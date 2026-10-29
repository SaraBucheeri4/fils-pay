-- Additional suspense accounts for future reconciliation lanes.
--
-- Corrected to 0007's chart_of_accounts shape (id, name, kind). As first
-- committed this used columns the table never had (code, account_type,
-- description) and a 'suspense' kind the CHECK rejects, so it could not
-- apply anywhere. Suspense is modelled as 'asset', the same as 0007's
-- scheme_rounding_residue. Neither account is used by any code yet; the
-- kind for chargeback_suspense needs finance sign-off before first use.

INSERT INTO chart_of_accounts (id, name, kind)
VALUES
  ('fx_rounding_difference', 'FX rounding difference (suspense)', 'asset'),
  ('chargeback_suspense',    'Chargeback suspense',               'asset')
ON CONFLICT (id) DO NOTHING;
