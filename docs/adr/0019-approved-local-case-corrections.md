# 0019. Approved corrections from the original case review

- **Status:** Accepted; implemented, database integration verification pending
- **Date:** 2026-10-30
- **Decider:** Repository owner, explicit confirmation in this session
- **Supersedes:** ARCHITECTURE's client-clock expiry rule; ADR-0012's unresolved
  signed-body representation for this implementation; ADR-0014's deferral of
  removing the capture-time volume tier. Other safeguards remain in force.
- **Related:** Original case files, B17, B23, B93, ADR-0016

## Context

The owner requested local code fixes, excluding production work. Asked whether
expiry should use server time, callback signatures exact raw bytes, and capture
pricing exclude the volume tier, including whether the pricing change had
approval, the owner answered "yeah". This records that authorization; it does
not claim independently obtained provider documentation or external finance
evidence.

## Decision

1. Payment links must be unexpired at the atomic database claim, according to
   database time. Client `submittedAt` remains accepted for compatibility but
   cannot change eligibility. Existing capture ownership, ambiguous-outcome
   blocking and retry protections remain intact.
2. Callback HMAC-SHA256 covers the ASCII timestamp followed by `.` followed by
   the exact raw HTTP JSON body bytes. Capture those bytes before JSON parsing;
   retain body-size limits and JSON safety checks. Mandatory signatures, retired
   secret rejection and the five-minute freshness check remain enforced. This
   defines the local integration contract, not verification of a real provider.
3. New captures use the event-time effective merchant MDR and negotiated
   discount-before-MDR rule, without the platform-wide volume-tier bonus.
   Preserve recorded historical fees and tier snapshots. Recalculation and
   refunds retain their existing historical-fee protections; there is no repair
   or retroactive repricing.

## Consequences

These are future local-code behaviors. No production deployment, external
credential operation, historical financial repair or refund release is approved.
The refund flag remains off by default; enabled local QA still requires an
explicitly opted-in disposable merchant.
