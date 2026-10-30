-- Fixed-window request counters for apps/api's rate limiter. Keys are SHA-256
-- digests, so no IP address, email or token is stored. UNLOGGED because a
-- counter lost in a crash only grants a client a fresh window, and every
-- limited request writes here, so skipping WAL matters more than durability.
CREATE UNLOGGED TABLE rate_limit_counters (
    key TEXT PRIMARY KEY,
    count INTEGER NOT NULL,
    reset_at TIMESTAMPTZ NOT NULL
);

-- The limiter's periodic sweep of expired windows.
CREATE INDEX rate_limit_counters_reset_at_idx ON rate_limit_counters (reset_at);
