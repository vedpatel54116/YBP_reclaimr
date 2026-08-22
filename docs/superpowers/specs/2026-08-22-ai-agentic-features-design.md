# ReclaimR — AI / Agentic Features Design

**Status:** Approved design baseline
**Date:** 2026-08-22
**Builds on:** `ARCHITECTURE.md` (decisions D1–D10), `PRODUCT.md`, existing banking/detection pipeline
**Approach:** A — AI module inside the existing API + worker (no new deployables), with chat streaming via a Fastify SSE endpoint.

---

## 1. Scope

Six agentic features, all sharing one AI platform foundation:

| # | Feature | Access | Trigger |
|---|---------|--------|---------|
| 1 | **Alternative advisor** — cheaper/better alternatives per detected subscription, with estimated monthly savings | Free | Background job after detection |
| 2 | **Smart alert reasoning** — agent-written explanation + recommended action on price-increase / new-subscription alerts | Free | Background job after alert creation |
| 3 | **Savings insights digest** — periodic agent digest: trends, price increases, unused subscriptions, reclaimable total | Premium | Weekly repeatable job |
| 4 | **Cancellation assistant** — cancellation steps, deadline before next charge, draft cancellation message | Premium | On-demand from subscription detail |
| 5 | **Negotiation coach** — talking points + draft message with target price for negotiable bills | Premium | On-demand from bill detail |
| 6 | **Chat assistant** — conversational Q&A over the member's own financial data, streamed | Premium | On-demand, SSE |

Premium gating uses the existing `PremiumSubscription` model: status in (`trialing`, `active`) unlocks premium features; free members see upgrade prompts (existing `UpgradeButton` / pricing page).

**Out of scope (v1):** live web-search pricing, free-form LLM tool calling, admin CRUD for the alternatives catalog (seeded via Prisma seed), email delivery of digests, multi-language output.

## 2. Key decisions

| # | Decision | Rationale |
|---|----------|-----------|
| A1 | **Provider-agnostic LLM adapter + deterministic mock**, mirroring the Plaid adapter pattern (`apps/api/src/adapters/plaid/`). | No vendor lock-in; mock keeps dev/tests deterministic and offline, exactly like `MockPlaidAdapter`. |
| A2 | **Curated alternatives catalog in the DB + LLM personalization.** Prices come from the catalog (source of truth); the LLM ranks and explains using the member's actual data. | Reproducible, testable, no hallucinated prices. Catalog is ops-maintained like `Merchant`. |
| A3 | **Batch features run as BullMQ jobs in `apps/worker`; chat streams on demand.** Results cached in `AiSuggestion`; UI reads the cache. | Reuses the existing queue/retry/scaling pattern (D7); no LLM latency on page loads. |
| A4 | **Chat context is assembled by fixed server-side "context loaders", not free-form tool calling.** | Deterministic, safe, testable; the LLM never chooses what data to fetch. |
| A5 | **PII guard:** account numbers/masks, raw transaction external IDs, and email addresses are never included in LLM prompts. | Minimize data sent to third parties. |
| A6 | **Freemium split** as in the scope table. | Signature feature (advisor) drives engagement; deep features monetize via existing premium flow. |

## 3. Platform foundation

### 3.1 LLM adapter — `apps/api/src/adapters/llm/`

Twin of the Plaid adapter structure:

- `types.ts` — `LlmAdapter` interface:
  - `complete(input: LlmCompletionInput): Promise<LlmCompletionResult>` for batch features. Input: `{ system: string; user: string; temperature?: number; maxTokens?: number; jsonMode?: boolean }`. Result: `{ content: string; model: string; usage?: { promptTokens: number; completionTokens: number } }`.
  - `stream(input: LlmCompletionInput): AsyncIterable<string>` for chat (token chunks).
- `openai-adapter.ts` — plain HTTP (`fetch`) against any OpenAI-compatible chat-completions endpoint. Configured by env: `LLM_BASE_URL` (default `https://api.openai.com/v1`), `LLM_API_KEY`, `LLM_MODEL` (default `gpt-4o-mini`), `LLM_TIMEOUT_MS` (default 30000). Works with OpenAI, OpenRouter, or local servers.
- `mock-adapter.ts` — deterministic fixture responses keyed by a feature marker in the system prompt; `stream` yields the fixture in fixed chunks. Used automatically when `LLM_API_KEY` is unset (same fail-soft selection as `createPlaidAdapter`).
- `index.ts` — `createLlmAdapter(config): LlmAdapter` factory + `llmEnabled(config)` predicate.

