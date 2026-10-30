// Package balances refreshes the ledger-authoritative payable cache after
// settlement operations. ADR-0006 display corrections remain cache-only and,
// per ADR-0011, survive this refresh; only a rebuild resets them.
package balances

import (
	"context"
	"github.com/filspay/settlement/internal/money"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

func ApplyBatchClose(ctx context.Context, tx pgx.Tx, merchantID, batchID uuid.UUID, _ money.Fils) error {
	return refresh(ctx, tx, merchantID, batchID)
}

func ApplyPayout(ctx context.Context, tx pgx.Tx, merchantID, batchID uuid.UUID, _ money.Fils) error {
	return refresh(ctx, tx, merchantID, batchID)
}

func refresh(ctx context.Context, tx pgx.Tx, merchantID, batchID uuid.UUID) error {
	if _, err := tx.Exec(ctx, `INSERT INTO merchant_balances (merchant_id, cached_payable_fils)
   VALUES ($1, 0) ON CONFLICT DO NOTHING`, merchantID); err != nil {
		return err
	}
	var ignored int64
	if err := tx.QueryRow(ctx, `SELECT cached_payable_fils FROM merchant_balances WHERE merchant_id = $1 FOR UPDATE`, merchantID).Scan(&ignored); err != nil {
		return err
	}
	_, err := tx.Exec(ctx, `UPDATE merchant_balances SET cached_payable_fils = (
   SELECT COALESCE(SUM(CASE WHEN direction = 'credit' THEN amount_fils ELSE -amount_fils END), 0)
   FROM ledger_entries WHERE merchant_id = $1 AND account_id = 'merchant_payable') + display_adjustment_fils,
   last_settlement_batch_id = $2, updated_at = now() WHERE merchant_id = $1`, merchantID, batchID)
	return err
}
