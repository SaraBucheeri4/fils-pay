# FilsPay project bug checklist

Prepared 2026-10-29; source-audited 2026-10-30. The originally cited bugs.md is absent and is not supporting evidence. Duplicate reports are consolidated; distinct export problems are split for tracking. This is a remediation plan based on source inspection, not proof of runtime reproduction or a complete security audit.

Mark an item complete only when the fix and its dependent behavior have been verified. Integration decisions are tracked separately from confirmed implementation defects. No production-data repair is authorized by this checklist.

## Current source audit - 2026-10-30

- Reviewed original B01-B68 against current source/schema and historical evidence. Old test/reproduction statements are author-reported historical records, not fresh results.
- Removed from active defects: B07-B09 (integration scope), B13 (explicit display-only policy), B17 (documented client-clock policy), B30 (approximate monitoring), B54 (fixture hygiene, no established data exposure). B65 is consolidated into B21, not an unconditional status-change requirement.
- B56 is resolved by current guide edits; B57 false checksum assurance is corrected without adding checksums. B03 is repaired code awaiting account-kind approval. B59 remains open because replacement coverage does not retire its original failing test.
- Qualified B10/B14/B18/B26/B35/B45/B48/B49/B52/B53/B58/B60/B64/B66: removed false authority, unsupported causal/authorship claims and unconditional contract choices. Go's discount order is not established business authority.
- Added distinct gaps B69-B87. Existing entries cover related SSRF, paid-history, impersonation and approval problems, so those were not duplicated.
- Comment cleanup changes no executable financial/authentication behavior. No staging/production access or data repair is authorized by this audit.
- Verification: comment-free TypeScript compiler output is identical in 55 changed TS/TSX files; executable Go tokens are identical in 6 files; Compose non-comment content is unchanged. All 87 checklist IDs occur once. Full npm test attempt hit sandbox spawn EPERM; Go test -short hit denied build-cache access. DATABASE_URL is unset, so no database integration pass is claimed. Logs are in reports/checklist-audit-*-test.log.

## Cleanup scope and protected evidence

Runtime-source comments were corrected without changing executable behavior. Applied migrations, regression-locked tests, frozen money packages and archived narrative records were preserved. Old misleading comments there are historical evidence, not guarantees: SQL claims about64-bit INTEGER, scheme truncation, automatic callback dedupe and paged/compressed archives are disproved by B46/B26/B19/B37. This audit did not rewrite migration bytes or test assertions to hide that evidence.

## Historical status update — 2026-10-29

Verified against a local Docker stack (Postgres 16, all migrations, seed, all services running). Nothing was run against staging or production.

| State | Items |
|---|---|
| Historically reported resolved (not rerun here) | B01, B02, B04, B05, B06, B32, B34, B40, B41, B42, B43, B58, B61, B62, B68 |
| Fixed, verification or sign-off outstanding | B03 |
| Historically reported reproduced, not rerun here | B10, B11, B12, B14, B60 |
| Newly recorded (B40–B60) | see "Additional findings" and "Test suite results" at the end |
| Found in checklist review (B61–B68) | B61 (critical), B62–B64 and B68 (high), B65–B67; see "Checklist review" for reclassified items |

The source file named above, `bugs.md`, does not exist in this repository or its git history.

## Working rules

- Money amounts must remain whole fils; no floating-point money calculations. Resolve existing decimal input/export contracts explicitly rather than silently changing units.
- Daily settlement starts at midnight Asia/Bahrain (UTC+3), closing the completed business day.
- Use executable paths/schema for actual behavior and approved requirements for intended behavior. Cross-check documents and attributed comments; conflicting policies are not automatically defects.
- Respect existing money-package and test-file freezes. Identify any approval or policy change needed before implementation; a test preserving a bug must not dictate incorrect business behavior.
- Check migration deployment history before changing existing migration files. Fresh-install and upgrade paths both need validation.

## Fix order and dependencies

1. Startup: B01–B06. B02 must be repaired before the migration runner can reach B03.
2. Access and isolation: B32–B35, B23, B17–B18 and B31. Coordinate OTP enforcement with B09.
3. Money correctness: B10–B15, B20–B21 and B25–B30. Validate ledger/report effects together.
4. Activate refunds (B16) only after its safeguards and downstream consumers work. Live processing/payouts (B07–B08) require explicit product scope and provider integration.
5. Notifications and scale: B19, B22, B24 and B36–B39. Fix B38 before switching exports to the existing streaming helper.

Dependencies below include both strict prerequisites and changes that must be coordinated; they are not all blockers for starting investigation.

## Checklist

- [x] **B01 — Docker application builds reference missing files**

**Category:** Startup blocker.

**Summary and business impact:** Compose references Dockerfiles absent from the repository, so the documented container setup cannot build the applications.

**Code references:** [ops/docker-compose.yml](ops/docker-compose.yml), [ops/README.md](ops/README.md).

**Suggested fixes:** Add reproducible Node and Go Dockerfiles, or document running apps locally with only Postgres in Docker. Explicitly wire environment settings and order migration/seed jobs.

**Why this approach:** Makes the documented setup reproducible rather than dependent on files on an individual developer's machine.

**Dependencies / verification:** B02–B05; cannot run Docker is a broad report: confirm any Docker Desktop/engine error separately.

**Resolution (2026-10-29):** Added [ops/Dockerfile.node](ops/Dockerfile.node) (Node 22, two-stage so argon2 can compile on linux/arm64) and [ops/Dockerfile.go](ops/Dockerfile.go) (static distroless settlement binary), plus a root [.dockerignore](.dockerignore) that excludes host `node_modules`, `.git`, `docs` and all env files. Compose now orders startup postgres → migrate → seed (optional `seed` profile) → services, and adds `web`/`admin` services. Verified: all seven images build and every service starts. No Dockerfile had ever existed in git history, despite the README and compose comments saying otherwise.

**Re-verified (2026-10-29, B01–B05 review):** `docker compose config` is valid. The api container runs as `node` and settlement as uid 65532 (both non-root). The image contains no `.env*`, `.git` or `docs`. Startup ordering was exercised for real: when migrate failed earlier, no dependent service started.

- [x] **B02 — Migration 0054 references a nonexistent table**

**Category:** Startup blocker.

**Summary and business impact:** The unbatched-capture view references settlement_batch_events, which migrations do not create. Fresh database setup stops.

**Code references:** [db/migrations/0054_views.sql](db/migrations/0054_views.sql), [db/migrations/0023_transaction_events_settlement_batch.sql](db/migrations/0023_transaction_events_settlement_batch.sql), [db/migrate.ts](db/migrate.ts).

**Suggested fixes:** Use transaction_events.settlement_batch_id IS NULL and include both full and partial capture events. Check deployment history before choosing a safe repair for the migration chain.

**Why this approach:** Uses the schema the application actually writes and preserves eligibility for partial captures.

**Dependencies / verification:** B03 follows this migration. Verify a complete fresh migration and an upgrade from an existing schema.

**Status (2026-10-29): startup blocker fixed; item still open.** Added [db/migrations/0053a_settlement_batch_events.sql](db/migrations/0053a_settlement_batch_events.sql), which defines `settlement_batch_events` as a view over `transaction_events.settlement_batch_id` (the column CloseBatch writes), skipped if the relation already exists. Fresh install verified: 0053a–0073 applied cleanly. Outstanding: `v_unbatched_capture_events` still excludes `partially_captured`; the upgrade path from a database that has its own `settlement_batch_events` is untested; and 0054–0056 occupy numbers ADR-0005 reserves for settlement v2.

**Tested (2026-10-29), in throwaway databases since dropped:**
- Fresh install: all 68 migrations apply from empty. ✅
- Upgrade from 0053: the working database went 51 → 68. ✅
- Upgrade where `settlement_batch_events` already exists as a table: the guard skips it and 0054 builds on it; 68/68. ✅
- Correctness on seeded data: `settlement_batch_events` = batched events (1,200 = 1,200) ✅; no batched event appears as unbatched ✅.
- ❌ **Still open:** the view lists 217 unbatched captures, but CloseBatch will settle 223. The 6 missing are `partially_captured`. Fix with a new migration that recreates the view using `event_type IN ('captured','partially_captured') AND settlement_batch_id IS NULL`; do not edit 0054 in place (B57). The view has no code consumers today.

**Resolution (2026-10-29):** Added [0074_unbatched_capture_events_include_partial.sql](db/migrations/0074_unbatched_capture_events_include_partial.sql). It redefines `v_unbatched_capture_events` with CloseBatch's own rule (both capture kinds, `settlement_batch_id IS NULL`), keeps the existing columns and appends `occurred_at`. Verified:
- Upgrade on the working database: the view returns 223 rows and 223 events are CloseBatch-eligible; 0 extra, 0 missing; the 6 partial captures are now included.
- Fresh install: 69/69 migrations, with the expected column list.
- The full test suite passes on everything this touches.

The remaining item, migration numbers 0054–0056 that ADR-0005 reserves, is a governance question recorded under "Repository integrity concerns", not a defect in this fix.

- [ ] **B03 — Migration 0055 uses nonexistent account columns**

**Category:** Account-classification sign-off; original startup mismatch repaired.

**Summary and business impact:** The original insert used nonexistent columns. Current0055 uses id/name/kind and no longer blocks startup for that reason. Finance approval of unused account kinds is outstanding, not an unfixed column bug.

**Code references:** [db/migrations/0055_chart_of_accounts_suspense.sql](db/migrations/0055_chart_of_accounts_suspense.sql), [db/migrations/0007_ledger_double_entry.sql](db/migrations/0007_ledger_double_entry.sql), [db/migrate.ts](db/migrate.ts).

**Suggested fixes:** Align the insert with actual columns and permitted account kinds. Confirm the intended accounting classification and migration history before repairing the upgrade path.

**Why this approach:** Fixes the schema mismatch without inventing incompatible accounts or bypassing migration tracking.

**Dependencies / verification:** B02. Validate fresh installation and upgrades; do not silently modify migrations already applied elsewhere.

**Status (2026-10-29): fixed, awaiting finance sign-off.** [0055](db/migrations/0055_chart_of_accounts_suspense.sql) now inserts `(id, name, kind)` with kind `asset`, matching 0007's existing suspense account. Editing it was safe: as written it could not apply on any database with this schema. Fresh install verified (9 accounts present). Outstanding: finance must confirm the kind for `chargeback_suspense` before first use.

**Tested (2026-10-29):** fresh install and both upgrade paths apply 0055 cleanly. Accounts present: `fx_rounding_difference(asset)` and `chargeback_suspense(asset)`, alongside the 7 existing ones. No longer a startup blocker. **Blocked only on finance sign-off of the account kinds**, which is why this stays unchecked. Neither account is used by code yet. Note that [db/migrate.ts](db/migrate.ts) stores only filenames (no checksum, contrary to the inline comment), so a database that somehow applied a different 0055 would not be detected (see B57).

- [x] **B04 — Development encryption-key fallback has the wrong length**

**Category:** Startup blocker.

**Summary and business impact:** The fallback decodes to 34 bytes but AES-256-GCM configuration requires 32. API startup and seed configuration fail without an explicit valid key.

**Code references:** [apps/api/src/config.ts](apps/api/src/config.ts), [apps/api/src/webhooks/secretCrypto.ts](apps/api/src/webhooks/secretCrypto.ts), [db/seed/generate.ts](db/seed/generate.ts), [ops/docker-compose.yml](ops/docker-compose.yml).

**Suggested fixes:** Provision a persistent random 32-byte key encoded as Base64. Repair development provisioning and setup documentation; retain strict validation and never silently replace an existing encryption key.

**Why this approach:** Allows startup while keeping stored webhook secrets decryptable across restarts.

**Dependencies / verification:** B01. Existing encrypted secrets require the original key or an explicit migration/rotation procedure.

**Resolution (2026-10-29):** Confirmed the old fallback decoded to the 34-byte text `test-key-for-dev-only-not-for-prod`. [config.ts](apps/api/src/config.ts) now uses a 32-byte dev-only fallback; production still refuses to start without an explicit key, and the 32-byte validation is unchanged. Setup documented in [ops/README.md](ops/README.md) ("Webhook secret encryption key", including `openssl rand -base64 32` and a rotation warning). Verified: new [config.new.test.ts](apps/api/src/config.new.test.ts) passes 5/5, the API boots, and the seed completes. Re-verified inside the running api container (no key set, `NODE_ENV=development`): the key decodes to 32 bytes and an AES-256-GCM encrypt/decrypt round trip succeeds through `secretCrypto.ts`. No stored secrets were affected, because the old key could never start the API. This differs from the suggested fix: the dev key is built in and public rather than a provisioned random key. That is acceptable for local use only; revisit if dev databases ever hold real webhook secrets.