Errors surface as `LlmAdapterError` (extends `Error`, carries `statusCode?`); services treat it as retriable.

### 3.2 Prompt layer — `apps/api/src/modules/ai/prompts/`

One pure function per feature (e.g. `alternativeAdvisorPrompt(subscription, alternatives, merchantFacts): { system, user }`). No I/O, no `Date.now()` — all context passed in, following `packages/core` discipline. Unit-tested directly.

### 3.3 Storage — new Prisma models

Follow existing schema conventions: integer cents, UUID ids, `userId` denormalized on every member-owned row, `@@map` snake_case tables, doc comments on business rules.

```prisma
enum AiSuggestionKind {
  alternative_advice
  alert_reasoning
  digest
  cancellation_plan
  negotiation_script
}

/// Curated catalog of cheaper/better alternatives per service category.
/// Global, ops-maintained (like Merchant); seeded in v1, no admin CRUD.
model AlternativeOption {
  id              String   @id @default(uuid()) @db.Uuid
  category        String   // e.g. "streaming", "music", "fitness"
  name            String
  monthlyPriceCents Int
  highlights      String[] @default([])
  tradeoffs       String[] @default([])
  /// Matching keys: normalized merchant keys this option replaces (e.g. "netflix").
  replaces        String[] @default([])
  isActive        Boolean  @default(true)
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  @@index([category, isActive])
  @@map("alternative_options")
}

/// Cached generated AI artifact. One row per (kind, subject); regenerated by
/// upsert. Last good content survives regeneration failures.
model AiSuggestion {
  id         String           @id @default(uuid()) @db.Uuid
  userId     String           @db.Uuid
  user       User             @relation(fields: [userId], references: [id], onDelete: Cascade)
  kind       AiSuggestionKind
  /// Polymorphic subject: ("subscription", id) | ("alert", id) | ("bill", id) | ("user", userId).
  subjectType String
  subjectId  String           @db.Uuid
  /// Feature-specific structured payload (digest bullets, alternatives list, plan steps...).
  content    Json
  /// Raw LLM prose where the feature produces it (rationale, draft message).
  summary    String?
  model      String
  createdAt  DateTime         @default(now())
  updatedAt  DateTime         @updatedAt

  @@unique([kind, subjectId])
  @@index([userId, kind])
  @@map("ai_suggestions")
}

model ChatThread {
  id        String        @id @default(uuid()) @db.Uuid
  userId    String        @db.Uuid
  user      User          @relation(fields: [userId], references: [id], onDelete: Cascade)
  title     String?
  createdAt DateTime      @default(now())
  updatedAt DateTime      @updatedAt

  messages ChatMessage[]

  @@index([userId, updatedAt(sort: Desc)])
  @@map("chat_threads")
}

model ChatMessage {
  id        String     @id @default(uuid()) @db.Uuid
  threadId  String     @db.Uuid
  thread    ChatThread @relation(fields: [threadId], references: [id], onDelete: Cascade)
  role      String     // "user" | "assistant"
  content   String
  createdAt DateTime   @default(now())

  @@index([threadId, createdAt])
  @@map("chat_messages")
}
```

`User` gains the three relations (`aiSuggestions`, `chatThreads`). Migration: one new migration `ai_features`.

### 3.4 Queue — `packages/queue`

New queue in `QUEUE_NAMES`:

```ts
/** Generate/refresh a cached AI suggestion for a member. */
aiGenerate: "ai.generate",
```

Job payload schema (Zod, in `jobs.ts`): `{ userId: string; kind: AiSuggestionKind; subjectId: string }`. Concurrency 2; existing `DEFAULT_JOB_OPTIONS` (5 attempts, exponential backoff).

### 3.5 Composition — `apps/api/src/services/ai.ts`

```ts
export interface AiServices {
  advisor: AlternativeAdvisorService;
  alertReasoning: AlertReasoningService;
  digest: DigestService;
  cancellation: CancellationAssistantService;
  negotiation: NegotiationCoachService;
  chat: ChatService;
}

export function createAiServices(prisma, config, options: { queue?: JobProducer | null; adapter?: LlmAdapter }): AiServices
```

Exported from the `apps/api/src/services.ts` barrel so `apps/worker` builds the same graph (identical pattern to `createBankingServices`). When `queue` is null and a generation is triggered inline (local dev without Redis), the same service method runs synchronously — mirroring `SyncPipeline`'s inline mode.

### 3.6 Worker wiring — `apps/worker`

