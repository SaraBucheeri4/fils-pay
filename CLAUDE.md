# FilsPay: operating rules and YA-attributed history

## Sole sources of truth for intended business behavior

By the user's instruction, the only authoritative business-design sources are:

- docs/ARCHITECTURE.md
- docs/HANDOVER.md
- Every record under docs/adr/, read in full, including status and supersession.

This guide, the checklist, code, schema, tests, comments, commit messages,
changelog and other documents do not override those sources. Code and tests
show actual implementation; a mismatch is evidence to investigate, not a
replacement business rule. Author attribution does not change authority:
do not exclude a designated source because MK, AM, FH or YA contributed to it.

Honor an accepted ADR's explicit supersession only within its stated scope.
Read proposed/paused ADRs as proposed work, not evidence a feature is approved
or implemented. If designated sources still contradict one another, identify
the exact conflicting passages and obtain an explicit resolution before
changing the affected behavior. Record an approved change in those sources
(a superseding ADR for an accepted decision); never silently choose by author,
code behavior, passing tests or checklist wording. External finance/provider
input must be reflected in an approved source update before it changes the rule.

ADR-0007 records the owner's 2026-10-30 approval: Bahrain windows and displayed
timestamps, ledger-authoritative CLI and console rebuilds, and atomic,
idempotent per-line residue posting. It supersedes ADR-0003's UTC-month
exception and ADR-0004's separate console source. Accepted settlement ADR
implementation is approved; do not ask for that same approval again.
ADR-0020 extends the Bahrain rule to file exports, inputs and operator logs.
ADR-0019 decides server-time link expiry, raw-byte callback signatures and
capture pricing without the volume tier, superseding those open points in
ARCHITECTURE, ADR-0012 and ADR-0014.

The remaining document conflict requiring care is HANDOVER versus ARCHITECTURE
on credit posting dates. ADR-0007 decides the residue question HANDOVER and
ADR-0002 disagreed on. Implementation status claims must not be mistaken for
proof a requirement is satisfied.

This guide limits historical business guidance to statements attributed to
Yousif Al-Ansari (YA), with their sources. Attribution is not proof of
authorship or correctness: the history is constructed, HANDOVER was moved
and annotated by MK, and ARCHITECTURE explicitly lists later editors.
Nothing below claims that YA wrote this replacement guide. The operating
rules below are current repository safeguards, not quotations from YA.

## Operating rules for a fresh session

- Work against a local, disposable stack only. Never point tools at staging
  or production. Inspect the target of DATABASE_URL before any command that
  writes fixtures, migrations, seeds or financial records; never print its
  credentials. An unset URL is not a successful integration-test setup.
- Read all designated sources above before changing business behavior.
  Check CHANGELOG.md and project_bug_checklist.md for historical evidence and
  existing findings, not additional authority. ADR-0016 and ADR-0019 set
  discount-before-MDR for new captures; do not reprice recorded historical fees.
- Time: everything a person reads or enters uses Asia/Bahrain (UTC+3, no DST),
  including CSV exports (ADR-0007, ADR-0020). Never shift a stored instant.
- Money is integer fils: 1 BD = 1000 fils. The monetary schema convention is
  BIGINT and Go money.Fils is int64. The platform counter is now BIGINT (B46,
  migration 0081); do not narrow amounts.
  Use parseBhdToFils for BHD text, applyRateFils for basis-point rates and
  formatBhd for display. Preserve half-to-even integer rounding; do not use
  floats or parseFloat for financial calculations. The two-decimal external
  scheme format is an explicit exception, not a change to internal units.
- Preserve packages/money and apps/settlement/internal/money. Monetary
  behavior changes require finance approval. Keep existing regression-locked
  tests intact unless explicitly authorized; add coverage in new test files.
  A passing test does not establish the business rule or excuse a known bug.
- Do not edit applied migrations. Add upgrade migrations after checking
  deployment history. Filename tracking currently has no checksum enforcement.
- Session/API-key/bearer-token and OTP randomness must use cryptographic
  generators. This current security rule is not attributed to YA. Seeded test
  fixtures and retry jitter have different randomness requirements.
- POST /v1/refunds returns 501 unless FEATURE_REFUNDS is on, and it defaults to
  off. Turning it on is the operator's release decision (ADR-0015), merchants
  must opt in one at a time (ADR-0009), and B16 stays open until a live refund
  test passes. Do not turn it on or enable a merchant as part of other work.
  Refund accounting uses the net fee actually charged by the relevant capture
  path, including discount debit legs, with cumulative partial-refund limits
  (B70/B83). Do not recompute a historical fee from a newly selected formula or
  today's merchant rate.
- The seed TRUNCATEs merchants with CASCADE and can erase linked data. A guard
  refuses non-disposable targets (B52), but a database name the guard accepts can
  still hold valuable data. Recalculate MDR no longer rewrites paid totals, but it
  posts real correction journals (B28, ADR-0010). reconcile_march is a dry run by
  default, and its --apply is a historical repair (B27).
  Do not run these against valuable data or as routine verification. No data
  repair, schema deployment, commit, or auth/money behavior change is authorized
  merely by reading this guide; obtain explicit authorization when needed.
- Do not dump db/seed/fixtures/production_seed.sql into context: it is roughly
  15 MB. Use targeted rg searches and bounded excerpts when relevant.

## Verification commands and baseline limits

- Run checks appropriate to the change, then the full suite before declaring
  a behavioral change complete: npm test, followed by go test ./... from
  apps/settlement. On Windows use go test -short ./... for the documented
  integration-test caveat; record that reduced scope.
