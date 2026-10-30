# 0016. Preserve capture identity and journal settlement fallback fees

- **Status:** Accepted
- **Date:** 2026-10-30
- **Decider:** Repository owner, authorization to address the reviewed defects
- **Related:** ARCHITECTURE; 0010, 0013, 0014
- **Supersedes:** ARCHITECTURE's same-transaction admin audit requirement only
  for capture-review operations that can call the acquirer; a committed attempt
  audit must precede that call and the final link transition records its outcome.

## Decision

1. ADR-0013's unknown-capture block applies to shared capture and void operations,
   including merchant API calls. Only the original payment-link claim may resolve
   its transaction. Only a confirmed acquirer decline (402) permits automatic
   void and release; local conflicts and all uncertain results retain the block.
2. Commit a capture-review attempt audit before calling capture or void, then
   record its result. Crashes leave an attempted phase, never an unaudited action.
   Explicit release requires a nonempty acquirer confirmation reference or note,
   recorded as releaseEvidence (maximum 2000 characters).
3. ADR-0014 excludes applying a platform threshold during recalculation. Preserve
   the recorded fee of an event with a nonzero volumeTierBonusBps rather than
   reclaiming its discount. A missing fee snapshot on such an event stops the
   recalculation for review. Changing tier-priced events remains pending finance.
4. Settlement may price a capture lacking both a fee journal and fee snapshot
   only when its gross and payable journals are complete and consistent. Use the
   existing event-time schedule, merchant fallback and discount-before-MDR rule,
   without the platform tier. Post balanced merchant_payable debit and
   platform_fee_revenue credit legs, at the capture instant, and persist the fee
   snapshot in the same transaction as the event's batch claim and close.
   A recorded zero stays zero. Snapshot/journal disagreement stops close for
   review; missing gross journals are not silently reconstructed.
5. Platform finance and super admins can read batch integrity directly and list
   unresolved capture attempts across merchants with bounded pagination. Merchant
   reports retain their existing role checks. Impersonation stays read-only.
6. Failed daily runs return successful merchant results alongside failed merchant
   IDs, and the admin response and audit preserve both. Cancellation identifies
   the remaining selected merchants as failed/unprocessed.
7. Refund drawer retries preserve the same request key and explicit amount after
   ambiguous responses. A successful refund followed by a refresh failure is
   reported as a successful refund requiring a page refresh.

## Consequences

This authorizes no historical repair, production deployment, refund activation,
or changes to protected money packages. Existing migrations remain unchanged;
0096 adds lookup indexes after the existing migration sequence.
