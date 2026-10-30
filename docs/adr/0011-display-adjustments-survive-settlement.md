# 0011. Display adjustments last until a rebuild

- **Status:** Accepted
- **Date:** 2026-10-30
- **Decider:** Repository owner, explicit approval in this session
- **Related:** 0006, 0007, B13, B14, B55

ADR-0006 says a balance rebuild resets display corrections. The per-merchant
cache refresh after each close and payout was also wiping them, which that
decision does not allow.

`merchant_balances.display_adjustment_fils` records the display-only part of the
cache. **Adjust balance** adds to it and to `cached_payable_fils`, with no ledger
entry. A settlement refresh sets the cache to ledger payable plus that amount. A
rebuild, whether from the CLI, the console or the 02:00 refresh, sets the cache
to ledger payable and zeroes it. A correction therefore lasts until the next
rebuild, at most until 02:00 Bahrain time.

Corrections made before migration 0085 are not reconstructed.
