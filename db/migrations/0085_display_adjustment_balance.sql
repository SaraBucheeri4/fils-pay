-- ADR-0011: the part of the cache that is a display correction, not ledger.
-- Historical corrections are not reconstructed; existing rows start at zero.
ALTER TABLE merchant_balances ADD COLUMN display_adjustment_fils BIGINT NOT NULL DEFAULT 0;
