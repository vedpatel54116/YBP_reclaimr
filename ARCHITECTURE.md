# ReclaimR — Technical Architecture

**Status:** Approved architecture baseline
**Supersedes:** `PLAN.md` §2.2 (React+Vite / Express / JSON-file store / demo token auth). That
stack was chosen for a zero-dependency local demo and is no longer the target.
**Authoritative product spec:** `PRODUCT.md` (stack-agnostic; features F1–F11, journeys J1–J8,
roles §7, API modules M1–M15, compliance §13 are all referenced by ID below).
**Authoritative domain contract:** `legacy/types/src/*.ts` — 9 modules of strict TypeScript
domain types and enums. These are promoted to `packages/types` and become the single source of
truth for wire format, Prisma schema, and client types. See Appendix B for the port.

---

## 0. Decisions and assumptions

### 0.1 Locked decisions

| #   | Decision                                                                                                                                              | Rationale                                                                                                                                                                                                                                                                                                                                                      |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | **pnpm + Turborepo monorepo.** `apps/*` + `packages/*`                                                                                                | Already scaffolded (`pnpm-workspace.yaml`, `turbo.json`). One atomic commit changes a Prisma model, the API contract, and the UI together — no version-skew window.                                                                                                                                                                                            |
| D2  | **Keep `packages/types` as the hand-written contract.** Port `legacy/types` forward; do not generate domain types from Prisma.                        | The legacy types encode business rules Prisma cannot express: "amounts are integer cents", "absent data is `null`, never `undefined`", "detections surface at confidence ≥ 0.97", "accessMode is always `read-only`". Prisma output is a _persistence_ shape; `packages/types` is the _domain_ shape. A mapping layer between them is a feature, not overhead. |
| D3  | **Port `legacy/server/src/lib/detect.js` into `packages/core`** as typed, pure, unit-tested functions.                                                | It is the signature feature (F3) and the highest-value existing asset. See Appendix B.2 for the required corrections (dollars→cents, cadence enum casing, category exclusion by merchant table rather than string set).                                                                                                                                        |
| D4  | **BFF pattern.** The browser never talks to Fastify. Next.js Route Handlers and Server Components proxy to the API over the private network.          | JWTs live only in `httpOnly; Secure; SameSize=Strict` cookies, unreachable from JS. XSS cannot exfiltrate a session. Removes CORS from the production path entirely. Cost: one extra intra-VPC hop (~1–3 ms).                                                                                                                                                  |
| D5  | **Fastify API is stateless.** All session, queue, cache, and lock state in Postgres or Redis.                                                         | Horizontal scale and zero-downtime rolling deploys.                                                                                                                                                                                                                                                                                                            |
| D6  | **Separate `apps/admin` deployment** for staff (concierge agents, finance ops, admins).                                                               | Different threat model, different auth realm (mandatory MFA, IP allowlist), different blast radius. A staff XSS must not be reachable from the member app's origin.                                                                                                                                                                                            |
| D7  | **Worker is its own deployable** (`apps/worker`), never in-process with the API.                                                                      | A slow Plaid sync or a detection run over 12 months of transactions must not consume an API request thread or block the event loop. Independent autoscaling on queue depth.                                                                                                                                                                                    |
| D8  | **Integer cents everywhere.** `Int` in Postgres, `number` in TS, never `Float`/`Decimal` in application code.                                         | Inherited from `legacy/types/src/common.ts`. Removes an entire class of money bugs. Prisma `Decimal` is used only where a ratio is stored (`feePercent`).                                                                                                                                                                                                      |
| D9  | **All external side effects are idempotent**, keyed on a persisted idempotency key.                                                                   | Queues retry. Webhooks redeliver. Charging a negotiation success fee twice is an unrecoverable trust failure (`PRODUCT.md` §4 trust principle 2).                                                                                                                                                                                                              |
| D10 | **Money movement is delegated, never held.** Smart-Save (F10) ships the affordability engine, scheduler, and ledger behind a `TransferProvider` port. | `PRODUCT.md` §13 — holding or transmitting user funds requires licensing. v1 implements `SandboxTransferProvider` only (records intent, moves nothing); a chartered partner-bank adapter lands in V2 with the Reg E program.                                                                                                                                   |

### 0.2 Assumptions

