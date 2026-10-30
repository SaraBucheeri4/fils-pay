-- Merchant payment operations used to bypass unresolved link captures.
-- Index the new shared guard and bounded platform review queue so checking
-- every capture/void does not require scanning all historical payment links.
CREATE INDEX payment_links_unresolved_transaction
  ON payment_links (merchant_id, capture_attempt_transaction_id)
  WHERE status = 'reserved' AND capture_attempt_at IS NOT NULL;
CREATE INDEX payment_links_unresolved_queue
  ON payment_links (capture_attempt_at, id)
  WHERE status = 'reserved' AND capture_attempt_at IS NOT NULL;
