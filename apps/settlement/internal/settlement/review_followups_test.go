package settlement

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/filspay/settlement/internal/ledger"
	"github.com/filspay/settlement/internal/money"
)

// A capture event with no journal, as in a repaired or hand-built history.
func insertUnjournaledCapture(t *testing.T, pool *pgxpool.Pool, merchantID uuid.UUID, amount int64, at time.Time) uuid.UUID {
	t.Helper()
	ctx := context.Background()
	var txnID uuid.UUID
	if err := pool.QueryRow(ctx, `INSERT INTO transactions (merchant_id, status, amount_fils, captured_fils, acquirer_reference, occurred_at)
		VALUES ($1, 'captured', $2, $2, $3, $4) RETURNING id`, merchantID, amount, "acq-"+uuid.NewString(), at).Scan(&txnID); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO transaction_events (transaction_id, event_type, amount_fils, actor_type, occurred_at)
		VALUES ($1, 'captured', $2, 'system', $3)`, txnID, amount, at); err != nil {
		t.Fatal(err)
	}
	return txnID
}

// The seed's journal shape: "capture <ref>", gross credited net of a fee leg.
func journalCapture(t *testing.T, pool *pgxpool.Pool, merchantID, txnID uuid.UUID, amount, fee int64, description string, at time.Time) {
	t.Helper()
	// All legs in one statement: the balance trigger checks each statement's group.
	if _, err := pool.Exec(context.Background(), `INSERT INTO ledger_entries
		(entry_group_id, merchant_id, transaction_id, account_id, direction, amount_fils, occurred_at, description)
		SELECT $1, $2, $3, leg.account, leg.direction, leg.amount, $6, $7 FROM (VALUES
			('card_scheme_clearing', 'debit', $4::bigint),
			('merchant_payable', 'credit', $4::bigint - $5::bigint),
			('platform_fee_revenue', 'credit', $5::bigint)) AS leg(account, direction, amount)
		WHERE leg.amount > 0`,
		uuid.New(), merchantID, txnID, amount, fee, at, description); err != nil {
		t.Fatal(err)
	}
}

func reviewDay(n int) (time.Time, time.Time) {
	day := time.Date(2031, 3, n, 0, 0, 0, 0, time.UTC)
	start, _ := BusinessDayWindow(day)
	return day, start.Add(time.Hour)
}

func TestCloseUsesFeeFromAnyCaptureJournalDescription(t *testing.T) {
	pool := mustPool(t)
	merchantID := insertActiveMerchant(t, pool, 275)
	day, at := reviewDay(1)
	txn := insertUnjournaledCapture(t, pool, merchantID, 10000, at)
	journalCapture(t, pool, merchantID, txn, 10000, 123, "capture seeded-ref-0001", at)

	got, err := CloseBatch(context.Background(), pool, merchantID, day)
	if err != nil {
		t.Fatal(err)
	}
	if got.FeeFils != 123 || got.NetPayoutFils != 9877 {
		t.Fatalf("fee=%d net=%d, want the journaled 123 and 9877", got.FeeFils, got.NetPayoutFils)
	}
}

func TestCloseKeepsAGenuineZeroFeeSnapshot(t *testing.T) {
	pool := mustPool(t)
	ctx := context.Background()
	merchantID := insertActiveMerchant(t, pool, 275)
	day, at := reviewDay(2)
	txn := insertUnjournaledCapture(t, pool, merchantID, 10000, at)
	journalCapture(t, pool, merchantID, txn, 10000, 0, "capture: gross", at)
	if _, err := pool.Exec(ctx, `UPDATE transaction_events SET metadata = '{"feeFils": 0, "pricingVersion": "discount-before-mdr"}' WHERE transaction_id = $1`, txn); err != nil {
		t.Fatal(err)
	}

	got, err := CloseBatch(ctx, pool, merchantID, day)
	if err != nil {
		t.Fatal(err)
	}
	if got.FeeFils != 0 {
		t.Fatalf("fee=%d, a recorded zero fee must stay 0", got.FeeFils)
	}
}

func TestClosePricesAGrossJournalWithNoRecordedFee(t *testing.T) {
	pool := mustPool(t)
	merchantID := insertActiveMerchant(t, pool, 250)
	day, at := reviewDay(8)
	txn := insertUnjournaledCapture(t, pool, merchantID, 10000, at)
	journalCapture(t, pool, merchantID, txn, 10000, 0, "capture: gross", at)

	got, err := CloseBatch(context.Background(), pool, merchantID, day)
	if err != nil {
		t.Fatal(err)
	}
	if got.FeeFils != 250 {
		t.Fatalf("fee=%d, want 250 from the merchant rate", got.FeeFils)
	}
}

func TestCloseAppliesArchitectureRatesWithoutAJournal(t *testing.T) {
	pool := mustPool(t)
	ctx := context.Background()
	merchantID := insertActiveMerchant(t, pool, 275)
	if _, err := pool.Exec(ctx, `UPDATE merchants SET negotiated_discount_bps = 1250 WHERE id = $1`, merchantID); err != nil {
		t.Fatal(err)
	}
	day, at := reviewDay(3)
	insertUnjournaledCapture(t, pool, merchantID, 602, at)

	got, err := CloseBatch(ctx, pool, merchantID, day)
	if err != nil {
		t.Fatal(err)
	}
	if got.FeeFils != 14 {
		t.Fatalf("fee=%d, want 14 from the merchant's rate with discount before MDR", got.FeeFils)
	}
}

func TestCloseRefusesLegacyDiscountSpanningBatches(t *testing.T) {
	pool := mustPool(t)
	ctx := context.Background()
	merchantID := insertActiveMerchant(t, pool, 250)
	day, at := reviewDay(4)
	txn := insertUnjournaledCapture(t, pool, merchantID, 1000, at)
	journalCapture(t, pool, merchantID, txn, 1000, 25, "capture: gross", at)
	// A second capture event outside this batch plus a legacy discount posting
	// is the history CloseBatch refuses to attribute.
	if _, err := pool.Exec(ctx, `INSERT INTO transaction_events (transaction_id, event_type, amount_fils, actor_type, occurred_at)
		VALUES ($1, 'partially_captured', 100, 'system', $2)`, txn, at.Add(-48*time.Hour)); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO ledger_entries
		(entry_group_id, merchant_id, transaction_id, account_id, direction, amount_fils, occurred_at, description) VALUES
		($1, $2, $3, 'platform_fee_revenue', 'debit', 1, $4, 'capture: negotiated discount adjustment'),
		($1, $2, $3, 'merchant_payable', 'credit', 1, $4, 'capture: negotiated discount adjustment')`, uuid.New(), merchantID, txn, at); err != nil {
		t.Fatal(err)
	}
	if _, err := CloseBatch(ctx, pool, merchantID, day); err == nil {
		t.Fatal("want a historical attribution error, not a silently priced batch")
	}
}