**Follow-up from code review (2026-10-30):** the fix above let any `NODE_ENV` other than exactly `production` boot with the public key, including an unset value or `staging`, because `parseNodeEnv` maps those to development. Previously the broken key made every such box refuse to start. The fallback now applies only when `NODE_ENV` is literally `development` or `test`; anything else requires a real key. Compose now sets `NODE_ENV: development` explicitly on `api` and `seed` (no behaviour change locally), and ops/README.md documents the rule. `config.new.test.ts` was updated (it previously asserted the unsafe unset-NODE_ENV fallback) and passes 9/9.

- [x] **B05 — Settlement internal token is not supplied by Compose**

**Category:** Startup blocker.

**Summary and business impact:** The daemon requires an internal token, but Compose does not supply one. Settlement cannot start as documented, and the API must use the matching token.

**Code references:** [ops/docker-compose.yml](ops/docker-compose.yml), [apps/settlement/internal/config/config.go](apps/settlement/internal/config/config.go), [apps/settlement/cmd/settlement/main.go](apps/settlement/cmd/settlement/main.go), [apps/api/src/config.ts](apps/api/src/config.ts).

**Suggested fixes:** Explicitly supply the same token to API and settlement and use the correct internal URL for local versus container execution.

**Why this approach:** Restores authenticated communication without weakening the internal API's access control.

**Dependencies / verification:** B01. Verify daemon startup and an authenticated API-to-settlement request.

**Resolution (2026-10-29):** Compose sets `SETTLEMENT_INTERNAL_TOKEN: dev-token` on both `api` and `settlement`, with `SETTLEMENT_INTERNAL_URL=http://settlement:8091`. The false compose comment ("falls back to dev-token") is corrected. Verified:
- Without the token, the daemon exits at boot (exit 1, `SETTLEMENT_INTERNAL_TOKEN environment variable is not set`). This was tested against a throwaway database.
- End to end: finance admin → `POST /v1/admin/settlement/run-batch` (2026-10-28) → API → settlement returned 200. Every batch was `alreadyClosed`/`alreadyPaid`, and 0 batches were newly closed (an idempotent no-op).
- Direct to settlement from the api container: no token 401, wrong token 401, correct token 200.
- Existing Go tests `internal/config` (3) and `internal/internalapi` (8) pass against a migrated database.

**Follow-ups (not blockers):**
- No test covers `RequireInternalToken` (daemon refusal), and the auth test does not cover `/internal/recalculate-mdr`. Add new test files.
- Outside Docker, the api's default `SETTLEMENT_INTERNAL_URL` is `http://settlement:8091`; a locally run api needs `SETTLEMENT_INTERNAL_URL=http://localhost:8091` and the same token. This is not yet documented in ops/README.
- ARCHITECTURE.md's settings table still says the token defaults to `dev-token` in dev, which is false.

- [x] **B06 — Browser apps cannot reach the API with current origin configuration**

**Category:** Browser blocker.

**Summary and business impact:** The dashboards run on different ports from the API, with no matching API CORS registration or Vite proxy. Login and data requests can fail in the browser.

**Code references:** [apps/web/vite.config.ts](apps/web/vite.config.ts), [apps/admin/vite.config.ts](apps/admin/vite.config.ts), [apps/web/src/api/client.ts](apps/web/src/api/client.ts), [apps/admin/src/api/client.ts](apps/admin/src/api/client.ts), [apps/api/src/app.ts](apps/api/src/app.ts).

**Suggested fixes:** For development, proxy /v1 to the API and configure relative frontend API URLs. For separate deployed origins, explicitly configure allowed origins and credentialed CORS.

**Why this approach:** Provides a consistent browser connection path while retaining cookie authentication.

**Dependencies / verification:** B04 and B32. Test both dashboards through password and OTP login, not just API health.

**Status (2026-10-29): confirmed.** A browser preflight `OPTIONS /v1/auth/login` with `Origin: http://localhost:5173` returns 404; the API registers no CORS handling. Password + OTP login succeeds for merchants and all three admin roles when called directly (curl), so the remaining blocker is the browser origin path.

**Fix applied (2026-10-29), awaiting manual browser confirmation:** development uses the suggested Vite proxy. [apps/web/vite.config.ts](apps/web/vite.config.ts) and [apps/admin/vite.config.ts](apps/admin/vite.config.ts) proxy `/v1` to `API_PROXY_TARGET` (default `http://localhost:3000`; compose sets `http://api:3000`). Both API clients now default to same-origin (`""`); `VITE_API_BASE_URL` / `VITE_ADMIN_API_BASE_URL` still override for a separately hosted api, which would then need credentialed CORS (not added). Also added a `/` → `/dashboard` redirect in [apps/web/src/router.tsx](apps/web/src/router.tsx); `localhost:5173/` previously showed a router 404 because no root route existed. Verified via the frontend origins: admin login → OTP → `/me` → merchant list 200 through :5174; merchant login → OTP → transactions 200 through :5173. Cookies are host-only and HttpOnly. Both apps typecheck. The code comment claiming "CORS is locked to the two origins in config" was false: the api has no CORS configuration.

**Manually confirmed in a browser (2026-10-29):** merchant dashboard login with password + OTP as `owner@gammahospitality.example` (transactions list loads, 25 rows, amounts shown in 3-decimal BHD); admin console login as `superadmin@filspay.test` (merchant list loads). Credentialed CORS for a separately hosted api remains unimplemented; it is only needed if the frontends are ever deployed on a different origin from the api.

- [ ] **B10 — Settlement does not close at Bahrain midnight**

**Category:** Business timing.

**Summary and business impact:** The scheduler uses the UTC calendar date when selecting the Bahrain day and adds a default delay. Activity can be assigned or processed on the wrong schedule.

**Code references:** [apps/settlement/internal/scheduler/daemon.go](apps/settlement/internal/scheduler/daemon.go), [apps/settlement/internal/settlement/window.go](apps/settlement/internal/settlement/window.go), [apps/settlement/internal/config/config.go](apps/settlement/internal/config/config.go).

**Suggested fixes:** Choose the completed date in Asia/Bahrain before constructing the window. Preserve half-open boundaries and recover missed dates. The configured15-minute delay is an explicit scheduling choice; removing it requires an agreed schedule, not this bug fix.

**Why this approach:** Uses one business calendar independent of host timezone and keeps the midnight cutoff exact even when batch processing takes time.

**Dependencies / verification:** B15, B27 and B39. Audit boundary events and missed dates; a scheduler fix does not repair old closed batches.

**Status (2026-10-29): confirmed by simulation.** Replaying `runIfDue`'s logic across a Bahrain midnight: at 00:05–02:59 Bahrain it re-runs the day before yesterday (an idempotent no-op), and it first closes yesterday at 03:00 Bahrain (00:00 UTC). The 15-minute delay never takes effect. Window boundaries themselves (`BusinessDayWindow`) are correct when given a Bahrain date.

- [ ] **B11 — Net payout calculation uses float32 dinars**

**Category:** Money correctness.

**Summary and business impact:** NetPayableFils converts gross and fees to float32 dinars before returning fils. Precision loss can alter money owed to merchants.

**Code references:** [apps/settlement/internal/settlement/payable.go](apps/settlement/internal/settlement/payable.go), [apps/settlement/internal/settlement/batch.go](apps/settlement/internal/settlement/batch.go).

**Suggested fixes:** Calculate net directly as integer gross fils minus integer fee fils, with validated ranges and overflow handling.

**Why this approach:** Subtraction in the authoritative unit preserves every fil without a lossy conversion.

**Dependencies / verification:** B25, B28, B30 and B39. Reconcile changed results; preserve historical paid records and correct discrepancies explicitly.

**Status (2026-10-29): confirmed.** With the same arithmetic as `NetPayableFils`, gross 98,765,432 and fee 2,469,136 fils give 96,296,297 instead of 96,296,296: one fil overpaid. Smaller batches tested exact.

- [ ] **B12 — CSV adjustment amounts use a two-decimal parser**

**Category:** Money correctness.

**Summary and business impact:** Amounts documented as dinars are converted with a generic two-decimal parser, causing incorrect fils values and lost precision in ledger corrections.

**Code references:** [apps/api/src/admin/adjustmentCsvParsing.ts](apps/api/src/admin/adjustmentCsvParsing.ts), [apps/api/src/lib/decimal.ts](apps/api/src/lib/decimal.ts), [apps/api/src/admin/adjustmentImport.ts](apps/api/src/admin/adjustmentImport.ts), [packages/money/src/fils.ts](packages/money/src/fils.ts).

**Suggested fixes:** Use the existing exact parseBhdToFils helper for the documented legacy dinar-text interface. If imports must accept whole fils only, explicitly version/change the input contract and labels; never silently reinterpret units. Reject unsupported precision.

**Why this approach:** Makes input units explicit and produces whole-fils postings without truncation or floating-point parsing.

**Dependencies / verification:** B13. Audit past imports separately; fixing parsing does not correct existing ledger entries.

**Status (2026-10-29): confirmed by code path.** `parseAdjustmentAmountFils` calls `parseDecimalMinor(raw)` with its default of 2 decimals, so `"4.75"` (the format ADMIN.md tells finance to use) becomes 475 fils = 0.475 BD, ten times too small.

- [ ] **B14 — Admin and CLI balance rebuilds use different sources**

**Category:** Accounting correctness / policy conflict.

**Summary and business impact:** The fast path uses a view summing historical scheme gross without subtracting fees or payouts. A fully paid merchant can receive lifetime gross labelled cached payable. Different sources are an ADR-0004 decision; lifetime gross versus unpaid liability is the arithmetic defect.

**Code references:** [apps/settlement/internal/ledger/rebuild.go](apps/settlement/internal/ledger/rebuild.go), [apps/settlement/internal/ledger/refresh.go](apps/settlement/internal/ledger/refresh.go), [apps/settlement/internal/internalapi/server.go](apps/settlement/internal/internalapi/server.go), [db/migrations/0054_views.sql](db/migrations/0054_views.sql), [docs/adr/0004-balance-rebuild-source.md](docs/adr/0004-balance-rebuild-source.md).

**Suggested fixes:** Define current payable from actual unpaid liabilities and reconcile against ledger/statements. Different performance strategies must produce the same financial quantity; two implementations alone are not the defect.

**Why this approach:** A shared accounting definition prevents two supposedly equivalent operations producing different financial answers.

**Dependencies / verification:** B13 first or coordinated. Rebuilds erase cache-only adjustments; compare before/after values and ledger totals before rollout.

**Status (2026-10-29): confirmed, and worse than a source mismatch.** `merchant_payable_position` (0054) is `SUM(scheme_export_lines.amount_fils)` per merchant: lifetime gross, truncated to 10 fils, with no fees or payouts subtracted. The console's **Rebuild cached balances** therefore sets every merchant's balance to an inflated figure, and support's documented workflow then hand-corrects it with cache-only **Adjust balance**. Escalate to finance before anyone presses the button.

**Test locks in the bug:** `TestRebuildBalances_ValidToken` ([server_test.go](apps/settlement/internal/internalapi/server_test.go)) seeds a batch with gross 12,000 and net payout 11,700, then *requires* the rebuilt balance to be 12,000 (gross). It passes because the code is wrong. Per the working rules, this test must not dictate the fix; add a replacement test in a new file when B14 is resolved.

- [ ] **B15 — Scheme residue is not posted during batch close**

**Category:** Accounting correctness.

**Summary and business impact:** CloseBatch stores scheme lines but does not journal the integer-fils remainder required by ADR 0002. Ledger and external settlement records cannot reconcile consistently.

**Code references:** [apps/settlement/internal/settlement/batch.go](apps/settlement/internal/settlement/batch.go), [apps/settlement/internal/settlement/scheme_export.go](apps/settlement/internal/settlement/scheme_export.go), [db/migrations/0007_ledger_double_entry.sql](db/migrations/0007_ledger_double_entry.sql), [docs/adr/0002-scheme-residue-at-export.md](docs/adr/0002-scheme-residue-at-export.md).

**Suggested fixes:** Calculate residue from gross and the authoritative exported integer amount. Post the ADR's balanced clearing/residue entries atomically with the line, with a stable identity preventing duplicate postings.

**Why this approach:** Ties each difference to its source line and prevents missing or duplicate accounting entries.

**Dependencies / verification:** B26 determines the export amount; B27 must avoid sweeping residue already posted. Historical repairs require reconciliation.

- [ ] **B16 — Refund journey is not wired end to end**

**Category:** Feature blocker.

**Summary and business impact:** The public route returns 501. Helpers and tables alone do not deliver a safe refund, settlement deduction, report update or merchant notification.

