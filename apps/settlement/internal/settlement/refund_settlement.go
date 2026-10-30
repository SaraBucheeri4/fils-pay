package settlement

import (
	"context"
	"fmt"
	"math"
	"time"

	"github.com/filspay/settlement/internal/money"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// claimRefundsAndCorrections consumes durable financial rows, not an HTTP
// notification. Selection, totals and claims commit with the batch close.
// Earlier unclaimed refunds include late commits and missed settlement days.
func claimRefundsAndCorrections(ctx context.Context, tx pgx.Tx, merchantID, batchID uuid.UUID, end time.Time) (money.Fils, money.Fils, error) {
	rows, err := tx.Query(ctx, `SELECT id, amount_fils, fee_reversed_fils FROM refunds
   WHERE merchant_id = $1 AND status = 'succeeded' AND settlement_batch_id IS NULL
     AND occurred_at < $2 ORDER BY occurred_at, id FOR UPDATE`, merchantID, end)
	if err != nil {
		return 0, 0, err
	}
	var ids []uuid.UUID
	var gross, reversed money.Fils
	for rows.Next() {
		var id uuid.UUID
		var amount, fee int64
		if err := rows.Scan(&id, &amount, &fee); err != nil {
			rows.Close()
			return 0, 0, err
		}
		ids = append(ids, id)
		gross, err = addFinancialFils(gross, money.Fils(amount))
		if err != nil {
			rows.Close()
			return 0, 0, err
		}
		reversed, err = addFinancialFils(reversed, money.Fils(fee))
		if err != nil {
			rows.Close()
			return 0, 0, err
		}
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return 0, 0, err
	}
	rows.Close()
	if len(ids) > 0 {
		if _, err := tx.Exec(ctx, `UPDATE refunds SET settlement_batch_id = $2 WHERE id = ANY($1)`, ids, batchID); err != nil {
			return 0, 0, err
		}
	}
	var correction int64
	err = tx.QueryRow(ctx, `WITH claimed AS (
   UPDATE settlement_fee_corrections SET settlement_batch_id = $2
    WHERE id IN (SELECT id FROM settlement_fee_corrections
     WHERE merchant_id = $1 AND settlement_batch_id IS NULL AND occurred_at < $3
     ORDER BY id FOR UPDATE)
    RETURNING fee_delta_fils
 ) SELECT COALESCE(SUM(fee_delta_fils), 0) FROM claimed`, merchantID, batchID, end).Scan(&correction)
	if err != nil {
		return 0, 0, fmt.Errorf("claim fee corrections: %w", err)
	}
	netFee, err := subtractFinancialFils(reversed, money.Fils(correction))
	return gross, netFee, err
}

// applySettlementCarry allocates the existing ledger obligation across bank
// payouts. It creates no ledger movement and does not repair historical data.
func applySettlementCarry(ctx context.Context, tx pgx.Tx, merchantID, batchID uuid.UUID, net money.Fils) (money.Fils, money.Fils, money.Fils, error) {
	if _, err := tx.Exec(ctx, `INSERT INTO settlement_carry_balances (merchant_id) VALUES ($1) ON CONFLICT DO NOTHING`, merchantID); err != nil {
		return 0, 0, 0, err
	}
	var carry int64
	if err := tx.QueryRow(ctx, `SELECT carry_fils FROM settlement_carry_balances WHERE merchant_id = $1 FOR UPDATE`, merchantID).Scan(&carry); err != nil {
		return 0, 0, 0, err
	}
	payout, out, err := carryPayout(net, money.Fils(carry))
	if err != nil {
		return 0, 0, 0, err
	}
	_, err = tx.Exec(ctx, `UPDATE settlement_carry_balances SET carry_fils = $2, last_batch_id = $3 WHERE merchant_id = $1`, merchantID, int64(out), batchID)
	return payout, money.Fils(carry), out, err
}

func carryPayout(net, carry money.Fils) (money.Fils, money.Fils, error) {
	if carry > 0 || (carry < 0 && net < money.Fils(math.MinInt64)-carry) {
		return 0, 0, fmt.Errorf("invalid or overflowing settlement carry")
	}
	available := net + carry
	if available < 0 {
		return 0, available, nil
	}
	return available, 0, nil
}

// Legacy discounts were separate postings without a capture-event identity.
// A whole transaction's fee is exact from its journal; an ambiguous legacy
// transaction spanning batches requires separate historical review.
func actualCaptureFees(ctx context.Context, tx pgx.Tx, txnID uuid.UUID, events []eligibleEvent) (money.Fils, error) {
	var eventCount int
	var charged int64
	var discounted bool
	err := tx.QueryRow(ctx, `SELECT
  (SELECT count(*) FROM transaction_events WHERE transaction_id = $1 AND event_type IN ('captured','partially_captured')),
  (SELECT COALESCE(SUM(CASE WHEN direction = 'credit' THEN amount_fils ELSE -amount_fils END),0)
    FROM ledger_entries WHERE transaction_id = $1 AND account_id = 'platform_fee_revenue'
      AND description LIKE 'capture:%'),
  EXISTS (SELECT 1 FROM ledger_entries WHERE transaction_id = $1
    AND account_id = 'platform_fee_revenue' AND description = 'capture: negotiated discount adjustment')`, txnID).Scan(&eventCount, &charged, &discounted)
	if err != nil {
		return 0, err
	}
	if eventCount == len(events) {
		return money.Fils(charged), nil
	}
	var total money.Fils
	for _, e := range events {
		if e.modernFee && e.feeFils != nil {
			total, err = addFinancialFils(total, money.Fils(*e.feeFils))
			if err != nil {
				return 0, err
			}
			continue
		}
		if discounted {
			return 0, fmt.Errorf("transaction %s has legacy discount postings spanning batches; historical attribution review required", txnID)
		}
		if e.feeFils != nil {
			total, err = addFinancialFils(total, money.Fils(*e.feeFils))
			if err != nil {
				return 0, err
			}
			continue
		}
		var fee int64
		if err := tx.QueryRow(ctx, `SELECT COALESCE(SUM(CASE WHEN direction = 'credit' THEN amount_fils ELSE -amount_fils END),0)
    FROM ledger_entries WHERE transaction_id = $1 AND account_id = 'platform_fee_revenue'
    AND occurred_at = $2 AND description LIKE 'capture:%'`, txnID, e.occurredAt).Scan(&fee); err != nil {
			return 0, err
		}
		total, err = addFinancialFils(total, money.Fils(fee))
		if err != nil {
			return 0, err
		}
	}
	return total, nil
}
