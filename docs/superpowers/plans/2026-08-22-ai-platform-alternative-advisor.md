# AI Platform + Alternative Advisor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the AI platform foundation (LLM adapter, prompt layer, storage, queue, composition root) and the first feature — the alternative advisor that suggests cheaper/better subscriptions.

**Architecture:** Mirrors the existing Plaid adapter pattern: a provider-agnostic `LlmAdapter` interface with an OpenAI-compatible HTTP adapter and a deterministic mock. Batch generation runs as a BullMQ job (`ai.generate`) in `apps/worker`; results cache in `AiSuggestion` rows. The web reads the cache. All money math (savings deltas) is computed server-side from catalog prices, never from LLM output.

**Tech Stack:** Fastify 5, Prisma 6 (PostgreSQL), BullMQ, Zod, Vitest, Next.js 15 App Router, Tailwind v4, `@reclaimr/ui` design system.

**Spec:** `docs/superpowers/specs/2026-08-22-ai-agentic-features-design.md`

---

## File Structure

| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `apps/api/src/env.ts` | Add LLM env vars + `llmEnabled()` |
| Create | `apps/api/src/adapters/llm/types.ts` | `LlmAdapter` interface, input/result types, `LlmAdapterError` |
| Create | `apps/api/src/adapters/llm/mock-adapter.ts` | Deterministic fixture responses keyed by feature marker |
| Create | `apps/api/src/adapters/llm/openai-adapter.ts` | HTTP adapter for OpenAI-compatible endpoints |
| Create | `apps/api/src/adapters/llm/index.ts` | `createLlmAdapter()` factory |
| Modify | `apps/api/prisma/schema.prisma` | Add `AlternativeOption`, `AiSuggestion`, `AiSuggestionKind` |
| Create | `apps/api/prisma/migrations/…_ai_features/migration.sql` | DDL for new models |
| Modify | `apps/api/prisma/seed.ts` | Seed alternatives catalog |
| Modify | `packages/queue/src/names.ts` | Add `aiGenerate` queue + concurrency |
| Modify | `packages/queue/src/jobs.ts` | Add `aiGenerateJobSchema` |
| Create | `packages/shared/src/schemas/ai.ts` | Wire schemas for suggestions |
| Modify | `packages/shared/src/constants.ts` | Add `ai` routes to `API_ROUTES` |
| Create | `packages/shared/src/contracts/ai.ts` | Endpoint contract map |
| Modify | `packages/shared/src/index.ts` | Export new schemas/contracts |
| Create | `apps/api/src/modules/ai/prompts/alternative-advisor.ts` | Pure prompt builder |
| Create | `apps/api/src/modules/ai/alternative-advisor.service.ts` | Advisor service |
| Create | `apps/api/src/services/ai.ts` | `createAiServices()` composition root |
| Modify | `apps/api/src/services.ts` | Export AI services barrel |
| Create | `apps/worker/src/processors/ai-generate.processor.ts` | Worker processor |
| Modify | `apps/worker/src/index.ts` | Register AI processor |
| Modify | `apps/api/src/plugins/auth.ts` | Add `requirePremium` preHandler |
| Create | `apps/api/src/modules/ai/routes.ts` | Suggestions endpoint |
| Modify | `apps/api/src/app.ts` | Register AI routes + services |
| Modify | `apps/api/src/modules/detection/sync-pipeline.ts` | Enqueue AI generation after detection |
| Modify | `apps/api/test/support/fake-prisma.ts` | Add new model delegates |
| Create | `apps/api/test/adapters/mock-llm.adapter.test.ts` | Mock adapter tests |
| Create | `apps/api/test/ai/prompts.test.ts` | Prompt builder tests |
| Create | `apps/api/test/ai/advisor.service.test.ts` | Advisor service tests |
| Create | `apps/api/test/routes/ai-routes.test.ts` | Route smoke tests |
| Modify | `packages/queue/test/jobs.test.ts` | AI job schema tests |
| Modify | `apps/web/src/lib/api.ts` | Fetch suggestions |
| Modify | `apps/web/src/lib/demo.ts` | Demo suggestion fixtures |
| Modify | `apps/web/src/lib/data.ts` | Load suggestions with fallback |
| Create | `apps/web/src/components/dashboard/better-options-card.tsx` | Detail-page card |
| Modify | `apps/web/src/app/dashboard/subscriptions/[id]/page.tsx` | Render card |
| Modify | `apps/web/src/app/dashboard/subscriptions/page.tsx` | Savings badge |

---

### Task 1: LLM environment variables

**Files:**
- Modify: `apps/api/src/env.ts`

- [ ] **Step 1: Add LLM vars to the env schema and `llmEnabled` predicate**

In `apps/api/src/env.ts`, add after the `BANK_TOKEN_ENCRYPTION_KEY` field inside `envSchema`:

```typescript
  // ── LLM ─────────────────────────────────────────────────────────────────
  /** Leave unset to use the deterministic mock adapter (no network). */
  LLM_API_KEY: z.string().optional(),
  /** Any OpenAI-compatible chat-completions base URL. */
  LLM_BASE_URL: z.string().url().default("https://api.openai.com/v1"),
  LLM_MODEL: z.string().default("gpt-4o-mini"),
  LLM_TIMEOUT_MS: z.coerce.number().int().min(1000).default(30000),
```

Add after the `bankTokenKey` function:

```typescript
/** True when a real LLM API key is configured; otherwise the mock adapter is used. */
export function llmEnabled(config: Env): boolean {
  return Boolean(config.LLM_API_KEY);
}
```

- [ ] **Step 2: Verify typecheck passes**

Run: `pnpm --filter @reclaimr/api typecheck`
Expected: PASS (no errors)

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/env.ts
git commit -m "feat(api): add LLM environment variables and llmEnabled predicate"
```

---

### Task 2: LLM adapter types

**Files:**
- Create: `apps/api/src/adapters/llm/types.ts`

- [ ] **Step 1: Create the adapter interface and error class**

```typescript
/**
 * Provider-agnostic LLM adapter. Mirrors the PlaidAdapter pattern: one
 * interface, a real HTTP implementation, and a deterministic mock for
 * dev/tests. The factory in index.ts selects based on config.
 */

export interface LlmCompletionInput {
  /** System-level instruction (feature marker embedded for mock routing). */
  system: string;
  /** User-level content: the domain data for this invocation. */
  user: string;
  temperature?: number;
  maxTokens?: number;
  /** Request JSON-mode output when the feature expects structured JSON. */
  jsonMode?: boolean;
}

export interface LlmCompletionResult {
  content: string;
  model: string;
  usage?: { promptTokens: number; completionTokens: number };
}

export interface LlmAdapter {
  complete(input: LlmCompletionInput): Promise<LlmCompletionResult>;
  /** Token-by-token stream for chat. Default: yields the full completion. */
  stream(input: LlmCompletionInput): AsyncIterable<string>;
}

/** Retriable adapter failure (network, rate-limit, provider error). */
export class LlmAdapterError extends Error {
  constructor(
    message: string,
    readonly statusCode?: number,
  ) {
    super(message);
    this.name = "LlmAdapterError";
  }
}
```

- [ ] **Step 2: Verify typecheck**

Run: `pnpm --filter @reclaimr/api typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/adapters/llm/types.ts
git commit -m "feat(api): add LlmAdapter interface and error type"
```

---

### Task 3: Mock LLM adapter

**Files:**
- Create: `apps/api/src/adapters/llm/mock-adapter.ts`
- Test: `apps/api/test/adapters/mock-llm.adapter.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it } from "vitest";
import { MockLlmAdapter } from "../../src/adapters/llm/mock-adapter";