- **US-only, USD-only, single-currency** in v1 (`Currency = 'USD'` in the type contract).
- **One user per account.** No household/multi-tenant sharing until V2-8; `userId` is therefore
  the sole tenancy boundary and every query is scoped by it.
- **Web-first.** Next.js serves both mobile web and desktop. Native apps are out of scope, but the
  Fastify API is the only backend, so a future native client is additive (it would use the bearer
  path described in §7.3, not the BFF cookie path).
- **Deployment target is containers**, orchestrator-agnostic (ECS Fargate / Fly.io / Kubernetes).
  Nothing in the design depends on a serverless-specific primitive; §8.1 explains why (BullMQ
  workers are long-lived processes and Prisma+PgBouncer wants stable connections).
- **Plaid `/transactions/sync`** is the aggregation primitive, not the deprecated
  `/transactions/get`. This is load-bearing: the cursor model is what makes sync idempotent (§4).

---

## 1. High-level architecture

### 1.1 System context

```
                                    ┌──────────────────────┐
                                    │      Members         │
                                    │  (browser: mobile,   │
                                    │   tablet, desktop)   │
                                    └──────────┬───────────┘
                                               │ HTTPS
                                    ┌──────────▼───────────┐
                                    │  Cloudflare (WAF,    │
                                    │  TLS, CDN, bot mgmt) │
                                    └──────────┬───────────┘
                    ┌──────────────────────────┴────────────────────────┐
                    │                                                   │
      ┌─────────────▼─────────────┐                       ┌─────────────▼─────────────┐
      │   apps/web  (Next.js)     │                       │  apps/admin  (Next.js)    │
      │   PUBLIC — members        │                       │  PRIVATE — staff only     │
      │                           │                       │  IP allowlist + SSO + MFA │
      │  • App Router / RSC       │                       │                           │
      │  • Route Handlers = BFF   │                       │  • Case queues            │
      │  • httpOnly cookie session│                       │  • Merchant rules         │
      │  • Monochrome design sys  │                       │  • Audit log viewer       │
      └─────────────┬─────────────┘                       └─────────────┬─────────────┘
                    │  server-to-server, private network                │
                    │  Authorization: Bearer <access JWT>               │
                    └──────────────────┬────────────────────────────────┘
                                       │
                    ┌──────────────────▼──────────────────┐
                    │        apps/api  (Fastify)          │
                    │        STATELESS — N replicas        │
                    │                                     │
                    │  Plugins: auth · rbac · zod schemas  │
                    │  · rate limit · idempotency · audit  │
                    │  · request ctx · error mapper        │
                    │                                     │
                    │  Modules M1–M15 (§3.1)               │
                    │  ── never runs long work inline ──   │
                    └──┬─────────┬──────────┬─────────┬────┘
                       │         │          │         │
         enqueue ──────┘         │          │         └────── webhooks in
                       │         │          │                 (Plaid, Stripe)
      ┌────────────────▼───┐  ┌──▼───────┐  ┌▼──────────────────────────┐
      │   Redis            │  │ Postgres │  │  packages/core            │
      │  • BullMQ queues   │  │  16      │  │  pure domain logic:       │
      │  • cache (tagged)  │  │          │  │  • detection engine       │
      │  • rate limiters   │  │ PgBouncer│  │  • case state machines    │
      │  • distributed locks│ │ (txn pool)│ │  • fee / savings math     │
      │  • idempotency keys│  │          │  │  • affordability scoring  │
      └────────────────▲───┘  └──▲───────┘  └───────────────────────────┘
                       │         │
                    ┌──┴─────────┴────────────────────────┐
                    │      apps/worker  (BullMQ)          │
                    │      M autoscaled replicas           │
                    │                                     │
                    │  plaid.sync · detection.run          │
                    │  alerts.evaluate · notify.dispatch   │
                    │  billing.reconcile · concierge.sla   │
                    │  savings.autopilot · maintenance     │
                    └──┬──────────────────────────────┬────┘
                       │                              │
        ┌──────────────▼──────────┐      ┌────────────▼─────────────┐
        │  Plaid                  │      │  Stripe                  │
        │  Link · /transactions   │      │  Subscriptions ($7–14)   │
        │  /sync · /accounts      │      │  one-time success fees   │
        │  /institutions · webhooks│     │  Checkout · webhooks     │
        └─────────────────────────┘      └──────────────────────────┘

        ┌─────────────────────────┐      ┌──────────────────────────┐
        │  Resend (email)         │      │  AWS KMS (envelope keys) │
        │  FCM/APNs (push)        │      │  AWS S3 (case documents) │
        │  Sentry · OTel · PostHog│      │  Secrets Manager         │
        └─────────────────────────┘      └──────────────────────────┘
```

