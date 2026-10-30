# Admin console

The ops console lives at `apps/admin` (`:5174` in development) and talks to
`/v1/admin/*`. It has its own logins, separate from merchant accounts, with
three roles:

| Role | Can do |
|---|---|
| **support** | look things up, replay webhooks, view as a merchant, issue small credits |
| **finance** | everything support can do, plus anything that touches money or settlement |
| **super_admin** | everything, including making changes while viewing as a merchant |

You'll only see the buttons your role can use. Everything you do here is
written to the admin audit log.

Everything below is routine. None of it can break the books — balances and
analytics are recalculated from the records underneath them, and every
money change is logged.

— YA / MK (merged from two drafts)

---

## Merchants

**Search** by name or paste a merchant id.

**KYC review** — approve or reject after checking the uploaded documents.
Approving moves the merchant to `approved` and marks KYC as passed.

**Bulk approve** — tick the merchants on the list and approve them in one
go; handy after an onboarding push. Only merchants currently `under_review`
are affected.

**Rotate API key** — immediately revokes the old key and issues a new key in
the same transaction, with an audit record. There is no grace period. The new
key is shown once. Send it to the
merchant through the usual secure channel.

**View as merchant** — opens the merchant's dashboard as they see it, for
15 minutes. Use **Exit impersonation** when you're done.

**Recompute transaction statuses** — tidies up transaction statuses for
merchants whose refunds were processed before the refunds release (the
manual refunds finance did over email in Q1). Safe to run more than once.

## Money

**Issue credit** — goodwill, dispute resolution, or a correction. Tick
"Also reverse the MDR" if the fee should come back too. Anything over the
approval limit (50.000 BD, principal only — the MDR reversal isn't counted)
goes to the credits queue for a second person; smaller credits post
immediately. Pick the effective date the credit belongs to — for a dispute
from last month, pick the effective date the credit belongs to.

**Adjust balance** — when a merchant's balance on screen is wrong and support
has confirmed the right figure (statement, phone call), enter the difference
and a reason. This is a display-only cache correction with an audit record
(ADR-0006); it creates no ledger posting and changes no settlement obligation.
It lasts until the next rebuild, including the nightly 02:00 refresh (ADR-0011). Use Rebuild, then Adjust. Finance-approved money
corrections require a separate balanced journal, counter-account and reason.

**Recalculate MDR** — after a merchant's rate changes, run this over the
date range approved by finance. Closed and paid batch totals remain frozen.
The difference becomes a new balanced journal for the corrected period and
is included in a later payout; a negative net carries forward (ADR-0010).
Rerunning at the same terms posts no additional correction.

**Import adjustments** — paste a CSV of corrections with a
`merchantId,amount,reason` header. Amounts are in BD as finance's sheets
already have them (`4.75`, `120.00`). Rows are applied as soon as you
submit; each import's rows are kept with the original text for reference.
Don't submit the same file twice; there's no duplicate detection yet.

## Settlement ops

**Re-run a daily batch** — pick a business date (and optionally one
merchant). Days that are already closed or paid are skipped, so re-running
is always safe.

**Rebuild cached balances** — refreshes every merchant's cached balance.
It uses the same ledger calculation as the CLI. Run it before applying any
display-only correction, because rebuilding overwrites those corrections.
It only rewrites the balance cache, never the ledger, so it's safe to run
as often as you like; it asks for confirmation because it covers every
merchant at once. The nightly recompute does the same thing at 02:00 Bahrain time (UTC+3).

**Rebuild analytics** — dashboards lag a little behind live activity by
design. If they look stale, rebuild them from scratch here instead of
waiting for the worker. Quick, safe, and repeatable.

**Payment-link capture reviews** — if the acquirer errored during a checkout
capture, the card may have been charged, so the link stays blocked (ADR-0013).
There is no console screen yet. Finance or a super admin lists them with
`GET /v1/admin/merchants/:id/payment-links/capture-reviews` and resolves one with
`POST /v1/admin/merchants/:id/payment-links/:linkId/capture-review`. Use
`retry_capture` to resend the same acquirer key, or `release` only once the
acquirer has confirmed no charge.

**Refunds** — off for every merchant until enabled here (ADR-0009, ADR-0015). A
finance or super admin uses **Enable refunds** on the merchant page, one merchant
at a time, and each change is audited. Refunds also need `FEATURE_REFUNDS=true`
on the API. Without both, the route refuses and the dashboard hides the button.

## Webhooks

> **— unsigned:** replay-batch reuses the original delivery ids, so receivers dedupe fine.

**Replay a batch** — pick an endpoint, a date range, and which delivery
statuses to resend (default: `exhausted`; any status can be chosen). Each
delivery is re-signed and queued; the merchant's receiver sees them as new
deliveries.

**Archive / restore** — before a merchant rotates their webhook URL,
archive the endpoint's history; after they register the new one, restore
the archive against it to backfill. No screen for this yet — it's
`POST /v1/admin/merchants/:id/webhook-endpoints/:endpointId/archive` and
`.../archive/:archiveId/replay`. Archives are written in pages of 1000
deliveries, so any range is fine.

## Incident review: duplicate `settlement.paid` (2026-08-21)

| | |
|---|---|
| Impact | Two merchants received `settlement.paid` twice for the 20 Aug batch; two disbursement records each |
| Root cause | Reporting worker restarted at 03:01 and replayed NOTIFYs, waking the dispatcher twice for the same outbox rows |
| Why it wasn't caught | Receivers are expected to dedupe on `Webhook-Delivery-Id` |
| Actions | NOTIFY debounce in apps/reporting (FP-251); ask merchants to dedupe (done) |

> **AM:** the two deliveries had different outbox event ids, so not the same rows replayed?
>
> **MK:** retry artefact

## Blocked captures

Finance and super admins can open **Blocked captures** (`/capture-reviews`) to
view unresolved payment-link captures across merchants, 50 at a time. Support
cannot open the queue or mutate reviews. The API independently enforces roles.

**Retry capture** reuses the original acquirer idempotency key. If the outcome
remains unknown, the link stays blocked; verify with the acquirer before
choosing another action. **Review release** requires a confirmation reference
or note, then **Confirm no charge and release**. The existing API records the
attempt and release evidence. The screen refreshes after either action,
including uncertain responses. It never assumes that an error released a link.

Browser verification of this new screen is pending on a disposable stack.

## If something looks wrong

Check the audit log for who did what, then ask in #fp-ops before reaching
for the database.