describe("MockLlmAdapter", () => {
  const adapter = new MockLlmAdapter();

  it("returns a deterministic alternative_advice fixture", async () => {
    const result = await adapter.complete({
      system: "[feature:alternative_advice] Rank the alternatives.",
      user: "Subscription: Streaming Plus at $15.99/mo",
      jsonMode: true,
    });
    expect(result.model).toBe("mock");
    const parsed = JSON.parse(result.content);
    expect(parsed).toHaveProperty("picks");
    expect(Array.isArray(parsed.picks)).toBe(true);
  });

  it("returns the same content for identical inputs", async () => {
    const input = { system: "[feature:alternative_advice] x", user: "y" };
    const a = await adapter.complete(input);
    const b = await adapter.complete(input);
    expect(a.content).toBe(b.content);
  });

  it("stream yields the full content in chunks", async () => {
    const chunks: string[] = [];
    for await (const chunk of adapter.stream({ system: "[feature:alternative_advice]", user: "" })) {
      chunks.push(chunk);
    }
    expect(chunks.join("")).toContain("picks");
  });

  it("falls back to a generic response for unknown features", async () => {
    const result = await adapter.complete({ system: "no marker here", user: "hello" });
    expect(result.content).toBeTruthy();
    expect(result.model).toBe("mock");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @reclaimr/api test -- mock-llm`
Expected: FAIL — module not found

- [ ] **Step 3: Implement the mock adapter**

```typescript
import type { LlmAdapter, LlmCompletionInput, LlmCompletionResult } from "./types";

/**
 * Deterministic mock LLM. Routes on a `[feature:<kind>]` marker embedded in
 * the system prompt by each prompt builder. Same input → byte-identical
 * output, so the whole AI pipeline is testable in CI with no keys, no
 * network, and no flakiness — exactly like MockPlaidAdapter.
 */

const ALTERNATIVE_ADVICE_FIXTURE = JSON.stringify({
  picks: [
    {
      name: "StreamLite Basic",
      rationale: "Same core library at a lower tier; drops 4K you rarely use.",
    },
    {
      name: "AdView Plus",
      rationale: "Ad-supported plan cuts the price nearly in half.",
    },
  ],
  verdict: "Switching to a lower tier saves the most with the least disruption.",
});

const GENERIC_FIXTURE = JSON.stringify({ ok: true, note: "mock response" });

const FIXTURES: Record<string, string> = {
  alternative_advice: ALTERNATIVE_ADVICE_FIXTURE,
};

function featureOf(system: string): string | null {
  const match = system.match(/\[feature:([a-z_]+)\]/);
  return match ? match[1] : null;
}

export class MockLlmAdapter implements LlmAdapter {
  async complete(input: LlmCompletionInput): Promise<LlmCompletionResult> {
    const feature = featureOf(input.system);
    const content = (feature && FIXTURES[feature]) || GENERIC_FIXTURE;
    return {
      content,
      model: "mock",
      usage: { promptTokens: 10, completionTokens: 20 },
    };
  }

  async *stream(input: LlmCompletionInput): AsyncIterable<string> {
    const { content } = await this.complete(input);
    // Yield in fixed-size chunks to exercise the streaming path.
    for (let i = 0; i < content.length; i += 24) {
      yield content.slice(i, i + 24);
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @reclaimr/api test -- mock-llm`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/adapters/llm/mock-adapter.ts apps/api/test/adapters/mock-llm.adapter.test.ts
git commit -m "feat(api): add deterministic MockLlmAdapter with feature-keyed fixtures"
```

---

### Task 4: OpenAI HTTP adapter

**Files:**
- Create: `apps/api/src/adapters/llm/openai-adapter.ts`

- [ ] **Step 1: Implement the HTTP adapter**

```typescript
import { LlmAdapterError, type LlmAdapter, type LlmCompletionInput, type LlmCompletionResult } from "./types";

export interface OpenAiAdapterOptions {
  apiKey: string;
  baseUrl: string;
  model: string;
  timeoutMs: number;
}

/**
 * Plain-fetch adapter for any OpenAI-compatible /chat/completions endpoint
 * (OpenAI, OpenRouter, local servers). No SDK dependency.
 */
export class OpenAiAdapter implements LlmAdapter {
  constructor(private readonly options: OpenAiAdapterOptions) {}

  async complete(input: LlmCompletionInput): Promise<LlmCompletionResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.options.timeoutMs);
    try {
      const response = await fetch(`${this.options.baseUrl}/chat/completions`, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.options.apiKey}`,
        },
        body: JSON.stringify({
          model: this.options.model,
          temperature: input.temperature ?? 0.4,
          max_tokens: input.maxTokens ?? 1024,
          ...(input.jsonMode ? { response_format: { type: "json_object" } } : {}),
          messages: [
            { role: "system", content: input.system },
            { role: "user", content: input.user },
          ],
        }),
      });

      if (!response.ok) {
        throw new LlmAdapterError(`LLM request failed: ${response.status}`, response.status);
      }

      const body = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };
      const content = body.choices?.[0]?.message?.content;
      if (!content) throw new LlmAdapterError("LLM returned an empty completion");

      return {
        content,
        model: this.options.model,
        usage:
          body.usage?.prompt_tokens !== undefined && body.usage?.completion_tokens !== undefined
            ? { promptTokens: body.usage.prompt_tokens, completionTokens: body.usage.completion_tokens }
            : undefined,
      };
    } catch (error) {
      if (error instanceof LlmAdapterError) throw error;
      throw new LlmAdapterError(
        error instanceof Error ? error.message : "LLM request failed",
      );
    } finally {
      clearTimeout(timer);
    }
  }

  async *stream(input: LlmCompletionInput): AsyncIterable<string> {
    // v1 chat streams via the non-streaming path; a true SSE stream lands with
    // the chat assistant feature (Phase 6). Yielding the full completion keeps
    // the interface honest today.
    const { content } = await this.complete(input);
    yield content;
  }
}
```

- [ ] **Step 2: Verify typecheck**

Run: `pnpm --filter @reclaimr/api typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/adapters/llm/openai-adapter.ts
git commit -m "feat(api): add OpenAI-compatible HTTP LLM adapter"
```

---

### Task 5: LLM adapter factory

**Files:**
- Create: `apps/api/src/adapters/llm/index.ts`

- [ ] **Step 1: Create the factory (twin of createPlaidAdapter)**

```typescript
import { env, llmEnabled, type Env } from "../../env";
import { MockLlmAdapter } from "./mock-adapter";
import { OpenAiAdapter } from "./openai-adapter";
import type { LlmAdapter } from "./types";

/**
 * Adapter selection: real OpenAI-compatible endpoint when a key exists,
 * deterministic mock otherwise. Local dev and CI run with zero keys and
 * zero network.
 */
export function createLlmAdapter(config: Env = env()): LlmAdapter {
  if (llmEnabled(config)) {
    return new OpenAiAdapter({
      apiKey: config.LLM_API_KEY!,
      baseUrl: config.LLM_BASE_URL,
      model: config.LLM_MODEL,
      timeoutMs: config.LLM_TIMEOUT_MS,
    });
  }
  return new MockLlmAdapter();
}

export { MockLlmAdapter, OpenAiAdapter };
export * from "./types";
```

- [ ] **Step 2: Verify typecheck**

Run: `pnpm --filter @reclaimr/api typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/adapters/llm/index.ts
git commit -m "feat(api): add createLlmAdapter factory with mock fallback"
```

---

### Task 6: Prisma schema — AI models

**Files:**
- Modify: `apps/api/prisma/schema.prisma`

- [ ] **Step 1: Add the enum and two models**

Add the enum after `AuditActorType` (before the `// ─── Identity & consent` section):