### 1.2 Layered view (per deployable)

```
apps/web  ── presentation ──────────────────────────────────────────────
  Server Components (data fetch)  │  Client Components (interaction)
  Route Handlers (BFF: cookie → bearer, proxy, revalidate)
  ────────────────────────────────────────────────────────────────────
                              │ packages/api-client (typed fetch)
                              │ packages/types     (shared contract)
apps/api  ── interface ─────────▼───────────────────────────────────────
  route  → zod schema validation → auth/rbac guard → controller
  ────────────────────────────────────────────────────────────────────
  ── application ──
  service  (orchestration, transactions, authorization, enqueue, audit)
  ────────────────────────────────────────────────────────────────────
  ── domain ──  packages/core
  pure functions + state machines. No I/O, no Prisma, no clock, no random.
  Deterministic ⇒ exhaustively unit-testable.
  ────────────────────────────────────────────────────────────────────
  ── infrastructure ──  packages/db · adapters
  Prisma repositories · Plaid adapter · Stripe adapter · mailer · push
  · object store · crypto/KMS · queue producer
```

The domain layer is the important boundary. `packages/core` cannot import Prisma, Plaid, Redis, or
`Date.now()`. Time and randomness are injected. That is what makes the detection engine and the fee
math testable against fixtures instead of a live database.

### 1.3 Request path — member reads their subscriptions (J1/J2)

```
browser  GET /subscriptions
   │
   ▼
apps/web  Server Component  ──►  getSession()  reads httpOnly cookie
   │                              │
   │                              └─► access JWT valid?  no ─► refresh via BFF
   ▼                                                            (rotate, re-set cookie)
apps/web  packages/api-client  GET {API_URL}/v1/subscriptions
   │      Authorization: Bearer <access JWT>
   │      x-request-id: <propagated>
   ▼
apps/api  fastify
   │  1. requestContext plugin   → requestId, traceId, logger child
   │  2. auth plugin             → verify RS256 sig, exp, aud, iss, jti not revoked
   │  3. rbac plugin             → route requires role:member
   │  4. schema plugin           → validate query (zod → JSON Schema, compiled)
   │  5. handler                 → SubscriptionService.list({ userId, filters })
   │        └─ cache: GET sub:list:{userId}:{filterHash}   (Redis, 60 s, tagged)
   │        └─ miss → prisma.subscription.findMany({ where: { userId, ... } })
   │        └─ map persistence row → packages/types Subscription  (cents, ISO strings)
   │  6. serializer              → response schema (fast-json-stringify)
   ▼
apps/web  render RSC → stream HTML to browser
```

Note step 5's cache key is always prefixed by `userId`. Every cache key, queue job id, and lock
name in this system is tenant-scoped; there is no shared-key surface where one user's data can be
served to another.

---

## 2. Folder structure

### 2.1 Repository root

```
reclaimr/
├── apps/
│   ├── web/                     Next.js 15 — member app (public)
│   ├── admin/                   Next.js 15 — staff console (private)
│   ├── api/                     Fastify 5 — HTTP API
│   └── worker/                  BullMQ workers + schedulers
├── packages/
│   ├── types/                   Domain contract (ported from legacy/types)
│   ├── core/                    Pure domain logic (detection, cases, money math)
│   ├── db/                      Prisma schema, client, migrations, repositories, seed
│   ├── config/                  Zod-validated env loading, per-app schemas
│   ├── api-client/              Typed client generated from api route contracts
│   ├── ui/                      Monochrome design system (shared web + admin)
│   ├── queue/                   Queue names, payload schemas, producer, connection
│   ├── observability/           Logger, OTel setup, Sentry init, PII redaction
│   └── testing/                 Fixtures, factories, testcontainers harness
├── legacy/                      Frozen prototype. Reference only, never imported.
│   ├── types/                   → being ported to packages/types
│   └── server/                  → detect.js + concierge.js being ported to packages/core
├── infra/
│   ├── docker/                  Dockerfile per app + docker-compose.yml (local)
│   ├── terraform/               VPC, RDS, ElastiCache, ECS, KMS, S3, WAF
│   └── scripts/                 db-reset, seed-demo, rotate-keys, backfill runners
├── docs/
│   └── adr/                     One file per architectural decision (D1–D10 above)
├── PRODUCT.md                   Product spec (authoritative)
├── PLAN.md                      Historical; §2.2 superseded by this document
├── ARCHITECTURE.md              This file
├── context.md                   Design system + coding rules
├── pnpm-workspace.yaml · turbo.json · tsconfig.base.json
├── eslint.config.mjs · .prettierrc · .env.example
```