- New processor `processors/ai-generate.processor.ts` dispatching on `kind` to the matching service.
- `SyncPipeline` (apps/api): after detection/alerts stages, enqueue `ai.generate` jobs for newly detected/changed subscriptions and for newly created `price_increase` / `new_subscription_detected` alerts — only when `llmEnabled(config)`.
- Weekly digest repeatable job registered alongside the existing maintenance cron: pattern `0 7 * * 1` (Mon 07:00 UTC) on the `maintenance` queue → maintenance processor fans out `ai.generate { kind: digest }` per user (same fan-out pattern as per-item syncs).

### 3.7 Auth & gating

- All AI endpoints sit behind the existing `requireAuth` preHandler.
- New `requirePremium` preHandler in `plugins/auth.ts`: loads `PremiumSubscription`; status in (`trialing`, `active`) passes, otherwise throws `AppError` 403 with code `PREMIUM_REQUIRED`.
- Free features (advisor, alert reasoning): `requireAuth` only. Premium features (digest, cancellation, negotiation, chat): `requireAuth` + `requirePremium`.

## 4. Feature details

### 4.1 Alternative advisor (free)

- **Flow:** detection completes → `ai.generate { kind: alternative_advice, subjectId: subscriptionId }` → service loads subscription + merchant → queries `AlternativeOption` where `category` matches merchant category and `replaces` overlaps the merchant's normalized key (fallback: category-only match) → prompt includes member's actual price/cadence + catalog options → LLM returns ranked picks with rationale (jsonMode) → upsert `AiSuggestion`.
- **Content shape:** `{ alternatives: [{ optionId, name, monthlyPriceCents, monthlySavingsCents, rationale }], verdict: string }`. `monthlySavingsCents` computed from catalog price vs. subscription's monthly equivalent (`packages/core` `monthlyEquivalentCents`) — never from the LLM.
- **Endpoint:** `GET /api/v1/subscriptions/:id/suggestions` → `AiSuggestion` or `204`-style empty (`{ data: null }`) when not generated yet.
- **UI:** "Better options" card on subscription detail (name, price, savings delta, rationale); badge on list rows where `monthlySavingsCents > 0`. Demo-fallback fixtures in `apps/web/src/lib/demo.ts` for API-down mode.

### 4.2 Smart alert reasoning (free)

- **Flow:** `AlertService` creates a `price_increase` or `new_subscription_detected` alert → pipeline enqueues `ai.generate { kind: alert_reasoning, subjectId: alertId }` → prompt gets alert `data` + the subscription's recent history → 1–2 sentence explanation + one recommended action → upsert `AiSuggestion`.
- **Endpoint:** alert list responses gain `reasoning?: { explanation, recommendedAction }` joined from `AiSuggestion` (server-side join; no extra client round-trip).
- **UI:** alerts page renders reasoning under matching alerts.

### 4.3 Savings insights digest (premium)

- **Flow:** weekly fan-out (3.6) → service gathers last-30-day summary: transaction totals by category, active subscriptions with monthly equivalents, price changes since last digest, savings events, total reclaimable (all via existing services / `packages/core` math) → LLM produces structured digest → upsert `AiSuggestion { kind: digest, subjectId: userId }`.
- **Content shape:** `{ headline, bullets: [{ title, body, amountCents? }], reclaimableTotalCents, topAction }`.
- **Endpoint:** `GET /api/v1/insights/latest`.
- **UI:** new `/dashboard/insights` page; empty state ("Your first digest arrives after the next weekly run") until one exists; premium gate with upgrade prompt for free members.

### 4.4 Cancellation assistant (premium)

- **Flow:** on-demand `POST /api/v1/subscriptions/:id/cancellation-plan` → enqueue (or inline without Redis) → poll/read via `GET /api/v1/subscriptions/:id/suggestions?kind=cancellation_plan`.
- **Content shape:** `{ deadline (next billing date), steps: string[], draftMessage, notes? }`.
- **UI:** "Plan my cancellation" button on subscription detail → modal with plan; CTA continues into the existing cancellation case flow.

### 4.5 Negotiation coach (premium)

- **Flow:** on-demand `POST /api/v1/bills/:id/negotiation-script` (only when `bill.negotiable`) → same cache pattern.
- **Input:** bill history (expected/last amounts, due day, autopay), merchant facts from catalog.
- **Content shape:** `{ targetMonthlyCents, talkingPoints: string[], draftMessage }`. `targetMonthlyCents` derived from catalog/benchmark data server-side; LLM writes the argumentation.
- **UI:** modal on bill detail; CTA into the negotiation case flow.

### 4.6 Chat assistant (premium)

