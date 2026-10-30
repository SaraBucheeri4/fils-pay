# 0002. Journal scheme rounding residue at export

- **Status:** Accepted; implemented 2026-10 under ADR-0007 (migration 0080), no historical repair
- **Date:** 2025-11-20
- **Deciders:** Yousif Al-Ansari, Huda (finance)
- **Related:** 0001, FP-187, "verify residue with Visa" (ARCHITECTURE)

## Context

The card scheme settles in two decimals. Each exported line is truncated to
the nearest 10 fils, so 0–9 fils per line never reach the scheme. Over a
month this is a few BD per busy merchant. If the residue is not recorded,
the ledger, the settlement report and the scheme statement cannot all agree.

Options considered:

| Option | Pros | Cons |
|---|---|---|
| A. Journal residue per line at export into a suspense account | Ledger always ties to scheme file; auditable per line | One extra entry group per line |
| B. Monthly sweep script by finance | No code in the hot path | Month-end depends on a manual run; easy to get the window wrong |
| C. Send three decimals to the scheme | No residue at all | Scheme rejects 3dp in `amount`; `amount_minor` support unconfirmed |

## Decision

Option A. At export, for each line, post a balanced group:

| Leg | Account | Direction | Amount |
|---|---|---|---|
| 1 | `card_scheme_clearing` | credit | `gross_fils - amount_fils` |
| 2 | `scheme_rounding_residue` | debit | `gross_fils - amount_fils` |

Finance clears `scheme_rounding_residue` monthly against the scheme
statement.

## Implementation notes

Implemented inside `CloseBatch` alongside the `scheme_export_lines` insert
(March 2026). The one-off `scripts/reconcile_march.ts` covered March only,
because March closed before the CloseBatch change was deployed.

> **Correction (2026-10-30):** the March 2026 claim above was false. HANDOVER
> recorded that nothing posted residue, and the code agreed (B15). ADR-0007
> required the posting, and migration 0080 now does it per line, with a unique
> receipt. Residue missing from before that change has not been repaired.

## Consequences

- No month-end sweep is needed from April onwards.
- `scheme_rounding_residue` must exist in the chart of accounts (migration
  0007 seed).
- The scheme file `amount` must be exactly `amount_fils / 1000` formatted to
  two decimals, or the residue is wrong.