### 2.2 `apps/web` — Next.js member app

```
apps/web/
├── src/
│   ├── app/
│   │   ├── (marketing)/                     Unauthenticated shell
│   │   │   ├── page.tsx                     Landing
│   │   │   └── layout.tsx
│   │   ├── (auth)/                          S2
│   │   │   ├── login/page.tsx
│   │   │   ├── signup/page.tsx
│   │   │   ├── verify-email/page.tsx
│   │   │   └── forgot-password/page.tsx
│   │   ├── (onboarding)/
│   │   │   ├── welcome/page.tsx              S1 — value + permission scoping
│   │   │   └── link/page.tsx                 S3 — Plaid Link handoff
│   │   ├── (app)/                            Authenticated shell
│   │   │   ├── layout.tsx                    Nav, theme toggle, session guard
│   │   │   ├── page.tsx                      S4  Dashboard (M13 /overview)
│   │   │   ├── accounts/
│   │   │   │   ├── page.tsx                  S5
│   │   │   │   └── loading.tsx
│   │   │   ├── transactions/page.tsx         S6
│   │   │   ├── budgets/page.tsx              S7
│   │   │   ├── subscriptions/
│   │   │   │   ├── page.tsx                  S8  detected list
│   │   │   │   └── [id]/page.tsx             S9  detail + cancel flow
│   │   │   ├── bills/
│   │   │   │   ├── page.tsx                  S10
│   │   │   │   └── [id]/negotiate/page.tsx   S11 fee slider 35–60 %
│   │   │   ├── requests/[id]/page.tsx        S12 case timeline (shared)
│   │   │   ├── goals/page.tsx                S13 premium
│   │   │   ├── alerts/page.tsx               S14
│   │   │   ├── premium/page.tsx              S15 choose-your-price
│   │   │   └── settings/
│   │   │       ├── page.tsx                  S16 profile
│   │   │       ├── notifications/page.tsx
│   │   │       ├── institutions/page.tsx
│   │   │       ├── security/page.tsx
│   │   │       └── privacy/page.tsx          export / delete (CCPA, GDPR)
│   │   ├── api/                              ── BFF ONLY ──
│   │   │   ├── auth/
│   │   │   │   ├── login/route.ts            sets httpOnly cookies
│   │   │   │   ├── logout/route.ts           revokes session, clears cookies
│   │   │   │   ├── refresh/route.ts          rotating refresh
│   │   │   │   └── session/route.ts
│   │   │   ├── plaid/
│   │   │   │   ├── link-token/route.ts       proxies M2
│   │   │   │   └── exchange/route.ts         public_token → server
│   │   │   ├── stripe/checkout/route.ts      creates Checkout Session
│   │   │   └── [...proxy]/route.ts           generic authenticated passthrough
│   │   ├── error.tsx · not-found.tsx · global-error.tsx
│   │   └── layout.tsx                        Theme provider, font loading
│   ├── components/
│   │   ├── dashboard/                        WasteHeroCard, CashFlowBar,
│   │   │                                     UpcomingBillsTimeline, ReclaimedCounter
│   │   ├── subscriptions/                    SubscriptionRow, ConfidenceMeter,
│   │   │                                     PriceChangeDiff, CancelDialog
│   │   ├── bills/                            FeePercentSlider, SavingsProjection
│   │   ├── cases/                            CaseTimeline, CaseStatusBadge
│   │   ├── premium/                          PriceSlider, FeatureComparisonTable,
│   │   │                                     PremiumGate
│   │   ├── plaid/                            PlaidLinkButton (loads Link SDK)
│   │   └── states/                           EmptyState, ErrorState, Skeleton*
│   ├── lib/
│   │   ├── session.ts                        cookie seal/unseal (iron-session style)
│   │   ├── server-api.ts                     server-only fetch w/ bearer injection
│   │   ├── format.ts                         cents → display, cadence → label
│   │   └── flags.ts                          feature flag reads
│   ├── hooks/                                useSubscriptions, useCasePolling, useTheme
│   └── styles/globals.css                    Design tokens (light/dark, monochrome)
├── next.config.ts · tailwind.config.ts · .env.local.example
```