**Code references:** [apps/api/src/routes/refunds.ts](apps/api/src/routes/refunds.ts), [apps/api/src/refunds/initiateMerchantRefund.ts](apps/api/src/refunds/initiateMerchantRefund.ts), [apps/api/src/payments/processRefund.ts](apps/api/src/payments/processRefund.ts), [apps/web/src/pages/transactions/RefundDrawer.tsx](apps/web/src/pages/transactions/RefundDrawer.tsx), [apps/settlement/internal/settlement/batch.go](apps/settlement/internal/settlement/batch.go), [apps/reporting/src/consumer/runConsumerPass.ts](apps/reporting/src/consumer/runConsumerPass.ts), [apps/api/src/webhooks/envelope.ts](apps/api/src/webhooks/envelope.ts), [apps/api/src/webhooks/dispatcher.ts](apps/api/src/webhooks/dispatcher.ts).

**Suggested fixes:** After fixing refund correctness, agree one endpoint and connect route/UI, state changes, net fee reversal, next-settlement deductions, reports and refund.succeeded delivery. Reverse fees cumulatively so partial refunds cannot over-reverse the original net fee.

**Why this approach:** Prevents exposing a refund button that moves money but leaves settlement or reconciliation inconsistent.

**Dependencies / verification:** B20, B21, B22 and B23 before activation; coordinate B28 and B39. Add envelope support before enabling a new dispatcher event type.

- [ ] **B18 — Slow payment attempts allow two buyers to pay one link** — **high: confirmed code-path race; historical causation not independently established**

**Category:** Duplicate charge.

**Summary and business impact:** A timed-out reservation becomes claimable while its first processor request may still be running. Both attempts can capture before finalization.

**Code references:** [apps/api/src/paymentLinks/pay.ts](apps/api/src/paymentLinks/pay.ts), [apps/api/src/payments/authorize.ts](apps/api/src/payments/authorize.ts), [apps/api/src/payments/capture.ts](apps/api/src/payments/capture.ts), [db/migrations/0020_payment_links.sql](db/migrations/0020_payment_links.sql).

**Suggested fixes:** Persist a single active payment attempt with ownership and stable processor idempotency keys. Recover unknown outcomes before allowing another charge. Check ownership at finalization and enforce single-use before capture.

**Why this approach:** Protects customers before money moves; a longer timeout or a uniqueness error after capture cannot undo a double charge.

**Dependencies / verification:** B17 and B07. Include crash recovery so the fix does not leave links permanently reserved.

**Source evidence (2026-10-30): the race matches the incident narrative; production causation is not independently verified.**
- [docs/incidents/postmortem-2026-05.md](docs/incidents/postmortem-2026-05.md) says links were "captured more than once" because duplicate acquirer callbacks produced a second capture. Its own timeline records the doubles as "captures are 60–70 s apart".
- 60 s is exactly `PAYMENT_LINK_RESERVATION_TIMEOUT_SECONDS`' default ([config.ts](apps/api/src/config.ts), line 253). The claim in [pay.ts](apps/api/src/paymentLinks/pay.ts) lets a second buyer take a link once `reserved_at` is older than that, while the first buyer's processor call may still be running. Finalize matches only `WHERE id = $1 AND status = 'reserved'`, with no reservation/attempt identity, so it cannot tell whose reservation it is finalizing. Both buyers' captures complete.
- The callback path cannot produce a capture at all (see B19), so this snapshot's callback-note handler cannot explain the claimed capture side effect.
- The June eng sync ([2026-06-02-eng-sync.md](docs/meetings/2026-06-02-eng-sync.md)) shows the real fix, FP-202 ("one successful capture per link", AM), held back because the PR also changed the timeout to 300 s and MK wanted them split, while the callback "dedupe" (FP-201) was reported deployed. It also closes "holds staying active" (postmortem: two Gamma holds stayed `active` after the extra captures) as a duplicate of the callback issue.
- Nothing in the code has changed since: B18 is still exploitable whenever an acquirer call outlasts the reservation timeout. Raising the timeout (the FP-202 side change) only narrows the window; the fix is the attempt identity and single-capture guarantee described above.
- Follow-ups: correct the postmortem's root cause (as a dated correction, not a rewrite); re-check the two Gamma holds and the settled extra captures that finance credited.

- [ ] **B19 — Callback redeliveries insert duplicate notes**

**Category:** Duplicate event processing.

**Summary and business impact:** Every callback is inserted and callback identity is not unique, so retries produce duplicate timeline evidence.

**Code references:** [apps/api/src/acquirer/callbacks.ts](apps/api/src/acquirer/callbacks.ts), [apps/api/src/routes/acquirerCallbacks.ts](apps/api/src/routes/acquirerCallbacks.ts), [db/migrations/0051_acquirer_callback_notes.sql](db/migrations/0051_acquirer_callback_notes.sql).

**Suggested fixes:** Enforce provider-scoped callback identity in the database and record effects in the same transaction. Acknowledge exact duplicates without reapplying; flag identity reuse with conflicting content.

**Why this approach:** Database uniqueness protects both sequential retries and simultaneous processes.

**Dependencies / verification:** B23. Review existing duplicate rows before adding uniqueness; do not conflate callback retries with the separate link-reservation bug.

**Evidence (2026-10-30): the claimed fix was never made, and this bug did not cause incident 2026-05-14.**
- Commit `bf66bf2` ("fix: callbacks are deduplicated now", AM, 2026-05-14) changes **no files**; its message says "They are not. But the incident is closed." No `processed_events` table or unique index on `callback_id` exists in any migration; [0051](db/migrations/0051_acquirer_callback_notes.sql) itself contains "AM: can't find processed_events or FP-238's index anywhere". CHANGELOG 1.6.0/1.9.0, HANDOVER and the postmortem ("hotfix adding callback deduplication (`processed_events`) was deployed at 11:20 on 14 May") all describe a fix that does not exist.
- The handler ([callbacks.ts](apps/api/src/acquirer/callbacks.ts)) only inserts into `acquirer_callback_notes`, whose `callback_type` is CHECK-constrained to `'fraud_review.completed'`, and its own docblock says it does not change transaction status or the ledger. A redelivered callback therefore duplicates a **note**, never a capture. The postmortem's root cause ("the second application produced a second capture") cannot happen in this code; the doubles came from B18.
- Severity stays medium: duplicate timeline evidence, not money movement. Still fix with the suggested database uniqueness, and record the false fix claims in the CHANGELOG/postmortem corrections alongside B18.

- [ ] **B20 — Concurrent refunds can return money twice**

**Category:** Refund concurrency; latent release blocker while the public route returns501.

**Summary and business impact:** Validation and completion occur in separate transactions without reserving refundable funds. Two requests can both use the same available balance.

**Code references:** [apps/api/src/payments/processRefund.ts](apps/api/src/payments/processRefund.ts), [apps/api/src/payments/idempotency.ts](apps/api/src/payments/idempotency.ts), [db/migrations/0042_refunds.sql](db/migrations/0042_refunds.sql).

**Suggested fixes:** Lock the scoped transaction, validate availability and persist a pending refund reservation atomically. Use a stable provider refund identity, then finalize once. Keep ambiguous outcomes pending until recovered.

**Why this approach:** Coordinates different idempotency keys and survives process crashes without over-refunding or losing a successful external refund.

**Dependencies / verification:** B21 and B16. A lock only during validation is insufficient if it is released without a durable reservation.

- [ ] **B21 — Refund limits use authorization instead of captured funds**

**Category:** Refund amount validation; latent release blocker while the public route returns501.

**Summary and business impact:** The helper subtracts refunds from the authorized amount, permitting refunds of money never captured on partially captured transactions.

**Code references:** [apps/api/src/payments/processRefund.ts](apps/api/src/payments/processRefund.ts), [apps/api/src/payments/refundValidation.ts](apps/api/src/payments/refundValidation.ts), [apps/api/src/payments/refundState.ts](apps/api/src/payments/refundState.ts).

**Suggested fixes:** Use captured fils minus successful refunds minus pending reservations under the transaction lock. Validate positive whole fils and authenticated merchant ownership before any processor call.

**Why this approach:** Constrains refunds to actual collected funds rather than an unused authorization ceiling.

**Dependencies / verification:** B20. Verify partial captures, repeated partial refunds, cross-merchant requests and cumulative fee reversal before B16.

- [ ] **B22 — Outbound webhook signatures cover different bytes than delivery**

**Category:** Integration correctness.

**Summary and business impact:** Signing uses canonical JSON while delivery uses ordinary JSON.stringify. Merchants verifying the received bytes can reject authentic notifications.

**Code references:** [apps/api/src/webhooks/sign.ts](apps/api/src/webhooks/sign.ts), [apps/api/src/webhooks/dispatcher.ts](apps/api/src/webhooks/dispatcher.ts), [apps/api/src/webhooks/testSend.ts](apps/api/src/webhooks/testSend.ts), [apps/api/src/webhooks/transport.ts](apps/api/src/webhooks/transport.ts).

**Suggested fixes:** Serialize once, sign the timestamp plus that exact body, and send those unchanged bytes. Apply the same contract to normal sends, tests and replays.

**Why this approach:** Makes the signature describe exactly what the receiver receives, independent of JSON property order.

**Dependencies / verification:** B16 and B24. Check compatibility for receivers previously canonicalizing bodies and document the raw-body contract.

- [ ] **B23 — Inbound callback verification permits unsigned or stale messages**

**Category:** Callback authentication.

**Summary and business impact:** Verification can accept absent signatures, has no freshness check, and uses Buffer.compare rather than a timing-safe equality check.

**Code references:** [apps/api/src/webhooks/inboundVerify.ts](apps/api/src/webhooks/inboundVerify.ts), [apps/api/src/routes/acquirerCallbacks.ts](apps/api/src/routes/acquirerCallbacks.ts), [apps/api/src/config.ts](apps/api/src/config.ts), [apps/api/src/lib/crypto.ts](apps/api/src/lib/crypto.ts).

**Suggested fixes:** Require live signatures, strictly parse headers, compare equal-length decoded MACs with timingSafeEqual, and enforce the provider-agreed timestamp policy. Authenticate the exact body representation required by the provider.

**Why this approach:** Rejects unauthenticated/tampered requests and limits replay without relying on misleading helper names.

**Dependencies / verification:** B19 and B07. Coordinate signing support with the provider/simulator before enforcing it; freshness policy must accommodate legitimate retries.

- [ ] **B24 — Concurrent payout scans enqueue duplicate notifications**

**Category:** Duplicate payout events.

**Summary and business impact:** A NOT EXISTS scan followed by insertion is not atomic across the daemon and CLI. Duplicate logical events can trigger duplicate messages and disbursement effects.

**Code references:** [apps/settlement/internal/settlement/payout_notify.go](apps/settlement/internal/settlement/payout_notify.go), [db/migrations/0009_outbox_events.sql](db/migrations/0009_outbox_events.sql), [apps/api/src/webhooks/payoutDisbursement.ts](apps/api/src/webhooks/payoutDisbursement.ts), [db/migrations/0057_settlement_payout_disbursements.sql](db/migrations/0057_settlement_payout_disbursements.sql).

**Suggested fixes:** Add event-specific database uniqueness for settlement.paid per batch and conflict-safe insertion. Independently deduplicate payout/disbursement effects by business identity.

**Why this approach:** Database constraints coordinate all processes; event-specific uniqueness preserves legitimate repeated partial-capture events.

**Dependencies / verification:** B08 and B22. Review existing duplicates and verify concurrent daemon/CLI passes create one logical payout.

- [ ] **B25 — Child payouts do not sum to the parent payout**

**Category:** Money allocation.

**Summary and business impact:** Each child's share is rounded independently, so total child payouts can be above or below the parent's amount.

**Code references:** [apps/settlement/internal/splits/shares.go](apps/settlement/internal/splits/shares.go), [apps/settlement/internal/splits/allocate.go](apps/settlement/internal/splits/allocate.go), [packages/money/src/fils.ts](packages/money/src/fils.ts).

**Suggested fixes:** Allocate integer base shares and distribute remaining fils by largest remainder with stable tie-breaking. Validate the weight contract and assert exact conservation before posting.

**Why this approach:** Every fil is allocated deterministically, with no created or lost money.

**Dependencies / verification:** B11 establishes the correct parent total. Use the existing allocation algorithm as reference; frozen money packages are not implicitly authorized for edits.

- [ ] **B26 — Exported scheme amounts differ from stored scheme fils**

**Category:** Money representation.

**Summary and business impact:** A decimal value derived from gross is rounded by NUMERIC(10,2), while amount_fils is truncated separately. The exporter prefers the decimal value.

**Code references:** [apps/settlement/internal/settlement/scheme_export.go](apps/settlement/internal/settlement/scheme_export.go), [apps/settlement/internal/settlement/batch.go](apps/settlement/internal/settlement/batch.go), [db/migrations/0050_scheme_export_lines_acquirer_amount.sql](db/migrations/0050_scheme_export_lines_acquirer_amount.sql).

**Suggested fixes:** Derive the external decimal representation from one authoritative integer scheme amount. ADR-0002 explicitly permits a two-decimal scheme file. There is no established blanket user ban on decimal text; confirm the acquirer contract before changing that format.

