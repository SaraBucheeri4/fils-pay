package settlement

import (
	"context"
	"errors"
	"fmt"
	"sort"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/filspay/settlement/internal/balances"
	"github.com/filspay/settlement/internal/money"
	"github.com/filspay/settlement/internal/splits"
)

// ErrMerchantNotEligible is returned by CloseBatch when the merchant is
// not active/non-test-mode at the time of the call — CloseBatch is not
// meant to be invoked directly for such a merchant; the batching pass
// (RunDailyBatch) already filters merchants before ever calling it.
var ErrMerchantNotEligible = errors.New("settlement: merchant not found or not eligible for settlement")

// BatchResult is CloseBatch's return value.
type BatchResult struct {
	BatchID       uuid.UUID
	MerchantID    uuid.UUID
	BatchDate     time.Time
	AlreadyClosed bool // true when this call found an existing 'closed'/'paid' batch and made no changes (idempotent no-op)
	GrossFils     money.Fils
	FeeFils       money.Fils
	NetPayoutFils money.Fils
	EventCount    int
	LineCount     int
}

// PayoutResult is PayoutBatch's return value.
type PayoutResult struct {
	BatchID       uuid.UUID
	MerchantID    uuid.UUID
	AlreadyPaid   bool // true when the batch was already 'paid' (idempotent no-op)
	NotClosed     bool // true when the batch is not 'closed' (e.g. still 'open') — also a no-op
	NetPayoutFils money.Fils
}

type eligibleEvent struct {
	id            int64
	transactionID uuid.UUID
	amountFils    money.Fils
	occurredAt    time.Time
	feeFils       *int64
	modernFee     bool
}

