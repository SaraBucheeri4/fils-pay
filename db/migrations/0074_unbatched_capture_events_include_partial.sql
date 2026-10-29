-- v_unbatched_capture_events (0054) listed only 'captured' events, so the
-- partially_captured events CloseBatch also settles were missing from it.
-- Redefined with CloseBatch's own eligibility rule (batch.go): capture
-- events of either kind whose settlement_batch_id is still NULL. Reads the
-- column directly rather than through settlement_batch_events.
--
-- A new migration rather than an edit to 0054, which is already applied.
-- Existing columns keep their names and order; occurred_at (the timestamp
-- settlement windows on) is appended.

CREATE OR REPLACE VIEW v_unbatched_capture_events AS
SELECT te.id AS event_id,
       te.transaction_id,
       te.event_type,
       te.amount_fils,
       te.created_at,
       t.merchant_id,
       te.occurred_at
  FROM transaction_events te
  JOIN transactions t ON t.id = te.transaction_id
 WHERE te.event_type IN ('captured', 'partially_captured')
   AND te.settlement_batch_id IS NULL;