`app/api/` contains **only** BFF routes. No business logic lives in Next.js — every rule is in
Fastify so that a future native client inherits identical behaviour.

### 2.3 `apps/api` — Fastify

```
apps/api/
├── src/
│   ├── server.ts                  buildServer(): plugin registration only
│   ├── index.ts                   listen, graceful shutdown (SIGTERM drain)
│   ├── plugins/
│   │   ├── request-context.ts      requestId, traceId, child logger, AsyncLocalStorage
│   │   ├── auth.ts                 JWT verify (RS256/JWKS), attach req.user
│   │   ├── rbac.ts                 requireRole(), requireTier(), requireOwnership()
│   │   ├── validation.ts           zod → JSON Schema compile, strict unknown-key reject
│   │   ├── rate-limit.ts           Redis sliding window, per-route + per-identity
│   │   ├── idempotency.ts          Idempotency-Key capture/replay (§7.6)
│   │   ├── audit.ts                emits AuditLog rows for AuditAction routes
│   │   ├── prisma.ts               client lifecycle
│   │   ├── redis.ts                ioredis lifecycle
│   │   ├── queue.ts                BullMQ producer (never a worker here)
│   │   ├── error-handler.ts        AppError → RFC 9457 problem+json
│   │   ├── security-headers.ts     helmet, CSP, HSTS
│   │   └── health.ts               /healthz liveness, /readyz dependency probe
│   ├── modules/                    one folder per PRODUCT.md API module
│   │   ├── auth/                   M1   routes · service · schemas · tokens · password
│   │   ├── accounts/               M2   routes · service · plaid-link.service
│   │   ├── transactions/           M3
│   │   ├── detection/              M4   trigger endpoints; algorithm lives in core
│   │   ├── subscriptions/          M5
│   │   ├── cancellations/          M6
│   │   ├── bills/                  M7
│   │   ├── negotiations/           M8
│   │   ├── goals/                  M9   savings + autopilot
│   │   ├── budgets/                M10
│   │   ├── notifications/          M11  alerts, prefs, device tokens
│   │   ├── billing/                M12  premium, Stripe Checkout, fee charges
│   │   ├── overview/               M13  dashboard aggregate (single call)
│   │   ├── admin/                  M14  staff-only; mounted under /v1/admin
│   │   ├── events/                 M15  client telemetry ingest
│   │   ├── webhooks/
│   │   │   ├── plaid.route.ts       JWT-verified (§7.5)
│   │   │   └── stripe.route.ts      signature-verified, raw body preserved
│   │   └── health/
│   ├── adapters/                   infrastructure, one interface per vendor
│   │   ├── plaid/                  client · mappers · error taxonomy · MockPlaidAdapter
│   │   ├── stripe/                 client · price-catalog · fee-charger
│   │   ├── mailer/                 ResendMailer · ConsoleMailer(dev)
│   │   ├── push/                   FcmPush · ApnsPush · NoopPush
│   │   ├── storage/                S3Storage (presigned, private only)
│   │   ├── crypto/                 KmsEnvelopeCipher · LocalDevCipher
│   │   └── transfers/              TransferProvider port + SandboxTransferProvider (D10)
│   └── lib/                        errors.ts · pagination.ts · mappers/
└── test/
    ├── unit/ · integration/ (testcontainers: pg + redis) · contract/ (schema snapshots)
```

