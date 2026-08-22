import type { BillingCadence } from "@reclaimr/shared";

/**
 * Prompt builder for the alternative advisor. Pure: all domain data is passed
 * in, so the output is deterministic and unit-testable, exactly like the
 * detection engine in @reclaimr/core.
 *
 * Two rules are encoded in the prompt itself:
 *  1. The model ranks and explains; it must not invent options or prices.
 *     Savings are recomputed server-side from the catalog regardless.
 *  2. No member PII (email, account mask, transaction ids) is ever included —
 *     only the subscription's public name and its price.
 *
 * The `[feature:alternative_advice]` marker lets MockLlmAdapter route to its
 * fixture, which is how dev and CI run without an API key.
 */

export const ALTERNATIVE_ADVICE_MARKER = "[feature:alternative_advice]" as const;

export interface AlternativeAdvisorPromptInput {
  subscriptionName: string;
  /** The member's cost normalized to a month, in integer cents. */
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

export function alternativeAdvisorPrompt(input: AlternativeAdvisorPromptInput): {
  system: string;
  user: string;
} {
  const system = `${ALTERNATIVE_ADVICE_MARKER}
You are a subscription advisor for a personal-finance app. You receive a
member's current subscription and a curated list of alternatives. Rank only
the alternatives that genuinely save money or improve value.

Respond with ONLY a JSON object of this shape:
{"picks":[{"optionId":"<id from the list>","rationale":"<one sentence>"}],"verdict":"<one sentence>"}

Rules:
- At most 3 picks, best first.
- Only use optionId values from the provided list. Never invent an option.
- Never state a price; prices are computed by the application.
- Keep each rationale under 140 characters, plain and concrete.`;

  const alternativeLines = input.alternatives
    .map((option) => {
      const highlights = option.highlights.length
        ? ` highlights=[${option.highlights.join("; ")}]`
        : "";
      const tradeoffs = option.tradeoffs.length
        ? ` tradeoffs=[${option.tradeoffs.join("; ")}]`
        : "";
      return `- optionId=${option.optionId} name="${option.name}" monthlyPriceCents=${option.monthlyPriceCents}${highlights}${tradeoffs}`;
    })
    .join("\n");

  const user = `Current subscription:
  name="${input.subscriptionName}"
  monthlyAmountCents=${input.monthlyAmountCents}
  cadence=${input.cadence}

Curated alternatives:
${alternativeLines || "(none available)"}`;

  return { system, user };
}
