-- New exports retain their exact source amount. Historical repair is separate.
ALTER TABLE scheme_export_lines ADD COLUMN gross_fils BIGINT;
ALTER TABLE scheme_export_lines ADD CONSTRAINT new_scheme_amount_matches_fils
  CHECK (amount IS NULL OR amount = amount_fils::numeric / 1000) NOT VALID;
ALTER TABLE scheme_export_lines ADD CONSTRAINT scheme_export_gross_valid
  CHECK (gross_fils IS NULL OR (gross_fils >= amount_fils AND gross_fils - amount_fils < 10));

CREATE TABLE scheme_residue_postings (
  scheme_export_line_id UUID PRIMARY KEY REFERENCES scheme_export_lines(id),
  entry_group_id UUID NOT NULL UNIQUE,
  residue_fils BIGINT NOT NULL CHECK (residue_fils > 0)
);

CREATE FUNCTION post_scheme_line_residue(line_id UUID, gross BIGINT) RETURNS VOID AS $$
DECLARE
  line scheme_export_lines%ROWTYPE;
  merchant UUID;
  posting UUID;
  residue BIGINT;
BEGIN
  SELECT * INTO STRICT line FROM scheme_export_lines WHERE id = line_id FOR UPDATE;
  residue := gross - line.amount_fils;
  IF residue < 0 OR residue >= 10 THEN RAISE EXCEPTION 'invalid scheme residue'; END IF;
  IF residue = 0 THEN RETURN; END IF;
  SELECT merchant_id INTO STRICT merchant FROM settlement_batches WHERE id = line.settlement_batch_id;
  INSERT INTO scheme_residue_postings VALUES (line.id, gen_random_uuid(), residue)
    ON CONFLICT (scheme_export_line_id) DO NOTHING RETURNING entry_group_id INTO posting;
  IF posting IS NULL THEN RETURN; END IF;
  INSERT INTO ledger_entries
    (entry_group_id, merchant_id, transaction_id, settlement_batch_id, account_id, direction, amount_fils, occurred_at, description)
  VALUES
    (posting, merchant, line.transaction_id, line.settlement_batch_id, 'card_scheme_clearing', 'credit', residue, line.exported_at, 'scheme export residue'),
    (posting, merchant, line.transaction_id, line.settlement_batch_id, 'scheme_rounding_residue', 'debit', residue, line.exported_at, 'scheme export residue');
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION journal_new_scheme_residue() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.gross_fils IS NOT NULL THEN PERFORM post_scheme_line_residue(NEW.id, NEW.gross_fils); END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER scheme_line_residue AFTER INSERT ON scheme_export_lines
  FOR EACH ROW EXECUTE FUNCTION journal_new_scheme_residue();
