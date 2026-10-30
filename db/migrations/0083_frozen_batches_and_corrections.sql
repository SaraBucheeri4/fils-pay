-- An approved correction is a new journal, never a rewrite of money paid.
CREATE FUNCTION protect_paid_batch_totals() RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status IN ('closed', 'paid') AND
    (NEW.gross_fils, NEW.fee_fils, NEW.net_payout_fils, NEW.batch_date, NEW.merchant_id)
    IS DISTINCT FROM
    (OLD.gross_fils, OLD.fee_fils, OLD.net_payout_fils, OLD.batch_date, OLD.merchant_id)
  THEN RAISE EXCEPTION 'closed batch financial totals are frozen'; END IF;
  IF OLD.status = 'paid' AND (NEW.status, NEW.paid_at) IS DISTINCT FROM (OLD.status, OLD.paid_at)
  THEN RAISE EXCEPTION 'paid batch status is frozen'; END IF;
  IF OLD.status = 'closed' AND NEW.status = 'open'
  THEN RAISE EXCEPTION 'closed batch cannot reopen'; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER paid_batch_totals_frozen BEFORE UPDATE ON settlement_batches
  FOR EACH ROW EXECUTE FUNCTION protect_paid_batch_totals();

CREATE TABLE settlement_fee_corrections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES merchants(id),
  source_batch_id UUID NOT NULL REFERENCES settlement_batches(id),
  entry_group_id UUID NOT NULL UNIQUE,
  fee_delta_fils BIGINT NOT NULL CHECK (fee_delta_fils <> 0),
  settlement_batch_id UUID REFERENCES settlement_batches(id),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
