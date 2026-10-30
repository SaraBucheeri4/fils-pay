# 0018. API-key rotation revokes the original atomically

- **Status:** Accepted; implemented, database integration verification pending
- **Date:** 2026-10-30
- **Decider:** Repository owner, instruction to implement the reviewed code fixes
- **Related:** ARCHITECTURE (admin audit), original support case on key rotation, B100

## Decision

Admin rotation immediately sets the original merchant API key's `revoked_at`
and `revoked_reason = 'rotated'` in the same transaction as the replacement and
audit record. There is no automatic grace period. A successful rotation leaves
only the replacement usable; a failed replacement or audit rolls back the
revocation. Merchant ownership and the existing finance/super-admin role gates
remain required. The original row is locked before checking its status, so
concurrent rotations serialize and an already-revoked key cannot rotate again.

This is code behavior for future rotations. It does not revoke historical
keys, rotate external credentials, change callback signing, or deploy anything.
