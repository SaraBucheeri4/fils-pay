-- Watermarks remain diagnostic; receipts are authoritative even for late commits.
CREATE TABLE reporting_consumed_events (
    consumer_name TEXT NOT NULL,
    outbox_event_id BIGINT NOT NULL REFERENCES outbox_events(id),
    consumed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (consumer_name, outbox_event_id)
);
-- Preserve already applied rollups on upgrade. A controlled rebuild is required
-- to recover any events historically skipped by the sequence watermark.
INSERT INTO reporting_consumed_events (consumer_name, outbox_event_id)
SELECT c.consumer_name, e.id
FROM reporting_outbox_cursor c JOIN outbox_events e ON e.id <= c.last_processed_id
WHERE e.event_type IN ('transaction.captured', 'transaction.voided', 'settlement.batch_closed');
