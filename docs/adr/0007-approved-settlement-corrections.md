# 0007. Approved settlement corrections and Bahrain time

- **Status:** Accepted; implementation outstanding
- **Date:** 2026-10-30
- **Decider:** Repository owner, explicit instructions in this session
- **Supersedes:** 0003's UTC calendar-month exception; 0004's different console rebuild source
- **Related:** 0001, 0002, ARCHITECTURE, HANDOVER, B14, B15, B26, B27

## Context

The task split preserved UTC monthly reports and a separate settled-data
source for the console cache rebuild. The repository owner explicitly
corrected both decisions: the CLI gives the correct balance, and all date
windows and displayed timestamps must follow Bahrain time. The owner
reports that clicking the console rebuild significantly drops merchant
balances. That observed symptom is not a fresh reproduction in this pass.

The owner also approved implementing the settlement corrections specified
by the accepted ADRs, including automatic residue posting. This approval
does not establish that those corrections are already implemented.

## Decision

1. The ledger-based CLI calculation is authoritative for rebuilding
   `merchant_balances`. The console rebuild must produce that same balance;
   lifetime exported amounts are not a substitute for ledger payable.
   The timeout concern in 0004 may require asynchronous execution or query
   optimization; it must not change the financial quantity being rebuilt.
2. Daily and calendar-month windows use `Asia/Bahrain` (UTC+3, no DST),
   including reporting, finance scripts, scheduler dates and UI date defaults.
   Use half-open local calendar windows. Present timestamps in Bahrain time.
   Preserve absolute instants in timestamp storage; do not shift an instant
   by adding three hours to its stored value. UTC serialization of an instant
   does not justify using UTC calendar boundaries.
3. At each scheme export line, calculate residue in integer fils as
   `gross_fils - amount_fils`, where `amount_fils` is the authoritative
   exported integer amount. The external two-decimal amount must represent
   that same integer amount, as required by 0002; do not independently round
   gross to produce the external amount.
4. For positive residue, automatically credit `card_scheme_clearing` and
   debit `scheme_rounding_residue` by the same residue, in the same database
   transaction as the export line. Zero residue requires no monetary legs.
   Use a stable identity tied to the export line, enforced by a database
   uniqueness constraint, so retries or concurrent attempts cannot post the
   residue twice. A failure rolls back both line and posting.
5. The owner has approved code changes implementing accepted settlement ADR
   decisions. Do not request that same approval again. This does not activate
   proposed/paused settlement v2, authorize production deployment or historical
   data repair, or unfreeze the protected money packages.

## Consequences

- B14 is an active cache-rebuild defect, not an accepted difference in balance.
- B27 requires Bahrain month boundaries as well as duplicate-posting prevention
  and the account directions required by 0002.
- B26's export amount consistency is a prerequisite for correct B15 residue.
- Existing tests that preserve contradictory behavior do not define the rule.
  This decision does not change existing regression-locked test files.
- ADR-0006's display-only adjustments still reset on an authoritative rebuild;
  they must not silently become ledger postings.
- New export posting does not repair historical missing residue. Historical
  repair remains a separate operation requiring an explicit scope.
