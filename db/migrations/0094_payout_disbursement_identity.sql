-- Fail for explicit review if historical dispatches created duplicate records.
-- Do not discard payout evidence during migration.
CREATE UNIQUE INDEX settlement_payout_disbursements_one_per_batch
    ON settlement_payout_disbursements (settlement_batch_id);
