# Monitoring

Prometheus and Grafana, as an optional overlay on the normal stack. Nothing in
`docker-compose.yml` depends on it. Alerts show in Grafana only; nothing sends
notifications, so nobody is told unless they look. Logs and tracing aren't
included; logs stay in `docker logs`.

| Dashboard | Answers | Comes from |
|---|---|---|
| Infrastructure | Is the box and the database healthy? | `postgres-exporter`, `node-exporter`, `cadvisor` |
| Services | Is the API answering? Is the daemon's settlement pass working? | `/metrics` on `api` and `settlement` |
| Business health | Are payments, settlement, webhooks and reporting behaving? | `sql-exporter` |

Metrics are counts and timings. They hold no money amounts, merchant IDs or
tokens, and API routes are labelled by template, such as `/v1/transactions/:id`.

## Run it locally

From the repo root, with the application stack already up:

```bash
c() { docker compose -f ops/docker-compose.yml -f ops/docker-compose.observability.yml "$@"; }
c run --rm --build migrate   # metrics-role needs the current schema; this writes to the database
c run --rm metrics-role      # first time, after a schema change, or to change the password
c up -d --build --no-deps api settlement   # recreates them with METRICS_PORT set
c up -d --no-deps prometheus grafana postgres-exporter sql-exporter node-exporter cadvisor
c restart prometheus         # only if it was already running: it reads its config at start
```

- Grafana: <http://localhost:3001> (`admin` / `filspay_dev_grafana`)
- Prometheus: <http://localhost:9090>

`--no-deps` leaves every other application container alone. To use the overlay
without touching `api` and `settlement`, skip that line: their targets show as
down and the Services dashboard stays empty, but nothing else is affected.

`METRICS_PORT` is what turns `/metrics` on. It is unset without this overlay,
and the port is never published, so it can't be reached through Caddy.

## Run it on a server

Check `free -h` first. The monitoring containers are capped at about 1 GB in
total. Put the settings in `ops/.env`, which git ignores:

```bash
GRAFANA_ADMIN_PASSWORD=<your own>
METRICS_DB_PASSWORD=<your own, letters and digits only>
METRICS_DB_NAME=<the database the stack actually uses>
POSTGRES_ADMIN_PASSWORD=<the Postgres password>
```

Take a `pg_dump`, then from `ops/`, adding your usual environment such as
`FEATURE_REFUNDS`:

```bash
sudo docker compose -f docker-compose.yml -f docker-compose.observability.yml up -d --build
sudo docker compose -f docker-compose.yml -f docker-compose.observability.yml run --rm metrics-role
```

Every later redeploy needs both `-f` files. With only the first, `api` and
`settlement` are recreated without `METRICS_PORT`, and their targets go down.

Grafana and Prometheus bind to loopback. Reach them over an SSH tunnel:

```bash
ssh -L 3001:localhost:3001 -L 9090:localhost:9090 <user>@<server>
```

## Settings

| Variable | Default | |
|---|---|---|
| `GRAFANA_ADMIN_PASSWORD` | `filspay_dev_grafana` | Set your own on a server |
| `METRICS_DB_PASSWORD` | `filspay_dev_metrics` | Password for the read-only `filspay_metrics` role. Letters and digits only, because it goes into a URL. Set your own on a server, then re-run `metrics-role` |
| `METRICS_DB_NAME` | `filspay` | Database the exporters read. Must match the stack's actual database |
| `POSTGRES_ADMIN_USER` / `POSTGRES_ADMIN_PASSWORD` | local dev values | Used only by `metrics-role` to create the role |
| `PROMETHEUS_RETENTION_SIZE` | `500MB` | Oldest data is dropped at this size, or after 15 days |

## Checking the alert rules

```bash
docker compose -f ops/docker-compose.yml -f ops/docker-compose.observability.yml \
  exec prometheus promtool test rules \
  /etc/prometheus/tests/infrastructure.test.yml /etc/prometheus/tests/business.test.yml
```

## Alert runbooks

Severity `page` means act now; `ticket` means act this week. Neither sends
anything yet.

### PostgresDown

**Means:** the exporter has had no database connection for 2 minutes. The API's
`/readyz` stays green during this; it only checks at boot.
**First check:** `docker compose ps postgres`, then `docker compose logs --tail=50 postgres`.
If Postgres is healthy, check the exporter's log for a login error. That points
to `filspay_metrics` or `METRICS_DB_NAME`, not an outage.
**Escalate:** the person running the server. Don't restore or re-seed to fix this.

### MonitoringTargetDown

**Means:** Prometheus can't scrape the job named in the alert. Monitoring has
a gap, but the application may be fine.
**First check:** `docker compose ps`, then that service's log.
**Escalate:** the person running the server.

