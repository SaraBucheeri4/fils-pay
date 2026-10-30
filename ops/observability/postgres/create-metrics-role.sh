#!/bin/sh
# Creates or updates filspay_metrics, the role the exporters log in as. It can
# read Postgres's own statistics and the columns listed below, which never
# include amounts, payloads, tokens or names. Every session is read-only, and a
# slow query is cancelled rather than left running against the live database.
# Safe to re-run; re-running also applies a new password. Needs the migrations
# applied first, because the grants name their tables.
set -eu

psql -v ON_ERROR_STOP=1 -v metrics_password="$METRICS_DB_PASSWORD" <<'SQL'
SELECT 'CREATE ROLE filspay_metrics NOLOGIN'
 WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'filspay_metrics') \gexec

SELECT format('ALTER ROLE filspay_metrics LOGIN PASSWORD %L CONNECTION LIMIT 5', :'metrics_password') \gexec

ALTER ROLE filspay_metrics SET default_transaction_read_only = on;
ALTER ROLE filspay_metrics SET statement_timeout = '5s';
GRANT pg_monitor TO filspay_metrics;

GRANT SELECT (endpoint_id, status, next_attempt_at, last_attempted_at) ON webhook_deliveries TO filspay_metrics;
GRANT SELECT (id, status) ON webhook_endpoints TO filspay_metrics;
GRANT SELECT (id, event_type, created_at) ON outbox_events TO filspay_metrics;
GRANT SELECT (consumer_name, outbox_event_id) ON reporting_consumed_events TO filspay_metrics;
GRANT SELECT (merchant_id, batch_date, status) ON settlement_batches TO filspay_metrics;
GRANT SELECT (id, status, test_mode, created_at) ON merchants TO filspay_metrics;
GRANT SELECT (id, transaction_id) ON payment_links TO filspay_metrics;
GRANT SELECT (transaction_id, event_type, occurred_at) ON transaction_events TO filspay_metrics;
SQL

echo "filspay_metrics is ready"
