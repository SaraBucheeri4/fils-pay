# 0008. Admin impersonation, bulk KYC and webhook retention

- **Status:** Accepted
- **Date:** 2026-10-30
- **Decider:** Repository owner, explicit instructions in this session
- **Related:** B35, B64, B85, B87; ARCHITECTURE; HANDOVER

All active admin roles (support, finance, super_admin) may start impersonation.
The route must explicitly enforce requireAdminRole. Every impersonation grant
confers merchant support access only; auth middleware rejects write methods.

Bulk KYC approval is atomic: every requested merchant must exist and be
under_review. An invalid selection rejects the entire request. Each merchant
receives an individual KYC review and audit record in the same transaction.
The existing finance/super_admin route permission remains required.

Deleting a webhook endpoint disables it. Delivery and archive history remain
retained under the existing restrictive foreign keys; cascade deletion of
evidence is forbidden. This decision does not authorize historical purging.