```prisma
/// Kind of cached AI-generated artifact (one row per subject per kind).
enum AiSuggestionKind {
  alternative_advice
  alert_reasoning
  digest
  cancellation_plan
  negotiation_script
}
```

Add the two models at the end of the file (after `AuditLog`):

```prisma
// ─── AI features ────────────────────────────────────────────────────────────

/// Curated catalog of cheaper/better alternatives per service category.
/// Global and ops-maintained (like Merchant); seeded in v1, no admin CRUD.
model AlternativeOption {
  id                String   @id @default(uuid()) @db.Uuid
  /// Grouping category, e.g. "streaming", "music", "fitness".
  category          String
  name              String
  monthlyPriceCents Int
  highlights        String[] @default([])
  tradeoffs         String[] @default([])
  /// Normalized merchant keys this option can replace (e.g. "netflix").
  replaces          String[] @default([])
  isActive          Boolean  @default(true)
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  @@index([category, isActive])
  @@map("alternative_options")
}

/// Cached generated AI artifact. One row per (kind, subject); regenerated by
/// upsert so the last good content survives a failed regeneration.
model AiSuggestion {
  id          String           @id @default(uuid()) @db.Uuid
  userId      String           @db.Uuid
  user        User             @relation(fields: [userId], references: [id], onDelete: Cascade)
  kind        AiSuggestionKind
  /// Polymorphic subject: ("subscription", id) | ("alert", id) | ("bill", id) | ("user", userId).
  subjectType String
  subjectId   String           @db.Uuid
  /// Feature-specific structured payload (alternatives list, digest bullets...).
  content     Json
  /// Raw LLM prose where the feature produces it (rationale, verdict).
  summary     String?
  model       String
  createdAt   DateTime         @default(now())
  updatedAt   DateTime         @updatedAt

  @@unique([kind, subjectId])
  @@index([userId, kind])
  @@map("ai_suggestions")
}
```

Add the relations to the `User` model (after `auditLogs`):

```prisma
  aiSuggestions     AiSuggestion[]
```

- [ ] **Step 2: Generate the migration**

Run: `pnpm --filter @reclaimr/api db:dev -- --name ai_features`
Expected: creates `apps/api/prisma/migrations/<timestamp>_ai_features/migration.sql` and regenerates the client.

If the interactive prompt blocks, use: `pnpm --filter @reclaimr/api exec prisma migrate dev --name ai_features`

- [ ] **Step 3: Verify the generated client typechecks**

Run: `pnpm --filter @reclaimr/api typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/
git commit -m "feat(db): add AlternativeOption catalog and AiSuggestion cache models"
```

---

### Task 7: Queue — ai.generate

**Files:**
- Modify: `packages/queue/src/names.ts`
- Modify: `packages/queue/src/jobs.ts`
- Test: `packages/queue/test/jobs.test.ts`

- [ ] **Step 1: Write the failing test additions**

Append to `packages/queue/test/jobs.test.ts` inside the existing describes, and add a new import:

Add `aiGenerateJobSchema` to the import from `"../src/jobs"`. Then add:

```typescript
  it("accepts a valid ai.generate payload", () => {
    expect(
      aiGenerateJobSchema.parse({
        userId: UUID,
        kind: "alternative_advice",
        subjectId: UUID,
      }),
    ).toEqual({ userId: UUID, kind: "alternative_advice", subjectId: UUID });
  });

  it("rejects an unknown ai suggestion kind", () => {
    expect(
      aiGenerateJobSchema.safeParse({ userId: UUID, kind: "bogus", subjectId: UUID }).success,
    ).toBe(false);
  });
```

And in the `queue names` describe:

```typescript
  it("includes the ai.generate queue", () => {
    expect(QUEUE_NAMES.aiGenerate).toBe("ai.generate");
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @reclaimr/queue test`
Expected: FAIL — `aiGenerateJobSchema` not exported / `aiGenerate` missing

- [ ] **Step 3: Add the queue name and concurrency**

In `packages/queue/src/names.ts`, add to `QUEUE_NAMES` after `maintenance`:

```typescript
  /** Generate/refresh a cached AI suggestion for a member. */
  aiGenerate: "ai.generate",
```

Add to `QUEUE_CONCURRENCY`:

```typescript
  [QUEUE_NAMES.aiGenerate]: 2,
```

- [ ] **Step 4: Add the job payload schema**

In `packages/queue/src/jobs.ts`, add after `maintenanceJobSchema`:

```typescript
export const aiSuggestionKindSchema = z.enum([
  "alternative_advice",
  "alert_reasoning",
  "digest",
  "cancellation_plan",
  "negotiation_script",
]);
export type AiSuggestionKind = z.infer<typeof aiSuggestionKindSchema>;

export const aiGenerateJobSchema = z.object({
  userId: z.string().uuid(),
  kind: aiSuggestionKindSchema,
  subjectId: z.string().uuid(),
});
export type AiGenerateJob = z.infer<typeof aiGenerateJobSchema>;
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @reclaimr/queue test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/queue/src/names.ts packages/queue/src/jobs.ts packages/queue/test/jobs.test.ts
git commit -m "feat(queue): add ai.generate queue and job payload schema"
```

---

### Task 8: Shared wire schemas — AI

**Files:**
- Create: `packages/shared/src/schemas/ai.ts`
- Modify: `packages/shared/src/constants.ts`
- Create: `packages/shared/src/contracts/ai.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Create the AI schemas**

```typescript
import { z } from "zod";

export const aiSuggestionKindSchema = z.enum([
  "alternative_advice",
  "alert_reasoning",
  "digest",
  "cancellation_plan",
  "negotiation_script",
]);
export type AiSuggestionKind = z.infer<typeof aiSuggestionKindSchema>;

/** One ranked alternative returned by the advisor. */
export const alternativePickSchema = z.object({
  /** Catalog option id; null when the LLM named something off-catalog. */
  optionId: z.string().uuid().nullable(),
  name: z.string().min(1),
  monthlyPriceCents: z.number().int().min(0),
  /** Computed server-side: member's monthly cost minus this option's price. */
  monthlySavingsCents: z.number().int(),
  rationale: z.string(),
});
export type AlternativePick = z.infer<typeof alternativePickSchema>;

/** Structured content for kind = alternative_advice. */
export const alternativeAdviceContentSchema = z.object({
  picks: z.array(alternativePickSchema),
  verdict: z.string(),
});
export type AlternativeAdviceContent = z.infer<typeof alternativeAdviceContentSchema>;