### PostgresConnectionsNearLimit

**Means:** over 80% of `max_connections` have been in use for 10 minutes. New
requests may start failing soon.
**First check:** the "Postgres connections by state" panel. Many `idle in transaction` connections
point at a stuck application transaction.
**Escalate:** the person running the server.

### HostDiskLow

**Means:** under 15% of the host's disk is free.
**First check:** `docker system df`. Lower `PROMETHEUS_RETENTION_SIZE` if
monitoring is the cause. Never use `docker compose down -v` or
`docker volume prune` to free space: the database lives in a volume.
**Escalate:** the person running the server.

### PaymentLinkMultipleCaptures

**Means:** a single-use payment link has more than one capture event in the last
24 hours (FP-205). A cardholder may have been charged twice, and it may reach the
next settlement batch. It only sees repeat captures on the link's current
transaction, so a link that was reopened and captured on a new transaction won't
show here. It clears 24 hours after the captures, even if nobody acted.
**First check:** find the links, then see `docs/incidents/postmortem-2026-05.md`:

```sql
SELECT pl.id, pl.merchant_id, count(*) AS captures
  FROM payment_links pl
  JOIN transaction_events te ON te.transaction_id = pl.transaction_id
 WHERE te.event_type IN ('captured', 'partially_captured')
   AND te.occurred_at >= now() - interval '24 hours'
 GROUP BY pl.id, pl.merchant_id
HAVING count(*) > 1;
```

**Escalate:** finance before the next settlement close, and the person running
the server. Don't edit ledger or batch rows to fix this.

### SettlementBatchMissing

**Means:** at least one active, non-test merchant has no closed or paid batch for
the last completed Bahrain business day. The check moves to the new day at 01:00
Bahrain time. A merchant activated after that day's close also counts until the
next close.
**First check:** the "Settlement passes by result" panel, then
`docker compose logs --tail=100 settlement`. If the daemon was down across more
than one day, it only catches up the most recent one.
**Escalate:** the person running the server, and finance if payouts are late.
Backfill a date with `settlement run-batch --date=YYYY-MM-DD`, which is safe to
repeat. Don't use `Recalculate MDR` or `reconcile_march` to fix this.

### SettlementPassFailing

**Means:** the daemon's daily pass has had failing merchants for 15 minutes, despite
retrying every minute. Other merchants still settle.
**First check:** `docker compose logs --tail=100 settlement`, which names each
failed merchant and its error.
**Escalate:** the person running the server, and finance if payouts are late.

### WebhookBacklogStuck

**Means:** a delivery has been due for over 15 minutes, so merchants aren't
receiving events on time.
**First check:** the "Webhook dispatcher last pass" panel. If it's recent, one
slow endpoint may be holding up the queue, because deliveries go out one at a
time. Check `docker compose logs --tail=100 api`.
**Escalate:** the person running the server.

### WebhookDispatcherStalled

**Means:** the dispatcher in the API process hasn't finished a pass for 15 minutes.
No new deliveries are being created, so the backlog alert can stay quiet.
**First check:** `docker compose logs --tail=100 api`, looking for
`dispatch pass failed`. A long pass over slow endpoints can also cause this.
**Escalate:** the person running the server. Restarting `api` is safe, and
delivery is at-least-once.

### ReportingOutboxLagging

**Means:** the reporting worker is over 15 minutes behind the outbox, so analytics
are out of date. Payments and settlement aren't affected.
**First check:** `docker compose ps reporting`, then
`docker compose logs --tail=50 reporting`. An error on one event blocks the ones
behind it.
**Escalate:** the person running the server.

### BusinessMetricsMissing

**Means:** `sql-exporter` isn't producing the settlement or capture metrics, so the
alerts built on them can't fire. The application may be fine.
**First check:** `docker compose logs --tail=20 sql-exporter`. `permission denied`
means a query uses a column with no grant, or the schema changed: re-run
`metrics-role`, and check `postgres/create-metrics-role.sh`. A missing table or
column means the migrations haven't been applied.
**Escalate:** the person running the server.

### ApiErrorRateHigh

**Means:** over 5% of API requests have returned a 5xx for 5 minutes.
**First check:** the "Routes returning 5xx" panel, then
`docker compose logs --tail=100 api`. If every route is failing, check PostgresDown.
**Escalate:** the person running the server.

### ApiLatencyHigh

**Means:** the slowest 5% of requests have taken over 2.5 seconds for 10 minutes.
**First check:** the "API latency" and "API event loop lag" panels. Lag on every
route points at the process; one slow route points at that route's query or a
call to the acquirer.
**Escalate:** the person running the server.
