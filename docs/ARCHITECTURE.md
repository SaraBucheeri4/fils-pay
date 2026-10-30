# FilsPay architecture

Written by YA (Feb 2026); updated by MK (settlement, admin), FH (audit prep)
and AM (ops). Where it disagrees with the code, raise a ticket: a mismatch is
evidence to investigate, and neither side wins automatically.

---

## Overview

FilsPay is a handful of services around a single Postgres 16 database:

| Component | Language | Responsibility |
|---|---|---|
| `apps/api` | TypeScript / Fastify | Merchant, checkout and admin HTTP API; webhook dispatcher; acquirer client |
| `apps/settlement` | Go | Daily batch close, fees, payouts, scheme file export, balance cache |
| `apps/reporting` | TypeScript | Analytics read model, fed from the outbox |
| `packages/money` | TypeScript | Fils type, parsing/formatting, rate and allocation helpers |
| `packages/events` | TypeScript | Outbox event types and `enqueueEvent` |

Services communicate through the database: a transactional outbox plus
`LISTEN/NOTIFY` for wake-ups, and a small authenticated internal HTTP API on
the settlement worker for admin-triggered operations.

## Money

All amounts are integers in fils (1 BD = 1000 fils). Money columns end in
`_fils` and are `BIGINT`; TypeScript carries the branded `Fils` type and Go
uses `money.Fils` (`int64`). Text input is converted with `parseBhdToFils`;
rates are integer basis points. `applyRateFils` rounds half-to-even.

The card scheme settles in two decimals. `apps/settlement` truncates each
exported line to a multiple of 10 fils at batch close.

## The ledger

`ledger_entries` is the record of money movements. Every movement is a group
of balanced legs sharing an `entry_group_id`, enforced by a deferred
constraint trigger (migration 0007). Corrections are new entries posted with
the effective date of the period they correct.

`merchant_balances` is a cache; `settlement rebuild-balances` refreshes it.
The daemon also refreshes it at 02:00 Bahrain time, and the console's
**Rebuild cached balances** button triggers the same refresh on demand.

## Settlement

A settlement business day runs from midnight to midnight Asia/Bahrain
(UTC+3, no DST). The daemon closes the previous business day shortly after
local midnight. Batch lifecycle: **close** claims unbatched capture events
and computes gross/fee/net; **pay** posts payout legs and records
disbursement; **notify** enqueues `settlement.paid`. Re-running a day is
safe; closed and paid batches are left alone.

Fees are computed per capture event, not per batch total. Rates come from
`fee_schedules`, falling back to `merchants.mdr_bps`. Discounts reduce the
amount the MDR is charged on.

## Time

Everything a person reads or enters uses Asia/Bahrain (UTC+3, no DST), including
file exports (ADR-0007, ADR-0020). Stored timestamps stay absolute instants, and
JSON API and webhook payloads may serialize them in UTC.

## Events

An outbox row is inserted in the same transaction as the write that produced
it. The reporting consumer records a receipt per event in the same transaction
as its effects, and its cursor is diagnostic only (migration 0092). The webhook
dispatcher tracks each event through its delivery rows. Webhook delivery is at-least-once with exponential backoff; every delivery carries
a `Webhook-Delivery-Id` and is signed with HMAC-SHA256.

## Security

- Merchant login is password then OTP. The pending session grants nothing
  until the OTP is verified.
- Merchant/admin OTP email uses Resend; ADR-0017 records the temporary demo
  recipient override. Production never exposes codes in responses or logs.
- Merchant-scoped queries take the merchant from the authenticated context.
- Outbound webhook signatures are HMAC-SHA256 compared in constant time.
- KYC uploads are validated by detected content type (magic bytes).

Payment links are single-use. Expiry is checked using database time at the
atomic claim. Client `submittedAt` cannot extend validity (ADR-0019).
Tokens are 128-bit, from `crypto.randomBytes`.

## The admin plane

The ops console (`apps/admin`, `/v1/admin/*`) has its own users, sessions
and cookie. Roles are `support` < `finance` < `super_admin`, checked
server-side per route. Audit rows are written in the same transaction as
the action, except capture-review operations that can call the acquirer, which
commit an attempt audit first (ADR-0016). Credits above the threshold need a
second approver.

## Operations

| Setting | Read by | Default |
|---|---|---|
| `DATABASE_URL` | all | — |
| `PGCONN_SETTLEMENT` | settlement | unset |
| `SETTLEMENT_INTERNAL_TOKEN` | api, settlement | No built-in default. The daemon exits without it, the api requires it in production, and compose sets `dev-token` locally |
| `ACQUIRER_CALLBACK_REQUIRE_SIGNATURE` | api | mandatory; legacy flag cannot disable verification |
| `FEATURE_REFUNDS` | api | `false`; turning it on is the operator's release decision (ADR-0015) |
| `METRICS_PORT` | api, settlement | `0`, which leaves `/metrics` off; the monitoring overlay sets `9464` |
| `FEATURE_ASYNC_CLOSE` | none | Listed historically; no application code reads it (checked 2026-10-30) |

The API is sized for 0.5 vCPU / 512 MB. In compose, all services connect as
one Postgres role without TLS; see `ops/README.md`.
