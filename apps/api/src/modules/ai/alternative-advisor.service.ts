import type { PrismaClient } from "@prisma/client";
import { monthlyEquivalentCents, normalizeMerchant } from "@reclaimr/core";
import { QUEUE_NAMES, type JobProducer } from "@reclaimr/queue";
import type { AiSuggestion, AlternativeAdviceContent, AlternativePick } from "@reclaimr/shared";
import type { LlmAdapter } from "../../adapters/llm/types";
import { toAiSuggestion } from "./mapper";
import { alternativeAdvisorPrompt } from "./prompts/alternative-advisor";

/** Statuses worth advising on — a canceled subscription needs no alternative. */
const ADVISABLE_STATUSES = ["active", "paused"] as const;

/** Never surface more than this many options to a member at once. */
const MAX_PICKS = 3;

/** What the model is allowed to return. Anything else is discarded. */
interface AdvisorModelOutput {
  picks?: Array<{ optionId?: unknown; rationale?: unknown }>;
  verdict?: unknown;
}

/**
 * Alternative advisor.
 *
 * For one subscription: find catalog options that can replace it, ask the
 * model to rank them, then persist a cached suggestion. The model contributes
 * ordering and prose only — every cent shown to a member is recomputed here
 * from `AlternativeOption.monthlyPriceCents`, so a hallucinated price cannot
 * reach the UI.
 *
 * Idempotent: the cache row is keyed uniquely on (kind, subjectId), so
 * re-running refreshes in place instead of duplicating.
 */
export class AlternativeAdvisorService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly llm: LlmAdapter,
    /** Null when Redis is absent; fan-out then runs inline via the pipeline. */
    private readonly queue: JobProducer | null = null,
  ) {}

  /** Generate (or refresh) advice for one subscription. Null when there is
   *  nothing to say: unknown subscription, no matching catalog entry, or no
   *  option that actually saves money. */
  async generateForSubscription(
    userId: string,
    subscriptionId: string,
  ): Promise<AiSuggestion | null> {
    const subscription = await this.prisma.subscription.findFirst({
      where: { id: subscriptionId, userId },
      include: { merchant: { select: { normalizedKey: true, category: true } } },
    });
    if (!subscription) return null;

    const options = await this.matchingOptions(
      // Detected subscriptions carry a merchant; manually added ones do not, so
      // fall back to normalizing the member's own label with the same function
      // detection uses on statement descriptions.
      subscription.merchant?.normalizedKey ?? normalizeMerchant(subscription.name),
      subscription.merchant?.category ?? null,
    );
    if (options.length === 0) return null;

    const memberMonthlyCents = monthlyEquivalentCents(
      subscription.amountCents,
      subscription.cadence,
    );

    const { system, user } = alternativeAdvisorPrompt({
      subscriptionName: subscription.name,
      monthlyAmountCents: memberMonthlyCents,
      cadence: subscription.cadence,
      alternatives: options.map((option) => ({
        optionId: option.id,
        name: option.name,
        monthlyPriceCents: option.monthlyPriceCents,
        highlights: option.highlights,
        tradeoffs: option.tradeoffs,
      })),
    });

    const completion = await this.llm.complete({ system, user, jsonMode: true });
    const { picks, verdict } = this.buildContent(completion.content, options, memberMonthlyCents);

    // Nothing cheaper: leave the cache untouched rather than writing an empty
    // card the UI would have to special-case.
    if (picks.length === 0) return null;

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
      update: { content, summary: verdict || null, model: completion.model },
    });

    return toAiSuggestion(row);
  }

  /** Refresh advice for every advisable subscription (inline / no-Redis path).
   *  One failing subscription must not abort the rest. */
  async runForUser(userId: string): Promise<number> {
    const targets = await this.advisableSubscriptionIds(userId);
    let generated = 0;
    for (const subscriptionId of targets) {
      try {
        if (await this.generateForSubscription(userId, subscriptionId)) generated += 1;
      } catch {
        // Swallowed on purpose: advice is best-effort enrichment, never a
        // reason to fail the sync that triggered it.
      }
    }
    return generated;
  }

  /** Queue one generation job per advisable subscription (worker path). */
  async enqueueForUser(userId: string): Promise<number> {
    if (!this.queue) return 0;
    const targets = await this.advisableSubscriptionIds(userId);
    for (const subjectId of targets) {
      await this.queue.add(QUEUE_NAMES.aiGenerate, {
        userId,
        kind: "alternative_advice",
        subjectId,
      });
    }
    return targets.length;
  }

  /** Read the cached advice for one subscription. */
  async findForSubscription(userId: string, subscriptionId: string): Promise<AiSuggestion | null> {
    const row = await this.prisma.aiSuggestion.findFirst({
      where: { userId, kind: "alternative_advice", subjectId: subscriptionId },
    });
    return row ? toAiSuggestion(row) : null;
  }

  // ── internals ─────────────────────────────────────────────────────────────

  private async advisableSubscriptionIds(userId: string): Promise<string[]> {
    const rows = await this.prisma.subscription.findMany({
      where: { userId, status: { in: [...ADVISABLE_STATUSES] } },
      select: { id: true },
    });
    return rows.map((row) => row.id);
  }

  /**
   * Catalog match: a merchant-key hit is the precise signal ("netflix" →
   * options that replace Netflix); category is the fallback so a recognised
   * merchant in a known category still gets suggestions. Filtering happens in
   * memory because the catalog is reference data (tens of rows), which also
   * keeps the query free of array operators.
   */
  private async matchingOptions(matchKey: string, category: string | null) {
    const catalog = await this.prisma.alternativeOption.findMany({ where: { isActive: true } });
    const byKey = catalog.filter((option) => option.replaces.includes(matchKey));
    if (byKey.length > 0) return byKey;
    return category ? catalog.filter((option) => option.category === category) : [];
  }

  /** Parse model output into picks, recomputing every cent from the catalog. */
  private buildContent(
    raw: string,
    options: Array<{ id: string; name: string; monthlyPriceCents: number }>,
    memberMonthlyCents: number,
  ): { picks: AlternativePick[]; verdict: string } {
    let parsed: AdvisorModelOutput;
    try {
      parsed = JSON.parse(raw) as AdvisorModelOutput;
    } catch {
      // Unparseable output is treated as "no advice" rather than an error:
      // the job has already retried by the time it lands here.
      return { picks: [], verdict: "" };
    }

    const byId = new Map(options.map((option) => [option.id, option]));
    const seen = new Set<string>();
    const picks: AlternativePick[] = [];

    for (const pick of parsed.picks ?? []) {
      const optionId = typeof pick.optionId === "string" ? pick.optionId : null;
      if (!optionId || seen.has(optionId)) continue;
      const option = byId.get(optionId);
      if (!option) continue; // off-catalog hallucination
      const monthlySavingsCents = memberMonthlyCents - option.monthlyPriceCents;
      if (monthlySavingsCents <= 0) continue; // not actually cheaper

      seen.add(optionId);
      picks.push({
        optionId: option.id,
        name: option.name,
        monthlyPriceCents: option.monthlyPriceCents,
        monthlySavingsCents,
        rationale: typeof pick.rationale === "string" ? pick.rationale : "",
      });
      if (picks.length === MAX_PICKS) break;
    }

    return { picks, verdict: typeof parsed.verdict === "string" ? parsed.verdict : "" };
  }
}
