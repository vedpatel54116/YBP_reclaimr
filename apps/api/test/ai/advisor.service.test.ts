import { beforeEach, describe, expect, it } from "vitest";
import { monthlyEquivalentCents } from "@reclaimr/core";
import type { JobProducer } from "@reclaimr/queue";
import { MockLlmAdapter } from "../../src/adapters/llm/mock-adapter";
import type { LlmAdapter, LlmCompletionInput } from "../../src/adapters/llm/types";
import { AlternativeAdvisorService } from "../../src/modules/ai/alternative-advisor.service";
import { createFakePrisma, type FakePrisma } from "../support/fake-prisma";

const USER_ID = "0b9a6c8e-6f2a-4d4e-9d3a-2f5e8a1c7b33";
const OTHER_USER_ID = "9c9a6c8e-6f2a-4d4e-9d3a-2f5e8a1c7b99";
const SUBSCRIPTION_ID = "1b9a6c8e-6f2a-4d4e-9d3a-2f5e8a1c7b33";
const MERCHANT_ID = "3b9a6c8e-6f2a-4d4e-9d3a-2f5e8a1c7b33";
const CHEAP_OPTION_ID = "2b9a6c8e-6f2a-4d4e-9d3a-2f5e8a1c7b33";
const PRICEY_OPTION_ID = "4b9a6c8e-6f2a-4d4e-9d3a-2f5e8a1c7b33";

/** Records what was enqueued without touching Redis. */
function createFakeQueue() {
  const jobs: Array<{ name: string; payload: unknown }> = [];
  const queue = {
    jobs,
    add: async (name: string, payload: unknown) => {
      jobs.push({ name, payload });
      return `job-${jobs.length}`;
    },
  };
  return queue as unknown as JobProducer & { jobs: typeof jobs };
}

/** Returns fixed model output and counts invocations. */
function createScriptedLlm(content: string) {
  const calls: LlmCompletionInput[] = [];
  const adapter: LlmAdapter = {
    complete: async (input) => {
      calls.push(input);
      return { content, model: "scripted" };
    },
    stream: async function* () {
      yield content;
    },
  };
  return { adapter, calls };
}

