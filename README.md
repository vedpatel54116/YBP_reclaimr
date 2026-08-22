# ReclaimR

Money recovery app: discover subscriptions, detect recurring bills, cancel
unwanted services, and track savings. Built as a pnpm + Turborepo monorepo in
strict TypeScript, with a black-and-white monochrome design system (light and
dark themes, grayscale only).

## Stack

| Area     | Tooling                                                            |
| -------- | ------------------------------------------------------------------ |
| Monorepo | pnpm workspaces, Turborepo                                         |
| Frontend | Next.js (App Router), React 19, TypeScript strict, Tailwind CSS v4 |
| Backend  | Fastify 5, TypeScript strict, Zod validation, JWT auth (jose)      |
| Data     | PostgreSQL via Prisma ORM, Redis (rate limiting, cache-ready)      |
| Jobs     | BullMQ queues on Redis; workers in `apps/worker`                   |
| Domain   | `@reclaimr/core` — pure, fully unit-tested detection + money math  |
| Shared   | Zod schemas, API contracts, domain types, constants                |
| UI       | Monochrome React components (`@reclaimr/ui`)                       |
| Quality  | ESLint 9 (flat config), Prettier, `tsc --noEmit`, Vitest           |

## Layout

```
reclaimr/
├── apps/
│   ├── web/              # Next.js frontend (@reclaimr/web, port 3000)
│   ├── api/              # Fastify backend (@reclaimr/api, port 3001)
│   │   ├── prisma/       # Schema, migrations, seed
│   │   └── src/adapters/ # Plaid (HTTP + deterministic mock), token cipher
│   └── worker/           # BullMQ workers (@reclaimr/worker)
├── packages/
│   ├── shared/           # Types, Zod schemas, API contracts, constants
│   ├── core/             # Pure domain logic: detection engine, money math
│   ├── queue/            # BullMQ queue names, job schemas, producer
│   └── ui/               # Black-and-white design system (Tailwind tokens)
├── docker-compose.yml    # Local PostgreSQL + Redis
├── legacy/               # Pre-monorepo prototype code (out of the workspace)
├── package.json          # Workspace root + shared dev tooling
├── pnpm-workspace.yaml
├── turbo.json            # Turbo task pipeline (build/lint/typecheck/test)
├── tsconfig.base.json
├── eslint.config.mjs     # Single flat ESLint config for all packages
├── .prettierrc
└── .env.example
```

## Getting started

**Prerequisites:** Node.js 20+, pnpm (`corepack enable pnpm`), Docker (for
PostgreSQL and Redis).

```bash
pnpm install                # install all workspace dependencies
cp .env.example .env        # API environment (DB, Redis, JWT secret)
cp apps/web/.env.example apps/web/.env.local
pnpm db:up                  # start PostgreSQL + Redis via docker compose
pnpm db:migrate             # apply Prisma migrations
pnpm db:seed                # seed the demo member + subscriptions
pnpm dev                    # run web + api together
```

- Web: http://localhost:3000 (design system showcase at `/design`)
- API: http://localhost:3001/health (readiness probe at `/ready`)

## Data model

`apps/api/prisma/schema.prisma` is the authoritative persistence schema — 16
models covering the full product domain. Money is integer cents everywhere,
every member-owned row denormalizes `userId` (the single tenancy boundary),
and absent data is `null` on the wire, never `undefined`.

| Model                 | Purpose                                                        |
| --------------------- | -------------------------------------------------------------- |
| `User`                | Member identity (bcrypt password hash, soft-delete marker)     |
| `RefreshToken`        | Rotating refresh tokens, stored SHA-256-hashed, revocable      |
| `Consent`             | GDPR/CCPA consent ledger (terms, privacy, processing, email)   |
| `PlaidItem`           | One aggregator credential grant (encrypted token, sync cursor) |
| `ConnectedAccount`    | Linked bank accounts (aggregator item, balance, sync status)   |
| `Transaction`         | Immutable ledger entries (signed cents, + = outflow)           |
| `Merchant`            | Canonical merchant entity + aliases (admin-curated)            |
| `Subscription`        | Detected/manual recurring charges (confidence, price-change)   |
| `Bill`                | Recurring bills (due day, cadence, negotiable flag)            |
| `CancellationCase`    | Concierge cancellation workflow (timeline JSON)                |
| `NegotiationCase`     | Concierge negotiation (fee %, projected/confirmed savings)     |
| `SavingsEvent`        | Append-only reclaimed-money ledger                             |
| `Alert`               | System-generated insights (typed, severity, read state)        |
| `Notification`        | Delivery records (in-app / email / push)                       |
| `PremiumSubscription` | Choose-your-price membership state ($7–$14/mo)                 |
| `AuditLog`            | Append-only compliance trail (member/admin/system actors)      |
| `AdminUser`           | Staff accounts — separate auth realm from members              |

