# 0015. Who enables refunds for a merchant

- **Status:** Accepted
- **Date:** 2026-10-30
- **Decider:** Repository owner, explicit approval in this session
- **Related:** 0009, B16, B90, FP-300

ADR-0009 makes `merchants.refunds_enabled` an explicit opt-in but names no way
to set it, so no merchant could use refunds without a direct database edit.

A finance or super admin sets it for one merchant at a time through
`POST /v1/admin/merchants/:id/refunds-enabled`, audited in the same transaction.
There is no bulk action, and existing NULL rows stay NULL until someone chooses.

The route also requires `FEATURE_REFUNDS=true`, which stays off by default.
Turning it on for a deployment is the operator's release decision.
