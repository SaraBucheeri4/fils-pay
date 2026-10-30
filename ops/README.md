# ops/

Local development stack for FilsPay: Postgres plus the three services that
talk to it directly (apps/api, apps/settlement, apps/reporting). The hosted
demo instance uses the same compose file with a different `.env`.

## Quick start

See [otp-email.md](otp-email.md) for Resend settings and local execution, and
[hosting.md](hosting.md) for the prepared HTTPS hosting override and its gates.

For durable KYC storage, existing-container migration precautions and the
backup/restore drill, see [kyc-storage.md](kyc-storage.md). Complete the backup
before recreating an API container that predates the volume mount.

```
docker compose -f ops/docker-compose.yml up -d postgres
docker compose -f ops/docker-compose.yml run --rm migrate
docker compose -f ops/docker-compose.yml run --rm seed
docker compose -f ops/docker-compose.yml up api settlement reporting
```

apps/web and apps/admin aren't part of this compose file — they're plain
Vite dev servers that talk to apps/api over HTTP (`npm run dev` inside
each package), not services with their own database connection.

## Files

| File | Purpose |
|---|---|
| `docker-compose.yml` | the stack |
| `.env.docker` | shared service settings, loaded by compose for every service |
| `Dockerfile.node` | image for api, reporting, migrate, seed, web and admin (`node:22`, full install; deps compiled in `node:22-bookworm`, run in `-slim` as the `node` user) |
| `Dockerfile.go` | multi-stage build of `apps/settlement` (static binary on distroless, non-root) |

> **AM (July):** the two Dockerfiles aren't in the repo for me. built my own
>
> **MK:** they were in the initial ops commit. check you're on main

## Database

Every service, plus the one-off `migrate`/`seed` jobs, connects with the
same `filspay` role and the same `DATABASE_URL`
(`postgres://filspay:filspay_dev_password@postgres:5432/filspay?sslmode=disable`).
One role keeps local setup to a single password instead of hand-rolling
per-service grants for a stack this size. `sslmode=disable` is safe here:
Postgres and every service run on the same Docker Compose bridge network,
which never carries traffic outside the host, so there's no untrusted hop
for a connection to cross.

The settlement worker can be given a second connection string,
`PGCONN_SETTLEMENT`, for its batch-close pool. It only takes effect when
`DATABASE_URL` is unset.

To reset the database to a clean, freshly-seeded state at any point, re-run
the `seed` job above — `db/seed/index.ts` truncates and regenerates its
fixture tables on every invocation; it doesn't need the volume removed
first.

## Required settings per service

| Service | Needs | Where it comes from in compose |
|---|---|---|
| api | `DATABASE_URL`, `SETTLEMENT_INTERNAL_URL`, `SETTLEMENT_INTERNAL_TOKEN` | `environment:` |
| api, seed | `NODE_ENV` | `environment:` (`development`) |
| api | `WEBHOOK_SECRET_ENCRYPTION_KEY` | required unless `NODE_ENV` is exactly `development` or `test`, where a built-in dev key is used (see below) |
| api | `FEATURE_REFUNDS` | `false`; set `true` to open `POST /v1/refunds`. Merchants still need the opt-in (ADR-0009) |
| api | `ACQUIRER_CALLBACK_SIGNING_SECRET` | required in production only; compose does **not** load `.env.docker`, so it is unset locally |
| settlement | `DATABASE_URL` | `environment:` |
| settlement | `SETTLEMENT_INTERNAL_TOKEN` | `environment:` (`dev-token`); the daemon exits at boot without it |
| reporting | `DATABASE_URL` | `environment:`; runs `worker` by default |

### Webhook secret encryption key

Merchant webhook secrets are encrypted at rest with AES-256-GCM, so
`WEBHOOK_SECRET_ENCRYPTION_KEY` must be base64 that decodes to exactly
**32 bytes**. The api refuses to start otherwise.

- **Local / development:** leave it unset with `NODE_ENV=development` (compose
  sets this) or `NODE_ENV=test`. The api falls back to a built-in, public dev
  key. Anything encrypted with it is not secret.
- **Anything else, including an unset `NODE_ENV` or a value like `staging`:**
  a real key is required and the api refuses to start without one.
- **Production or the hosted box:** set `NODE_ENV=production` and a real key.
  Generate one with:

  ```bash
  openssl rand -base64 32
  ```

  Keep it in the host's secret store, not in this repo. Rotating it makes
  existing encrypted webhook secrets unreadable, so plan a re-encryption first.

## API docs

- Swagger UI: `/v1/docs` on the API, or through either dashboard's port. The
  spec itself is at `/v1/docs/json`.
- Postman: import `docs/api/filspay.postman_collection.json`. After changing
  `apps/api/src/docs/openapi.ts`, run `npm run postman`; a test fails if the
  spec, the routes and the collection disagree.
- `API_DOCS_ENABLED=false` removes the page. `API_DOCS_INCLUDE_INTERNAL=true`
  adds the admin routes to it. The Postman collection always includes them.

## Rate limiting

Budgets are in `apps/api/src/plugins/rateLimit.ts` and counters in the
`rate_limit_counters` table, so they hold across restarts and API instances.
If that table can't be reached, requests are allowed and an error is logged.

| Setting | Default | |
| --- | --- | --- |
| `RATE_LIMIT_ENABLED` | `true` (`false` under `NODE_ENV=test`) | Set `false` for load tests |
| `RATE_LIMIT_DEFAULT_PER_MINUTE` | `600` | Per IP, on routes with no stricter rule |
| `TRUST_PROXY` | `loopback,linklocal,uniquelocal` | Who may set `X-Forwarded-For`; `false` trusts no one |

Per-IP limits are only as good as the client IP the API sees. Requests from a
trusted address may name any client in `X-Forwarded-For`, so don't expose the
API port on a network where the host's Docker setup rewrites public client
addresses to a private one. Check with a request from outside: the API log's
`remoteAddress` should show the real public address.

## Resource sizing

The hosted demo box is 0.5 vCPU / 2 GB RAM / 2 GB disk; the API container is
limited to 512 MB. Postgres defaults are fine at this size. The settlement
image is built on the box with `go build` from `Dockerfile.go`.

> **AM:** first build on the box filled the disk (go build cache). cleared it and it went through on the second try