## API surface

`@reclaimr/shared` defines the wire contract: Zod schemas for every request
and response, and `contracts/` mapping each endpoint to its schemas. Both the
Fastify routes and the web client import the same package, so shapes cannot
drift. Routes live under `/api/v1` (see `API_ROUTES` for the full list):

| Domain          | Endpoints                                                                   |
| --------------- | --------------------------------------------------------------------------- |
| `auth`          | register · login · refresh · logout · me                                    |
| `users`         | profile get/update · data export · account deletion · consents              |
| `plaid`         | create-link-token · exchange-public-token                                   |
| `accounts`      | list · get · sync (balance + transaction pull) · unlink                     |
| `transactions`  | list (filter/search) · get · recategorize/annotate                          |
| `subscriptions` | CRUD · run detection                                                        |
| `bills`         | CRUD · upcoming-bills calendar projection                                   |
| `cancellations` | list · create · get · withdraw                                              |
| `negotiations`  | list · create (fee % 35–60) · get · withdraw                                |
| `savings`       | summary aggregate · event ledger · manual adjustments                       |
| `alerts`        | list · mark read · mark all read                                            |
| `notifications` | list · mark read · mark all read                                            |
| `premium`       | state · upgrade ($7–$14 choose-your-price) · cancel · resume                |
| `admin`         | staff auth · case queues/advance · member directory · merchants · audit log |

Admin routes mount under `/api/v1/admin` and authenticate against the separate
`AdminUser` realm. Case state machines (submitted → in_review → in_progress →
succeeded/failed/canceled) live in the shared `CaseStatus` enum with
append-only JSON timelines on each case.

## Account linking & transaction processing

The pipeline that powers "we find your subscriptions": link a bank through
Plaid, pull transactions incrementally, normalize merchants, detect
recurring charges, and generate alerts.

### Endpoints

| Endpoint                                   | What it does                                                                                                         |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| `POST /api/v1/plaid/create-link-token`     | Mints a short-lived Plaid Link token for the browser SDK                                                             |
| `POST /api/v1/plaid/exchange-public-token` | Exchanges the Link public token; creates the item + accounts and triggers the initial sync                           |
| `GET /api/v1/accounts`                     | Lists linked accounts with balances and sync status                                                                  |
| `POST /api/v1/accounts/:id/sync`           | Syncs balances + transactions for the account's item (`202` when queued on Redis, `200` with counts when run inline) |
| `GET /api/v1/transactions`                 | Filterable ledger listing (`accountId`, `category`, `from`/`to`, `search`, `direction`, `recurringOnly`, pagination) |

### Services (apps/api/src/modules)

- **PlaidLinkService** — Link handshake; access tokens are AES-256-GCM
  encrypted at rest (`PlaidItem.accessTokenEnc`) and never returned by any API.
- **TransactionSyncService** — cursor-based incremental pulls over Plaid
  `/transactions/sync`. Rows dedupe on `externalId`; the cursor is persisted
  after every applied page, so retries resume exactly where they stopped.
  Re-auth failures mark the item `requires_reauth` and raise a
  `bank_connection_error` alert.
- **MerchantNormalizationService** — maps noisy statement descriptions
  (`PLANET FITNESS #0242`) onto canonical `Merchant` rows, created lazily
  from the seed catalog in `@reclaimr/core`.
- **SubscriptionDetectionService** — runs the pure engine and reconciles its
  output with the `Subscription` table (idempotent per merchant); flags
  price increases (>8% level shift) and emits `new_subscription_detected` /
  `price_increase` alerts.
- **BillDetectionService** — same engine over bill categories (utilities,
  telecom, insurance, housing) with variable amounts tolerated; derives the
  due day and negotiability; keeps bills separate from subscriptions.
- **SavingsCalculationService** — subscription-spend projections
  ("$312/mo"), negotiation potential, and the confirmed `SavingsEvent`
  ledger summary that feeds the reclaimed counter.
