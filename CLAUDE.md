# FilsPay — agent guide

This file replaces the original rule files (git `669af52`). Those contradicted
the ADRs and the code. Every claim below was checked against the code on
2026-10-30.

## Sources of truth

1. `docs/adr/` and `docs/ARCHITECTURE.md` define intended behaviour.
2. The code is what actually runs. Where it disagrees with (1), the code is
   likely wrong, but check before you fix it.
3. Treat these as unverified claims: `docs/HANDOVER.md`, `CHANGELOG.md`
   (it cites commit hashes that don't exist), commit messages (some empty
   "fix" commits change no files), and inline `MK:` / `am:` / `FH:` / `YA:`
   comments. Trust them only after reading the code path or reproducing the
   behaviour.

Tracked defects live in `project_bug_checklist.md`. Check it before you
report something as new.

## Money (ADR-0001)

- Amounts are integer **fils**: 1 BD = **1000** fils. Columns end in `_fils`
  and are `BIGINT`. TS uses the branded `Fils` type, Go uses `money.Fils` (`int64`).
- Parse text amounts with `parseBhdToFils`. Apply rates (basis points) with
  `applyRateFils`, which rounds half-to-even once.
- No float arithmetic on money, not even temporarily. Format for display
  with `formatBhd`, never `toFixed(2)`.
- Two-decimal figures appear only in the scheme export (ADR-0002).
- Known violations, all still open: the adjustment CSV import uses
  `parseDecimalMinor(raw, 2)` (`"4.75"` → 475), `NetPayableFils` computes
  payouts in `float32`, and `platform_stats.total_processed_fils` is `INTEGER`.

## Settlement

- A business day runs from midnight to midnight **Asia/Bahrain** (UTC+3, no
  DST), not UTC. Fees are computed per capture event, and discounts reduce
  the amount the MDR is charged on.

## Security

- Session tokens, API keys, OTPs and payment-link tokens must come from
  `node:crypto`. `lib/random.ts` uses `Math.random`. It is currently used for
  OTPs and link tokens, which is a known defect, not a convention.
- Admin roles are checked server-side per route. Impersonation is meant to
  be view-only (merchant role `support`). The code currently lets any admin
  start it and maps `super_admin` to `owner`, which is a known defect.

## Changing code

- `packages/money` was audited: money behaviour changes there need finance
  sign-off. Explain the change; don't route around the package.
- Never edit an applied migration. Add a new one. (`schema_migrations` stores
  no checksum, so this is a policy for upgrade safety, not a technical lock.)
- Tests can be wrong. Several pin current bugs. Changing a test is allowed
  with a stated reason in the commit, plus finance sign-off when money
  figures change. New coverage can go in `*.new.test.ts` files.
- `apps/api/src/v1/` is dead code. `POST /v1/refunds` is a hard-coded 501
  stub with no feature flag.
- Don't read `db/seed/fixtures/production_seed.sql` (15 MB of INSERTs). Use
  `grep` on it if you need something specific.

## Testing

- Run the tests for what you changed, e.g. `npm test -w apps/api` or
  `cd apps/settlement && go test ./internal/settlement/`. Run the full suite
  (`npm test`, then `go test ./...` in `apps/settlement`) once before you
  call a change done. They share the DB, so run them one after the other.
- The API and reporting tests need a migrated Postgres (`npm run migrate`).
- Baseline (2026-10-30): 36 of 167 `apps/api` tests and all 3
  `apps/reporting` tests fail on main. Go, `packages/*` and `apps/web` pass.
  Compare against this baseline rather than expecting all green.

## Boundaries

- Local stack only. Never point anything at staging or production.
- Ask before commits, deletes, data repairs, or changes to auth or money logic.
