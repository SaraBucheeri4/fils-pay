-- Existing duplicate notifications require explicit historical review.
CREATE UNIQUE INDEX outbox_settlement_paid_once
    ON outbox_events (aggregate_id) WHERE event_type = 'settlement.paid';
