# 0013. Unknown capture outcomes block a payment link

- **Status:** Accepted
- **Date:** 2026-10-30
- **Decider:** Repository owner, explicit approval in this session
- **Related:** ARCHITECTURE (single-use links), B18, B07

Payment links are single-use, so nobody else may be charged while an earlier
charge might have succeeded.

1. Before calling the acquirer to capture, the attempt is recorded durably. If
   that claim was already superseded, no capture happens and the authorization
   is voided.
2. A definite refusal voids the authorization and reopens the link.
3. An acquirer error, an exception or a crash leaves the outcome unknown. The
   link stays reserved and cannot be claimed, even after the reservation
   timeout, and its authorization stays in place.
4. Finance or a super admin resolves it. `retry_capture` resends the same
   acquirer idempotency key. `release` voids the authorization and reopens the
   link, and asserts that the acquirer confirmed no charge. Both are audited.