Each `modules/<m>/` folder is self-contained: `routes.ts` (HTTP), `service.ts` (orchestration),
`schemas.ts` (zod in/out), `mapper.ts` (Prisma row → `packages/types`). A module may call another
module's _service_, never its routes or its Prisma models directly.

### 2.4 `apps/worker` and `apps/admin`

```
apps/worker/
├── src/
│   ├── index.ts                    boots selected queues via WORKER_QUEUES env
│   ├── processors/
│   │   ├── plaid-sync.processor.ts        cursor-based incremental sync
│   │   ├── plaid-backfill.processor.ts    initial 12-month historical pull
│   │   ├── detection.processor.ts         calls packages/core detection engine
│   │   ├── alerts-evaluate.processor.ts   AlertType rules → Alert rows
│   │   ├── notify-dispatch.processor.ts   Alert → email/push/in-app fan-out
│   │   ├── notify-digest.processor.ts     J8 weekly habit-loop digest
│   │   ├── billing-reconcile.processor.ts Stripe drift repair
│   │   ├── fee-charge.processor.ts        negotiation success fee (idempotent)
│   │   ├── concierge-sla.processor.ts     stale-case escalation
│   │   ├── autopilot.processor.ts         affordability scoring + transfer intent
│   │   ├── item-health.processor.ts       REQUIRES_REAUTH detection + nudges
│   │   └── retention.processor.ts         GDPR/CCPA deletion, doc retention
│   ├── schedulers/repeatable.ts     registers cron-like repeatable jobs (§5.4)
│   └── lib/job-context.ts           per-job logger, tracing, lock helpers
└── test/

apps/admin/
├── src/app/
│   ├── (auth)/login/               SSO + mandatory TOTP
│   └── (console)/
│       ├── queue/                  cancellation + negotiation work queues
│       ├── cases/[id]/             timeline editor, notes, documents, outcome
│       ├── members/[id]/           masked member view (no raw tokens, ever)
│       ├── merchants/              canonical merchant + alias rules (Finance Ops)
│       ├── fees/                   fee bounds config (dual-control approval)
│       ├── flags/                  feature flags
│       ├── alerts/templates/       alert copy templates
│       └── audit/                  append-only audit log search
```

`apps/worker` is one image; `WORKER_QUEUES` selects which queues a replica consumes. That lets a
latency-sensitive queue (`notify.dispatch`) scale independently of a throughput-heavy one
(`plaid.sync`) without maintaining separate images.

### 2.5 `packages/core` — the domain

```
packages/core/src/
├── detection/
│   ├── normalize-merchant.ts       raw description → canonical key
│   ├── cadence-bands.ts            7 / 14 / 30.4 / 91.3 / 365 d ± tolerance
│   ├── group-charges.ts            merchant + amount-bucket grouping
│   ├── score.ts                    regularity, stability, confidence
│   ├── predict-next-charge.ts
│   ├── price-change.ts             same-merchant level shift (> 8 %)
│   ├── trial-detection.ts          $0 / promo → paid pattern (F5, J5)
│   ├── classify.ts                 subscription vs bill (uses Merchant table)
│   └── detect.ts                   orchestrates the above; pure function
├── cases/
│   ├── case-state-machine.ts       CaseStatus transition table + guards
│   ├── cancellation.ts
│   ├── negotiation.ts
│   └── simulated-driver.ts         demo-only auto-advance (ported concierge.js)
├── money/
│   ├── cents.ts                    add, prorate, percent-of, round-half-up
│   ├── monthly-equivalent.ts       cadence → normalized monthly cents
│   ├── success-fee.ts              feePercent × confirmed savings (D9, never projected)
│   └── savings-ledger.ts           SavingsEvent aggregation → "reclaimed" counter
├── savings/
│   ├── cash-flow-forecast.ts       balance + upcoming bills + income rhythm
│   └── affordability.ts            transfer sizing $5–50 + overdraft guard
├── alerts/rules.ts                 one pure predicate per AlertType
└── budgets/rollup.ts               budget vs actual
```

Every file here is a pure function or a state machine. `Date` and `Math.random` are injected as
`{ now, rng }`, so a detection run over a fixture produces byte-identical output on every machine.
This is what makes the precision target in `PRODUCT.md` §10 ("≥ 97 % before surfacing") measurable
in CI rather than aspirational.

<!-- SECTION-MARKER -->
