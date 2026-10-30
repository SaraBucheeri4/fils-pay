-- ADR-0013: set durably before the acquirer capture call. While set, the charge
-- outcome is unknown, so the link cannot be claimed by another buyer.
ALTER TABLE payment_links
  ADD COLUMN capture_attempt_at TIMESTAMPTZ,
  ADD COLUMN capture_attempt_transaction_id UUID REFERENCES transactions(id),
  ADD COLUMN capture_attempt_idempotency_key TEXT;
CREATE INDEX payment_links_capture_review ON payment_links (merchant_id, capture_attempt_at)
  WHERE capture_attempt_at IS NOT NULL;