- **AlertService** — low balance, large purchase, and upcoming-bill rules
  (pure predicates in `@reclaimr/core`), deduplicated by stable keys so
  frequent evaluation never spams members.

### Detection logic (`@reclaimr/core`, pure and unit-tested)

Group charges by normalized merchant → require ≥3 occurrences → match
interval regularity against cadence bands (weekly/biweekly/monthly/
quarterly/annual ± tolerance, jitter < 35%) → score amount stability →
combine into a confidence score → check the series is still active
(last charge within 1.5 cadences) → predict the next charge from the median
gap. `Date.now()` is never called inside core — time is injected, so tests
are byte-deterministic.

### Background jobs (BullMQ on Redis)

| Queue                     | Job                                                                           |
| ------------------------- | ----------------------------------------------------------------------------- |
| `plaid.sync`              | Incremental sync for one item → fans out detections                           |
| `detection.subscriptions` | Recompute detected subscriptions → queues alerts                              |
| `detection.bills`         | Recompute detected bills → queues alerts                                      |
| `alerts.evaluate`         | Evaluate alert rules for a member                                             |
| `maintenance`             | Daily 06:00 UTC fan-out: one sync per healthy item (deduped per item per day) |

Jobs retry with exponential backoff (5 attempts); each stage is independently
retriable. With `REDIS_URL` unset, `POST /accounts/:id/sync` and the initial
exchange sync run the whole chain inline — local dev works with zero
infrastructure beyond Postgres.

```bash
pnpm dev:worker        # run all queues (requires REDIS_URL)
WORKER_QUEUES=plaid.sync pnpm dev:worker   # scale one queue per replica
```

### Plaid: real or mock

Set `PLAID_CLIENT_ID` + `PLAID_SECRET` to use real Plaid (`PLAID_ENV=sandbox`
works with free developer keys). Without them, a **deterministic mock
adapter** is used: same access token + same clock → identical accounts and
~10 months of realistic history (8 subscriptions including a Netflix price
hike, 5 bills including a seasonal utility and quarterly insurance, biweekly
paychecks, noise, and a once-a-year decoy charge that must NOT be detected).
The mock makes the entire pipeline runnable — and testable in CI — with no
keys and no network.

Run a single app with `pnpm dev:web` or `pnpm dev:api`.

**Demo login** (after seeding): `demo@reclaimr.app` / `reclaimr-demo-2026`

```bash
# Try the API
curl -s -X POST localhost:3001/api/v1/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"demo@reclaimr.app","password":"reclaimr-demo-2026"}'

TOKEN=<accessToken from the response>
curl -s localhost:3001/api/v1/subscriptions -H "authorization: Bearer $TOKEN"
```

## Scripts

| Command             | What it does                                    |
| ------------------- | ----------------------------------------------- |
| `pnpm dev`          | Start web + api in watch mode (turbo, parallel) |
| `pnpm dev:worker`   | Start the BullMQ worker (requires `REDIS_URL`)  |
| `pnpm build`        | Build all packages (next build, prisma + tsup)  |
| `pnpm lint`         | ESLint across every package                     |
| `pnpm typecheck`    | `tsc --noEmit` across every package             |
| `pnpm test`         | Vitest across every package (no infra needed)   |
| `pnpm format`       | Prettier write                                  |
| `pnpm format:check` | Prettier check                                  |
| `pnpm clean`        | Remove build artifacts and node_modules         |
| `pnpm db:up`        | Start PostgreSQL + Redis (docker compose)       |
| `pnpm db:down`      | Stop them                                       |
| `pnpm db:migrate`   | Apply Prisma migrations (`migrate deploy`)      |
| `pnpm db:seed`      | Seed demo user and subscriptions                |
| `pnpm db:studio`    | Open Prisma Studio                              |

## Environment variables

See [.env.example](./.env.example). The API reads `.env` from the repo root;
Next.js requires its variables in `apps/web/.env.local` (notably
`NEXT_PUBLIC_API_URL`).

