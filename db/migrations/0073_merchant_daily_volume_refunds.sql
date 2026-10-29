-- Refund columns on the reporting read model. applyDailySummaryRollup
-- (apps/reporting/src/consumer/applyEvent.ts) writes refund_count and
-- refund_gross_fils, which 0027 never created. Not reached yet (the
-- consumer does not select refund events), but it would fail the first
-- time refunds are wired into reporting.

ALTER TABLE merchant_daily_volume
    ADD COLUMN IF NOT EXISTS refund_count      INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS refund_gross_fils BIGINT  NOT NULL DEFAULT 0;