func TestDailyBatchPaysLaterMerchantsWhenOneFails(t *testing.T) {
	pool := mustPool(t)
	ctx := context.Background()
	day, at := reviewDay(5)

	// Split weights that do not sum to 10000 fail only at payout.
	failing := insertActiveMerchant(t, pool, 250)
	child := insertActiveMerchant(t, pool, 250)
	if _, err := pool.Exec(ctx, `UPDATE merchants SET status = 'suspended' WHERE id = $1`, child); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO merchant_split_children (parent_merchant_id, child_merchant_id, split_weight_bps) VALUES ($1, $2, 5000)`, failing, child); err != nil {
		t.Fatal(err)
	}
	// Merchants run in id order, so the healthy one must sort after the failure.
	healthy := insertActiveMerchant(t, pool, 250)
	for healthy.String() < failing.String() {
		healthy = insertActiveMerchant(t, pool, 250)
	}
	txn := insertUnjournaledCapture(t, pool, healthy, 2000, at)
	journalCapture(t, pool, healthy, txn, 2000, 50, "capture: gross", at)

	report, err := RunDailyBatch(ctx, pool, day, nil)
	if err == nil {
		t.Fatal("want the failure returned after the pass")
	}
	reported := false
	for _, f := range report.Failures {
		reported = reported || f.MerchantID == failing
	}
	if !reported {
		t.Fatalf("failures=%v, want the failing merchant named", report.Failures)
	}
	var status string
	if err := pool.QueryRow(ctx, `SELECT status FROM settlement_batches WHERE merchant_id = $1 AND batch_date = $2`, healthy, day).Scan(&status); err != nil || status != "paid" {
		t.Fatalf("healthy merchant batch status=%q err=%v", status, err)
	}
}

func TestRecalculationIgnoresVolumeTier(t *testing.T) {
	pool := mustPool(t)
	ctx := context.Background()
	merchantID := insertActiveMerchant(t, pool, 250)
	day, at := reviewDay(6)
	txn := insertUnjournaledCapture(t, pool, merchantID, 10000, at)
	journalCapture(t, pool, merchantID, txn, 10000, 250, "capture: gross", at)
	if _, err := CloseBatch(ctx, pool, merchantID, day); err != nil {
		t.Fatal(err)
	}

	var saved int64
	if err := pool.QueryRow(ctx, `SELECT total_processed_fils FROM platform_stats WHERE id = 1`).Scan(&saved); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `UPDATE platform_stats SET total_processed_fils = 2000000000 WHERE id = 1`); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		pool.Exec(context.Background(), `UPDATE platform_stats SET total_processed_fils = $1 WHERE id = 1`, saved) //nolint:errcheck
	})

	result, err := RecalculateMDR(ctx, pool, merchantID, day, day.AddDate(0, 0, 1))
	if err != nil {
		t.Fatal(err)
	}
	if len(result.Adjusted) != 0 {
		t.Fatalf("adjusted=%+v, the tier must not correct a batch whose merchant terms did not change", result.Adjusted)
	}
}

func TestDisplayAdjustmentSurvivesCloseAndResetsOnRebuild(t *testing.T) {
	pool := mustPool(t)
	ctx := context.Background()
	merchantID := insertActiveMerchant(t, pool, 250)
	day, at := reviewDay(7)
	if _, err := pool.Exec(ctx, `INSERT INTO merchant_balances (merchant_id, cached_payable_fils, display_adjustment_fils) VALUES ($1, 500, 500)`, merchantID); err != nil {
		t.Fatal(err)
	}
	txn := insertUnjournaledCapture(t, pool, merchantID, 10000, at)
	journalCapture(t, pool, merchantID, txn, 10000, 250, "capture: gross", at)

	if _, err := CloseBatch(ctx, pool, merchantID, day); err != nil {
		t.Fatal(err)
	}
	read := func() (cached, display int64) {
		t.Helper()
		if err := pool.QueryRow(ctx, `SELECT cached_payable_fils, display_adjustment_fils FROM merchant_balances WHERE merchant_id = $1`, merchantID).Scan(&cached, &display); err != nil {
			t.Fatal(err)
		}
		return
	}
	if cached, display := read(); cached != 9750+500 || display != 500 {
		t.Fatalf("after close cached=%d display=%d, want ledger 9750 plus the 500 correction", cached, display)
	}

	diffs, err := ledger.RefreshBalanceCache(ctx, pool)
	if err != nil {
		t.Fatal(err)
	}
	if diffs[merchantID].Rebuilt != money.Fils(9750) {
		t.Fatalf("rebuilt=%d", diffs[merchantID].Rebuilt)
	}
	if cached, display := read(); cached != 9750 || display != 0 {
		t.Fatalf("after rebuild cached=%d display=%d, want the ledger figure and no correction", cached, display)
	}
}
