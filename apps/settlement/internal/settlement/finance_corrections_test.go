package settlement

import (
	"context"
	"github.com/filspay/settlement/internal/money"
	"testing"
	"time"
)

func TestFinanceNetPreservesWholeFils(t *testing.T) {
	gross := money.Fils(123456789123)
	if got := NetPayableFils(gross, 234567); got != gross-234567 {
		t.Fatalf("net=%d", got)
	}
}

func TestFinanceSchemeUsesExportedInteger(t *testing.T) {
	if got := SchemeAmountBD(TruncateToSchemeAmount(4759)); got != "4.75" {
		t.Fatalf("amount=%v", got)
	}
}

func TestFinanceNegativeCarryRecoversBeforePayout(t *testing.T) {
	payout, carry, err := carryPayout(-3900, 0)
	if err != nil || payout != 0 || carry != -3900 {
		t.Fatalf("first: %d %d %v", payout, carry, err)
	}
	payout, carry, err = carryPayout(4875, carry)
	if err != nil || payout != 975 || carry != 0 {
		t.Fatalf("next: %d %d %v", payout, carry, err)
	}
}

func TestFinanceResidueIsAtomicAndRetrySafe(t *testing.T) {
	pool := mustPool(t)
	ctx := context.Background()
	resetPlatformStats(t, pool)
	merchant := insertActiveMerchant(t, pool, 250)
	date := time.Date(2026, 9, 1, 0, 0, 0, 0, time.UTC)
	start, _ := BusinessDayWindow(date)
	insertCaptureEvent(t, pool, merchant, 250, 4759, start.Add(time.Hour))
	first, err := CloseBatch(ctx, pool, merchant, date)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := CloseBatch(ctx, pool, merchant, date); err != nil {
		t.Fatal(err)
	}
	var amount, residue int64
	var external string
	if err := pool.QueryRow(ctx, `SELECT amount_fils, amount::text, p.residue_fils FROM scheme_export_lines s
   JOIN scheme_residue_postings p ON p.scheme_export_line_id = s.id WHERE settlement_batch_id = $1`, first.BatchID).Scan(&amount, &external, &residue); err != nil {
		t.Fatal(err)
	}
	if amount != 4750 || external != "4.75" || residue != 9 {
		t.Fatalf("export: %d %s %d", amount, external, residue)
	}
	var clearing, rounding, count int64
	if err := pool.QueryRow(ctx, `SELECT count(*),
   COALESCE(SUM(amount_fils) FILTER (WHERE account_id = 'card_scheme_clearing' AND direction = 'credit'),0),
   COALESCE(SUM(amount_fils) FILTER (WHERE account_id = 'scheme_rounding_residue' AND direction = 'debit'),0)
   FROM ledger_entries WHERE settlement_batch_id = $1 AND description = 'scheme export residue'`, first.BatchID).Scan(&count, &clearing, &rounding); err != nil {
		t.Fatal(err)
	}
	if count != 2 || clearing != 9 || rounding != 9 {
		t.Fatalf("legs: %d %d %d", count, clearing, rounding)
	}
}
