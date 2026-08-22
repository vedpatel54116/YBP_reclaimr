# Deploying ReclaimR

This document covers running ReclaimR outside a developer's laptop: what the
system needs, how to configure it safely, and the operational details that are
easy to get wrong (webhook secrets, statement storage, migration ordering).

- [Topology](#topology)
- [Prerequisites](#prerequisites)
- [Configuration](#configuration)
- [Quick start: single host with Docker Compose](#quick-start-single-host-with-docker-compose)
- [Building and running the images individually](#building-and-running-the-images-individually)
- [Database migrations](#database-migrations)
- [Stripe setup](#stripe-setup)
- [Statement storage](#statement-storage)
- [Staff console access](#staff-console-access)
- [Health checks and readiness](#health-checks-and-readiness)
- [Scaling](#scaling)
- [Security checklist](#security-checklist)
- [Backups and recovery](#backups-and-recovery)
- [Observability](#observability)
- [Troubleshooting](#troubleshooting)

---

## Topology

Four runtime pieces plus two datastores:

| Component     | Image                           | Port | Internet-facing | Scales on            |
| ------------- | ------------------------------- | ---- | --------------- | -------------------- |
| `web`         | `apps/web/Dockerfile`           | 3000 | yes             | request volume       |
| `api`         | `apps/api/Dockerfile`           | 3001 | yes             | request volume       |
| `worker`      | `apps/worker/Dockerfile`        | —    | **no**          | queue depth          |
| `migrate`     | `apps/api/Dockerfile`           | —    | no              | runs once per deploy |
| PostgreSQL 17 | managed or `postgres:17-alpine` | 5432 | no              | —                    |
| Redis 7       | managed or `redis:7-alpine`     | 6379 | no              | —                    |

The worker must never be reachable from the internet. It holds the same database
and Plaid credentials as the API but has no authentication layer of its own,
because it only ever consumes jobs the API produced.

Redis is optional for the API (without it, rate limiting falls back to
per-process memory and sync runs inline in the request) but **required** for the
worker, which has no inline fallback.

---

## Prerequisites

- Docker 24+ with BuildKit (default in modern Docker), or Node 22 + pnpm 11
- PostgreSQL 17
- Redis 7
- A Stripe account (test mode is fine for staging)
- Plaid credentials — optional; without them the API uses a deterministic mock
  aggregator that generates realistic transaction history

---

## Configuration

Every setting is an environment variable, validated once at startup by
`apps/api/src/env.ts`. Invalid or missing configuration **fails the boot** with a
list of problems rather than starting in a half-working state:

```
Error: Invalid environment configuration:
  STRIPE_WEBHOOK_SECRET: is required when STRIPE_SECRET_KEY is set (webhooks grant premium access)
  JWT_ADMIN_SECRET: is required in production
  BANK_TOKEN_ENCRYPTION_KEY: is required in production
```

Start from [`.env.example`](../.env.example), which documents every variable.

### Required in production

| Variable                    | Why it is mandatory                                                                                                                             |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`              | PostgreSQL connection string                                                                                                                    |
| `CORS_ORIGIN`               | Comma-separated allowed origins. Empty means _allow all_ — acceptable locally, never in production                                              |
| `JWT_ACCESS_SECRET`         | Signs member access tokens                                                                                                                      |
| `JWT_ADMIN_SECRET`          | Signs staff tokens. Must differ from the member secret so the two realms cannot forge each other's credentials                                  |
| `BANK_TOKEN_ENCRYPTION_KEY` | AES key for aggregator access tokens at rest. In development this silently falls back to the JWT secret; in production that fallback is refused |
| `STRIPE_SECRET_KEY`         | Without it the API would fall back to the mock billing adapter and hand out premium for free, so production refuses to start                    |
| `STRIPE_WEBHOOK_SECRET`     | The webhook is the only thing that grants premium, and its signature is its only authentication                                                 |

Generate each secret independently:

```bash
openssl rand -base64 32
```

Do not reuse one value across variables. `JWT_ADMIN_SECRET` sharing
`JWT_ACCESS_SECRET` would collapse the realm separation that keeps a stolen
member token from acting as staff.

### Notable optional settings

| Variable                           | Default              | Notes                                                                                                                    |
| ---------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `REDIS_URL`                        | unset                | Enables Redis-backed rate limiting and background jobs. **With it set, the API fails closed while Redis is unreachable** |
| `ADMIN_MFA_REQUIRED`               | `false`              | Always treated as `true` in production                                                                                   |
| `JWT_ADMIN_TTL_SECONDS`            | `900`                | Staff sessions are short by design; there is no staff refresh token                                                      |
| `STATEMENT_STORAGE_DIR`            | `./.data/statements` | Must be a durable volume — see [Statement storage](#statement-storage)                                                   |
| `PLAID_CLIENT_ID` / `PLAID_SECRET` | unset                | Both unset selects the mock aggregator                                                                                   |
| `LLM_API_KEY`                      | unset                | Unset selects the mock LLM adapter                                                                                       |

---

## Quick start: single host with Docker Compose

Suitable for staging or a small production deployment on one machine.

```bash
cp .env.example .env
# Fill in DATABASE_URL is not needed here (compose builds it), but you must set:
#   POSTGRES_PASSWORD, CORS_ORIGIN, NEXT_PUBLIC_API_URL,
#   JWT_ACCESS_SECRET, JWT_ADMIN_SECRET, BANK_TOKEN_ENCRYPTION_KEY,
#   STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET,
#   STRIPE_SUCCESS_URL, STRIPE_CANCEL_URL

docker compose -f docker-compose.prod.yml up -d --build
```

Compose refuses to start if any required secret is missing, rather than
substituting a blank string:

```
error while interpolating services.api.environment.STRIPE_WEBHOOK_SECRET:
  required variable STRIPE_WEBHOOK_SECRET is missing a value: set STRIPE_WEBHOOK_SECRET
```

The `migrate` service runs `prisma migrate deploy` once and the `api` and
`worker` services wait for it to complete successfully
(`depends_on: condition: service_completed_successfully`). That ordering is what
stops two API replicas racing to apply the same migration.

Verify:

```bash
curl -s localhost:3001/health   # liveness — touches no dependencies
curl -s localhost:3001/ready    # readiness — checks Postgres and Redis
curl -s localhost:3000/         # web
docker compose -f docker-compose.prod.yml logs -f api worker
```

`docker-compose.yml` (no suffix) is a _development_ file: it starts only
Postgres and Redis for `pnpm dev`. Do not deploy it.

### Note on `NEXT_PUBLIC_API_URL`

Next.js inlines `NEXT_PUBLIC_*` values into the client bundle at build time, so
the API URL is a **build argument**, not a runtime variable. Pointing the web app
at a different API requires rebuilding the image, not restarting it.

---

## Building and running the images individually

All three Dockerfiles expect the **repository root** as the build context,
because the apps depend on workspace packages that ship TypeScript source.

```bash
docker build -f apps/api/Dockerfile    -t reclaimr-api:1.0.0    .
docker build -f apps/worker/Dockerfile -t reclaimr-worker:1.0.0 .
docker build -f apps/web/Dockerfile \
  --build-arg NEXT_PUBLIC_API_URL=https://api.example.com \
  -t reclaimr-web:1.0.0 .
```

Each image is multi-stage: dependencies, build, a `--prod` dependency install,
then a slim runner that drops to the non-root `node` user. The API and worker
images retain the Prisma CLI on purpose — it is a runtime requirement for the
release-time `prisma migrate deploy` step.

Running the API standalone:

```bash
docker run -d --name reclaimr-api -p 3001:3001 \
  -e NODE_ENV=production \
  -e DATABASE_URL="postgresql://user:pass@db.internal:5432/reclaimr" \
  -e REDIS_URL="redis://cache.internal:6379" \
  -e CORS_ORIGIN="https://app.example.com" \
  -e JWT_ACCESS_SECRET="$(openssl rand -base64 32)" \
  -e JWT_ADMIN_SECRET="$(openssl rand -base64 32)" \
  -e BANK_TOKEN_ENCRYPTION_KEY="$(openssl rand -base64 32)" \
  -e STRIPE_SECRET_KEY="sk_live_..." \
  -e STRIPE_WEBHOOK_SECRET="whsec_..." \
  -e STRIPE_SUCCESS_URL="https://app.example.com/settings/premium?status=ok" \
  -e STRIPE_CANCEL_URL="https://app.example.com/settings/premium?status=canceled" \
  -v reclaimr-statements:/repo/apps/api/.data/statements \
  reclaimr-api:1.0.0
```

### Deploying without Docker

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm --filter @reclaimr/api db:migrate
NODE_ENV=production pnpm --filter @reclaimr/api start   # node dist/index.js
NODE_ENV=production pnpm --filter @reclaimr/worker start
NODE_ENV=production pnpm --filter @reclaimr/web start
```

---

## Database migrations

Migrations are checked in under `apps/api/prisma/migrations` and applied with:

```bash
pnpm --filter @reclaimr/api db:migrate    # prisma migrate deploy
```

Rules that matter in production:

1. **Run migrations as a separate release step**, before new application
   containers start. The compose file models this with the `migrate` service.
2. **Never use `prisma migrate dev` or `db push` against a deployed database.**
   Both can drop data. `db:dev` and `db:push` exist for local work only.
3. **Deploy expand-then-contract.** Add a nullable column, ship code that writes
   it, backfill, then make it required in a later migration. A single migration
   that renames or drops a column will break whichever replicas are still
   running the previous image during a rolling deploy.

Verify a migration set reproduces the schema exactly before shipping it:

```bash
createdb reclaimr_shadow
pnpm --filter @reclaimr/api exec prisma migrate diff \
  --from-migrations prisma/migrations \
  --to-schema-datamodel prisma/schema.prisma \
  --shadow-database-url "postgresql://user:pass@localhost:5432/reclaimr_shadow" \
  --exit-code
# "No difference detected." is the only acceptable output.
```

### Seeding

```bash
pnpm --filter @reclaimr/api db:seed
```

The seed **refuses to run when `NODE_ENV=production`** — its credentials are
published in this repository. It is for local development and disposable staging
only. It is idempotent: re-running replaces demo data rather than duplicating it.

---

## Stripe setup

Premium is granted by the webhook, not by the checkout redirect. Getting this
wrong is the most likely cause of "the member paid but has no premium".

1. **Create the webhook endpoint** in the Stripe dashboard, pointing at:

   ```
   https://api.example.com/api/v1/billing/webhook
   ```

2. **Subscribe to these events** — the handler ignores everything else:

   | Event                           | Effect                                            |
   | ------------------------------- | ------------------------------------------------- |
   | `checkout.session.completed`    | Grants premium                                    |
   | `customer.subscription.created` | Fills in period dates                             |
   | `customer.subscription.updated` | Status, cadence, and cancel-at-period-end changes |
   | `customer.subscription.deleted` | Ends the entitlement                              |
   | `invoice.payment_failed`        | Marks `past_due` (access is retained)             |

3. **Copy the signing secret** into `STRIPE_WEBHOOK_SECRET`. The endpoint has no
   other authentication; the signature is the entire security boundary, and it
   verifies both the HMAC and a timestamp tolerance so a captured payload cannot
   be replayed.

4. **Do not put the webhook behind auth, CSRF, or a body-rewriting proxy.**
   Signature verification needs the exact bytes Stripe signed. The route
   installs its own raw-body parser in an isolated Fastify scope for this reason.

5. **Test locally** with the Stripe CLI:

   ```bash
   stripe listen --forward-to localhost:3001/api/v1/billing/webhook
   stripe trigger checkout.session.completed
   ```

### Idempotency

Stripe delivers at-least-once. Every event id is claimed in the `stripe_events`
table before any side effect, so a redelivery is acknowledged without being
re-applied. The endpoint always returns `200` once the signature is valid —
returning an error for an event we chose not to act on would make Stripe retry it
indefinitely.

### Pricing model

Members choose their own monthly price between `$7` and `$14`
(`PREMIUM_PRICE_MIN_CENTS`/`MAX_CENTS`). Because the price is per-member there is
no fixed Stripe Price object; each Checkout session declares its amount inline
via `price_data`. The yearly plan charges the chosen monthly price × **10**
(`PREMIUM_YEARLY_MONTHS_CHARGED`, i.e. two months free), so there is exactly one
price dimension to reason about.

Webhook payloads carry `reclaimr_user_id`, `reclaimr_price_cents_monthly`, and
`reclaimr_interval` in subscription metadata, which is how a delivery is resolved
back to a member. A payload claiming a price outside the published band is
rejected rather than stored.

---

## Statement storage

Members upload bill statements to support negotiation cases. These are among the
most sensitive objects in the product — full account statements.

The default `LocalStorageAdapter` writes to `STATEMENT_STORAGE_DIR`. It assumes
**one writer with a durable volume**:

- Mount a persistent volume over that path. Statements written to a container's
  ephemeral filesystem are lost on redeploy, and a concierge working the case
  will see a document row pointing at nothing.
- **Do not run multiple API replicas against local disk.** Uploads would scatter
  across machines and downloads would intermittently 404.

For multi-replica deployments, implement the three-method `StorageAdapter` port
against S3/GCS/R2 and select it in
`apps/api/src/adapters/storage/index.ts` — the same pattern
`createPlaidAdapter` uses. Nothing above that file knows where bytes live.

Storage keys are server-generated and userId-prefixed
(`negotiations/<userId>/<caseId>/<uuid>.pdf`) so a leaked key cannot address
another member's file, and the client-supplied filename never reaches the path.
Uploads are capped at 10MB and restricted to PDF, PNG, JPEG, and WebP.

---

## Staff console access

Staff accounts (`admin_users`) are a separate realm from members: different
credentials table, different signing secret, different token audience, and no
refresh tokens. A member token is rejected on every admin route and a staff token
is rejected on every member route.

### Roles

| Role          | Capabilities                                                  |
| ------------- | ------------------------------------------------------------- |
| `agent`       | `cases.read`, `cases.write`, `members.read`, `merchants.read` |
| `finance_ops` | the above plus `merchants.write`                              |
| `admin`       | the above plus `audit.read`                                   |

`audit.read` is the narrowest grant on purpose: the audit log is the record used
to review staff behaviour, including their own.

### MFA

TOTP is **mandatory in production**. An account without an enrolled secret cannot
log in there, and the failure is recorded as `admin.login_failed` with reason
`mfa_not_enrolled`.

Secrets are stored AES-256-GCM encrypted under their own key-derivation domain
(`reclaimr:admin-mfa:v1`), so an MFA ciphertext can never be decrypted by the
bank-token key even though both derive from configured secrets.

### Creating the first staff account

There is deliberately no self-service staff signup. Create the first account
directly, then use the console to manage the rest:

```bash
docker compose -f docker-compose.prod.yml exec api node -e '
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");
const prisma = new PrismaClient();
(async () => {
  await prisma.adminUser.create({
    data: {
      email: process.env.EMAIL,
      name: process.env.NAME,
      role: "admin",
      passwordHash: await bcrypt.hash(process.env.PASSWORD, 12),
    },
  });
  console.log("created; enrol MFA before production use");
  await prisma.$disconnect();
})();
'
```

Then enrol a TOTP secret for that account (encrypting it with the
`reclaimr:admin-mfa:v1` domain) before granting it production access.

---

## Health checks and readiness

| Route         | Purpose       | Behaviour                                                                                                       |
| ------------- | ------------- | --------------------------------------------------------------------------------------------------------------- |
| `GET /health` | **Liveness**  | Never touches dependencies. Use it for restart decisions, so a database blip does not restart a healthy process |
| `GET /ready`  | **Readiness** | Checks Postgres (required) and Redis (optional). Returns `503` while dependencies recover                       |

Point your load balancer's traffic gate at `/ready` and your orchestrator's
restart probe at `/health`. Wiring both to the same route is a common mistake: a
brief database outage would then roll every container simultaneously.

The worker exposes no port and has no HTTP probe. Judge it by queue progress and
log output.

---

## Scaling

| Component | Notes                                                                                                                                                                                         |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `api`     | Stateless **except** for local statement storage. Scale freely once an object-storage adapter is configured                                                                                   |
| `worker`  | Scale horizontally on queue depth. Use `WORKER_QUEUES` to dedicate replicas to specific queues (`plaid.sync`, `detection.subscriptions`, `detection.bills`, `alerts.evaluate`, `maintenance`) |
| `web`     | Fully stateless                                                                                                                                                                               |
| Postgres  | Vertical first; add read replicas only after measuring. Every member-owned query is already scoped by a single `userId` index                                                                 |
| Redis     | Required for multi-replica rate limiting to be shared rather than per-process                                                                                                                 |

Run exactly one replica of the `maintenance` queue consumer. Its daily fan-out is
deduplicated by job id, but a single consumer keeps the scheduling simple.

---

## Security checklist

Before accepting real users:

- [ ] Every secret generated independently with `openssl rand -base64 32`
- [ ] `JWT_ADMIN_SECRET` differs from `JWT_ACCESS_SECRET`
- [ ] `CORS_ORIGIN` set to explicit origins — never left empty
- [ ] `BANK_TOKEN_ENCRYPTION_KEY` set explicitly (the dev fallback is refused in production)
- [ ] TLS terminated in front of both `web` and `api`
- [ ] Postgres and Redis **not** published to the internet (the prod compose file uses `expose`, not `ports`)
- [ ] Worker not internet-reachable
- [ ] `STRIPE_WEBHOOK_SECRET` set, and the webhook path excluded from any body-rewriting proxy
- [ ] Statement volume is durable and encrypted at rest
- [ ] Every staff account has TOTP enrolled
- [ ] Seed script never run against production (it refuses, but do not rely on that alone)
- [ ] Database backups running and **restore-tested**
- [ ] Log aggregation configured (see [Observability](#observability))

---

## Backups and recovery

Two stores hold data you cannot rebuild:

1. **PostgreSQL** — everything. Take continuous archiving or at minimum nightly
   `pg_dump`, and test a restore on a schedule. An untested backup is a guess.

   ```bash
   docker compose -f docker-compose.prod.yml exec -T postgres \
     pg_dump -U reclaimr reclaimr | gzip > reclaimr-$(date +%F).sql.gz
   ```

2. **Statement storage** — member-uploaded documents. Back up the volume or rely
   on the object store's own durability and versioning.

Redis holds only job state. Losing it loses queued syncs, which the daily
maintenance fan-out re-creates; it is not a backup priority, though the prod
compose file enables append-only persistence so a restart does not drop
in-flight work.

The append-only tables — `audit_logs` and `savings_events` — are never updated or
deleted by application code. Treat them as records: retention policy applies, but
never write a migration that mutates them in place.

---

## Observability

The API logs structured JSON via Pino. Ship container stdout to your log
platform; no file-based logging is configured.

Signals worth alerting on:

| Signal                                | Why                                                                                                                         |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `GET /ready` returning `503`          | Dependency degradation                                                                                                      |
| `action: "unmatched"` in webhook logs | A payment succeeded that could not be attributed to a member                                                                |
| `Failed to write audit log`           | Audit writes are best-effort and never block a member action, so a failure is silent to users and must not be silent to you |
| `admin.login_failed` volume           | Credential stuffing against the staff realm                                                                                 |
| Queue depth growth                    | The worker is not keeping up                                                                                                |
| Case age in `submitted`               | Concierge queues are backing up, which members experience directly                                                          |

The audit trail is queryable through the console (`GET /api/v1/admin/audit-logs`,
`audit.read` capability) and supports filtering by action prefix and member.

---

## Troubleshooting

**API exits immediately with "Invalid environment configuration"**
Working as intended. The listed variables are missing or malformed; fix them and
restart. Configuration is validated once at boot rather than lazily at first use.

**Member paid but has no premium**
The webhook never landed. Check the Stripe dashboard's delivery attempts, then
the API logs for `Rejected billing webhook` (signature mismatch — wrong
`STRIPE_WEBHOOK_SECRET`, or a proxy rewriting the body) or `action: "unmatched"`
(the payload carried no resolvable member). Premium is only ever granted by the
webhook, never by the checkout redirect.

**Webhook returns 401**
Signature verification failed. Either `STRIPE_WEBHOOK_SECRET` does not match the
endpoint's secret, or something between Stripe and the API is modifying the
request body.

**Statement upload succeeds, download 404s**
The bytes went to a container filesystem that has since been replaced, or
requests are load-balanced across replicas that do not share storage. Mount a
durable volume, or move to an object-storage adapter.

**`403 PREMIUM_REQUIRED` for a paying member**
Check `premium_subscriptions.status` and `currentPeriodEnd`. `trialing`,
`active`, and `past_due` all grant access; `canceled` and `expired` do not. A
lapsed `currentPeriodEnd` also denies access as a guard against a missed webhook.

**`403 INSUFFICIENT_ROLE` in the console**
The staff account's role lacks the capability. See
[Roles](#roles) — merchant writes need `finance_ops`, audit logs need `admin`.

**Concierge cannot mark a negotiation succeeded**
By design. Only the member can approve an offer, because approval is what books
the success fee. Staff take a case to `offer_pending`; the member's
`POST /negotiations/:id/offer/approve` resolves it.

**Worker processes nothing**
`REDIS_URL` is unset or unreachable. Unlike the API, the worker has no inline
fallback.

**`ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY` during a build**
Set `CI=true`. The Dockerfiles already do.
