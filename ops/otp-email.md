# OTP email delivery

Merchant login/resend and admin login await Resend before reporting success.
Provider rejection or timeout returns `503 otp_delivery_failed`; missing
production configuration returns `503 otp_delivery_unavailable`. Codes are not
logged by the email path, and production responses cannot expose `devOtpCode`,
even if `OTP_DEV_EXPOSE=true`. Existing expiry, attempt limits and merchant
resend cooldown remain enforced independently of delivery.

API contract: [Resend Send Email](https://resend.com/docs/api-reference/emails/send-email).
Uses the fixed HTTPS endpoint, a ten-second timeout and no automatic retry.
An ambiguous provider timeout may still deliver mail; users can retry through
the existing login/resend flows rather than trusting delivery success.

Configure `RESEND_API_KEY`, `OTP_EMAIL_FROM`, and optionally
`OTP_EMAIL_TO_OVERRIDE`. Without a key, only development/test retain the local
logging fallback. Production never falls back to code disclosure.

The owner selected Resend on 2026-10-30 and requested that both login types
temporarily route to `lifeasmaryam7@gmail.com`. Those settings and the supplied
key are stored in ignored `.env.local`, excluded from Docker build contexts.
Do not commit the key. The recipient override is local configuration, so
clearing it restores delivery to each user's email without a code change.

For local API execution, load the ignored file explicitly (the API does not
auto-load it): `node --env-file=.env.local --import tsx apps/api/src/index.ts`.
Supply an independently verified disposable `DATABASE_URL` for local QA.
For Compose, pass `--env-file .env.local` before the `-f` options.

Resend accepted one merchant and one admin production-mode notifier smoke
message on 2026-10-30. Acceptance is not proof of inbox receipt or full login
verification. Both messages used random smoke codes unconnected to any account.
Full password/OTP verification, expiry/resend and delivery-error route checks
still require a migrated disposable database. Never enable hosted production
solely from this smoke check.

## Test override codes

`OTP_OVERRIDE_CODE` (merchant) and `ADMIN_OTP_OVERRIDE_CODE` (admin) set a fixed
code that OTP verify accepts alongside the emailed one, so tests and demos don't
depend on an inbox. Both are unset by default and must be at least 6 characters.

Only the OTP step changes: the password, code expiry, attempt limit and rate
limits all still apply, and each use is logged as a warning. The API refuses to
boot with either set under `NODE_ENV=production`.

A box running `NODE_ENV=development` still honours them, so on a public host
anyone with a password and the code can log in. Use a long random value
(`openssl rand -hex 16`), never commit it, and unset it after testing.
