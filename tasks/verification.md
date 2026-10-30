# Bug implementation and verification — 2026-10-30

No test files or protected money packages were changed. No migration, seed,
financial repair, deployment, credential rotation or history rewrite ran.
Four checklist items are complete; the other eight retain their acceptance gates.

| Item | Result | Evidence / remaining work |
|---|---|---|
| B97 | Complete | 64-character hex validation precedes decoding. Valid/uppercase digests pass; trailing junk, odd length, invalid hex, empty and short values fail. Fresh signed callback passes; appended junk/odd nibble fail. Shared callers are OTP verification (including admin re-export), inbound callbacks and outbound verification. Existing OTP/signing checks pass, 14/14. |
| B95 | Complete | Both buffered and streaming exports prefix formula-capable text before CSV escaping, including leading whitespace/control characters; commas, quotes and CR remain quoted. Manual in-memory exports included `=`, `+`, `-`, `@`, whitespace, tab and CR. Signed numeric columns remain unprefixed `-1.000`, `-0.500`, `-0.250`. |
| B96 | Complete | Fastify in-memory requests to detail/events/capture/void with malformed IDs returned 404 and made zero queries. A valid UUID shape reached the merchant-scoped detail query. Authentication was stubbed for this isolated check; real ownership/auth integration remains covered by the existing database-dependent suites, which could not run here. |
| B98 | Complete | Removed the bar and its undefined float-derived percentage. Whole-fils formatting remains unchanged. Merchant production build and typechecking pass. Browser rendering was not inspected. |
| B92 | Implemented; runtime pending | Explicit upload path and named volume; [backup/restore instructions](../ops/kyc-storage.md). Merged Compose mounts `/app/data/kyc`. Upload/recreate/restore checks and existing missing-file inventory need a working disposable stack. No lost-file recovery claimed. |
| B94 | Implemented; browser pending | Finance/super-admin screen at `/capture-reviews`, bounded 50-row pages, existing retry/release APIs, required trimmed release evidence, mutation lock, refresh after success/error, role gate. Admin build/typecheck pass. Browser role/error/action QA and real audit verification remain pending. |
| B09 | Implemented; full login pending | Resend selected by owner, ADR-0017. Merchant login/resend and admin login await delivery. Two real production-mode notifier smoke emails accepted at the requested temporary inbox. In-memory provider success/rejection/timeout/missing-key checks behaved correctly for both notifiers; failures return controlled 503s, logs omit code/key, production forces `otpDevExpose=false`. Full password/OTP verify, expiry, attempt-limit and resend-cooldown journeys need the disposable DB. Inbox receipt was not independently checked. |
| B99 | Prepared; runtime pending | [Hosting overlay](../ops/docker-compose.hosting.yml), built frontends and Caddy HTTPS routing. Compose v5.1.1 model validated using fake non-secret values: zero host ports on postgres/api/admin, ports 80/443 only on gateway, production API, secure cookies, refunds off, required credentials and durable KYC mount. No image build/HTTPS/login runtime check; see [hosting gates](../ops/hosting.md). |
| B16 | Blocked on local runtime | Refund wiring remains intact and release flag stays false. Full capture/refund accounting, carry, reporting and signed-delivery journey cannot be verified without the disposable database. No merchant was opted in. |
| B23 | External decision pending | ADR-0012 explicitly leaves signed-body representation open. Mandatory signatures and freshness remain enforced. No invented provider contract. |
| B53 | External evidence pending | No credential use/revocation evidence in designated sources. Retired fingerprint rejection unchanged; no rotation or history rewrite. |
| B93 | Finance decision pending | ADR-0014 explicitly reserves the live tier decision for written finance direction. Historical snapshots and live pricing unchanged. |

## Existing checks

| Command | Result |
|---|---|
| `npm run typecheck` | Passed across all workspaces, database tooling and scripts. |
| `npm run build -w apps/admin` | Passed. |
| `npm run build -w apps/web` | Passed; existing mixed static/dynamic import warning for `utils/helpers.ts`. |
| Existing `auth/otp.test.ts` and `webhooks/sign.test.ts` | 14 passed, zero failed. |
| `npm test` | Failed: events 4/4, money 40/40, API 141/183, reporting 0/3, web 10/11. Database-dependent files fail setup because `DATABASE_URL` is unset. API retains outdated callback expectations; web expects UTC midnight instead of Bahrain midnight. Root script tests are not reached after the workspace command fails. |
| `go test -short ./...` in `apps/settlement` | Failed only in scheduler: `TestSchedulingLocationUsesTZ` expects UTC, implementation uses ADR-0007's Asia/Bahrain. Other packages passed/cached or have no tests. Short mode omits integration coverage. |
| `git diff --check` | Passed. |

Initial sandbox runs failed to spawn esbuild/test workers or access Go's cache;
the checks above were rerun outside the sandbox. First full npm run before OTP
integration and final run after it had the same workspace counts above. This
is not a clean database-backed regression baseline.

Local Docker inspection first hit pipe permissions; elevated inspection then
returned an engine HTTP 500. No local Postgres binaries were available, no
disposable `DATABASE_URL` was configured, and no Chrome DevTools/browser testing
connector was exposed. Compose model validation does not require the engine;
actual KYC, browser, refund and hosting verification remains blocked.

## Next runtime acceptance checks

1. Provision a migrated, isolated disposable database. Never use a hosted URL
   or run the destructive seed against valuable data. Isolate suites by database
   or schema; sequential execution alone does not prevent fixture contamination.
2. Verify both password/OTP login flows in production mode through HTTPS,
   including wrong/expired codes, attempt limits, resend cooldown and provider
   failures. Confirm no production code disclosure and receipt at the override.
3. Exercise the blocked queue as finance/super-admin/support: loading, empty,
   error and paging states; retry success/refusal/unknown response; release
   evidence requirement; refresh failure and audit outcomes. Verify keyboard
   access and responsive rendering. Support must not mutate via direct API calls.
4. Complete KYC backup/recreate/restore/hash checks and missing-file inventory.
5. Enable refunds only on the disposable QA stack with one explicitly opted-in
   merchant. Verify NULL/false opt-ins denied; full and cumulative partial refunds;
   exact historical fee/discount reversal; concurrent and ambiguous-response
   retries retaining the same key/amount; balanced journals and no double posting;
   successful-refund/refresh-error messaging; settlement claim/carry across days;
   frozen paid batches; reporting consumption and signed webhook delivery.
6. Build and exercise hosting images, HTTPS/SPA routing and secure login on both
   configured hostnames. Review host-scoped impersonation cookies before using
   cross-host view-as-merchant workflows. Meet B23/B53 prerequisites and obtain
   the operator's release decision; do not infer it from configuration validation.
