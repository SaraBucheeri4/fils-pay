# Hosting preparation (B99)

`docker-compose.hosting.yml` overlays the local stack. It removes database/API
host ports, requires supplied secrets, uses production API mode and secure
cookies, keeps refunds off, and replaces Vite servers with built assets behind
Caddy HTTPS. No hosted release has been performed or approved by this change.

Requires Docker Compose 2.24.4 or newer for `!override` and `!reset`:
[Compose merge documentation](https://docs.docker.com/reference/compose-file/merge/).
The gateway uses Caddy's [SPA and API pattern](https://caddyserver.com/docs/caddyfile/patterns).

Supply these server-side variables through an ignored environment file or
deployment secrets, never a frontend `VITE_*` variable:

- `POSTGRES_PASSWORD` and `HOSTING_DATABASE_URL` (URL-encode the password;
  URL must target `postgres:5432/filspay` on this stack).
- `WEBHOOK_SECRET_ENCRYPTION_KEY` (existing persistent base64 32-byte key;
  replacing it makes existing webhook secrets unreadable).
- `SETTLEMENT_INTERNAL_TOKEN`, `ACQUIRER_CALLBACK_SIGNING_SECRET` (retired
  callback value remains rejected).
- `RESEND_API_KEY`, `OTP_EMAIL_FROM` (verified sender for general delivery).
- `WEB_DOMAIN` and `ADMIN_DOMAIN` (distinct DNS hostnames, no schemes/paths).
- `OTP_EMAIL_TO_OVERRIDE` only for the owner's temporary single-inbox demo.
  The local `.env.local` supplies the requested inbox. Clear this variable for
  delivery to each authenticated user's email.

Inspect the merged configuration locally with `config --quiet`; ordinary
`config` prints secrets and must not be pasted into tickets or logs:

```powershell
docker compose --env-file .env.local -f ops/docker-compose.yml -f ops/docker-compose.hosting.yml config --quiet
```

Do not start a hosted stack until both production login journeys, OTP expiry
and resend behavior pass on a disposable local setup; callback-contract and
rotation prerequisites remain open under ADR-0012/B53. Perform the KYC backup
and restore procedure in [kyc-storage.md](kyc-storage.md) **before** container
recreation. This overlay does not rotate database credentials already stored
in an existing Postgres volume; changing its environment is not a rotation.

For a later authorized host release, configure DNS and permit ports 80/443 for
Caddy's automatic certificates. Persist its certificate volumes. Do not enable
the `local-dev-only` or `local-seed-only` profiles. The seed remains destructive.
Per-service database roles/TLS and backups remain operational work from HANDOVER,
not claims established by this overlay. Monitoring is a separate optional overlay:
see [observability/README.md](observability/README.md).

Local verification pending: image build, HTTPS routing, login with secure
cookies on both hostnames and KYC restore. Docker engine access failed during
this change; Compose model validation alone cannot establish release readiness.
