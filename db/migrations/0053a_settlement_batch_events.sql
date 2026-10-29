-- settlement_batch_events: which capture events each settlement batch
-- claimed. 0054's v_unbatched_capture_events reads this relation, but no
-- migration ever created it, so a fresh database failed at 0054.
--
-- Defined as a view over transaction_events.settlement_batch_id (0023)
-- rather than a new table: CloseBatch records batching on that column, and
-- a separate table nothing writes to would report every capture as
-- unbatched.
--
-- Named 0053a so it sorts after 0053 and before 0054 (the runner sorts
-- filenames). Guarded so a database where some other branch already
-- created a relation of this name is left untouched.

DO $$
BEGIN
  IF to_regclass('public.settlement_batch_events') IS NULL THEN
    CREATE VIEW settlement_batch_events AS
    SELECT te.settlement_batch_id,
           te.id AS transaction_event_id,
           te.transaction_id,
           te.event_type,
           te.amount_fils,
           te.occurred_at
      FROM transaction_events te
     WHERE te.settlement_batch_id IS NOT NULL;
  END IF;
END
$$;