- Scoped commands include npm test -w apps/api and go test ./internal/settlement/
  from apps/settlement. npm run typecheck checks the TypeScript workspaces,
  database tooling and scripts. Database tests require a migrated disposable
  Postgres; npm run migrate writes schema and must target that database only.
- Isolate workspace test fixtures by database/schema, or reset a disposable
  database between suites. Running sequentially alone does not prevent B60
  contamination. Never seed or migrate an unverified shared database to test.
- Some locked tests fail on purpose because they assert behavior an accepted ADR
  rejects, including dashboard.test.ts dayStartIso and
  TestSchedulingLocationUsesTZ. They stay unedited as evidence. The lists are in
  original_history.md section 9 and the checklist's Post-review follow-up.
  Establish and record actual failures for the current checkout before
  attributing them to a change.
- Report skipped/blocked checks explicitly; never label them passing.

## YA's stated approach

- **Exact money:** YA questions float32 money in commit `925744c`.
  In `9567ea0`, he explicitly says 4.75 BD is 4750 fils, not 475.
  The money implementation attributed to him in `ddda03b`
  (`packages/money/src/fils.ts`) uses integer fils, exact text parsing,
  half-to-even rate rounding and remainder allocation. These are supported
  by the implementation, not inferred from a reassuring comment.
- **Written finance evidence:** HANDOVER, People: "Huda knows the numbers.
  Trust what she sends in writing over what anyone remembers her saying."
  This is YA's stated preference; no unavailable finance contract is assumed
  to have been checked. ADRs and ARCHITECTURE have multiple contributors
  and must not be represented as exclusively YA's decisions.
- **Settlement dates:** HANDOVER, Timezone: the business day is Asia/Bahrain,
  with no DST. In ADR-0003's YA note dated 2026-03-02, he objects to UTC
  monthly reconciliation: windows compared against batches must use the
  same day. The accepted UTC-month decision is MK's, not YA's.
- **Ledger-based balances:** HANDOVER, Balances: the CLI reads the ledger;
  YA says there should not be a console rebuild reading another source.
  ADR-0004's later settled-data rebuild is MK's decision, not YA's.
- **Scheme residue:** HANDOVER, Scheme residue: YA describes posting residue
  inside CloseBatch as unfinished. ADR-0002's original March 2026 "implemented"
  claim was false; ADR-0007 required the posting and migration 0080 does it.
- **Webhook bytes:** HANDOVER, Webhook signing: "The dispatcher should sign
  exactly the bytes it sends." `fe24d26` mentions sign-raw, but is an empty
  commit; the dispatcher now signs and sends one serialized body (B22).
- **Holds:** HANDOVER, Holds: YA describes marking active holds expired with
  an UPDATE and retaining the rows. The original upstream script instead
  deleted rows; the fork subsequently changed the script. Treat the
  handover as a stated approach, not proof of historical implementation.
- **Unfinished work:** HANDOVER, Not finished: YA identifies per-service DB
  roles/TLS and outbox consumption by commit order instead of sequence ID
  as unfinished. The reference to an external gist does not establish that
  its proposed implementation exists in this repository.
- **Platform tier approval:** HANDOVER, Platform volume tier: YA requires
  written finance sign-off before introducing the tier. His separate claim
  that INTEGER is safe "while it's only a counter" is not reliable evidence
  of adequate capacity for cumulative fils. ADR-0019 removes the tier from new
  capture pricing; the column is now BIGINT.

## Discrepancies between documented statements and implementation

The designated documents remain authoritative for intended behavior. This
table records observed mismatches, re-checked against the code on 2026-10-30; it
does not demote HANDOVER or authorize the code to override it. Resolve conflicts
between designated documents first.

| YA-attributed claim | Current evidence | State |
|---|---|---|
| `transport.ts` said private-IP blocking already prevents SSRF. | `webhooks/create.ts` still checks only the scheme, but `transport.ts` now rejects non-public resolved addresses at send time, refuses redirects and caps response bytes (B63, B80). | Fixed |
| HANDOVER says the daemon's UTC date selection is harmless. | `scheduler/daemon.go` now picks the completed Bahrain day (B10). | Fixed |
| HANDOVER says impersonation is support-only and read-only. | `admin/impersonation.ts` maps every admin role to support, and auth rejects writes (B35, ADR-0008). | Fixed |
| HANDOVER says second approvers are compared by admin user ID. | `admin/creditApproval.ts` compares `adminUserId` (B67). | Fixed |
| HANDOVER says credit effective dates are metadata and ledger rows use now(). | `admin/credits.ts` posts at Bahrain midnight of the selected effective date, as ARCHITECTURE describes. | Open source conflict |
| HANDOVER says callbacks are deduplicated in processed_events. | That table never existed. `acquirer/callbacks.ts` dedupes notes with `ON CONFLICT (callback_id)` (migration 0091). | Fixed differently |
| HANDOVER says apps/api/src/v1 is the live partner API. | `app.ts` registers `routes/transactions.ts`; the `v1/routes` tree is not registered. | Still mismatched |
| HANDOVER calls refund helpers done and says partial fee reversals sum to the original fee. | Amount, concurrency and cumulative-fee defects are fixed (B20, B21, B83). The route is live only with FEATURE_REFUNDS on. B16 stays open. | Partly fixed |
| HANDOVER says there is no console balance-rebuild button. | The console has one, and it now uses the same ledger rebuild as the CLI (B14, ADR-0007). | Superseded by ADR-0007 |

The previous guide's blanket document precedence, fee-discount ordering,
crypto policy, test-failure counts and approval conventions were not shown
to be exclusively YA-authored. They are not attributed to him here.
Existing user instructions and approval requirements still apply; this
historical guide does not supersede them or resolve conflicting contracts.