| Variable                         | App         | Description                                              |
| -------------------------------- | ----------- | -------------------------------------------------------- |
| `API_PORT`                       | api         | Listen port (default `3001`)                             |
| `CORS_ORIGIN`                    | api         | Comma-separated allowed origins (empty = all)            |
| `DATABASE_URL`                   | api, worker | PostgreSQL connection string                             |
| `REDIS_URL`                      | api, worker | Optional for api (inline fallback); required for worker  |
| `JWT_ACCESS_SECRET`              | api         | HS256 access-token secret (min 32 chars; rotate in prod) |
| `JWT_ACCESS_TTL_SECONDS`         | api         | Access token lifetime (default 900)                      |
| `REFRESH_TOKEN_TTL_DAYS`         | api         | Refresh token lifetime (default 30)                      |
| `PLAID_ENV`                      | api         | `sandbox` (default) · `development` · `production`       |
| `PLAID_CLIENT_ID`/`PLAID_SECRET` | api         | Set both for real Plaid; unset → deterministic mock      |
| `BANK_TOKEN_ENCRYPTION_KEY`      | api         | AES key for access tokens at rest (required in prod)     |
| `WORKER_QUEUES`                  | worker      | Comma-separated queues to consume (default `all`)        |
| `NEXT_PUBLIC_API_URL`            | web         | Base URL of the API                                      |

## Architecture notes

**Internal packages.** `packages/*` have no build step — they export
TypeScript source directly. `apps/web` compiles them via Next.js
`transpilePackages`, and `apps/api` bundles them with tsup
(`noExternal` in `tsup.config.ts`). This removes build orchestration from the
hot path; convert a package to a built package later by adding a build script
and pointing `exports` at `dist`.

**Pure domain layer.** `@reclaimr/core` contains the detection engine,
cadence math, money calculations, and alert rules as pure functions — no I/O,
no Prisma, no Redis, no `Date.now()` (time is injected). This is what makes
the detection precision target measurable in CI instead of aspirational.
The same services power both the HTTP API and the `apps/worker` jobs (the
worker imports them from `@reclaimr/api/services`), so background and
inline execution can never drift apart.

**Shared contracts.** `@reclaimr/shared` is the single source of truth for
API shapes: Zod schemas define requests/responses, `contracts/` maps each
endpoint to its schemas, and both the Fastify routes and the web client import
from the same package. The API validates every request body/query against the
schemas and returns errors shaped as `ApiErrorResponse`.

**Strict TypeScript everywhere.** `tsconfig.base.json` extends `strict` with
`noUncheckedIndexedAccess`, `noUnusedLocals`, `noUnusedParameters`,
`noImplicitOverride`, `noFallthroughCasesInSwitch`, and
`verbatimModuleSyntax`; every package extends the base config.

**Auth.** JWT access tokens (HS256, 15 min) guard member routes via the
`requireAuth` preHandler. Refresh tokens are opaque 256-bit secrets, stored
hashed (SHA-256), rotated on every use, and revoked on logout. Passwords are
bcrypt-hashed (12 rounds). Credential endpoints carry a 10 req/min rate
limit on top of the global 300 req/min limiter (Redis-backed when
`REDIS_URL` is set). Money is integer cents end to end.

**Monochrome design system.** `@reclaimr/ui` ships Tailwind-based components
driven by grayscale tokens (`--background`, `--foreground`, `--muted`, …)
mapped to utilities via `@theme inline` (`bg-background`, `text-foreground`,
`font-heading`, …). Themes are a `.dark` class on `<html>` — set before first
paint by an inline script and toggled by `ThemeProvider` (light / dark /
system). Typography: **Inter** for body, **Space Grotesk** for headings,
**JetBrains Mono** for numbers and financial amounts. State is communicated
via contrast, borders, weight, and labels — never color. The full component
set (Button, Input, Field, Card, Badge, Table, Modal, Toast, EmptyState,
Skeleton, Spinner, ThemeToggle) is documented live at `/design`.

**Prisma.** The schema lives in `apps/api/prisma` with a checked-in initial
migration; `pnpm db:migrate` applies it. During development prefer
`pnpm --filter @reclaimr/api db:dev` (creates migrations from schema edits).

## Adding a package

1. `mkdir -p apps/<name>` (or `packages/<name>`) with a `package.json` named
   `@reclaimr/<name>` and a `tsconfig.json` extending `../../tsconfig.base.json`.
2. Reference it in consumers with `"@reclaimr/<name>": "workspace:*"`.
3. Add the standard `lint` / `typecheck` / (if it builds) `build` scripts so
   Turbo picks them up automatically.

## Legacy code

`legacy/` contains the pre-monorepo prototype (an Express server and the
`@reclaimr/types` package). It is excluded from the workspace, ESLint,
Prettier, and Turbo; its domain types are good source material for migrating
into `@reclaimr/shared` over time.