- **Endpoints:**
  - `POST /api/v1/chat/threads` → create thread
  - `GET /api/v1/chat/threads` → list (paginated)
  - `GET /api/v1/chat/threads/:id/messages` → history (paginated)
  - `POST /api/v1/chat/threads/:id/messages` `{ content }` → persists user message, then **SSE-streams** the assistant reply (Fastify raw stream response), persists the full reply on completion.
- **Context assembly (A4):** fixed loaders fetch, tenancy-scoped: active subscriptions, active bills, last-30-day category totals, savings events, latest digest. Assembled into a system-prompt data block. History: last 12 messages.
- **Guardrails (A5):** no account masks/numbers, no external IDs, no emails in prompts; system prompt restricts the assistant to the member's data and money guidance (no financial advice disclaimers handled in copy).
- **UI:** `/dashboard/assistant` — thread list + streaming message view; client reads the SSE stream incrementally.

## 5. Contracts (`packages/shared`)

- `schemas/ai.ts` — `aiSuggestionSchema`, `alternativeOptionSchema`, `digestContentSchema`, `cancellationPlanSchema`, `negotiationScriptSchema`, `chatThreadSchema`, `chatMessageSchema`, request schemas.
- `contracts/ai.ts` — added to `API_ROUTES`:
  ```ts
  ai: {
    suggestionsForSubscription: (id) => `/api/v1/subscriptions/${id}/suggestions`,
    insightsLatest: "/api/v1/insights/latest",
    cancellationPlan: (id) => `/api/v1/subscriptions/${id}/cancellation-plan`,
    negotiationScript: (id) => `/api/v1/bills/${id}/negotiation-script`,
    chatThreads: "/api/v1/chat/threads",
    chatMessages: (threadId) => `/api/v1/chat/threads/${threadId}/messages`,
  }
  ```
- Conventions unchanged: `Paginated<T>` for lists, `ApiErrorResponse` for errors, `null` never `undefined` on the wire.

## 6. Error handling

- LLM call fails → job retries with existing defaults (5 attempts, exponential backoff). After final failure: previous `AiSuggestion` content (if any) is preserved; otherwise the subject simply has no suggestion and the UI shows its "not available yet" empty state.
- Mock adapter (no `LLM_API_KEY`) means local dev and all tests never hit this path.
- Chat stream interruption: partial reply discarded (not persisted); client shows an error state with retry.
- Premium check failures: 403 `PREMIUM_REQUIRED` — UI shows the upgrade card, never a dead end.

## 7. Testing

Mirrors existing Vitest patterns; **no live LLM calls in any test**:

- Prompt builders: pure-function tests asserting key facts appear in prompts (`apps/api/test/ai/prompts.test.ts`).
- Mock adapter: fixture-keyed behavior (`apps/api/test/adapters/mock-llm.adapter.test.ts`), modeled on `mock-plaid.adapter.test.ts`.
- Services: against `test/support/fake-prisma.ts` — advisor picks catalog options and computes savings from prices (not LLM output); premium gating rejects free members; upsert idempotency; PII guard (assert masked fields never reach the prompt).
- Routes: auth required, premium gating, empty states (`apps/api/test/routes/ai-routes.test.ts`), modeled on `banking-routes.test.ts`.
- Queue: payload schema validation in `packages/queue/test/jobs.test.ts`.

## 8. Environment

Additions to `.env.example`:

```
# ── LLM (optional) ──────────────────────────────────────────────────────────
# Leave LLM_API_KEY unset to use the deterministic mock adapter (no network).
# LLM_API_KEY=
# LLM_BASE_URL=https://api.openai.com/v1
# LLM_MODEL=gpt-4o-mini
# LLM_TIMEOUT_MS=30000
```

## 9. Phasing

Each phase independently shippable; verified by `pnpm test && pnpm lint && pnpm typecheck`:

1. **Platform** — LLM adapter + mock, prompt module skeleton, Prisma models + migration + seed (catalog), `ai.generate` queue, `createAiServices`, worker processor, `requirePremium` preHandler.
2. **Alternative advisor** — advisor service, endpoint, subscription detail card + list badge, demo fixtures.
3. **Smart alert reasoning** — alert enrichment in pipeline, alerts page UI.
4. **Savings digest** — weekly fan-out, digest service, `/dashboard/insights`.
5. **Cancellation assistant + negotiation coach** — on-demand services, modals, case-flow CTAs.
6. **Chat assistant** — thread/message endpoints, SSE streaming, context loaders, `/dashboard/assistant`.