**Why this approach:** One amount shared by export and accounting eliminates inconsistent rounding paths.

**Dependencies / verification:** B15 and B27. Preserve evidence of files already sent and reconcile historical differences before any re-export.

- [ ] **B27 — March reconciliation posts duplicate corrections on rerun**

**Category:** Reconciliation idempotency.

**Summary and business impact:** Fresh UUIDs are generated on every execution and no business-level duplicate guard exists, so reruns can change balances again.

**Code references:** [scripts/reconcile_march.ts](scripts/reconcile_march.ts), [db/migrations/0007_ledger_double_entry.sql](db/migrations/0007_ledger_double_entry.sql).

**Suggested fixes:** Use a stable reconciliation/source identity enforced uniquely in the database, claimed in the same transaction as the correction. Use reconciled source lines, exclude already-accounted residue and provide a dry run.

**Why this approach:** An operation identity remains the same across retries and processes, unlike a newly generated entry UUID.

**Dependencies / verification:** B15, B26 and B10. Resolve the documented monthly-window conflict and review existing postings; repair duplicates with explicit compensating entries.

- [ ] **B28 — MDR recalculation rewrites frozen paid batch totals**

**Category:** Historical accounting.

**Summary and business impact:** Recalculation selects non-open batches and updates their fee/net totals even after payout, changing the recorded history of what was paid.

**Code references:** [apps/settlement/internal/settlement/recalculate_mdr.go](apps/settlement/internal/settlement/recalculate_mdr.go), [apps/settlement/internal/settlement/batch.go](apps/settlement/internal/settlement/batch.go), [apps/api/src/admin/settlementClient.ts](apps/api/src/admin/settlementClient.ts).

**Suggested fixes:** Preserve closed/paid batch amounts. Store approved corrections separately, linked to the source batch with a stable identity, and settle their financial effect once in an appropriate later payout. Apply the agreed accounting effective date.

**Why this approach:** Preserves payout evidence while allowing traceable corrections that actually affect money owed.

**Dependencies / verification:** B08, B13, B14 and B16. Coordinate settlement/report consumption; merely stopping the UPDATE would leave corrections unpaid.

- [ ] **B29 — Displayed current fee uses entry date instead of effective date**

**Category:** Pricing visibility.

**Summary and business impact:** The display selects the latest created fee schedule, so backdated or future rows can show a rate that charging does not use.

**Code references:** [apps/api/src/fees/currentFeeScheduleDisplay.ts](apps/api/src/fees/currentFeeScheduleDisplay.ts), [apps/api/src/fees/feeSchedule.ts](apps/api/src/fees/feeSchedule.ts), [apps/settlement/internal/settlement/fee_schedule.go](apps/settlement/internal/settlement/fee_schedule.go).

**Suggested fixes:** Use the same effective-date resolution and fallback as charging, with deterministic tie-breaking. Label base rates and discounts separately.

**Why this approach:** Explains the actual applicable pricing instead of when a staff member entered a schedule.

**Dependencies / verification:** B28. Do not change historical charged rates just to match a previously incorrect display.

- [ ] **B31 — Status maintenance accidentally activates test merchants**

**Category:** Test/live isolation.

**Summary and business impact:** Status recomputation excludes authorized rows, reports zero open authorizations, and can then clear test_mode. Test captures can become eligible for real settlement.

**Code references:** [apps/api/src/admin/transactionStatusRecompute.ts](apps/api/src/admin/transactionStatusRecompute.ts), [apps/api/src/admin/merchantFlags.ts](apps/api/src/admin/merchantFlags.ts), [apps/api/src/routes/adminMerchantsRecompute.ts](apps/api/src/routes/adminMerchantsRecompute.ts), [apps/settlement/internal/settlement/batch.go](apps/settlement/internal/settlement/batch.go).

**Suggested fixes:** Remove activation from status maintenance. Use a separate authorized and audited go-live operation; preserve each transaction's test/live provenance. Count open authorizations from the correct population when needed.

**Why this approach:** Separates maintenance from a business activation decision and prevents historical test money entering live payouts.

**Dependencies / verification:** B08 and B10. Audit previously changed merchants before backfills or live payout activation.

- [x] **B32 — Pending merchant sessions bypass OTP verification**

**Category:** Authentication.

**Summary and business impact:** The protected session lookup reads live_sessions without requiring authenticated=true, so a password-only pending session can grant access.

**Code references:** [apps/api/src/auth/sessions.ts](apps/api/src/auth/sessions.ts), [db/migrations/0058_live_sessions.sql](db/migrations/0058_live_sessions.sql), [apps/api/src/auth/requireMerchantAuth.ts](apps/api/src/auth/requireMerchantAuth.ts), [apps/web/src/auth/DashboardAuthContext.tsx](apps/web/src/auth/DashboardAuthContext.tsx).

**Suggested fixes:** Require authenticated=true for every protected merchant-session lookup. Keep pending lookups limited to OTP endpoints and verify promotion/expiry/revocation handling.

**Why this approach:** Enforces the intended two-step authentication boundary on the server.

**Dependencies / verification:** B06 and B09. Dashboard calls made before OTP must now remain in the OTP flow rather than expect protected data.

**Resolution (2026-10-30):** `lookupSession` in [sessions.ts](apps/api/src/auth/sessions.ts) now requires `s.authenticated = true`; it backs both `requireSession` and the cookie path of `requireMerchantAuth`. The OTP endpoints keep using `lookupPendingSession`. The dashboard calls `/me` only after OTP and treats 401 as logged out, so its flow is unchanged. The false MK comment in `routes/apiKeys.ts` was removed. Verified: new [pendingSession.new.test.ts](apps/api/src/auth/pendingSession.new.test.ts) failed on the old code (pending session got 200 on payment links and 201 issuing an API key) and passes now. Also fixes B62.

**Follow-ups from code review (2026-10-30):**
- *Logout:* `/v1/auth/logout` used `requireSession`, so after this fix a user who abandoned login on the OTP screen could not revoke the pending session. Logout now accepts an authenticated or a pending session and revokes it; no or an invalid cookie is still 401. Verified by new [logout.new.test.ts](apps/api/src/routes/logout.new.test.ts) (3/3, including that a revoked pending session cannot complete OTP).
- *View:* `live_sessions` still listed pending sessions, so any future reader would reintroduce this bug. New migration [0075_live_sessions_authenticated_only.sql](db/migrations/0075_live_sessions_authenticated_only.sql) adds `authenticated = true` to the view (same columns, so `CREATE OR REPLACE` applies). The explicit check in `lookupSession` stays for databases that have not run 0075. A new test in `pendingSession.new.test.ts` failed before the migration and passes after it. Applied to `filspay_test` only; the local `filspay` database and the Docker image need `docker compose build migrate api` and an `up` to pick it up.

- [ ] **B33 — Merchant and admin OTP codes use Math.random**

**Category:** Authentication randomness.

**Summary and business impact:** OTP generation uses a non-cryptographic random source for login credentials. Database uniqueness does not provide unpredictability.

**Code references:** [apps/api/src/auth/otp.ts](apps/api/src/auth/otp.ts), [apps/api/src/adminAuth/otp.ts](apps/api/src/adminAuth/otp.ts), [apps/api/src/lib/random.ts](apps/api/src/lib/random.ts).

**Suggested fixes:** Use crypto.randomInt for OTP digits while preserving code length and leading zeroes. Retain expiry, atomic attempt limits, single-use verification and resend controls.

**Why this approach:** Uses a random source intended for security-sensitive credentials without changing the user's login process.

**Dependencies / verification:** B32 and B09. Prefer an OTP-specific change or audit other consumers before changing a shared random helper; earlier repository guidance conflicts with this remediation.

- [x] **B34 — Merchants can cancel another merchant's payment link**

**Category:** Merchant isolation.

**Summary and business impact:** The cancellation helper updates and reads by link ID only. URL merchant validation does not prove the supplied link belongs to that merchant.

**Code references:** [apps/api/src/paymentLinks/cancel.ts](apps/api/src/paymentLinks/cancel.ts), [apps/api/src/routes/paymentLinks.ts](apps/api/src/routes/paymentLinks.ts).

**Suggested fixes:** Pass merchant ID from authenticated context and require both link ID and merchant ID in update and lookup queries. Return not-found for out-of-scope links.

**Why this approach:** Enforces ownership at the database operation that changes the resource.

**Dependencies / verification:** B32. Verify merchant A cannot cancel merchant B's link even through A's valid URL.

**Resolution (2026-10-30):** [cancel.ts](apps/api/src/paymentLinks/cancel.ts) now takes `merchantId` and filters both the UPDATE and the follow-up lookup by it; the route passes `request.merchantAuth.merchantId`. An out-of-scope link returns 404. Verified: new [paymentLinks.new.test.ts](apps/api/src/routes/paymentLinks.new.test.ts) failed on the old code (204, link canceled) and passes now; cancelling one's own link still returns 204.

- [ ] **B35 — Impersonation grants exceed documented write permissions**

**Category:** Authorization policy conflict.

**Summary and business impact:** Impersonation lacks an enforced read-only scope. Finance/super_admin map to finance/owner, but even support grants reach capture/void routes that only require authentication. Existing grants also lack an active-admin check. Rendered always-support/read-only promises contradict this code; documents conflict over the intended role policy.

**Code references:** [apps/api/src/admin/impersonation.ts](apps/api/src/admin/impersonation.ts), [apps/api/src/auth/requireMerchantAuth.ts](apps/api/src/auth/requireMerchantAuth.ts), [apps/api/src/routes/adminMerchants.ts](apps/api/src/routes/adminMerchants.ts), [docs/ADMIN.md](docs/ADMIN.md), [docs/HANDOVER.md](docs/HANDOVER.md).

**Suggested fixes:** Agree explicit impersonation scopes, enforce them on each write path, retain truthful admin actor attribution and reject inactive originating admins. Align product copy; mapping to support alone does not make access read-only.

**Why this approach:** Makes permissions depend on an explicit server-enforced grant rather than broad merchant roles or hidden UI buttons.

**Dependencies / verification:** B32 and B34. Test writes through merchant endpoints for every admin role, including expired and disabled-admin grants.

- [ ] **B36 — Transaction CSV exports load the full result into memory**

**Category:** Resource use.

**Summary and business impact:** The active export route loads all rows, maps them into strings and joins one large CSV. Large requests can exhaust API memory and interrupt other merchants' payments.

**Code references:** [apps/api/src/transactions/exportCsv.ts](apps/api/src/transactions/exportCsv.ts), [apps/api/src/routes/transactions.ts](apps/api/src/routes/transactions.ts).

**Suggested fixes:** Use bounded reads and streaming with backpressure, or a durable background export job. Apply server-side resource limits and cancellation handling; keep amount units explicit.

**Why this approach:** Bounds memory by batch size rather than merchant history while retaining complete exports.

**Dependencies / verification:** B38 must be fixed before adopting the existing streaming helper. Measure actual memory; an OOM incident has not been reproduced in this review.

- [ ] **B37 — Webhook archive creation and replay load entire histories**

**Category:** Resource use.

**Summary and business impact:** Archive creation fetches all deliveries and serializes one large document; replay reads it all back. Large histories can exhaust memory despite documentation describing pages.

**Code references:** [apps/api/src/webhooks/archiveReplay.ts](apps/api/src/webhooks/archiveReplay.ts), [db/migrations/0068_webhook_delivery_archives.sql](db/migrations/0068_webhook_delivery_archives.sql), [apps/api/src/routes/adminMerchants.ts](apps/api/src/routes/adminMerchants.ts).

**Suggested fixes:** Store archives in bounded chunks or streamed storage, with resumable job progress and bounded replay batches. Preserve delivery provenance and define replay identity explicitly.

**Why this approach:** Keeps complete audit history without holding the entire history in one API process.

**Dependencies / verification:** B22 and B24. Existing archive format needs a compatibility/migration plan; this is split from the large-export source entry.

- [ ] **B38 — Existing streaming export cursor can skip transactions**

**Category:** Latent export correctness.

**Summary and business impact:** The streaming helper paginates only by occurred_at and advances with a strict greater-than timestamp. Rows sharing the boundary timestamp can be omitted.

**Code references:** [apps/api/src/transactions/exportCsv.ts](apps/api/src/transactions/exportCsv.ts).

**Suggested fixes:** Order and paginate by the composite (occurred_at, id), preserve database timestamp precision in the cursor, and define snapshot consistency for concurrent writes.

**Why this approach:** A stable unique ordering prevents silent omissions at page boundaries.

**Dependencies / verification:** B36. Test more than one page of rows sharing a timestamp before wiring this helper into the live route.

- [ ] **B39 — Settlement summary overcounts partial captures and is slow**

**Category:** Reporting correctness / performance.

