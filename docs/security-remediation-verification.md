# Auth, webhook and reporting verification — 2026-10-30

Implementation evidence, not additional business-design authority. Policy
decisions are recorded in ADR-0008; refund coordination is documented in
security-refund-handoff.md. No staging/production access, deployment,
historical repair or provider-side secret rotation was performed.

## Verification

All database writes targeted a separate disposable Postgres 16 container,
`filspay-security-disposable-20261030`, bound to 127.0.0.1:55490. Each database
was freshly migrated before its final run:

| Check | Result | Evidence in reports/ |
|---|---|---|
| Added security unit tests | 9 passed | security-focused-unit-test.log |
| Added security integration tests | 12 passed | security-focused-integration-test.log |
| Existing reporting suite on its own clean database | 11 passed | security-reporting-clean-test.log |
| Existing root script tests | 8 passed | security-other-scripts-test.log |
| Windows Go suite | go test -short ./... passed | security-go-short-test.log |
| Two concurrent Go CLI processes against a paid fixture | One event, one payout record, zero subscribers, zero new ledger entries | security-payout-concurrency.log |
| Full TypeScript check | npm run typecheck passed | security-typecheck.log |
| Full npm suite | Failed; details below | security-full-npm-test.log |
| Diff hygiene | git diff --check passed; frozen money and existing tests unchanged | git diff |

The new integration suite uses SECURITY_TEST_DATABASE_URL, which must be a
local disposable database with `test`, `disposable` or `seed` in its name.
Run it separately from API/reporting fixtures:

```powershell
$env:SECURITY_TEST_DATABASE_URL = $env:DATABASE_URL # verified disposable target only
node --import tsx --test --test-timeout=20000 scripts/securityRemediation.test.ts
```

The test checks concurrent invitation redemption, immutable approver identity
(unit coverage), atomic bulk KYC with individual evidence and audit-failure
rollback, all-admin read-only impersonation, missing/valid/expired export
credentials, the concurrent fiftieth saved filter, late-committing events,
competing consumers and rebuilds, exact signed refund bytes, competing delivery
claims, retained disabled endpoint history, Bahrain refund dates, callback
freshness and deduplication, missing rollups, paid lifecycle updates, archive
budgets, decoded image limits, seed-target guards and the refund-summary join.

Transport tests inject only trusted test dependencies at the HTTP boundary.
Production resolves all addresses, rejects private/reserved destinations,
connects directly to a validated IP with the original Host/TLS server name,
rejects redirects, and caps response bytes at 64 KiB across the request deadline.
The implementation uses the documented Node [HTTP request options](https://nodejs.org/api/http.html#httprequestoptions-callback)
and [BlockList](https://nodejs.org/api/net.html#class-netblocklist) interfaces.

## Full-suite failures preserved for review

The API finished 387/401, with 14 failures:

- Five callback assertions accept unsigned callbacks or use a timestamp from
  2025; those conflict with mandatory authentication/freshness.
- One KYC assertion rejects a detected PDF because its filename lacks `.pdf`.
- One bulk-audit fixture is not under_review and now correctly rejects before
  reaching its injected audit failure. New coverage injects failure after a
  valid transition and confirms complete rollback.
- One webhook assertion expects hard deletion; ADR-0008 requires disabling.
- Five webhook scenarios target loopback HTTP receivers, now blocked by SSRF
  enforcement. New injected-boundary and exact-byte integration tests cover
  transport and delivery behavior without weakening production restrictions.
- The existing exact-backoff assertion expects 1000 ms despite the unchanged
  jitter implementation (B59). This task did not change either one.

The reporting workspace then finished 7/11 in the full run because API tests
leave malformed outbox fixtures in the shared database (B60). A separate clean
reporting database passes all 11 tests. Existing event, money and web suites
pass 4/4, 40/40 and 8/8 respectively. Since workspace failures prevent npm's
final root-script command from running, those tests were run separately.
No clean pre-change baseline is claimed. Existing tests were not edited,
deleted or skipped to hide failures.

## Upgrade and operational limits

- New migrations 0090–0095 were checked against available filenames and
  successfully applied on the disposable databases. Historical migrations
  remain unchanged. No remote deployment history was queried.
- Unique callback, disbursement and paid-event indexes deliberately fail if
  existing duplicate evidence needs review; this work does not delete it.
- Reporting receipts preserve the existing watermark on upgrade. A separately
  scoped rebuild is needed to recover events skipped before this fix.
- Rebuilds lock the consumer identity and hold a SHARE lock on the outbox
  until source/replay data and receipts commit. This ensures a consistent
  snapshot, but blocks outbox-producing writes during the rebuild; schedule
  that operation in a maintenance window.
- Archives reject windows over 1000 deliveries or 4 MiB without truncation.
  Legacy archives exceeding that budget require bounded offline handling.
  Audit-history pruning is disabled under ADR-0008.
- KYC decoding is capped at four million source pixels and two simultaneous
  decodes per API process. This is a conservative application budget, not a
  representative-container peak-memory benchmark.
- Destructive seeds require a local disposable database name and explicit
  ALLOW_DESTRUCTIVE_SEED equal to that exact name, including direct generate()
  callers. Default Compose seed commands therefore fail closed until an
  operator deliberately configures an eligible disposable target.
- Go changes remain confined to payout_notify.go. Payout records are created
  by the notification scan independently of subscribers. An immediate record
  in the actual bank-instruction transaction requires coordination with the
  friend owning batch.go; that file was not edited.
- B53 remains open: the committed secret is absent from the current environment
  file and permanently rejected by fingerprint, but the acquirer must rotate
  it and provision the replacement through the secret store. Git history was
  not rewritten and no provider-side rotation is claimed.
- The owner confirmed the current producer contract as the shared baseline on
  2026-10-30; no separate acknowledgement is outstanding. B16 remains open for
  refund/accounting release blockers outside this owner's scope. Envelope,
  delivery and consumer support have the previously recorded coverage; the
  public refund route remains disabled. No further tests were added after the
  owner's instruction to stop adding tests.

Changes are left uncommitted for review alongside the pre-existing
documentation changes. No deployment or data repair was performed.

## Impersonation follow-up from manual QA

The owner found a mixed-credential bypass: a valid merchant session took
precedence over a live impersonation grant and authorized payment-link creation.
The first implementation and its verification did not cover that combination.

The correction checks a live grant first, enforces read-only access in all
three merchant authentication middleware paths, and lets the dashboard identity
endpoint resolve the grant without requiring a real merchant session. Its
response identifies the impersonated merchant, support role, admin/grant
identity and a null merchantUserId. The client type permits that null value.
Session-only and API-key-only surfaces reject fallback to other credentials
while a grant is active. The admin plane retains its own authentication.

The isolated QA API was restarted on 127.0.0.1:3010. Real HTTP verification
with an Alpha owner session and a Beta impersonation grant confirmed:

- /v1/auth/me identifies Beta as support; no merchant user is fabricated.
- Payment-link creation, API-key creation, saved-filter creation and
  transaction authorization return 403.
- Transaction reads return 200.
- Ending the grant restores the real Alpha owner identity.

No new test files or cases were added after the owner's instruction. Existing
regression output is in reports/impersonation-followup-npm-test.log and
typechecking output is in reports/impersonation-followup-typecheck.log.
