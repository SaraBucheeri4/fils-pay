# 0017. Resend OTP email delivery and temporary demo routing

- **Status:** Accepted; delivery implemented, full login verification pending
- **Date:** 2026-10-30
- **Decider:** Repository owner, explicit provider selection in this session
- **Related:** ARCHITECTURE (merchant/admin login), B09, B99

## Decision

Use Resend for merchant and admin OTP email delivery. The owner explicitly
requested temporary routing of both types to `lifeasmaryam7@gmail.com`.
Represent that exception through server-side `OTP_EMAIL_TO_OVERRIDE` in the
ignored local environment file, not a permanent account-email change. Clearing
the override delivers to the authenticated account's email. The API key stays
outside source control and frontend assets.

Await delivery acceptance before claiming that login/resend sent an OTP.
Provider rejection or timeout fails the request without disclosing a code,
key or provider response. Production has no logging/code-response fallback.
Retain existing challenge expiry, attempt limits and resend cooldown.

## Consequences

The temporary recipient controls receipt of codes for both login planes in
this demo configuration. General user delivery requires clearing the override
and configuring a verified sender. Resend acceptance alone does not prove
inbox receipt or successful end-to-end login.

This selection does not resolve ADR-0012's callback-format question, establish
credential revocation under B53, approve tier pricing under ADR-0014, activate
refunds, or authorize deployment. Hosting remains pending local verification.