**Summary and business impact:** The summary joins capture events to transactions, then sums each transaction's running captured total once per event. Partial captures inflate business totals and the join adds unnecessary work.

**Code references:** [apps/api/src/settlement/query.ts](apps/api/src/settlement/query.ts), [apps/api/src/routes/settlement.ts](apps/api/src/routes/settlement.ts), [docs/perf/2026-07-settlement-summary-slow.md](docs/perf/2026-07-settlement-summary-slow.md).

**Suggested fixes:** Sum per-event amount_fils within the Bahrain window and count distinct transactions separately. After correcting totals, inspect the query plan and add measured indexes. Reconcile with matching batch windows.

**Why this approach:** Measures the money moved in the requested period instead of repeatedly counting cumulative totals; correctness comes before tuning.

**Dependencies / verification:** B10, B11 and B16. Verify captures spanning multiple days and profile representative high-volume data.

## Additional findings (recorded 2026-10-29)

Found while getting the local stack running and cross-referencing migrations, code and seed. Same format as above. "Latent" means the code path is not reachable today.

- [x] **B40 — Node containers could not write to their own app directory**

**Category:** Startup blocker (introduced and fixed in B01's new Dockerfile).

**Summary and business impact:** The app files were owned by root while containers run as the non-root `node` user. Vite failed with `EACCES` writing its config timestamp file, so `web` and `admin` exited on start.

**Code references:** [ops/Dockerfile.node](ops/Dockerfile.node).

**Suggested fixes:** Give the runtime user ownership of `/app` (`COPY --chown=node:node`) rather than running as root.

**Why this approach:** Keeps the containers non-root while letting Vite write its cache and the API write KYC uploads.

**Dependencies / verification:** B01.

**Resolution (2026-10-29):** Fixed as suggested. Verified: `web` (:5173) and `admin` (:5174) start and return 200.

- [x] **B41 — Documented Node version cannot install the dependencies**

**Category:** Startup blocker / documentation.

**Summary and business impact:** ops/README specified `node:20`, but `cookie@2` (via `@fastify/cookie`) requires Node ≥ 22, and `argon2` has no prebuilt linux/arm64 binary, so it needs Python and a C++ toolchain. `npm ci` failed in a Node 20 slim image.

**Code references:** [ops/Dockerfile.node](ops/Dockerfile.node), [ops/README.md](ops/README.md), [package-lock.json](package-lock.json).

**Suggested fixes:** Use Node 22; compile native modules in the full Debian image and copy them into the slim runtime of the same Debian release.

**Why this approach:** Matches the lockfile's engine requirements without shipping a compiler in the runtime image.

**Dependencies / verification:** B01.

**Resolution (2026-10-29):** Fixed as suggested; README updated. Verified: `npm ci` succeeds and argon2 password hashing works (seed and logins).

- [x] **B42 — Merchant login can create a session for a different merchant**

**Category:** Authentication / merchant isolation. **High severity.**

**Summary and business impact:** `/v1/auth/login` verifies the password for the requested merchant, then issues the OTP challenge and session for `findOtpRecipient(email)`: any active user with that email at any merchant (`LIMIT 1`, no ordering). A person with accounts at two merchants can land in the wrong merchant's dashboard with that account's role.

**Code references:** [apps/api/src/routes/auth.ts](apps/api/src/routes/auth.ts) (line 78), [apps/api/src/auth/users.ts](apps/api/src/auth/users.ts).

**Suggested fixes:** Issue the challenge and session for the already-verified `user`, never an email-only lookup. If OTP delivery needs a contact address, read it from that same row.

**Why this approach:** The identity that passed the password check is the only identity the session may represent.

**Dependencies / verification:** B32 (both concern the merchant session boundary). Add a new test: the same email at two merchants must yield a session for the requested merchant only.

**Status (2026-10-29): confirmed locally.** Logging in to Beta Digital Services as `owner@alpharetail.example` returned `merchantId` of Alpha Retail Co. Not fixed; awaiting approval because it changes authentication.

**Resolution (2026-10-29):** [auth.ts](apps/api/src/routes/auth.ts) now issues the challenge and session for the `user` row that passed the password check. The email-only helper `apps/api/src/auth/users.ts` (`findOtpRecipient`, no other callers) was deleted so it cannot be reused. New test [auth.new.test.ts](apps/api/src/routes/auth.new.test.ts) covers two cases: the same email at two merchants, each login lands in the requested merchant with that row's role; and a password valid at merchant A is rejected at merchant B. Verified:
- Against the original code the first test **fails** (wrong merchantId returned); against the fix both pass. The test fails deterministically on the bug whichever row Postgres picks.
- On the running site after an api rebuild: Alpha → Alpha and Beta → Beta for the shared email.

Existing sessions issued before the fix may belong to the wrong merchant; in a real deployment, revoke merchant sessions for emails that exist under more than one merchant.

- [x] **B43 — Reporting refund rollup writes columns no migration creates**

**Category:** Schema gap (latent).

**Summary and business impact:** `applyDailySummaryRollup` writes `merchant_daily_volume.refund_count` and `refund_gross_fils`, which 0027 never created. It would fail the first time refunds are wired into reporting.

**Code references:** [apps/reporting/src/consumer/applyEvent.ts](apps/reporting/src/consumer/applyEvent.ts), [db/migrations/0027_merchant_daily_volume.sql](db/migrations/0027_merchant_daily_volume.sql).

**Suggested fixes:** Add the columns in a new migration with zero defaults.

**Why this approach:** Additive and safe on existing rows; no data rewrite.

**Dependencies / verification:** B16, B44.

**Resolution (2026-10-29):** Added [0073_merchant_daily_volume_refunds.sql](db/migrations/0073_merchant_daily_volume_refunds.sql). Verified: both columns exist after migration. The rollup itself is still not wired (B16) and buckets by the wrong date (B44).

- [ ] **B44 — Refund daily rollup buckets by UTC date**

**Category:** Business timing (latent).

**Summary and business impact:** The rollup keys on `occurredAt.toISOString().slice(0, 10)`, the UTC date. Refunds between 00:00 and 03:00 Bahrain time land on the previous business day, unlike captures and settlement.

**Code references:** [apps/reporting/src/consumer/applyEvent.ts](apps/reporting/src/consumer/applyEvent.ts), [apps/reporting/src/bahrainDate.ts](apps/reporting/src/bahrainDate.ts).

**Suggested fixes:** Use the existing `toBahrainDateString` helper.

**Why this approach:** One business calendar across all reporting.

**Dependencies / verification:** B10, B16. Test refunds at 23:59 and 00:01 Bahrain time.

- [ ] **B45 — Refund summary view joins on the wrong column**

**Category:** Reporting correctness (latent).

**Summary and business impact:** The unused materialized view joins transactions.id to refunds.id instead of refunds.transaction_id. Most rows disappear; coincidentally matching unrelated IDs could associate the wrong transaction. Always empty is too strong. No current reader/refresh path was established.

**Code references:** [db/migrations/0072_refund_merchant_summary.sql](db/migrations/0072_refund_merchant_summary.sql).

**Suggested fixes:** Recreate the materialized view in a new migration with the correct join. 0072 applies successfully, so do not edit it in place.

**Why this approach:** Databases that already ran 0072 get the correction through normal migration.

**Dependencies / verification:** B16.

- [ ] **B46 — Platform volume counter overflows int32**

**Category:** Money correctness.

**Summary and business impact:** `platform_stats.total_processed_fils` is `INTEGER`, and the Go code reads and writes it as `int32`. The maximum is about 2,147,483.647 BD, just above the 2,000,000 BD volume-tier threshold. Once exceeded, the counter wraps negative (or the write fails) and the platform-wide tier discount silently disappears.

**Code references:** [apps/settlement/internal/settlement/platform_volume.go](apps/settlement/internal/settlement/platform_volume.go), [db/migrations/0049_platform_stats.sql](db/migrations/0049_platform_stats.sql).

**Suggested fixes:** Migrate the column to `BIGINT` and use `int64` throughout; reject or alert on overflow.

**Why this approach:** ADR-0001 requires `BIGINT` money columns.

**Dependencies / verification:** Check the production value before migrating.

- [ ] **B47 — Promotional discount parser uses floats and cents**

**Category:** Money correctness (latent; not called anywhere today).

**Summary and business impact:** `parsePromotionalDiscountFils` does `Math.round(parseFloat(raw) * 100)`: float parsing, and ×100 instead of ×1000. `"1.500"` becomes 150 fils instead of 1500.

**Code references:** [apps/api/src/payments/discountAdjustment.ts](apps/api/src/payments/discountAdjustment.ts).

**Suggested fixes:** Use `parseBhdToFils`, or delete the unused function.

**Why this approach:** ADR-0001: one exact parser for BD text.

**Dependencies / verification:** None.

- [ ] **B48 — Refund settlement notification divides the amount by 10**

**Category:** Money correctness (latent; not called anywhere today).

**Summary and business impact:** The unused helper sends amountFils divided by10 while labelling it fils; feeReversedFils stays unscaled. No caller or implemented /internal/refund-adjustment endpoint exists. This is a latent malformed request, not evidence settlement currently deducts a tenth of a refund.

**Code references:** [apps/api/src/admin/settlementClient.ts](apps/api/src/admin/settlementClient.ts).

**Suggested fixes:** Send integer fils unchanged; settlement already works in fils.

**Why this approach:** No unit conversion between services (ADR-0001).

**Dependencies / verification:** B16.

- [ ] **B49 — Settlement report fee estimate uses floating-point rates**

**Category:** Money correctness.

**Summary and business impact:** `estimateFeeFils` multiplies by `bps / 10000` as floats and rounds once with `Math.round` (half-up), unlike settlement's integer half-to-even `ComputeSettlementFee`. The report's fees can disagree with the batch by a fil per event.

**Code references:** [apps/api/src/fees/estimate.ts](apps/api/src/fees/estimate.ts), [apps/api/src/settlement/query.ts](apps/api/src/settlement/query.ts), [apps/settlement/internal/settlement/discounted_fee.go](apps/settlement/internal/settlement/discounted_fee.go).

**Suggested fixes:** Use exact integer rate arithmetic with the authoritative formula selected under B66. Do not automatically adopt Go ordering; its contract authority is disputed.

**Why this approach:** The rounding/formula mismatch is confirmed, but the old CLAUDE.md assertion is not pricing authority.

**Dependencies / verification:** B39. Compare report and batch fees across seed data.

- [ ] **B50 — Payment-link tokens use Math.random**

**Category:** Payment authorization.

**Summary and business impact:** ARCHITECTURE.md states link tokens are 128-bit from `crypto.randomBytes`; the code builds them from `Math.random`. A link token is what lets someone pay a link, so it should be unpredictable.

**Code references:** [apps/api/src/paymentLinks/create.ts](apps/api/src/paymentLinks/create.ts), [apps/api/src/lib/random.ts](apps/api/src/lib/random.ts).

**Suggested fixes:** Generate from `crypto.randomBytes` (or `crypto.randomInt` per character) with at least 128 bits of entropy.

**Why this approach:** Matches the documented design; uniqueness constraints do not provide unpredictability.

**Dependencies / verification:** B33 uses the same random helper. The old agent-rule justification was removed; uniqueness does not establish unpredictability.

- [ ] **B51 — Admin invite code references a table that does not exist**

**Category:** Schema gap / authentication randomness (dead code).

**Summary and business impact:** `inviteCode.ts` reads and writes `admin_invites`, which no migration creates, and generates admin invite codes with `Math.random`. Nothing imports it today.

**Code references:** [apps/api/src/admin/inviteCode.ts](apps/api/src/admin/inviteCode.ts).

**Suggested fixes:** Delete it, or add a migration and switch to `crypto` before wiring it up.

**Why this approach:** Prevents a broken, weakly random admin-onboarding path from being enabled later.

**Dependencies / verification:** None.

- [ ] **B52 — Seed wipes every merchant-linked table**

**Category:** Operational safety.

**Summary and business impact:** The seed TRUNCATE includes merchants CASCADE and can empty all referencing data, not just fixture rows. Shared-database safety assurances are false. This is a possible reset mechanism, not independent proof of who caused a narrated staging reset.

**Code references:** [db/seed/generate.ts](db/seed/generate.ts), [docs/RUNBOOK.md](docs/RUNBOOK.md), [ops/docker-compose.yml](ops/docker-compose.yml).

**Suggested fixes:** Refuse to run unless the database is clearly local or disposable (an explicit flag or a database-name check); correct the documentation.

**Why this approach:** A guard is more reliable than a warning in a runbook.

**Dependencies / verification:** None. Do not run the seed against any shared database until fixed.

- [ ] **B53 — Acquirer callback signing secret is committed to git**

**Category:** Security.

**Summary and business impact:** ops/.env.docker is tracked and contains a callback-secret value. Compose does not load it via env_file. Sandbox-only labelling does not prove actual credential use or production compromise.

**Code references:** [ops/.env.docker](ops/.env.docker), [.gitignore](.gitignore), [ops/docker-compose.yml](ops/docker-compose.yml).

**Suggested fixes:** Replace embedded examples with placeholders and correct ignore/loading guidance. Rotate with the provider if actual sandbox/live use is confirmed; do not assert a real credential incident from scenario text alone.

**Why this approach:** Anyone with repository access has the secret; deleting the file alone leaves it in history.

**Dependencies / verification:** B23. Confirm with the acquirer whether this is the sandbox or a live secret.

- [ ] **B55 — Documented nightly balance refresh does not exist**

**Category:** Documentation / operations.

**Summary and business impact:** ARCHITECTURE.md and ADMIN.md say the daemon refreshes cached balances at 02:00 Bahrain time. The daemon only closes batches and enqueues payout notifications.

**Code references:** [apps/settlement/internal/scheduler/daemon.go](apps/settlement/internal/scheduler/daemon.go), [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/ADMIN.md](docs/ADMIN.md).

**Suggested fixes:** Decide whether a nightly refresh is wanted (and from which source, per B14); then implement it or remove the claim.

**Why this approach:** Support and finance rely on that claim when judging balance staleness.

**Dependencies / verification:** B14.

- [x] **B56 — AI agent rule files contradict ADR-0001 and the settlement window**

**Category:** Resolved documentation defect; historical record retained.

**Summary and business impact:** Original rules prescribed cents, UTC windows and acceptable float32 money. Current CLAUDE.md is source-linked YA-attribution guidance; AGENTS.md/.cursorrules point to it and state correct fils/Bahrain facts. The original false instructions are removed; financial policy disputes remain separate.

**Code references:** [CLAUDE.md](CLAUDE.md), [AGENTS.md](AGENTS.md), [.cursorrules](.cursorrules), [docs/adr/0001-integer-fils.md](docs/adr/0001-integer-fils.md).

**Suggested fixes:** No further fix for the original false-unit/window instructions. Keep attribution distinct from correctness.

**Why this approach:** These files are read automatically by coding assistants.

**Dependencies / verification:** None.

- [x] **B58 — Every refund without a reason violates the refunds constraint**

**Category:** Feature blocker (latent until refunds launch).

**Summary and business impact:** `processRefund` inserts `reason = input.reason ?? null`. Migration 0070 (from commit `67f8949`) set a default of `'unspecified'` and added `CHECK (reason IS NOT NULL)`. A column default applies only when the column is omitted, not when NULL is sent explicitly, so every refund without a reason is rejected with `chk_refunds_reason_not_null`. This causes 11 of the 12 api test failures (processRefund and initiateMerchantRefund).

**Code references:** [apps/api/src/payments/processRefund.ts](apps/api/src/payments/processRefund.ts), [db/migrations/0070_refund_reason_default.sql](db/migrations/0070_refund_reason_default.sql).

**Suggested fixes:** Decide whether a reason is mandatory. If not, have the code write `'unspecified'` (or omit the column) when none is given. If it is, validate it at the API and return 400 rather than a database error.

**Why this approach:** Makes the rule explicit at the boundary instead of surfacing a constraint violation as a 500.

**Dependencies / verification:** B16, B20, B21. The 11 existing refund tests should pass once fixed, without modifying them.

**Current fork behavior: a reason is optional.** [processRefund.ts](apps/api/src/payments/processRefund.ts) stores a missing, empty or whitespace-only reason as `'unspecified'` (`UNSPECIFIED_REFUND_REASON`, matching 0070's column default) instead of sending NULL; a given reason is trimmed before it is hashed and stored. Verified by new [refundReason.new.test.ts](apps/api/src/payments/refundReason.new.test.ts) (5/5). All 15 locked refund tests in `processRefund.test.ts` and `initiateMerchantRefund.test.ts` now pass **unmodified**; full api suite 391/392.

**Evidence limits:** Original optional types/tests and nullable reason support optional input; the current fork writes unspecified, satisfying0070. Editable author names and release dates do not prove who wrote0070 or when. Claims that its actual author maliciously broke a finished feature have been removed. Runtime validation of non-string reasons is not established by this resolution.

- [ ] **B59 — Webhook backoff test asserts an exact delay the code randomises**

**Category:** Invalid test.

**Summary and business impact:** `dispatcher.test.ts` asserts `backoffDelayMs(1, config) === 1000`, but `backoffDelayMs` deliberately applies ±10% random jitter by default (documented in its JSDoc). The test fails on almost every run (observed 924, 979, 1063 and 1093). The code is correct; the test is wrong, so the suite can never pass reliably.

**Code references:** [apps/api/src/webhooks/dispatcher.test.ts](apps/api/src/webhooks/dispatcher.test.ts) (line 196), [apps/api/src/webhooks/dispatcher.ts](apps/api/src/webhooks/dispatcher.ts).

**Suggested fixes:** Pass a fixed jitter (`() => 0.5`) or assert the 900–1100 ms range. Because existing test files are locked, this needs an explicit exception to change it, or a corrected replacement test in a new file with the old assertion retired.

**Why this approach:** A test should pin intended behaviour, not a coincidence of random input.

**Dependencies / verification:** None. Not caused by any 2026-10-29 change; this is the only non-refund api failure.

**Partial remediation: replacement coverage exists, but the original failing assertion remains active.** The jitter and the exact-delay assertion were added in the same commit (`c2f3627`), so the test was wrong from the start. New [dispatcher.backoff.new.test.ts](apps/api/src/webhooks/dispatcher.backoff.new.test.ts) repeats the backoff/exhaustion sequence, checks the delay actually applied to each row (`next_attempt_at − last_attempted_at`, both set from one database `now()`) against the ±10 % jitter range, and checks exact values (900/1000/1100 ms, doubling, the 60 s cap) with a fixed jitter source. 3/3 passing, stable across repeated runs. The original locked test is unchanged and still fails; treat that failure as known and superseded.

- [ ] **B60 — Test suites contaminate each other on a shared database**

**Category:** Test reliability.

**Summary and business impact:** Historical records report API fixtures with empty outbox payloads contaminating reporting tests on a shared database. Current CLAUDE.md does not require that setup. This is a test-isolation concern under that setup, not proof the full suite can never pass locally. It was not rerun against a disposable database in this audit.

**Code references:** [apps/reporting/src/consumer/runConsumerPass.test.ts](apps/reporting/src/consumer/runConsumerPass.test.ts), [apps/reporting/src/cli/rebuild.test.ts](apps/reporting/src/cli/rebuild.test.ts), [apps/api/src/webhooks/dispatcher.test.ts](apps/api/src/webhooks/dispatcher.test.ts), [CLAUDE.md](CLAUDE.md).

**Suggested fixes:** Give each workspace its own database (or schema) in the test runner, or have tests clean up the outbox rows they create.

**Why this approach:** Isolation makes failures mean something.

**Dependencies / verification:** B59.

- [x] **B61 — Hold expiry deletes every hold on a night with nothing expired**

**Category:** Data loss. **Critical.**

**Summary and business impact:** `expire_holds` selects expired hold ids, then builds the delete with `buildDelete("holds", { id: expiredIds })`. `buildWhere` skips empty arrays, so with zero expired holds the statement is `DELETE FROM holds` with no `WHERE` clause, which removes every active hold. The docblock ("a night with nothing expired changes no rows") is false. Separately, holds are deleted rather than set to `expired` (HANDOVER says they are never deleted), and the SELECT-then-DELETE can remove a hold captured in between.

**Code references:** [scripts/expire_holds.ts](scripts/expire_holds.ts), [scripts/lib/sqlFilter.ts](scripts/lib/sqlFilter.ts) (line 10), [scripts/expire_holds.test.ts](scripts/expire_holds.test.ts).

**Suggested fixes:** Return early when there are no ids, and make `buildWhere`/`buildDelete` refuse to produce an unfiltered DELETE. Replace the two-step delete with one atomic `UPDATE holds SET status = 'expired' WHERE status = 'active' AND expires_at < now()`.

**Why this approach:** A single conditional statement cannot race with capture and cannot widen to the whole table.

**Dependencies / verification:** None. Reproduced: `buildDelete("holds", { id: [] })` returns `{"text":"DELETE FROM holds","values":[]}`. The existing tests only cover non-empty lists; add a new test for the empty case. Do not run the script against any shared database until fixed.

**Resolution (2026-10-30):** [expire_holds.ts](scripts/expire_holds.ts) now runs one `UPDATE holds SET status = 'expired' WHERE status = 'active' AND expires_at < now()`, matching HANDOVER.md ("flips active to expired with one UPDATE; holds are never deleted"). This removes the empty-list wipe, the capture race and the deletion. [buildDelete](scripts/lib/sqlFilter.ts) now throws instead of producing an unfiltered DELETE. `buildExpiredHoldsDelete` is no longer used by the script but is kept because the locked `expire_holds.test.ts` imports it. Verified: new [expire_holds.new.test.ts](scripts/expire_holds.new.test.ts) failed on the old code and passes; new [expire_holds.integration.new.test.ts](scripts/expire_holds.integration.new.test.ts) (in a rolled-back transaction) shows only the active past-due hold becomes `expired`, no row is deleted, and a rerun changes nothing.

- [x] **B62 — Password-only session can mint a permanent API key** (fixed with B32, 2026-10-30)

**Category:** Authentication. **High severity** (escalates B32).

**Summary and business impact:** `requireSession` uses `lookupSession`, which reads `live_sessions` without `authenticated = true` (B32). `POST /:merchantId/api-keys` is guarded only by `requireSession` + `requireRole("owner")`. Anyone with an owner's password can skip the OTP and issue an API key, which then carries full merchant authority with no session expiry. The inline MK comment ("requireSession checks authenticated") is false.

**Code references:** [apps/api/src/routes/apiKeys.ts](apps/api/src/routes/apiKeys.ts) (line 36), [apps/api/src/auth/middleware.ts](apps/api/src/auth/middleware.ts) (line 30), [apps/api/src/auth/sessions.ts](apps/api/src/auth/sessions.ts) (line 78).

**Suggested fixes:** Fixing B32 (require `authenticated = true` in `lookupSession`) closes this. Add a new test showing a pending session gets 401 on key issuance.

**Why this approach:** One server-side check at the session lookup protects every route behind it.

**Dependencies / verification:** B32. In a real deployment, review API keys issued from sessions that never completed OTP.

- [ ] **B63 — Webhook endpoint URLs are not checked for internal hosts (SSRF)**

**Category:** Security.

**Summary and business impact:** `validateWebhookUrl` checks only that the scheme is http(s) and, in production, https. It does not block localhost, private ranges or link-local/metadata addresses. Comments in `transport.ts` ("create.ts blocks private IPs") and `routes/webhooks.ts` ("create.ts blocks private hosts in production") describe a check that does not exist. A merchant can make the platform send signed requests to internal services.

**Code references:** [apps/api/src/webhooks/create.ts](apps/api/src/webhooks/create.ts), [apps/api/src/webhooks/transport.ts](apps/api/src/webhooks/transport.ts) (line 38), [apps/api/src/routes/webhooks.ts](apps/api/src/routes/webhooks.ts) (line 146).

**Suggested fixes:** Resolve the hostname at send time and reject loopback, private, link-local and unique-local addresses (re-check on every delivery to defeat DNS rebinding); disable redirects. Keep a dev-only allowance for localhost.

**Why this approach:** Validating only at creation can be bypassed by DNS changes; checking the resolved address per request cannot.

**Dependencies / verification:** B22 (same send path). Test with `http://127.0.0.1`, `http://169.254.169.254` and a hostname resolving to a private IP.

- [ ] **B64 — Any admin role can start impersonation**

**Category:** Authorization (extends B35).

**Summary and business impact:** Start impersonation requires an admin session but no admin-role predicate. No current middleware supplies the previously claimed super_admin gate. The authorized role set requires an explicit policy decision. B35 covers actual write reachability even with support mapping.

**Code references:** [apps/api/src/routes/adminMerchants.ts](apps/api/src/routes/adminMerchants.ts) (line 328), [apps/api/src/admin/impersonation.ts](apps/api/src/admin/impersonation.ts), [apps/api/src/auth/requireMerchantAuth.ts](apps/api/src/auth/requireMerchantAuth.ts), [CLAUDE.md](CLAUDE.md).

**Suggested fixes:** Decide who may impersonate (ADMIN.md versus HANDOVER.md, see B35) and enforce it with `requireAdminRole` on the route. Make every grant read-only unless an explicit, audited write scope is approved.

**Why this approach:** The route is the authoritative check; documentation and comments are not.

**Dependencies / verification:** B35. Test each admin role starting a grant and attempting a merchant write.

- [ ] **B66 — Capture applies the discount after MDR; settlement applies it before**

**Category:** Money correctness.

**Summary and business impact:** ARCHITECTURE.md says "discounts reduce the amount the MDR is charged on", and Go's `ComputeSettlementFee` does exactly that. The live capture path (`routes/transactions.ts:111` → `applyCaptureDiscountAdjustment`) charges MDR on the full amount and then reverses a share of the fee. The results differ: 602 fils at 275 bps with a 1250 bps discount gives 14 fils in Go and 15 fils at capture, so the capture-time ledger and the batch disagree.

**Code references:** [apps/api/src/payments/discountAdjustment.ts](apps/api/src/payments/discountAdjustment.ts), [apps/api/src/routes/transactions.ts](apps/api/src/routes/transactions.ts) (line 111), [apps/settlement/internal/settlement/discounted_fee.go](apps/settlement/internal/settlement/discounted_fee.go), [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

**Suggested fixes:** Obtain the approved pricing formula and rounding order, then align API capture, checkout, reporting and Go settlement. Go is not automatically authoritative because a test or architecture paragraph says so. Preserve15-versus14 as the regression case.

**Why this approach:** One fee formula across capture, reporting (B49) and settlement.

**Dependencies / verification:** B49. Compare capture-time and batch fees across seed data.

- [ ] **B67 — Credit second approver is compared by display name**

**Category:** Authorization / four-eyes control.

**Summary and business impact:** `creditApproval.ts` rejects self-approval only when `approver.displayName === requester.displayName`. The same admin can approve their own credit if the display names differ (for example after a rename), and two different admins who share a name cannot approve each other. HANDOVER says the check compares admin user ids.

**Code references:** [apps/api/src/admin/creditApproval.ts](apps/api/src/admin/creditApproval.ts) (line 11).

**Suggested fixes:** Compare `adminUserId`, and enforce the distinct-approver rule in the database as well.

**Why this approach:** Identity, not a mutable label, is what the four-eyes rule is about.

**Dependencies / verification:** None. Test self-approval after a display-name change.

- [x] **B68 — A merchant can refund another merchant's transaction**

**Category:** Merchant isolation / money movement. **High severity (latent until B16).**

**Summary and business impact:** `initiateMerchantRefund` looks up the transaction by id only and then calls `processRefund` with `merchantId: txn.merchant_id`, the transaction's owner, not the caller. The caller's `merchantId` is used only for the refunds-on-hold check. Merchant A can therefore refund merchant B's captured transaction, with the idempotency key, ledger entries and refund row all recorded under B. A comment in the locked test file says so ("another merchant's existing transactionId should also 404. currently refunds it — am") and FH notes the test covering it was deleted.

**Code references:** [apps/api/src/refunds/initiateMerchantRefund.ts](apps/api/src/refunds/initiateMerchantRefund.ts), [apps/api/src/refunds/initiateMerchantRefund.test.ts](apps/api/src/refunds/initiateMerchantRefund.test.ts) (line 170).

**Suggested fixes:** Look the transaction up with `WHERE id = $1 AND merchant_id = $2` using the authenticated merchant, return 404 otherwise, and pass the caller's merchant to `processRefund`.

**Why this approach:** The same ownership rule as B34: enforce it in the query that selects the resource.

**Dependencies / verification:** Must be fixed before B16 wires the route. Add a new test: merchant A refunding merchant B's transaction gets 404 and no refund row exists.

**Resolution (2026-10-30):** Fixed in two layers. [initiateMerchantRefund.ts](apps/api/src/refunds/initiateMerchantRefund.ts) looks the transaction up with `WHERE id = $1 AND merchant_id = $2` using the caller's merchant (another merchant's transaction is the same `NotFoundError` as a missing one) and passes the caller's merchant on. [processRefund.ts](apps/api/src/payments/processRefund.ts) also scopes its own lookup by `merchant_id`, so it returns its existing `404 transaction_not_found` even if a future caller passes a mismatched pair. Verified by new [initiateMerchantRefund.new.test.ts](apps/api/src/refunds/initiateMerchantRefund.new.test.ts) (3/3): the cross-merchant test failed on the old code (the refund went through and the acquirer was called) and passes now with no acquirer call and B's transaction untouched; a direct `processRefund` test fails when only the processRefund scoping is reverted; refunding one's own transaction still works. Full api suite: 376/392, the same 16 known failures (B58 locked tests, superseded B59).

## Checklist review — 2026-10-29

Historical notes below are superseded by the current source audit where they conflict. They are not independent verification of all claims:

| Item | Finding |
|---|---|
| B13 | Policy conflict rather than a defect: ADR-0006 prescribes cache-only adjustments; ADMIN.md describes journaled ones. |
| B17 | Policy conflict: ARCHITECTURE.md deliberately describes client-clock expiry for offline terminals. Needs an explicit decision to supersede. |
| B49 | Conclusion holds, but the stated justification cites CLAUDE.md, an unreliable source. ARCHITECTURE.md §4 supports the same fix. |
| B53 | Lower risk than stated: the file labels the secret sandbox-only and compose never loads the file (no `env_file`). Still remove from git and rotate. |
| B54 | Overstated: the file holds the seed's 20 fictional merchants and no emails, phone numbers or card numbers, so it is not a data-exposure incident. Integrity note: its header says "Generated 2026-09-24" but it was committed in commit `f33e02b` (2026-02-16). |
| B32 | Severity raised: see B62. |
| B21, B35 | Extended by B65 and B64. |

Ruled out as decoys: the unscoped transaction reads in `apps/api/src/v1/routes/transactions.ts`, `transactions/receipt.ts` and `transactions/lookup.ts` are not imported anywhere; API keys bypassing role checks is a documented design decision (keys are owner-issued, though see B62).

## Test suite results — 2026-10-29

Historical author-reported run against filspay_test, not repeated in this source audit. Current CLAUDE.md does not prescribe that setup.

| Suite | Result | Notes |
|---|---|---|
| packages/events | 4/4 ✅ | |
| packages/money | 40/40 ✅ | |
| apps/api | 357/369 | 11 × B58 (refund reason), 1 × B59 (invalid jitter test). Includes the new `config.new.test.ts` (5/5) and `auth.new.test.ts` (2/2). **Updated 2026-10-30: 391/392.** All 15 locked refund tests pass unmodified now that B58 makes the reason optional. The one failure is the original B59 test, superseded by `dispatcher.backoff.new.test.ts`. |
| apps/reporting | 7/11 (11/11 on a clean DB) | 4 failures are B60 contamination from api-test fixtures. |
| apps/web | 8/8 ✅ | |
| scripts/ | 5/5 ✅ | Skipped by `npm test` after the first failing workspace; run separately. |
| Go `./...` | all 7 packages ok ✅ | |

No failure is in code changed on 2026-10-29. Passing tests are not proof of correctness: `TestRebuildBalances_ValidToken` passes because it locks in B14, and `window_utc_compat_test.go` says of itself that it "locks in current behaviour".

## Repository integrity concerns (not code defects)

For escalation; recorded so they are not lost.

- **Commit `67f8949`** ("database migrations (0031–0072)") is authored as Yousif Al-Ansari, dated 2026-01-19, with committer `placeholder <p@x>`. It adds migrations for features the CHANGELOG says shipped from April to July, and fills numbers ADR-0005 reserves (0054–0056). HANDOVER.md (April) still describes those numbers as unused gaps.
- **Commit `a9b2753`** (merchant login, OTP, sessions; the source of B42) is authored as Fatima Haji, dated 2025-08-14. ONBOARDING.md says she joined in June 2026.
- **Undocumented migration gaps:** 0059, 0062, 0063 and 0067, in addition to the documented 0039, 0041 and 0054–0056.
- **This checklist** was committed by `ProfessorMaryam <lifeasmaryam7@gmail.com>` (a personal address), and its stated source `bugs.md` is not in the repository.

## Decisions, integration scope and consolidated scenarios

Removed from active confirmed-bug remediation; IDs retained to preserve references. No fix is implied by reclassification.

- [ ] **B07 — Card processing uses only a simulator**

**Category:** Integration decision.

**Summary and business impact:** The API always constructs a simulator; approvals do not represent real card processing. This is a live-launch gap, not necessarily a defect for a demo.

**Code references:** [apps/api/src/app.ts](apps/api/src/app.ts), [apps/api/src/acquirer/simulator.ts](apps/api/src/acquirer/simulator.ts), [apps/api/src/acquirer/types.ts](apps/api/src/acquirer/types.ts).

**Suggested fixes:** Decide whether the target is a demo or live payments. For live use, add a provider adapter with stable idempotency, timeout recovery and callback verification; retain an explicit simulator mode.

**Why this approach:** Keeps demonstrations deterministic and prevents simulated approvals being mistaken for live payments.

**Dependencies / verification:** B17–B23. Requires a provider contract; do not mark live-ready from simulator tests.

- [ ] **B08 — Paid batch status does not represent a confirmed bank transfer**

**Category:** Integration decision.

**Summary and business impact:** Payout code posts ledger entries and marks batches paid without initiating or confirming a bank transfer. The business cannot treat that status as evidence of disbursement.

**Code references:** [apps/settlement/internal/settlement/batch.go](apps/settlement/internal/settlement/batch.go), [apps/settlement/internal/splits/allocate.go](apps/settlement/internal/splits/allocate.go), [apps/settlement/internal/settlement/payout_notify.go](apps/settlement/internal/settlement/payout_notify.go), [apps/api/src/webhooks/payoutDisbursement.ts](apps/api/src/webhooks/payoutDisbursement.ts).

**Suggested fixes:** For live payouts, add a durable payout instruction and provider/manual-confirmation workflow. Mark paid only on authoritative confirmation; make retries and ledger posting idempotent.

**Why this approach:** Separates money owed, transfer requested and transfer completed, preventing false payout confirmations.

**Dependencies / verification:** B11, B24, B25 and B28. Coordinate ledger, status, reports and notifications; demo-only scope must be explicit.

- [ ] **B09 — OTP delivery is a logging stub**

**Category:** Integration gap.

**Summary and business impact:** No real email or SMS delivery exists. In production the code is not logged, so users cannot complete normal OTP login through a delivery channel.

**Code references:** [apps/api/src/auth/notifier.ts](apps/api/src/auth/notifier.ts), [apps/api/src/adminAuth/notifier.ts](apps/api/src/adminAuth/notifier.ts), [apps/api/src/config.ts](apps/api/src/config.ts).

**Suggested fixes:** Add a notifier adapter for the selected delivery provider with bounded retries and delivery-failure handling. Keep development exposure explicitly restricted to development.

**Why this approach:** Makes two-step login usable without leaking production authentication codes into logs.

**Dependencies / verification:** B32 and B33. Test delivery failure, expiry and resend for merchant and admin accounts.

- [ ] **B13 — Balance adjustments affect only the cache despite journaled documentation**

**Category:** Accounting policy conflict.

**Summary and business impact:** The active adjustment route updates the cached balance and audit log but not the ledger. Corrections disappear on rebuild and disagree with ADMIN.md; ADR 0006 prescribes cache-only behavior.

**Code references:** [apps/api/src/routes/adminBalanceAdjustments.ts](apps/api/src/routes/adminBalanceAdjustments.ts), [apps/api/src/admin/balanceAdjustments.ts](apps/api/src/admin/balanceAdjustments.ts), [apps/api/src/admin/ledgerAdjustments.ts](apps/api/src/admin/ledgerAdjustments.ts), [docs/ADMIN.md](docs/ADMIN.md), [docs/adr/0006-display-adjustments.md](docs/adr/0006-display-adjustments.md).

**Suggested fixes:** Resolve the documented policy conflict. For actual financial corrections, use balanced journal entries with reasons and effective dates, and update the cache consistently. Label any retained display-only corrections explicitly.

**Why this approach:** Distinguishes a financial correction from a visual override and prevents a rebuild from silently undoing real corrections.

**Dependencies / verification:** B14 and B28. Review existing cache adjustments before migration; do not automatically journal all historical display changes.

- [ ] **B17 — Client timestamps can bypass payment-link expiry**

**Category:** Documented client-clock security-policy decision.

**Summary and business impact:** Expiry checking trusts submittedAt from the payer, allowing a backdated request to make an expired link payable.

**Code references:** [apps/api/src/paymentLinks/pay.ts](apps/api/src/paymentLinks/pay.ts), [apps/api/src/routes/paymentLinks.ts](apps/api/src/routes/paymentLinks.ts), [apps/web/src/pages/checkout/CheckoutPage.tsx](apps/web/src/pages/checkout/CheckoutPage.tsx).

**Decision needed:** Architecture expressly permits offline-terminal submittedAt. Backdating is possible by design; changing to server-clock expiry requires an explicit approved policy change.

**Why this approach:** This is an explicit client-clock policy with security implications, not an accidental implementation divergence.

**Dependencies / verification:** B18. ARCHITECTURE.md currently describes client-time expiry; explicitly supersede that policy when implementing this reported defect.

- [ ] **B30 — Lifetime payout totals lose whole-fils precision**

**Category:** Approximate monitoring limitation; not actual payout arithmetic.

**Summary and business impact:** Payout accumulation converts amounts to float32 and stores the total as REAL, losing precision for high-volume merchants.

**Code references:** [apps/settlement/internal/settlement/payout_estimate.go](apps/settlement/internal/settlement/payout_estimate.go), [db/migrations/0040_merchants_lifetime_payout_monitoring_estimate.sql](db/migrations/0040_merchants_lifetime_payout_monitoring_estimate.sql).

**Decision needed:** monitoring_estimate is explicitly approximate and no read feeds payout amounts. Integer migration is optional accuracy work if an actual consumer requires exact totals; B11 separately covers payout-affecting precision loss.

**Why this approach:** Reconstructing from exact source records recovers information that casting an already-rounded float cannot restore.

**Dependencies / verification:** B11, B08 and B28. Treat schema changes as explicit migrations and reconcile before/after totals.

- [ ] **B54 — Orphaned "production-equivalent" seed file**

**Category:** Unused fixture integrity/hygiene; no established personal-data exposure.

**Summary and business impact:** [db/seed/fixtures/production_seed.sql](db/seed/fixtures/production_seed.sql) (50,338 lines, labelled "production-equivalent", from a "prod-mirror" environment) is referenced by no code, config or doc. It posts to four ledger accounts that do not exist (`merchant_receivable`, `platform_fee`, `refund_payable`, `settlement_holding`), so it could not load.

**Code references:** [db/seed/fixtures/production_seed.sql](db/seed/fixtures/production_seed.sql).

**Decision needed:** Production/prod-mirror labels are unverified. Inspected merchants match fictional fixtures. Invalid account IDs are an artifact-validity issue, not proof of leaked customer data. Escalate exposure only with independent real-data evidence.

**Why this approach:** The artifact has incompatible fixture entries; claimed production provenance alone does not establish confidentiality exposure.

**Dependencies / verification:** None.

- [ ] **B65 — A fully refunded partial capture becomes refundable again**

**Category:** Duplicate B21 scenario: latent amount-bound defect, not an established status-policy bug.

**Summary and business impact:** After a full refund of a partial capture, `nextStatusAfterRefund` returns `partially_captured` because captured < authorized. That status is in `REFUNDABLE_STATUSES`, and the limit is authorized − refunded (B21), so a second refund passes validation even though every captured fil has been returned. YA's comment ("refundValidation stops the second refund since refunded == captured") is false: validation never compares against captured.

**Code references:** [apps/api/src/payments/refundState.ts](apps/api/src/payments/refundState.ts) (line 47), [apps/api/src/payments/refundValidation.ts](apps/api/src/payments/refundValidation.ts), [apps/api/src/payments/processRefund.ts](apps/api/src/payments/processRefund.ts) (line 90).

**Suggested fixes:** Fix captured-minus-refunded-minus-pending availability under B21/B20. Do not require refunded status until authorization-headroom policy is resolved. Partially_captured alone cannot permit excess refunds when the amount bound is correct.

**Why this approach:** A correct captured-funds bound prevents duplicate refunds regardless of a separately agreed authorization-headroom status policy.

**Dependencies / verification:** B21, B20, B16. Test: authorize 1000, capture 400, refund 400, then a second refund must be rejected.

- [x] **B57 — Migration runner does not checksum applied files**

**Category:** Process / documentation.

**Summary and business impact:** Historical checksum assurance was false. The runner tracks filenames/timestamps only. This audit corrected the misleading comment; checksums remain optional hardening, not an established business requirement.

**Code references:** [db/migrate.ts](db/migrate.ts).

**Suggested fixes:** Comment corrected. No checksum enforcement was added. Use new migrations for upgrades; consider checksums separately if required.

**Why this approach:** Correcting a comment removes a false guarantee; it does not add technical enforcement.

**Dependencies / verification:** B02, B03.


## New source-confirmed findings - 2026-10-30

No production or disposable-database integration reproduction is claimed for these findings.

- [ ] **B69 - Capture idempotency omits transaction identity**

**Evidence and impact:** Capture hashes amount only while key scope is merchant+endpoint+key. Reusing the key/amount for another transaction can replay the first result.

**Code references:** [apps/api/src/payments/capture.ts](apps/api/src/payments/capture.ts).

**Suggested fixes:** Include transaction ID in canonical request identity; test cross-resource reuse.

- [ ] **B70 - Checkout omits negotiated discount adjustment**

**Evidence and impact:** Only the transaction route invokes applyCaptureDiscountAdjustment; payment-link pay calls captureTransaction directly without that adjustment.

**Code references:** [apps/api/src/paymentLinks/pay.ts](apps/api/src/paymentLinks/pay.ts).

**Suggested fixes:** Use one agreed fee flow after resolving B66.

- [ ] **B71 - Payout records depend on webhook subscriber count**

**Evidence and impact:** Dispatcher PRE_DELIVERY_EFFECTS inserts a disbursement per first delivery attempt. Zero subscribers means no record; multiple endpoints/replays mean multiple records. This is not proof of duplicate bank transfers.

**Code references:** [apps/api/src/webhooks/dispatcher.ts](apps/api/src/webhooks/dispatcher.ts).

**Suggested fixes:** Record actual payout bookkeeping once per business payout, independently of notification delivery.

- [ ] **B72 - Report scope accepts an unrelated merchant child**

**Evidence and impact:** resolveReportMerchantId checks global child membership without authenticated parent membership. A merchant can request another marketplace child transactions.

**Code references:** [apps/api/src/reporting/scope.ts](apps/api/src/reporting/scope.ts).

**Suggested fixes:** Scope the parent-child relationship to caller and requested child; test unrelated tenants.

- [ ] **B73 - Rollback failure masks the original transaction error**

**Evidence and impact:** Awaiting ROLLBACK before rethrow means rollback rejection replaces the original error. This proves error masking, not that every failed client is reused.

**Code references:** [apps/api/src/db/withTransaction.ts](apps/api/src/db/withTransaction.ts).

**Suggested fixes:** Preserve original failure, record rollback error separately and discard a confirmed broken client.

- [ ] **B74 - Reporting cursor is not locked across processes**

**Evidence and impact:** readCursor lacks FOR UPDATE; separate worker/catch-up processes can apply the same existing-cursor range. Local running flag cannot serialize processes.

**Code references:** [apps/reporting/src/consumer/cursor.ts](apps/reporting/src/consumer/cursor.ts).

**Suggested fixes:** Serialize by durable consumer identity and test concurrent passes.

- [ ] **B75 - Sequence watermark skips late-committing events**

**Evidence and impact:** A reserves low ID, B commits high ID, consumer advances high, A commits afterward and is excluded by id > watermark. Sequence allocation is not commit order.

**Code references:** [apps/reporting/src/consumer/runConsumerPass.ts](apps/reporting/src/consumer/runConsumerPass.ts).

**Suggested fixes:** Use durable per-event consumption or correctly designed commit-safe ordering; coordinate B74.

- [ ] **B76 - Admin analytics rebuild does not coordinate consumer cursor**

**Evidence and impact:** Admin refresh includes transaction_events already committed but not yet consumed; subsequent worker replay can add them again. Source rebuild does not move/lock cursor to its snapshot.

**Code references:** [apps/api/src/admin/reportingRebuild.ts](apps/api/src/admin/reportingRebuild.ts).

**Suggested fixes:** Coordinate snapshot, cursor and worker, or use one safe replay/rebuild mechanism.

- [ ] **B77 - Missing daily rollup can poison batch-close reporting**

**Evidence and impact:** With captures but no daily-volume row, applyBatchClosed dereferences rows[0].captured_count and throws. Rollback/retry can repeat indefinitely. Missing-batch coverage is not missing-rollup coverage.

**Code references:** [apps/reporting/src/consumer/applyEvent.ts](apps/reporting/src/consumer/applyEvent.ts).

**Suggested fixes:** Handle/recover missing rollup and test it separately.

- [ ] **B78 - Payout trends omit paid lifecycle updates**

**Evidence and impact:** Consumer handles batch_closed but not settlement.paid. If close is consumed before payout, cached status/paid_at remain stale until rebuilt.

**Code references:** [apps/reporting/src/consumer/runConsumerPass.ts](apps/reporting/src/consumer/runConsumerPass.ts).

**Suggested fixes:** Apply payout lifecycle changes idempotently and test close-before-pay ordering.

- [ ] **B79 - Reporting export-summary lacks authentication prehandler**

**Evidence and impact:** Registered route dereferences merchantAuth without running its authentication prehandler. A cookie alone does not populate context. This is an error path, not established data disclosure.

**Code references:** [apps/api/src/routes/reporting.ts](apps/api/src/routes/reporting.ts).

**Suggested fixes:** Require authentication and test missing/valid/expired credentials.

- [ ] **B80 - Webhook response bodies have no byte limit**

**Evidence and impact:** response.text buffers the full response before SQL excerpt truncation. A timeout bounds duration, not memory. No specific OOM was reproduced.

**Code references:** [apps/api/src/webhooks/transport.ts](apps/api/src/webhooks/transport.ts).

**Suggested fixes:** Bound streamed response bytes and preserve timeout/cancellation; coordinate SSRF fix B63.

- [ ] **B81 - PDF-only KYC check trusts filename**

**Evidence and impact:** Generic magic accepts JPEG/PNG/PDF; document-specific check tests .pdf extension. A JPEG named CR.pdf passes.

**Code references:** [apps/api/src/onboarding/kyc.ts](apps/api/src/onboarding/kyc.ts).

**Suggested fixes:** Compare detected type against document-specific requirement; test renamed images.

- [ ] **B82 - Thumbnail lacks an application-specific decoded-pixel budget**

**Evidence and impact:** Compressed upload cap does not bound decoded pixels. sharp is invoked without an explicit application memory/pixel budget. No current library default or actual OOM was verified here.

**Code references:** [apps/api/src/onboarding/kycThumbnail.ts](apps/api/src/onboarding/kycThumbnail.ts).

**Suggested fixes:** Define measured pixel/concurrency limits for container capacity. This is a resource risk, not a confirmed exploit.

- [ ] **B83 - Refund reversal ignores discounted fee debits**

**Evidence and impact:** Latent: query sums fee-revenue credits only, ignoring discount debits. Independent partial rounding also lacks cumulative reversed-fee accounting. Public route remains501.

**Code references:** [apps/api/src/payments/processRefund.ts](apps/api/src/payments/processRefund.ts).

**Suggested fixes:** Reverse remaining net charged fee cumulatively; coordinate B16/B20/B21 before launch.

- [ ] **B84 - Webhook delivery attempts lack cross-replica claim**

**Evidence and impact:** Due rows are selected without lock or claimed state. Replicas can send same row and execute first-attempt financial effects concurrently. At-least-once notifications do not excuse duplicate bookkeeping.

**Code references:** [apps/api/src/webhooks/dispatcher.ts](apps/api/src/webhooks/dispatcher.ts).

**Suggested fixes:** Claim attempts durably and make business effects separately idempotent; coordinate B24/B71.

- [ ] **B85 - Bulk KYC bypasses advertised state/review trail**

**Evidence and impact:** Bulk update accepts every supplied merchant ID without under_review predicate and writes bulk admin audit without individual merchant_kyc_reviews. The individual review workflow differs.

**Code references:** [apps/api/src/admin/bulkKyc.ts](apps/api/src/admin/bulkKyc.ts).

**Suggested fixes:** Confirm bulk-transition policy and preserve required individual review evidence.

- [ ] **B86 - Saved-filter listing relies on nonexistent count cap**

**Evidence and impact:** Code claims a50-filter CHECK in0061, but0061 seeds accounts and0069 has no count cap. Inserts/list are unbounded. This is a capacity risk, not a reproduced outage.

**Code references:** [apps/api/src/reporting/savedFilters.ts](apps/api/src/reporting/savedFilters.ts).

**Suggested fixes:** Enforce an actual quota or paginate; remove fictitious constraint assurance.

- [ ] **B87 - Webhook deletion conflicts with foreign-key retention promises**

**Evidence and impact:** deleteWebhookEndpoint hard-deletes the endpoint. Delivery endpoint_id is NOT NULL with a restrictive FK, not ON DELETE SET NULL/CASCADE; archives also reference endpoints. Existing rows can cause a constraint failure rather than the promised retained-history deletion. No migration altering that delivery FK was found.

**Code references:** [cancel.ts](apps/api/src/webhooks/cancel.ts), [0022](db/migrations/0022_webhook_deliveries.sql), [0068](db/migrations/0068_webhook_delivery_archives.sql).

**Suggested fixes:** Agree explicit disable/delete/retention semantics; preserve audit history and test an endpoint with deliveries/archives. Do not silently cascade-delete evidence.