/** Cached AI artifact as returned by the API. */
export const aiSuggestionSchema = z.object({
  id: z.string().uuid(),
  kind: aiSuggestionKindSchema,
  subjectType: z.string(),
  subjectId: z.string().uuid(),
  content: z.unknown(),
  summary: z.string().nullable(),
  model: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type AiSuggestion = z.infer<typeof aiSuggestionSchema>;

/** GET /subscriptions/:id/suggestions — null content until generated. */
export const subscriptionSuggestionsResponseSchema = z.object({
  data: aiSuggestionSchema.nullable(),
});
export type SubscriptionSuggestionsResponse = z.infer<typeof subscriptionSuggestionsResponseSchema>;
```

- [ ] **Step 2: Add AI routes to API_ROUTES**

In `packages/shared/src/constants.ts`, add inside `API_ROUTES` after the `admin` block (before the closing `} as const`):

```typescript
  ai: {
    suggestionsForSubscription: (id: string) => `${API_PREFIX}/subscriptions/${id}/suggestions`,
  },
```

- [ ] **Step 3: Create the contract map**

```typescript
import { API_ROUTES } from "../constants";
import { idParamSchema } from "../schemas/common";
import { subscriptionSuggestionsResponseSchema } from "../schemas/ai";

/**
 * API contract for the AI suggestion endpoints. Routes in apps/api and
 * clients in apps/web both import these so shapes cannot drift.
 */
export const aiContract = {
  subscriptionSuggestions: {
    method: "GET",
    path: `${API_ROUTES.ai.suggestionsForSubscription("{id}")}`,
    params: idParamSchema,
    response: subscriptionSuggestionsResponseSchema,
  },
} as const;
```

- [ ] **Step 4: Export from the shared barrel**

In `packages/shared/src/index.ts`, add to the domain schemas section:

```typescript
export * from "./schemas/ai";
```

And to the endpoint contracts section:

```typescript
export * from "./contracts/ai";
```

- [ ] **Step 5: Verify typecheck**

Run: `pnpm --filter @reclaimr/shared typecheck`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/schemas/ai.ts packages/shared/src/constants.ts packages/shared/src/contracts/ai.ts packages/shared/src/index.ts
git commit -m "feat(shared): add AI suggestion wire schemas, routes, and contract"
```

---

### Task 9: Prompt builder — alternative advisor

**Files:**
- Create: `apps/api/src/modules/ai/prompts/alternative-advisor.ts`
- Test: `apps/api/test/ai/prompts.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it } from "vitest";
import { alternativeAdvisorPrompt } from "../../src/modules/ai/prompts/alternative-advisor";

describe("alternativeAdvisorPrompt", () => {
  const input = {
    subscriptionName: "Streaming Plus",
    monthlyAmountCents: 1599,
    cadence: "monthly" as const,
    alternatives: [
      {
        optionId: "0b9a6c8e-6f2a-4d4e-9d3a-2f5e8a1c7b33",
        name: "StreamLite Basic",
        monthlyPriceCents: 999,
        highlights: ["Same core library"],
        tradeoffs: ["No 4K"],
      },
    ],
  };

  it("embeds the feature marker for mock routing", () => {
    const { system } = alternativeAdvisorPrompt(input);
    expect(system).toContain("[feature:alternative_advice]");
  });

  it("includes the member's actual price and name", () => {
    const { user } = alternativeAdvisorPrompt(input);
    expect(user).toContain("Streaming Plus");
    expect(user).toContain("1599");
  });

  it("includes every catalog alternative", () => {
    const { user } = alternativeAdvisorPrompt(input);
    expect(user).toContain("StreamLite Basic");
    expect(user).toContain("999");
  });

  it("requests JSON output", () => {
    const { system } = alternativeAdvisorPrompt(input);
    expect(system.toLowerCase()).toContain("json");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @reclaimr/api test -- prompts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement the prompt builder**

```typescript
import type { BillingCadence } from "@reclaimr/shared";

export interface AlternativeAdvisorPromptInput {
  subscriptionName: string;
  monthlyAmountCents: number;
  cadence: BillingCadence;
  alternatives: Array<{
    optionId: string;
    name: string;
    monthlyPriceCents: number;
    highlights: string[];
    tradeoffs: string[];
  }>;
}

/**
 * Pure prompt builder for the alternative advisor. No I/O — all domain data
 * is passed in, so the output is deterministic and unit-testable. The
 * `[feature:alternative_advice]` marker lets MockLlmAdapter route to its
 * fixture. Prices are integer cents; the LLM ranks and explains, never
 * invents prices.
 */
export function alternativeAdvisorPrompt(
  input: AlternativeAdvisorPromptInput,
): { system: string; user: string } {
  const system = `[feature:alternative_advice]
You are a subscription advisor. Given a member's current subscription and a
curated list of alternatives, rank the alternatives that genuinely save money
or improve value. Respond with ONLY a JSON object of shape:
{ "picks": [ { "optionId": string, "name": string, "rationale": string } ], "verdict": string }
Include at most 3 picks, best first. Do not mention prices you were not given.
Do not invent alternatives that are not in the list.`;

  const altLines = input.alternatives
    .map(
      (a) =>
        `- optionId=${a.optionId} name="${a.name}" monthlyPriceCents=${a.monthlyPriceCents}` +
        (a.highlights.length ? ` highlights=[${a.highlights.join("; ")}]` : "") +
        (a.tradeoffs.length ? ` tradeoffs=[${a.tradeoffs.join("; ")}]` : ""),
    )
    .join("\n");

  const user = `Current subscription:
  name="${input.subscriptionName}"
  monthlyAmountCents=${input.monthlyAmountCents}
  cadence=${input.cadence}

Curated alternatives:
${altLines || "(none available)"}`;

  return { system, user };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @reclaimr/api test -- prompts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/ai/prompts/alternative-advisor.ts apps/api/test/ai/prompts.test.ts
git commit -m "feat(api): add pure alternative-advisor prompt builder"
```

---

### Task 10: AlternativeAdvisorService

**Files:**
- Create: `apps/api/src/modules/ai/alternative-advisor.service.ts`
- Modify: `apps/api/test/support/fake-prisma.ts`
- Test: `apps/api/test/ai/advisor.service.test.ts`

- [ ] **Step 1: Extend fake-prisma with the new models**

In `apps/api/test/support/fake-prisma.ts`, add to the `MODELS` record (after `auditLog`):

```typescript
  alternativeOption: {
    defaults: { highlights: [], tradeoffs: [], replaces: [], isActive: true },
  },
  aiSuggestion: {
    defaults: { summary: null },
    compoundKeys: ["kind_subjectId"],
  },
```

Add `"alternativeOption"` and `"aiSuggestion"` to the `ModelName` union type.

- [ ] **Step 2: Write the failing test**

```typescript
import { beforeEach, describe, expect, it } from "vitest";
import { monthlyEquivalentCents } from "@reclaimr/core";
import { MockLlmAdapter } from "../../src/adapters/llm/mock-adapter";
import { AlternativeAdvisorService } from "../../src/modules/ai/alternative-advisor.service";
import { createFakePrisma, type FakePrisma } from "../support/fake-prisma";

describe("AlternativeAdvisorService", () => {
  let db: FakePrisma;
  let service: AlternativeAdvisorService;
  const userId = "0b9a6c8e-6f2a-4d4e-9d3a-2f5e8a1c7b33";
  const subscriptionId = "1b9a6c8e-6f2a-4d4e-9d3a-2f5e8a1c7b33";
  const optionId = "2b9a6c8e-6f2a-4d4e-9d3a-2f5e8a1c7b33";

  beforeEach(async () => {
    db = createFakePrisma();
    service = new AlternativeAdvisorService(db.asPrisma(), new MockLlmAdapter());

    await db.user.create({ data: { id: userId, email: "a@b.c" } });
    await db.subscription.create({
      data: {
        id: subscriptionId,
        userId,
        name: "Streaming Plus",
        amountCents: 1599,
        cadence: "monthly",
        nextBillingDate: new Date("2026-09-01"),
      },
    });
    await db.alternativeOption.create({
      data: {
        id: optionId,
        category: "entertainment",
        name: "StreamLite Basic",
        monthlyPriceCents: 999,
        replaces: ["streaming plus"],
      },
    });
  });

  it("generates and caches a suggestion with server-side savings math", async () => {
    const result = await service.generateForSubscription(userId, subscriptionId);
    expect(result).not.toBeNull();
    const content = result!.content as { picks: Array<{ monthlySavingsCents: number }> };
    // Savings must be computed from catalog price, not LLM output.
    const expected = monthlyEquivalentCents(1599, "monthly") - 999;
    expect(content.picks[0].monthlySavingsCents).toBe(expected);
  });

  it("upserts: regenerating does not duplicate the row", async () => {
    await service.generateForSubscription(userId, subscriptionId);
    await service.generateForSubscription(userId, subscriptionId);
    const count = await db.aiSuggestion.count({});
    expect(count).toBe(1);
  });

  it("returns null for a subscription owned by another user", async () => {
    const result = await service.generateForSubscription("99999999-9999-9999-9999-999999999999", subscriptionId);
    expect(result).toBeNull();
  });

  it("getForSubscription reads the cached row", async () => {
    await service.generateForSubscription(userId, subscriptionId);
    const cached = await service.getForSubscription(userId, subscriptionId);
    expect(cached).not.toBeNull();
    expect(cached!.kind).toBe("alternative_advice");
  });

  it("getForSubscription returns null when nothing is cached", async () => {
    const cached = await service.getForSubscription(userId, subscriptionId);
    expect(cached).toBeNull();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @reclaimr/api test -- advisor.service`
Expected: FAIL — module not found

- [ ] **Step 4: Implement the service**

```typescript
import type { PrismaClient } from "@prisma/client";
import { monthlyEquivalentCents } from "@reclaimr/core";
import type { AlternativeAdviceContent } from "@reclaimr/shared";
import type { LlmAdapter } from "../../adapters/llm/types";
import { alternativeAdvisorPrompt } from "./prompts/alternative-advisor";

/**
 * Alternative advisor: for one subscription, pull matching catalog options,
 * ask the LLM to rank them, then persist a cached AiSuggestion. All money
 * math (monthlySavingsCents) is computed here from catalog prices — the LLM
 * only supplies ranking and rationale, never prices.
 */
export class AlternativeAdvisorService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly adapter: LlmAdapter,
  ) {}

  async generateForSubscription(
    userId: string,
    subscriptionId: string,
  ): Promise<{ content: AlternativeAdviceContent; summary: string | null; kind: string } | null> {
    const subscription = await this.prisma.subscription.findFirst({
      where: { id: subscriptionId, userId },
      include: { merchant: { select: { normalizedKey: true, category: true } } },
    });
    if (!subscription) return null;

    const memberMonthly = monthlyEquivalentCents(subscription.amountCents, subscription.cadence);

    // Match catalog options by merchant normalized key first, then by the
    // merchant category; fall back to the subscription's own category name.
    const merchantKey = subscription.merchant?.normalizedKey ?? null;
    const category = subscription.merchant?.category ?? "other";
    const options = await this.prisma.alternativeOption.findMany({
      where: { isActive: true },
    });
    const matched = options.filter(
      (o) =>
        (merchantKey && o.replaces.includes(merchantKey)) || o.category === category,
    );

    const { system, user } = alternativeAdvisorPrompt({
      subscriptionName: subscription.name,
      monthlyAmountCents: subscription.amountCents,
      cadence: subscription.cadence,
      alternatives: matched.map((o) => ({
        optionId: o.id,
        name: o.name,
        monthlyPriceCents: o.monthlyPriceCents,
        highlights: o.highlights,
        tradeoffs: o.tradeoffs,
      })),
    });

    const completion = await this.adapter.complete({ system, user, jsonMode: true });

    // Parse LLM ranking; rebuild picks with server-side savings so a
    // hallucinated price can never reach the member.
    const priceById = new Map(matched.map((o) => [o.id, o.monthlyPriceCents]));
    const nameById = new Map(matched.map((o) => [o.id, o.name]));
    let picks: AlternativeAdviceContent["picks"] = [];
    let verdict = "";
    try {
      const parsed = JSON.parse(completion.content) as {
        picks?: Array<{ optionId?: string; name?: string; rationale?: string }>;
        verdict?: string;
      };
      verdict = parsed.verdict ?? "";
      picks = (parsed.picks ?? [])
        .map((p) => {
          const price = p.optionId ? priceById.get(p.optionId) : undefined;
          if (price === undefined) return null; // drop off-catalog picks
          return {
            optionId: p.optionId ?? null,
            name: nameById.get(p.optionId!) ?? p.name ?? "Alternative",
            monthlyPriceCents: price,
            monthlySavingsCents: memberMonthly - price,
            rationale: p.rationale ?? "",
          };
        })
        .filter((p): p is NonNullable<typeof p> => p !== null)
        .slice(0, 3);
    } catch {
      // Unparseable LLM output → cache an empty result rather than failing.
    }

    const content: AlternativeAdviceContent = { picks, verdict };
    const row = await this.prisma.aiSuggestion.upsert({
      where: { kind_subjectId: { kind: "alternative_advice", subjectId: subscriptionId } },
      create: {
        userId,
        kind: "alternative_advice",
        subjectType: "subscription",
        subjectId: subscriptionId,
        content,
        summary: verdict || null,
        model: completion.model,
      },
      update: {
        content,
        summary: verdict || null,
        model: completion.model,
      },
    });

    return { content, summary: row.summary, kind: row.kind };
  }

  async getForSubscription(userId: string, subscriptionId: string) {
    return this.prisma.aiSuggestion.findFirst({
      where: { userId, kind: "alternative_advice", subjectId: subscriptionId },
    });
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @reclaimr/api test -- advisor.service`
Expected: PASS (5 tests)

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/ai/alternative-advisor.service.ts apps/api/test/support/fake-prisma.ts apps/api/test/ai/advisor.service.test.ts
git commit -m "feat(api): add AlternativeAdvisorService with server-side savings math"
```

---

### Task 11: AI composition root + barrel export

**Files:**
- Create: `apps/api/src/services/ai.ts`
- Modify: `apps/api/src/services.ts`

- [ ] **Step 1: Create the composition root**

```typescript
import type { PrismaClient } from "@prisma/client";
import type { JobProducer } from "@reclaimr/queue";
import { createLlmAdapter, type LlmAdapter } from "../adapters/llm";
import type { Env } from "../env";
import { AlternativeAdvisorService } from "../modules/ai/alternative-advisor.service";

export interface AiServices {
  advisor: AlternativeAdvisorService;
}

/**
 * Composition root for the AI feature graph. Constructed once per process by
 * the Fastify app and by apps/worker — the same services and code paths in
 * both, mirroring createBankingServices.
 */
export function createAiServices(
  prisma: PrismaClient,
  config: Env,
  options: { queue?: JobProducer | null; adapter?: LlmAdapter } = {},
): AiServices {
  const adapter = options.adapter ?? createLlmAdapter(config);
  void options.queue; // reserved for on-demand enqueue in later phases

  return {
    advisor: new AlternativeAdvisorService(prisma, adapter),
  };
}
```

- [ ] **Step 2: Export from the services barrel**

In `apps/api/src/services.ts`, add after the existing exports:

```typescript
export { createLlmAdapter, MockLlmAdapter, OpenAiAdapter, LlmAdapterError, type LlmAdapter } from "./adapters/llm";
export { createAiServices, type AiServices } from "./services/ai";
export { AlternativeAdvisorService } from "./modules/ai/alternative-advisor.service";
```

- [ ] **Step 3: Verify typecheck**

Run: `pnpm --filter @reclaimr/api typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/services/ai.ts apps/api/src/services.ts
git commit -m "feat(api): add createAiServices composition root and barrel exports"
```

---

### Task 12: requirePremium preHandler

**Files:**
- Modify: `apps/api/src/plugins/auth.ts`

- [ ] **Step 1: Add the premium guard**

In `apps/api/src/plugins/auth.ts`, add `requirePremium` to the `FastifyInstance` declaration (after `requireAdmin`):

```typescript
    /**
     * Route guard for premium features. Passes when the member has an active
     * or trialing PremiumSubscription; otherwise throws 403 PREMIUM_REQUIRED.
     * Must run after requireAuth (depends on request.user).
     */
    requirePremium: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
```

Inside the plugin body, after the `requireAdmin` decoration:

```typescript
    app.decorate("requirePremium", async (request: FastifyRequest) => {
      const userId = request.user?.sub;
      if (!userId) throw unauthorized("Authentication required");
      const premium = await app.prisma.premiumSubscription.findFirst({
        where: { userId, status: { in: ["trialing", "active"] } },
      });
      if (!premium) {
        throw forbidden("This feature requires a premium subscription", "PREMIUM_REQUIRED");
      }
    });
```

- [ ] **Step 2: Verify typecheck**

Run: `pnpm --filter @reclaimr/api typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/plugins/auth.ts
git commit -m "feat(api): add requirePremium route guard"
```

---

### Task 13: AI suggestions route

**Files:**
- Create: `apps/api/src/modules/ai/routes.ts`
- Modify: `apps/api/src/app.ts`
- Test: `apps/api/test/routes/ai-routes.test.ts`

- [ ] **Step 1: Write the failing route smoke test**

```typescript
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";
process.env.JWT_ACCESS_SECRET ??= "test-secret-that-is-at-least-32-characters-long";

let app: FastifyInstance;

beforeAll(async () => {
  const { buildApp } = await import("../../src/app");
  app = await buildApp({ logger: false });
});

afterAll(async () => {
  await app.close();
});

describe("AI suggestion endpoints require authentication", () => {
  it("GET /api/v1/subscriptions/:id/suggestions → 401 without a token", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/subscriptions/0b9a6c8e-6f2a-4d4e-9d3a-2f5e8a1c7b33/suggestions",
    });
    expect(response.statusCode).toBe(401);
    expect(response.json().error).toBe("Unauthorized");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @reclaimr/api test -- ai-routes`
Expected: FAIL — 404 (route not registered)

- [ ] **Step 3: Create the route module**

```typescript
import type { FastifyPluginAsync, FastifyReply } from "fastify";
import { idParamSchema, type ApiErrorResponse } from "@reclaimr/shared";
import type { AiServices } from "../../services/ai";

function notFound(reply: FastifyReply): FastifyReply {
  const payload: ApiErrorResponse = { error: "Not Found", message: "Subscription not found" };
  return reply.code(404).send(payload);
}

/** AI suggestion read endpoints. Suggestions are generated by the worker;
 *  these routes only read the cache. */
export const aiRoutes: FastifyPluginAsync<{ ai: AiServices }> = async (app, options) => {
  const { advisor } = options.ai;

  app.get(
    "/subscriptions/:id/suggestions",
    { preHandler: app.requireAuth },
    async (request, reply) => {
      const { id } = idParamSchema.parse(request.params);
      const userId = request.user!.sub;

      // Confirm ownership so we never leak another member's suggestion.
      const owned = await app.prisma.subscription.findFirst({ where: { id, userId } });
      if (!owned) return notFound(reply);

      const suggestion = await advisor.getForSubscription(userId, id);
      return reply.send({
        data: suggestion
          ? {
              id: suggestion.id,
              kind: suggestion.kind,
              subjectType: suggestion.subjectType,
              subjectId: suggestion.subjectId,
              content: suggestion.content,
              summary: suggestion.summary,
              model: suggestion.model,
              createdAt: suggestion.createdAt.toISOString(),
              updatedAt: suggestion.updatedAt.toISOString(),
            }
          : null,
      });
    },
  );
};
```

- [ ] **Step 4: Register the route and build AI services in app.ts**

In `apps/api/src/app.ts`, add the import near the other route imports:

```typescript
import { aiRoutes } from "./modules/ai/routes";
import { createAiServices } from "./services/ai";
```

After the `const banking = createBankingServices(...)` block, add:

```typescript
  const ai = createAiServices(app.prisma, config, { queue: app.queue });
  await app.register(aiRoutes, { prefix: API_PREFIX, ai });
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @reclaimr/api test -- ai-routes`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/ai/routes.ts apps/api/src/app.ts apps/api/test/routes/ai-routes.test.ts
git commit -m "feat(api): add GET /subscriptions/:id/suggestions endpoint"
```

---

### Task 14: Worker processor + wiring

**Files:**
- Create: `apps/worker/src/processors/ai-generate.processor.ts`
- Modify: `apps/worker/src/index.ts`

- [ ] **Step 1: Create the processor**

```typescript
import type { Processor } from "bullmq";
import type { AiServices } from "@reclaimr/api/services";
import { aiGenerateJobSchema } from "@reclaimr/queue";

/**
 * Generate/refresh one cached AI suggestion. Dispatches on `kind`; v1
 * handles alternative_advice. Later phases add the remaining kinds here.
 */
export function aiGenerateProcessor(ai: AiServices): Processor {
  return async (job) => {
    const { userId, kind, subjectId } = aiGenerateJobSchema.parse(job.data);

    if (kind === "alternative_advice") {
      const result = await ai.advisor.generateForSubscription(userId, subjectId);
      job.log(`alternative_advice for ${subjectId}: ${result ? "generated" : "skipped"}`);
      return { kind, generated: result !== null };
    }

    job.log(`ai.generate: unhandled kind "${kind}" — skipped`);
    return { kind, generated: false };
  };
}
```

- [ ] **Step 2: Wire the processor into the worker**

In `apps/worker/src/index.ts`, add the import:

```typescript
import { createAiServices } from "@reclaimr/api/services";
import { aiGenerateProcessor } from "./processors/ai-generate.processor";
```

After `const banking = createBankingServices(...)`, add:

```typescript
  const ai = createAiServices(prisma, config, { queue: producer });
```

Add to the `processors` record:

```typescript
    [QUEUE_NAMES.aiGenerate]: aiGenerateProcessor(ai),
```

- [ ] **Step 3: Verify typecheck**

Run: `pnpm --filter @reclaimr/worker typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/worker/src/processors/ai-generate.processor.ts apps/worker/src/index.ts
git commit -m "feat(worker): add ai.generate processor and register the queue"
```

---

### Task 15: Enqueue AI generation after detection

**Files:**
- Modify: `apps/api/src/modules/detection/sync-pipeline.ts`

- [ ] **Step 1: Extend the pipeline to enqueue advisor jobs**

The pipeline needs access to the queue and a way to find which subscriptions to advise. Update the `SyncPipelineDeps` interface and `runForItem`:

Replace the `SyncPipelineDeps` interface and `runForItem` method with:

```typescript
export interface SyncPipelineDeps {
  /** Null when Redis/BullMQ is not configured — everything then runs inline. */
  queue: JobProducer | null;
  syncTransactions: { syncItem(plaidItemId: string, now?: Date): Promise<SyncResult> };
  detectSubscriptions: { runForUser(userId: string, now?: Date): Promise<unknown> };
  detectBills: { runForUser(userId: string, now?: Date): Promise<unknown> };
  evaluateAlerts: { evaluateUser(userId: string, now?: Date): Promise<number> };
  /** Loads active auto-detected subscription ids for advisor fan-out. */
  listAdvisorTargets?: { (userId: string): Promise<string[]> };
  /** True when a real LLM is configured; skips AI jobs otherwise. */
  llmEnabled?: boolean;
}
```

In `runForItem`, after the inline detection/alert calls (inside the `else` branch) and after the queued `queue.add` (inside the `if` branch), add advisor fan-out. Replace the whole `runForItem` body:

```typescript
  async runForItem(
    userId: string,
    plaidItemId: string,
  ): Promise<{ mode: "queued" | "inline"; sync: SyncResult | null }> {
    if (this.deps.queue) {
      await this.deps.queue.add(QUEUE_NAMES.plaidSync, { userId, plaidItemId });
      // Advisor fan-out is enqueued by the worker after detection completes;
      // here we only ensure the queue import stays the single producer path.
      return { mode: "queued", sync: null };
    }

    const sync = await this.deps.syncTransactions.syncItem(plaidItemId);
    await this.deps.detectSubscriptions.runForUser(userId);
    await this.deps.detectBills.runForUser(userId);
    await this.deps.evaluateAlerts.evaluateUser(userId);

    // Inline mode: run the advisor directly for each active subscription so
    // local dev (no Redis) still populates suggestions.
    if (this.deps.llmEnabled && this.deps.listAdvisorTargets && this.deps.advisor) {
      const targets = await this.deps.listAdvisorTargets(userId);
      for (const subscriptionId of targets) {
        await this.deps.advisor.generateForSubscription(userId, subscriptionId);
      }
    }

    return { mode: "inline", sync };
  }
```

Add to the `SyncPipelineDeps` interface:

```typescript
  /** Generates advisor suggestions inline (no-Redis dev path). */
  advisor?: { generateForSubscription(userId: string, subscriptionId: string): Promise<unknown> };
```

- [ ] **Step 2: Wire the new deps in createBankingServices**

In `apps/api/src/services/banking.ts`, the `SyncPipeline` construction needs the new optional deps. This requires passing the AI advisor and an LLM flag. Update `createBankingServices` signature to accept an optional `advisor`:

Add to the `options` parameter type: `advisor?: { generateForSubscription(userId: string, subscriptionId: string): Promise<unknown> }; llmEnabled?: boolean;`

Update the `syncPipeline` construction:

```typescript
    syncPipeline: new SyncPipeline({
      queue,
      syncTransactions: transactionSync,
      detectSubscriptions: subscriptionDetection,
      detectBills: billDetection,
      evaluateAlerts: alerts,
      llmEnabled: options.llmEnabled ?? false,
      advisor: options.advisor,
      listAdvisorTargets: async (uid: string) => {
        const rows = await prisma.subscription.findMany({
          where: { userId: uid, status: "active", source: "auto" },
          select: { id: true },
        });
        return rows.map((r) => r.id);
      },
    }),
```

- [ ] **Step 3: Pass the advisor from app.ts**

In `apps/api/src/app.ts`, update the `createBankingServices` call to pass the advisor and LLM flag. Import `llmEnabled` from `./env`:

```typescript
import { corsOrigin, env, llmEnabled } from "./env";
```

Build AI services before banking so the advisor is available, then pass it in:

```typescript
  const ai = createAiServices(app.prisma, config, { queue: app.queue });
  const banking = createBankingServices(app.prisma, config, {
    queue: app.queue,
    advisor: ai.advisor,
    llmEnabled: llmEnabled(config),
  });
```

(Move the existing `const banking = ...` line accordingly and remove the duplicate `ai` construction added in Task 13 — reuse this one.)

- [ ] **Step 4: Verify typecheck + tests**

Run: `pnpm --filter @reclaimr/api typecheck && pnpm --filter @reclaimr/api test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/detection/sync-pipeline.ts apps/api/src/services/banking.ts apps/api/src/app.ts
git commit -m "feat(api): fan out alternative-advisor generation after detection"
```

---

### Task 16: Seed alternatives catalog

**Files:**
- Modify: `apps/api/prisma/seed.ts`

- [ ] **Step 1: Add catalog seeding**

In `apps/api/prisma/seed.ts`, add before the final `console.log` and after the subscription seeding. First add a helper at the top of `main()` scope, then the seed block:

```typescript
  // Re-seed the alternatives catalog idempotently (global, not user-scoped).
  await prisma.alternativeOption.deleteMany({});
  await prisma.alternativeOption.createMany({
    data: [
      // Streaming
      { category: "entertainment", name: "StreamLite Basic", monthlyPriceCents: 999, highlights: ["Same core library", "HD streaming"], tradeoffs: ["No 4K", "One screen"], replaces: ["streaming plus", "netflix"] },
      { category: "entertainment", name: "AdView Plus", monthlyPriceCents: 699, highlights: ["Ad-supported", "Full library"], tradeoffs: ["Ads during shows"], replaces: ["streaming plus", "netflix"] },
      // Music
      { category: "entertainment", name: "TunePass Solo", monthlyPriceCents: 1099, highlights: ["Full catalog", "Offline listening"], tradeoffs: ["Single account"], replaces: ["music family plan", "spotify"] },
      // Cloud storage
      { category: "other", name: "VaultDrive 1TB", monthlyPriceCents: 499, highlights: ["Half the storage at half the price"], tradeoffs: ["1TB instead of 2TB"], replaces: ["cloud storage"] },
      // Fitness
      { category: "fitness", name: "HomeFit App", monthlyPriceCents: 1299, highlights: ["Guided workouts", "No contract"], tradeoffs: ["No gym access"], replaces: ["fitness club", "planet fitness"] },
      // Design
      { category: "other", name: "PixelSuite", monthlyPriceCents: 2999, highlights: ["Comparable toolset"], tradeoffs: ["Smaller plugin ecosystem"], replaces: ["design suite", "adobe"] },
    ],
  });
```

Update the final `console.log` to mention the catalog:

```typescript
  console.log(`Seeded demo user ${DEMO_EMAIL} (password: ${DEMO_PASSWORD}) with 6 subscriptions and the alternatives catalog.`);
```

- [ ] **Step 2: Run the seed against the local DB to verify**

Run: `pnpm db:up && pnpm db:migrate && pnpm db:seed`
Expected: seed completes without error, logs the new message.

- [ ] **Step 3: Commit**

```bash
git add apps/api/prisma/seed.ts
git commit -m "feat(db): seed alternatives catalog for the advisor"
```

---

### Task 17: Web — fetch suggestions + demo fixtures

**Files:**
- Modify: `apps/web/src/lib/api.ts`
- Modify: `apps/web/src/lib/demo.ts`
- Modify: `apps/web/src/lib/data.ts`

- [ ] **Step 1: Add the fetch helper**

In `apps/web/src/lib/api.ts`, add the import and function. Add `type SubscriptionSuggestionsResponse` to the `@reclaimr/shared` import, then:

```typescript
/** Fetches cached alternative suggestions; null when unreachable or absent. */
export async function fetchSubscriptionSuggestions(
  id: string,
): Promise<SubscriptionSuggestionsResponse | null> {
  const json = await apiFetch(API_ROUTES.ai.suggestionsForSubscription(id));
  if (!json || typeof json !== "object" || !("data" in json)) return null;
  return json as SubscriptionSuggestionsResponse;
}
```

- [ ] **Step 2: Add demo suggestion fixtures**

In `apps/web/src/lib/demo.ts`, add the import at the top:

```typescript
import type { AlternativeAdviceContent } from "@reclaimr/shared";
```

Add after `UNUSED_SUBSCRIPTION_IDS`:

```typescript
/** Demo alternative-advice content keyed by demo subscription seed. */
export const DEMO_SUGGESTIONS: Record<string, AlternativeAdviceContent> = {
  streaming: {
    picks: [
      { optionId: null, name: "StreamLite Basic", monthlyPriceCents: 999, monthlySavingsCents: 600, rationale: "Same core library at a lower tier." },
      { optionId: null, name: "AdView Plus", monthlyPriceCents: 699, monthlySavingsCents: 900, rationale: "Ad-supported plan cuts the price nearly in half." },
    ],
    verdict: "Switching to a lower tier saves the most with the least disruption.",
  },
  music: {
    picks: [
      { optionId: null, name: "TunePass Solo", monthlyPriceCents: 1099, monthlySavingsCents: 600, rationale: "Solo plan covers one listener at a lower price." },
    ],
    verdict: "A solo plan is the cheapest path if you are the only listener.",
  },
};
```

- [ ] **Step 3: Add the data-access loader**

In `apps/web/src/lib/data.ts`, add the import and loader. Add `fetchSubscriptionSuggestions` to the `./api` import and `DEMO_SUGGESTIONS` to the `./demo` import. Add `type AlternativeAdviceContent` to the `@reclaimr/shared` import. Then:

```typescript
export interface SuggestionsResult {
  content: AlternativeAdviceContent;
  source: DataSource;
}

/** Loads alternative suggestions; falls back to demo fixtures by seed name. */
export async function loadSuggestions(
  subscriptionId: string,
  demoSeed?: string,
): Promise<SuggestionsResult | null> {
  const response = await fetchSubscriptionSuggestions(subscriptionId);
  if (response?.data && response.data.content) {
    return { content: response.data.content as AlternativeAdviceContent, source: "live" };
  }
  if (demoSeed && DEMO_SUGGESTIONS[demoSeed]) {
    return { content: DEMO_SUGGESTIONS[demoSeed], source: "demo" };
  }
  return null;
}
```

- [ ] **Step 4: Verify typecheck**

Run: `pnpm --filter @reclaimr/web typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/api.ts apps/web/src/lib/demo.ts apps/web/src/lib/data.ts
git commit -m "feat(web): add suggestions fetch, demo fixtures, and data loader"
```

---

### Task 18: Web — "Better options" card on detail page

**Files:**
- Create: `apps/web/src/components/dashboard/better-options-card.tsx`
- Modify: `apps/web/src/app/dashboard/subscriptions/[id]/page.tsx`

- [ ] **Step 1: Create the card component**

```tsx
import { Badge, Card, CardSection } from "@reclaimr/ui";
import type { AlternativeAdviceContent } from "@reclaimr/shared";
import { formatMoney } from "@/lib/format";

interface BetterOptionsCardProps {
  content: AlternativeAdviceContent;
  currency: string;
}

/** Ranked cheaper/better alternatives for one subscription. Monochrome:
 *  savings are conveyed with bold type and a badge, never color. */
export function BetterOptionsCard({ content, currency }: BetterOptionsCardProps) {
  if (content.picks.length === 0) return null;

  return (
    <Card>
      <CardSection
        title="Better options"
        description="Cheaper or better-value alternatives for this subscription."
      />
      <ul className="flex flex-col gap-3">
        {content.picks.map((pick) => (
          <li
            key={pick.name}
            className="flex items-start justify-between gap-3 rounded-md border p-3"
          >
            <div className="flex flex-col gap-1">
              <span className="text-sm font-semibold">{pick.name}</span>
              <span className="text-xs text-muted-foreground">{pick.rationale}</span>
            </div>
            <div className="flex flex-col items-end gap-1">
              <span className="font-mono text-sm font-semibold tabular-nums">
                {formatMoney(pick.monthlyPriceCents, currency)}
              </span>
              {pick.monthlySavingsCents > 0 ? (
                <Badge variant="outline">
                  Save {formatMoney(pick.monthlySavingsCents, currency)}/mo
                </Badge>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
      {content.verdict ? (
        <p className="text-xs text-subtle-foreground">{content.verdict}</p>
      ) : null}
    </Card>
  );
}
```

- [ ] **Step 2: Render the card on the detail page**

In `apps/web/src/app/dashboard/subscriptions/[id]/page.tsx`:

Add imports:

```tsx
import { BetterOptionsCard } from "@/components/dashboard/better-options-card";
import { loadSuggestions } from "@/lib/data";
```

Map subscription name → demo seed. Add a helper near the top of the file (after the imports):

```tsx
const DEMO_SEED_BY_NAME: Record<string, string> = {
  "Streaming Plus": "streaming",
  "Music Family Plan": "music",
};
```

Inside the component, after `const result = await loadSubscription(id);` and the `notFound()` guard, add:

```tsx
  const suggestions = await loadSuggestions(id, DEMO_SEED_BY_NAME[subscription.name]);
```

In the side column (`<div className="flex flex-col gap-4">`), insert the card as the first child, before the `unusedReason` conditional:

```tsx
          {suggestions ? (
            <BetterOptionsCard content={suggestions.content} currency={subscription.currency} />
          ) : null}
```

- [ ] **Step 3: Verify typecheck + build**

Run: `pnpm --filter @reclaimr/web typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/dashboard/better-options-card.tsx apps/web/src/app/dashboard/subscriptions/[id]/page.tsx
git commit -m "feat(web): add Better options card to subscription detail"
```

---

### Task 19: Web — savings badge on list rows

**Files:**
- Modify: `apps/web/src/app/dashboard/subscriptions/page.tsx`

- [ ] **Step 1: Add a "Savings available" badge to rows with demo suggestions**

In `apps/web/src/app/dashboard/subscriptions/page.tsx`, add the import:

```tsx
import { DEMO_SUGGESTIONS } from "@/lib/demo";
```

Add a name→seed map (same as detail page) near the top:

```tsx
const DEMO_SEED_BY_NAME: Record<string, string> = {
  "Streaming Plus": "streaming",
  "Music Family Plan": "music",
};
```

In the Merchant `<TableCell>`, after the `<Link>` for the name, add a badge when a suggestion exists:

```tsx
                  <TableCell className="font-semibold">
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/dashboard/subscriptions/${subscription.id}`}
                        className="transition-colors hover:underline"
                      >
                        {subscription.name}
                      </Link>
                      {DEMO_SEED_BY_NAME[subscription.name] &&
                      DEMO_SUGGESTIONS[DEMO_SEED_BY_NAME[subscription.name]] ? (
                        <Badge variant="outline">Cheaper option</Badge>
                      ) : null}
                    </div>
                  </TableCell>
```

- [ ] **Step 2: Verify typecheck**

Run: `pnpm --filter @reclaimr/web typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/dashboard/subscriptions/page.tsx
git commit -m "feat(web): add cheaper-option badge to subscription list rows"
```

---

### Task 20: Full verification

- [ ] **Step 1: Run the full quality gate across the workspace**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: all PASS across `@reclaimr/shared`, `@reclaimr/queue`, `@reclaimr/core`, `@reclaimr/api`, `@reclaimr/worker`, `@reclaimr/web`.

- [ ] **Step 2: Smoke-test the running stack**

Run: `pnpm db:up && pnpm db:migrate && pnpm db:seed && pnpm dev`

In another terminal, verify:
- `curl http://localhost:3001/health` → 200
- Log in as the demo user, then `curl -H "Authorization: Bearer <token>" http://localhost:3001/api/v1/subscriptions/<id>/suggestions` → `{ "data": null }` (no generation yet without Redis) or a suggestion object (with Redis + worker running).
- Open `http://localhost:3000/dashboard/subscriptions` → "Cheaper option" badges appear on Streaming Plus and Music Family Plan.
- Open a subscription detail → "Better options" card renders with demo fixtures.

- [ ] **Step 3: Final commit (if any fixups were needed)**

```bash
git add -A
git commit -m "chore: verification fixups for AI platform + alternative advisor"
```

---

## Self-Review Notes

- **Spec coverage:** Platform (adapter §3.1, prompts §3.2, storage §3.3, queue §3.4, composition §3.5, worker §3.6, gating §3.7) and Alternative Advisor (§4.1) are all covered. Alert reasoning, digest, cancellation, negotiation, and chat are deferred to follow-up plans per the phasing in §9.
- **Type consistency:** `AiSuggestionKind` enum values are identical across Prisma, `packages/queue` job schema, and `packages/shared` wire schema. `AlternativeAdviceContent.picks[].monthlySavingsCents` is always computed server-side.
- **Tenancy:** every read/write is `userId`-scoped; the route re-checks ownership before returning a suggestion.
- **No live LLM in tests:** all tests use `MockLlmAdapter`; route smoke tests only assert the auth guard (no DB/Redis needed).