// CloseBatch computes and freezes settlement figures for one merchant's
// one business day. Idempotent: re-running it against an already-closed
// or already-paid batch for the same (merchant, date) is a safe no-op.
// Every capture-type transaction_events row it selects is marked with this
// batch's id inside the same transaction that freezes the batch's totals,
// so a row can never be picked up by two batches.
func CloseBatch(ctx context.Context, db *pgxpool.Pool, merchantID uuid.UUID, businessDate time.Time) (BatchResult, error) {
	start, end := BusinessDayWindow(businessDate)
	batchDateOnly := time.Date(businessDate.Year(), businessDate.Month(), businessDate.Day(), 0, 0, 0, 0, time.UTC)

	tx, err := db.Begin(ctx)
	if err != nil {
		return BatchResult{}, fmt.Errorf("settlement: CloseBatch: begin: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	// One merchant's closes, including overlapping dates, serialize before
	// claiming refunds and consuming its carry balance.
	if _, err := tx.Exec(ctx, `SELECT id FROM merchants WHERE id = $1 FOR UPDATE`, merchantID); err != nil {
		return BatchResult{}, err
	}

	// Step 2: create the batch row if it doesn't already exist.
	_, err = tx.Exec(ctx, `
		INSERT INTO settlement_batches (merchant_id, batch_date, status)
		VALUES ($1, $2, 'open')
		ON CONFLICT (merchant_id, batch_date) DO NOTHING
	`, merchantID, batchDateOnly)
	if err != nil {
		return BatchResult{}, fmt.Errorf("settlement: CloseBatch: insert batch: %w", err)
	}

	// Step 3: row-lock the batch. This is what actually serializes
	// concurrent CloseBatch calls for the same (merchant, date).
	var batchID uuid.UUID
	var status string
	err = tx.QueryRow(ctx, `
		SELECT id, status FROM settlement_batches
		 WHERE merchant_id = $1 AND batch_date = $2
		 FOR UPDATE
	`, merchantID, batchDateOnly).Scan(&batchID, &status)
	if err != nil {
		return BatchResult{}, fmt.Errorf("settlement: CloseBatch: lock batch: %w", err)
	}

	// Step 4: already closed/paid -> idempotent no-op, nothing to undo.
	if status != "open" {
		tx.Rollback(ctx) //nolint:errcheck
		var gross, fee, net int64
		err = db.QueryRow(ctx, `
			SELECT gross_fils, fee_fils, net_payout_fils FROM settlement_batches WHERE id = $1
		`, batchID).Scan(&gross, &fee, &net)
		if err != nil {
			return BatchResult{}, fmt.Errorf("settlement: CloseBatch: read already-closed batch: %w", err)
		}
		return BatchResult{
			BatchID:       batchID,
			MerchantID:    merchantID,
			BatchDate:     batchDateOnly,
			AlreadyClosed: true,
			GrossFils:     money.Fils(gross),
			FeeFils:       money.Fils(fee),
			NetPayoutFils: money.Fils(net),
		}, nil
	}

	// Step 5: merchant must be active and not in test mode.
	var eligible bool
	err = tx.QueryRow(ctx, `SELECT true FROM merchants WHERE id = $1 AND status = 'active' AND test_mode = false`, merchantID).Scan(&eligible)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return BatchResult{}, ErrMerchantNotEligible
		}
		return BatchResult{}, err
	}

	// Platform-wide volume-tier bonus — read and locked once per batch.
	platformProcessedFils, err := ReadAndLockPlatformProcessedFils(ctx, tx)
	if err != nil {
		return BatchResult{}, fmt.Errorf("settlement: CloseBatch: read platform volume: %w", err)
	}

	// Step 6: select and lock eligible events for the whole window. The
	// join is transaction_events (many) -> transactions (one) — the safe
	// direction. Every amount is read from te.amount_fils — the exact
	// incremental delta capture.ts already recorded for that one real
	// event — never from transactions.captured_fils (a running total).
	rows, err := tx.Query(ctx, `
		SELECT te.id, te.transaction_id, te.amount_fils, te.occurred_at, (te.metadata->>'feeFils')::bigint, COALESCE(te.metadata->>'pricingVersion' = 'discount-before-mdr', false)
		  FROM transaction_events te
		  JOIN transactions t ON t.id = te.transaction_id
		 WHERE t.merchant_id = $1
		   AND te.event_type IN ('captured', 'partially_captured')
		   AND te.settlement_batch_id IS NULL
		   AND te.occurred_at >= $2 AND te.occurred_at < $3
		 ORDER BY te.transaction_id, te.occurred_at
		 FOR UPDATE OF te
	`, merchantID, start, end)
	if err != nil {
		return BatchResult{}, fmt.Errorf("settlement: CloseBatch: select eligible events: %w", err)
	}

	var events []eligibleEvent
	var orderedTxnIDs []uuid.UUID
	seenTxn := make(map[uuid.UUID]bool)
	for rows.Next() {
		var e eligibleEvent
		var amountFils int64
		if err := rows.Scan(&e.id, &e.transactionID, &amountFils, &e.occurredAt, &e.feeFils, &e.modernFee); err != nil {
			rows.Close()
			return BatchResult{}, fmt.Errorf("settlement: CloseBatch: scan eligible event: %w", err)
		}
		e.amountFils = money.Fils(amountFils)
		events = append(events, e)
		if !seenTxn[e.transactionID] {
			seenTxn[e.transactionID] = true
			orderedTxnIDs = append(orderedTxnIDs, e.transactionID)
		}
	}
	if err := rows.Err(); err != nil {
		return BatchResult{}, fmt.Errorf("settlement: CloseBatch: iterate eligible events: %w", err)
	}
	rows.Close()

	// Step 7: group the locked rows in Go, by transaction_id. Zero rows is
	// valid and proceeds with all totals at zero.
	grouped := make(map[uuid.UUID][]eligibleEvent, len(orderedTxnIDs))
	for _, e := range events {
		grouped[e.transactionID] = append(grouped[e.transactionID], e)
	}

	// Step 8: for each transaction group, and for the batch as a whole.
	// Fee is recomputed PER EVENT, then summed — never ApplyRateFils
	// applied once to the pre-summed total.
	type txnLine struct {
		transactionID uuid.UUID
		grossFils     money.Fils
		feeFils       money.Fils
	}
	var lines []txnLine
	var batchGross, batchFee money.Fils
	var eventIDs []int64

	for _, txnID := range orderedTxnIDs {
		var grossForTxn, feeForTxn money.Fils
		for _, e := range grouped[txnID] {
			grossForTxn, err = addFinancialFils(grossForTxn, e.amountFils)
			if err != nil {
				return BatchResult{}, err
			}

			eventIDs = append(eventIDs, e.id)
		}
		feeForTxn, err = actualCaptureFees(ctx, tx, merchantID, txnID, grouped[txnID])
		if err != nil {
			return BatchResult{}, err
		}
		lines = append(lines, txnLine{txnID, grossForTxn, feeForTxn})
		batchGross, err = addFinancialFils(batchGross, grossForTxn)
		if err != nil {
			return BatchResult{}, err
		}
		batchFee, err = addFinancialFils(batchFee, feeForTxn)
		if err != nil {
			return BatchResult{}, err
		}
	}
	captureGross := batchGross
	refundGross, refundFee, err := claimRefundsAndCorrections(ctx, tx, merchantID, batchID, end)
	if err != nil {
		return BatchResult{}, err
	}
	batchGross, err = subtractFinancialFils(batchGross, refundGross)
	if err != nil {
		return BatchResult{}, err
	}
	batchFee, err = subtractFinancialFils(batchFee, refundFee)
	if err != nil {
		return BatchResult{}, err
	}
	activityNet, err := subtractFinancialFils(batchGross, batchFee)
	if err != nil {
		return BatchResult{}, err
	}
	netPayout, carryIn, carryOut, err := applySettlementCarry(ctx, tx, merchantID, batchID, activityNet)
	if err != nil {
		return BatchResult{}, err
	}

	// Record this batch's contribution to the platform-wide lifetime
	// processed-volume counter, in the same transaction that freezes this
	// batch's own totals — so the counter and the batch it describes
	// commit or roll back together.
	if err := RecordPlatformProcessedVolume(ctx, tx, platformProcessedFils, int64(captureGross)); err != nil {
		return BatchResult{}, fmt.Errorf("settlement: CloseBatch: record platform volume: %w", err)
	}

	// Step 10: freeze the batch totals.
	_, err = tx.Exec(ctx, `
		UPDATE settlement_batches
		   SET status = 'closed', gross_fils = $2, fee_fils = $3, net_payout_fils = $4, carry_in_fils = $5, carry_out_fils = $6, closed_at = now()
		 WHERE id = $1
	`, batchID, int64(batchGross), int64(batchFee), int64(netPayout), int64(carryIn), int64(carryOut))
	if err != nil {
		return BatchResult{}, fmt.Errorf("settlement: CloseBatch: freeze batch totals: %w", err)
	}

	// Step 11: mark every included event as batched — permanently
	// ineligible for any future batch.
	if len(eventIDs) > 0 {
		_, err = tx.Exec(ctx, `
			UPDATE transaction_events SET settlement_batch_id = $2 WHERE id = ANY($1)
		`, eventIDs, batchID)
		if err != nil {
			return BatchResult{}, fmt.Errorf("settlement: CloseBatch: mark events batched: %w", err)
		}
	}

	for i, line := range lines {
		truncated := TruncateToSchemeAmount(line.grossFils)
		_, err = tx.Exec(ctx, `
			INSERT INTO scheme_export_lines (settlement_batch_id, transaction_id, amount_fils, amount, line_sequence, gross_fils)
			VALUES ($1, $2, $3, $4, $5, $6)
		`, batchID, line.transactionID, int64(truncated), formatFilsAsTwoDecimalString(truncated), i+1, int64(line.grossFils))
		if err != nil {
			return BatchResult{}, fmt.Errorf("settlement: CloseBatch: insert scheme export line: %w", err)
		}
	}

	// Step 13: enqueue settlement.batch_closed onto the shared outbox, in
	// the same transaction as the frozen totals.
	payload, err := buildBatchClosedPayload(merchantID, batchID, batchDateOnly, batchGross, batchFee, netPayout)
	if err != nil {
		return BatchResult{}, fmt.Errorf("settlement: CloseBatch: build outbox payload: %w", err)
	}
	_, err = tx.Exec(ctx, `
		INSERT INTO outbox_events (event_type, aggregate_type, aggregate_id, payload)
		VALUES ('settlement.batch_closed', 'settlement_batch', $1, $2)
	`, batchID, payload)
	if err != nil {
		return BatchResult{}, fmt.Errorf("settlement: CloseBatch: enqueue outbox event: %w", err)
	}

	// Step 14: refresh the merchant_balances cache from the ledger.
	if err := balances.ApplyBatchClose(ctx, tx, merchantID, batchID, netPayout); err != nil {
		return BatchResult{}, fmt.Errorf("settlement: CloseBatch: apply balance cache delta: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return BatchResult{}, fmt.Errorf("settlement: CloseBatch: commit: %w", err)
	}

	return BatchResult{
		BatchID:       batchID,
		MerchantID:    merchantID,
		BatchDate:     batchDateOnly,
		AlreadyClosed: false,
		GrossFils:     batchGross,
		FeeFils:       batchFee,
		NetPayoutFils: netPayout,
		EventCount:    len(eventIDs),
		LineCount:     len(lines),
	}, nil
}

// PayoutBatch posts the ledger legs representing an actual payout for an
// already-closed batch and transitions it 'closed' -> 'paid'. Idempotent:
// a batch that is not 'closed' (already 'paid', or somehow still 'open')
// is a safe no-op.
func PayoutBatch(ctx context.Context, db *pgxpool.Pool, batchID uuid.UUID) (PayoutResult, error) {
	tx, err := db.Begin(ctx)
	if err != nil {
		return PayoutResult{}, fmt.Errorf("settlement: PayoutBatch: begin: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	// Keep the same merchant -> batch lock order as close and recalculation.
	var lockMerchant uuid.UUID
	if err := tx.QueryRow(ctx, `SELECT merchant_id FROM settlement_batches WHERE id = $1`, batchID).Scan(&lockMerchant); err != nil {
		return PayoutResult{}, err
	}
	if _, err := tx.Exec(ctx, `SELECT id FROM merchants WHERE id = $1 FOR UPDATE`, lockMerchant); err != nil {
		return PayoutResult{}, err
	}

	var merchantID uuid.UUID
	var status string
	var netPayout int64
	err = tx.QueryRow(ctx, `
		SELECT merchant_id, status, net_payout_fils FROM settlement_batches WHERE id = $1 FOR UPDATE
	`, batchID).Scan(&merchantID, &status, &netPayout)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return PayoutResult{}, fmt.Errorf("settlement: PayoutBatch: batch %s not found", batchID)
		}
		return PayoutResult{}, fmt.Errorf("settlement: PayoutBatch: lock batch: %w", err)
	}

	if status == "paid" {
		tx.Rollback(ctx) //nolint:errcheck
		return PayoutResult{BatchID: batchID, MerchantID: merchantID, AlreadyPaid: true, NetPayoutFils: money.Fils(netPayout)}, nil
	}
	if status != "closed" {
		tx.Rollback(ctx) //nolint:errcheck
		return PayoutResult{BatchID: batchID, MerchantID: merchantID, NotClosed: true, NetPayoutFils: money.Fils(netPayout)}, nil
	}

	if netPayout < 0 {
		return PayoutResult{}, fmt.Errorf("negative batch requires approved recovery policy")
	}

	// Post the payout leg pair only when net_payout_fils > 0 — omitted
	// entirely for an empty or fee-only batch (ledger_entries has a CHECK
	// (amount_fils > 0)). card_scheme_clearing isn't touched here; scheme
	// clearing is its own process.
	if netPayout > 0 {
		groupID := uuid.New()
		_, err = tx.Exec(ctx, `
			INSERT INTO ledger_entries
			  (entry_group_id, merchant_id, settlement_batch_id, account_id, direction, amount_fils, occurred_at, description)
			VALUES
			  ($1, $2, $3, 'merchant_payable', 'debit',  $4, now(), 'settlement payout: batch paid'),
			  ($1, $2, $3, 'platform_cash',    'credit', $4, now(), 'settlement payout: batch paid')
		`, groupID, merchantID, batchID, netPayout)
		if err != nil {
			return PayoutResult{}, fmt.Errorf("settlement: PayoutBatch: post payout legs: %w", err)
		}
	}

	// Runs unconditionally, including for a zero-payout batch: adding zero
	// is a no-op, and keeping the running total's every update in lockstep
	// with every processed batch — rather than skipping zero-value ones —
	// keeps its own bookkeeping simple.
	if err := UpdateLifetimePayoutMonitoringEstimate(ctx, tx, merchantID, money.Fils(netPayout)); err != nil {
		return PayoutResult{}, fmt.Errorf("settlement: PayoutBatch: update lifetime payout monitoring estimate: %w", err)
	}

	_, err = tx.Exec(ctx, `
		UPDATE settlement_batches SET status = 'paid', paid_at = now() WHERE id = $1
	`, batchID)
	if err != nil {
		return PayoutResult{}, fmt.Errorf("settlement: PayoutBatch: update batch status: %w", err)
	}

	if err := balances.ApplyPayout(ctx, tx, merchantID, batchID, money.Fils(netPayout)); err != nil {
		return PayoutResult{}, fmt.Errorf("settlement: PayoutBatch: apply balance cache delta: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return PayoutResult{}, fmt.Errorf("settlement: PayoutBatch: commit: %w", err)
	}

	return PayoutResult{BatchID: batchID, MerchantID: merchantID, NetPayoutFils: money.Fils(netPayout)}, nil
}

// DailyBatchReport summarizes one RunDailyBatch pass.
type DailyBatchReport struct {
	BusinessDate    time.Time
	MerchantResults []MerchantBatchOutcome
	Failures        []MerchantBatchFailure
}

// MerchantBatchFailure is one merchant whose close or payout failed. Its own
// transaction rolled back; the remaining merchants were still processed.
type MerchantBatchFailure struct {
	MerchantID uuid.UUID
	Err        error
}

// MerchantBatchOutcome is one merchant's CloseBatch+PayoutBatch outcome
// within a daily pass.
type MerchantBatchOutcome struct {
	MerchantID    uuid.UUID
	BatchID       uuid.UUID
	AlreadyClosed bool
	AlreadyPaid   bool
	GrossFils     money.Fils
	FeeFils       money.Fils
	NetPayoutFils money.Fils
}

// RunDailyBatch closes and pays out every eligible merchant's batch for
// one business date. Called by `run-batch` directly, and by `daemon` once
// per scheduled wake-up for the business day that just completed.
//
// Sequential processing (one merchant at a time, never concurrently) is a
// deliberate simplicity choice: each merchant's batch is its own pair of
// short transactions, so there is no cross-merchant lock contention to
// parallelize away, and this removes any question of lock-ordering
// between concurrent goroutines each trying to FOR UPDATE a
// settlement_batches row.
//
// One merchant's failure never blocks another merchant's payout: failures are
// collected in the report and returned, joined, after every merchant has run.
func RunDailyBatch(ctx context.Context, db *pgxpool.Pool, businessDate time.Time, onlyMerchant *uuid.UUID) (DailyBatchReport, error) {
	var merchantIDs []uuid.UUID
	if onlyMerchant != nil {
		merchantIDs = []uuid.UUID{*onlyMerchant}
	} else {
		rows, err := db.Query(ctx, `
			SELECT id FROM merchants WHERE status = 'active' AND test_mode = false ORDER BY id
		`)
		if err != nil {
			return DailyBatchReport{}, fmt.Errorf("settlement: RunDailyBatch: select merchants: %w", err)
		}
		for rows.Next() {
			var id uuid.UUID
			if err := rows.Scan(&id); err != nil {
				rows.Close()
				return DailyBatchReport{}, fmt.Errorf("settlement: RunDailyBatch: scan merchant id: %w", err)
			}
			merchantIDs = append(merchantIDs, id)
		}
		if err := rows.Err(); err != nil {
			return DailyBatchReport{}, fmt.Errorf("settlement: RunDailyBatch: iterate merchants: %w", err)
		}
		rows.Close()
	}

	sort.Slice(merchantIDs, func(i, j int) bool { return merchantIDs[i].String() < merchantIDs[j].String() })

	report := DailyBatchReport{BusinessDate: businessDate}
	var failures []error
	fail := func(merchantID uuid.UUID, err error) {
		report.Failures = append(report.Failures, MerchantBatchFailure{MerchantID: merchantID, Err: err})
		failures = append(failures, err)
	}
	for _, merchantID := range merchantIDs {
		if err := ctx.Err(); err != nil {
			failures = append(failures, err)
			break
		}
		closeResult, err := CloseBatch(ctx, db, merchantID, businessDate)
		if err != nil {
			if errors.Is(err, ErrMerchantNotEligible) {
				// A caller passed an explicit --merchant that isn't
				// active/non-test-mode. Skip it, same as the default
				// merchant scan already would have.
				continue
			}
			fail(merchantID, fmt.Errorf("settlement: RunDailyBatch: CloseBatch(%s): %w", merchantID, err))
			continue
		}

		// A merchant with configured sub-merchant split children is paid
		// out across those children rather than as a single lump sum to
		// itself. CloseBatch above is identical either way — only the
		// payout leg differs.
		isSplitParent, err := splits.IsSplitParent(ctx, db, merchantID)
		if err != nil {
			fail(merchantID, fmt.Errorf("settlement: RunDailyBatch: IsSplitParent(%s): %w", merchantID, err))
			continue
		}

		var alreadyPaid bool
		if isSplitParent {
			splitResult, err := splits.PayoutSplitBatch(ctx, db, closeResult.BatchID)
			if err != nil {
				fail(merchantID, fmt.Errorf("settlement: RunDailyBatch: PayoutSplitBatch(%s): %w", closeResult.BatchID, err))
				continue
			}
			alreadyPaid = splitResult.AlreadyPaid
		} else {
			payoutResult, err := PayoutBatch(ctx, db, closeResult.BatchID)
			if err != nil {
				fail(merchantID, fmt.Errorf("settlement: RunDailyBatch: PayoutBatch(%s): %w", closeResult.BatchID, err))
				continue
			}
			alreadyPaid = payoutResult.AlreadyPaid
		}

		report.MerchantResults = append(report.MerchantResults, MerchantBatchOutcome{
			MerchantID:    merchantID,
			BatchID:       closeResult.BatchID,
			AlreadyClosed: closeResult.AlreadyClosed,
			AlreadyPaid:   alreadyPaid,
			GrossFils:     closeResult.GrossFils,
			FeeFils:       closeResult.FeeFils,
			NetPayoutFils: closeResult.NetPayoutFils,
		})
	}

	return report, errors.Join(failures...)
}
