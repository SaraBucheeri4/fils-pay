# 0010. Carry negative settlement net into later payouts

- **Status:** Accepted
- **Date:** 2026-10-30
- **Decider:** Repository owner, explicit answer in this session
- **Related:** B28, B48, B16, ADR-0001, ADR-0007

Refunds and approved financial corrections can exceed a day's captures.
That day sends zero to the bank. Carry the negative net forward to reduce
later payouts. Do not change the totals or bank instruction of a paid batch.

All calculations use integer fils. A batch consumes succeeded unbatched
refund rows and pending fee-correction rows atomically with close. Refund
gross reduces gross; the fee actually reversed reduces fees. Refunds are
already journaled by the API: settlement does not journal them again.

For each newly closed batch:

- `activity_net = gross_fils - fee_fils`
- `available = activity_net + carry_in_fils`
- `net_payout_fils = max(0, available)`
- `carry_out_fils = min(0, available)`

The next close consumes the previous carry once under a merchant row lock.
Carry is allocation metadata, not a new money movement. Only an actual
positive payout creates payout ledger legs. Fee corrections are new balanced
journals with the corrected period's effective date and a pending settlement
claim; both closed and paid batch totals remain frozen.

Reconciliation attributes batched and pending activity to its original
Bahrain window, including actual fees and refund reversals. Payout legs
discharge accruals and are excluded from the accrual comparison.

Migration defaults do not reconstruct historical missing refunds, residue,
corrections or carry. Historical repair and settlement v2 remain separate.
