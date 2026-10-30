// Package ledger rebuilds merchant_balances from ledger_entries. Called by the
// `rebuild-balances` CLI, the console button and the daemon's 02:00 refresh.
// The per-merchant refresh after a close or payout is in internal/balances.
package ledger

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/filspay/settlement/internal/money"
)

// RebuildMerchantBalance recomputes merchantID's cached balance from
// ledger_entries. Shared by CLI, console and nightly refresh.
func RebuildMerchantBalance(ctx context.Context, db *pgxpool.Pool, merchantID uuid.UUID) (money.Fils, error) {
	var balance int64
	err := db.QueryRow(ctx, `
		SELECT COALESCE(SUM(CASE WHEN direction = 'credit' THEN amount_fils ELSE -amount_fils END), 0)
		  FROM ledger_entries
		 WHERE merchant_id = $1 AND account_id = 'merchant_payable'
	`, merchantID).Scan(&balance)
	if err != nil {
		return 0, fmt.Errorf("ledger: RebuildMerchantBalance(%s): %w", merchantID, err)
	}
	return money.Fils(balance), nil
}

// RebuildDiff is the before/after state for one merchant, printed by the
// rebuild-balances CLI subcommand so an operator sees exactly what
// changed.
//
// Changed reports drift against the ledger: a false result means the cache
// already matched ledger_entries for that merchant.
type RebuildDiff struct {
	MerchantID   uuid.UUID
	CachedBefore money.Fils
	Rebuilt      money.Fils
}

// Changed reports whether the cached value differed from the rebuilt,
// authoritative one.
func (d RebuildDiff) Changed() bool {
	return d.CachedBefore != d.Rebuilt
}

// RebuildAllBalances recomputes every merchant's balance the same way and
// overwrites merchant_balances in one transaction. Returns the full
// before/after map so a caller (the rebuild-balances CLI subcommand) can
// print exactly what changed. A rebuild is what resets ADR-0006 display
// corrections, so it also zeroes the stored display adjustment (ADR-0011).
func RebuildAllBalances(ctx context.Context, db *pgxpool.Pool) (map[uuid.UUID]RebuildDiff, error) {
	tx, err := db.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("ledger: RebuildAllBalances: begin: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	// Lock cache writers before taking one ledger snapshot. The aggregate
	// scans payable entries once, rather than once for every merchant.
	if _, err := tx.Exec(ctx, `LOCK TABLE merchant_balances IN SHARE ROW EXCLUSIVE MODE`); err != nil {
		return nil, err
	}
	rows, err := tx.Query(ctx, `WITH before AS MATERIALIZED (
      SELECT merchant_id, cached_payable_fils FROM merchant_balances
    ), totals AS MATERIALIZED (
      SELECT ids.merchant_id, COALESCE(payable.balance, 0)::bigint AS balance
      FROM (SELECT merchant_id FROM before UNION SELECT merchant_id FROM ledger_entries WHERE account_id = 'merchant_payable') ids
      LEFT JOIN (SELECT merchant_id, SUM(CASE WHEN direction = 'credit' THEN amount_fils ELSE -amount_fils END) AS balance
        FROM ledger_entries WHERE account_id = 'merchant_payable' GROUP BY merchant_id) payable USING (merchant_id)
    ), updated AS (
      INSERT INTO merchant_balances (merchant_id, cached_payable_fils, updated_at)
      SELECT merchant_id, balance, now() FROM totals WHERE true
      ON CONFLICT (merchant_id) DO UPDATE SET cached_payable_fils = EXCLUDED.cached_payable_fils, display_adjustment_fils = 0, updated_at = now()
      RETURNING merchant_id, cached_payable_fils
    ) SELECT u.merchant_id, COALESCE(b.cached_payable_fils,0), u.cached_payable_fils
      FROM updated u LEFT JOIN before b USING (merchant_id)`)
	if err != nil {
		return nil, fmt.Errorf("ledger: rebuild: %w", err)
	}
	diffs := make(map[uuid.UUID]RebuildDiff)
	for rows.Next() {
		var id uuid.UUID
		var before, after int64
		if err := rows.Scan(&id, &before, &after); err != nil {
			rows.Close()
			return nil, err
		}
		diffs[id] = RebuildDiff{MerchantID: id, CachedBefore: money.Fils(before), Rebuilt: money.Fils(after)}
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return nil, err
	}
	rows.Close()

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("ledger: RebuildAllBalances: commit: %w", err)
	}

	return diffs, nil
}
