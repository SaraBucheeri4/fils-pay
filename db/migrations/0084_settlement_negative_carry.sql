ALTER TABLE settlement_batches ADD COLUMN carry_in_fils BIGINT NOT NULL DEFAULT 0;
ALTER TABLE settlement_batches ADD COLUMN carry_out_fils BIGINT NOT NULL DEFAULT 0;
CREATE TABLE settlement_carry_balances (
  merchant_id UUID PRIMARY KEY REFERENCES merchants(id),
  carry_fils BIGINT NOT NULL DEFAULT 0 CHECK (carry_fils <= 0),
  last_batch_id UUID REFERENCES settlement_batches(id)
);

-- Carry amounts are part of the frozen bank instruction too.
CREATE FUNCTION protect_paid_batch_carry() RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status IN ('closed', 'paid') AND (NEW.carry_in_fils, NEW.carry_out_fils)
    IS DISTINCT FROM (OLD.carry_in_fils, OLD.carry_out_fils)
  THEN RAISE EXCEPTION 'paid batch carry is frozen'; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER paid_batch_carry_frozen BEFORE UPDATE ON settlement_batches
  FOR EACH ROW EXECUTE FUNCTION protect_paid_batch_carry();
