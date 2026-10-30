ALTER TABLE payment_links ADD COLUMN reservation_id UUID;
CREATE UNIQUE INDEX payment_links_captured_transaction ON payment_links(transaction_id)
  WHERE transaction_id IS NOT NULL;
