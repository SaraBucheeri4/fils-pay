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

Remaining document conflicts requiring care include HANDOVER versus
ARCHITECTURE on credit posting dates, and HANDOVER versus
ADR-0002 on whether residue posting is already implemented. Implementation
status claims must not be mistaken for proof a requirement is satisfied.

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
  existing findings, not additional authority. Resolve B66 through the
  designated sources before changing the financial formula.
- Money is integer fils: 1 BD = 1000 fils. The monetary schema convention is
  BIGINT and Go money.Fils is int64; legacy exceptions such as the INTEGER
  platform counter are tracked defects, not permission to narrow amounts.
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
- Keep POST /v1/refunds disabled until the refund release blockers are
  resolved together. Adding refund.succeeded to a type list does not implement
  an envelope, reporting consumer, settlement adjustment or safe refund.
  Pending resolution of B66 in the designated sources, refund accounting uses the net fee
  actually charged by the relevant capture path, including discount debit
  legs, with cumulative partial-refund limits (B70/B83). Do not recompute a
  historical fee from a newly selected formula or today's merchant rate.
- The seed TRUNCATEs merchants with CASCADE and can erase linked data (B52).
  Recalculate MDR rewrites paid batch totals (B28). Re-running reconcile_march
  can post another correction (B27); it is not an idempotent inspection tool.
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
- Historical checklist records report API 391/392, with B59's original jitter
  assertion still failing; reporting 7/11 after contamination and 11/11 clean.
  Those figures are historical, not a fresh guaranteed baseline. Do not restore
  the unsupported 36/167 failure count. Establish and record actual failures
  for the current checkout before attributing them to a change.
- The last source audit could not complete normal suites because of sandbox
  spawn/cache errors and no configured disposable DATABASE_URL. Compiler/token
  equivalence checks verified comment-only edits, not database integration.
  Report skipped/blocked checks explicitly; never label them passing.

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
  inside CloseBatch as unfinished. ADR-0002's "implemented" status conflicts
  with that statement and with the missing posting in the reviewed code.
- **Webhook bytes:** HANDOVER, Webhook signing: "The dispatcher should sign
  exactly the bytes it sends." `fe24d26` mentions sign-raw, but is an empty
  commit; it does not contain the claimed fix.
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
  of adequate capacity for cumulative fils.

## Discrepancies between documented statements and implementation

The designated documents remain authoritative for intended behavior. This
table records observed mismatches; it does not demote HANDOVER or authorize
the code to override it. Resolve conflicts between designated documents first.

| YA-attributed claim | Conflicting evidence |
|---|---|
| `transport.ts` said private-IP blocking already prevents SSRF. | `webhooks/create.ts` checks URL scheme, not resolved private addresses. Transport follows redirects and has no response-byte cap. The false comment has been removed; behavior is unchanged. |
| HANDOVER says the daemon's UTC date selection is harmless. | `scheduler/daemon.go` passes a UTC date into the Bahrain date-label helper; early local-morning runs can select the wrong day. The helper itself is correct. |
| HANDOVER says impersonation is support-only and read-only. | `admin/impersonation.ts` maps finance/super_admin to finance/owner; transaction write routes do not enforce a read-only impersonation scope. |
| HANDOVER says second approvers are compared by admin user ID. | `admin/creditApproval.ts` compares display names. |
| HANDOVER says credit effective dates are metadata and ledger rows use now(). | `admin/credits.ts` posts at Bahrain midnight of the selected effective date. |
| HANDOVER says callbacks are deduplicated in processed_events. | `acquirer/callbacks.ts` appends notes; the claimed dedupe table/constraint is absent from the reviewed migrations. |
| HANDOVER says apps/api/src/v1 is the live partner API. | `app.ts` registers `routes/transactions.ts`, not `v1/routes/transactions.ts`. |
| HANDOVER calls refund helpers done and says partial fee reversals sum to the original fee. | Refund amount/concurrency defects remain; independently rounding each partial does not guarantee cumulative fee conservation. The route still returns 501. |
| HANDOVER says there is no console balance-rebuild button. | The current admin routes expose one. The historical statement does not describe the current fork. |

The previous guide's blanket document precedence, fee-discount ordering,
crypto policy, test-failure counts and approval conventions were not shown
to be exclusively YA-authored. They are not attributed to him here.
Existing user instructions and approval requirements still apply; this
historical guide does not supersede them or resolve conflicting contracts.