describe("AlternativeAdvisorService", () => {
  let db: FakePrisma;
  let service: AlternativeAdvisorService;

  /** Streaming Plus at $15.99/mo, merchant key "streaming plus". */
  async function seedSubscription(overrides: Record<string, unknown> = {}) {
    await db.merchant.create({
      data: {
        id: MERCHANT_ID,
        canonicalName: "Streaming Plus",
        normalizedKey: "streaming plus",
        category: "entertainment",
      },
    });
    await db.subscription.create({
      data: {
        id: SUBSCRIPTION_ID,
        userId: USER_ID,
        merchantId: MERCHANT_ID,
        name: "Streaming Plus",
        amountCents: 1599,
        cadence: "monthly",
        nextBillingDate: new Date("2026-09-01"),
        ...overrides,
      },
    });
  }

  async function seedCatalog() {
    await db.alternativeOption.create({
      data: {
        id: CHEAP_OPTION_ID,
        category: "entertainment",
        name: "StreamLite Basic",
        monthlyPriceCents: 999,
        replaces: ["streaming plus"],
      },
    });
    await db.alternativeOption.create({
      data: {
        id: PRICEY_OPTION_ID,
        category: "entertainment",
        name: "Premium Everything",
        monthlyPriceCents: 2499,
        replaces: ["streaming plus"],
      },
    });
  }

  beforeEach(async () => {
    db = createFakePrisma();
    service = new AlternativeAdvisorService(db.asPrisma(), new MockLlmAdapter());
    await db.user.create({ data: { id: USER_ID, email: "member@example.com", passwordHash: "x" } });
  });

  it("computes savings from the catalog price, not from model output", async () => {
    await seedSubscription();
    await seedCatalog();

    const suggestion = await service.generateForSubscription(USER_ID, SUBSCRIPTION_ID);

    expect(suggestion).not.toBeNull();
    const content = suggestion!.content as {
      picks: Array<{ optionId: string; monthlyPriceCents: number; monthlySavingsCents: number }>;
    };
    const expected = monthlyEquivalentCents(1599, "monthly") - 999;
    expect(content.picks[0]!.optionId).toBe(CHEAP_OPTION_ID);
    expect(content.picks[0]!.monthlySavingsCents).toBe(expected);
  });

  it("drops options that are not actually cheaper", async () => {
    await seedSubscription();
    await seedCatalog();

    const suggestion = await service.generateForSubscription(USER_ID, SUBSCRIPTION_ID);
    const content = suggestion!.content as { picks: Array<{ optionId: string }> };
    expect(content.picks.map((pick) => pick.optionId)).not.toContain(PRICEY_OPTION_ID);
  });

  it("discards picks referencing options outside the catalog", async () => {
    await seedSubscription();
    await seedCatalog();
    const { adapter } = createScriptedLlm(
      JSON.stringify({
        picks: [{ optionId: "ffffffff-0000-4000-8000-000000000000", rationale: "made up" }],
        verdict: "hallucinated",
      }),
    );
    const scripted = new AlternativeAdvisorService(db.asPrisma(), adapter);

    expect(await scripted.generateForSubscription(USER_ID, SUBSCRIPTION_ID)).toBeNull();
    expect(await db.aiSuggestion.count({})).toBe(0);
  });

  it("treats unparseable model output as no advice", async () => {
    await seedSubscription();
    await seedCatalog();
    const { adapter } = createScriptedLlm("not json at all");
    const scripted = new AlternativeAdvisorService(db.asPrisma(), adapter);

    expect(await scripted.generateForSubscription(USER_ID, SUBSCRIPTION_ID)).toBeNull();
  });

  it("skips the model entirely when no catalog option matches", async () => {
    await seedSubscription();
    const { adapter, calls } = createScriptedLlm("{}");
    const scripted = new AlternativeAdvisorService(db.asPrisma(), adapter);

    expect(await scripted.generateForSubscription(USER_ID, SUBSCRIPTION_ID)).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it("falls back to category matching when no merchant key matches", async () => {
    await seedSubscription();
    await db.alternativeOption.create({
      data: {
        id: CHEAP_OPTION_ID,
        category: "entertainment",
        name: "Category Match",
        monthlyPriceCents: 500,
        replaces: ["something else"],
      },
    });

    const suggestion = await service.generateForSubscription(USER_ID, SUBSCRIPTION_ID);
    const content = suggestion!.content as { picks: Array<{ name: string }> };
    expect(content.picks[0]!.name).toBe("Category Match");
  });

  it("matches on the normalized subscription name when no merchant is linked", async () => {
    // Manually added subscriptions have no merchant row, so the member's own
    // label is the only signal. Note the key is "cloud storage tb": the
    // normalizer strips the digit out of "2TB" and keeps the letters, which is
    // exactly why catalog keys must be written in normalized form.
    await db.subscription.create({
      data: {
        id: SUBSCRIPTION_ID,
        userId: USER_ID,
        name: "Cloud Storage 2TB",
        amountCents: 999,
        cadence: "monthly",
        nextBillingDate: new Date("2026-09-01"),
      },
    });
    await db.alternativeOption.create({
      data: {
        id: CHEAP_OPTION_ID,
        category: "other",
        name: "VaultDrive 1TB",
        monthlyPriceCents: 499,
        replaces: ["cloud storage tb"],
      },
    });

    const suggestion = await service.generateForSubscription(USER_ID, SUBSCRIPTION_ID);
    const content = suggestion!.content as { picks: Array<{ monthlySavingsCents: number }> };
    expect(content.picks[0]!.monthlySavingsCents).toBe(500);
  });

  it("refreshing in place never duplicates the cache row", async () => {
    await seedSubscription();
    await seedCatalog();

    await service.generateForSubscription(USER_ID, SUBSCRIPTION_ID);
    await service.generateForSubscription(USER_ID, SUBSCRIPTION_ID);

    expect(await db.aiSuggestion.count({})).toBe(1);
  });

  it("returns null for a subscription owned by another member", async () => {
    await seedSubscription();
    await seedCatalog();

    expect(await service.generateForSubscription(OTHER_USER_ID, SUBSCRIPTION_ID)).toBeNull();
  });

  it("findForSubscription reads the cache and stays member-scoped", async () => {
    await seedSubscription();
    await seedCatalog();
    await service.generateForSubscription(USER_ID, SUBSCRIPTION_ID);

    const mine = await service.findForSubscription(USER_ID, SUBSCRIPTION_ID);
    expect(mine?.kind).toBe("alternative_advice");
    expect(await service.findForSubscription(OTHER_USER_ID, SUBSCRIPTION_ID)).toBeNull();
  });

  it("findForSubscription returns null before anything is generated", async () => {
    await seedSubscription();
    expect(await service.findForSubscription(USER_ID, SUBSCRIPTION_ID)).toBeNull();
  });

  it("runForUser advises active and paused subscriptions only", async () => {
    await seedSubscription();
    await seedCatalog();
    await db.subscription.create({
      data: {
        id: "5b9a6c8e-6f2a-4d4e-9d3a-2f5e8a1c7b33",
        userId: USER_ID,
        merchantId: MERCHANT_ID,
        name: "Streaming Plus (canceled)",
        amountCents: 1599,
        cadence: "monthly",
        status: "canceled",
        nextBillingDate: new Date("2026-09-01"),
      },
    });

    expect(await service.runForUser(USER_ID)).toBe(1);
  });

  it("enqueueForUser queues one job per advisable subscription", async () => {
    await seedSubscription();
    await seedCatalog();
    const queue = createFakeQueue();
    const queued = new AlternativeAdvisorService(db.asPrisma(), new MockLlmAdapter(), queue);

    expect(await queued.enqueueForUser(USER_ID)).toBe(1);
    expect(queue.jobs).toEqual([
      {
        name: "ai.generate",
        payload: { userId: USER_ID, kind: "alternative_advice", subjectId: SUBSCRIPTION_ID },
      },
    ]);
  });

  it("enqueueForUser is a no-op without a queue", async () => {
    await seedSubscription();
    expect(await service.enqueueForUser(USER_ID)).toBe(0);
  });
});
