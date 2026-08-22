import { describe, expect, it } from "vitest";
import {
  ALTERNATIVE_ADVICE_MARKER,
  alternativeAdvisorPrompt,
} from "../../src/modules/ai/prompts/alternative-advisor";

const OPTION_ID = "2b9a6c8e-6f2a-4d4e-9d3a-2f5e8a1c7b33";

const input = {
  subscriptionName: "Streaming Plus",
  monthlyAmountCents: 1599,
  cadence: "monthly" as const,
  alternatives: [
    {
      optionId: OPTION_ID,
      name: "StreamLite Basic",
      monthlyPriceCents: 999,
      highlights: ["Same core library"],
      tradeoffs: ["No 4K"],
    },
  ],
};

describe("alternativeAdvisorPrompt", () => {
  it("embeds the feature marker so the mock adapter can route", () => {
    expect(alternativeAdvisorPrompt(input).system).toContain(ALTERNATIVE_ADVICE_MARKER);
  });

  it("asks for JSON output with an optionId-keyed pick list", () => {
    const { system } = alternativeAdvisorPrompt(input);
    expect(system).toContain("JSON");
    expect(system).toContain("optionId");
  });

  it("forbids inventing options and quoting prices", () => {
    const { system } = alternativeAdvisorPrompt(input);
    expect(system).toContain("Never invent an option");
    expect(system).toContain("Never state a price");
  });

  it("includes the member's subscription name, monthly cents, and cadence", () => {
    const { user } = alternativeAdvisorPrompt(input);
    expect(user).toContain("Streaming Plus");
    expect(user).toContain("monthlyAmountCents=1599");
    expect(user).toContain("cadence=monthly");
  });

  it("includes every catalog alternative with its id and price", () => {
    const { user } = alternativeAdvisorPrompt(input);
    expect(user).toContain(`optionId=${OPTION_ID}`);
    expect(user).toContain("StreamLite Basic");
    expect(user).toContain("monthlyPriceCents=999");
    expect(user).toContain("highlights=[Same core library]");
    expect(user).toContain("tradeoffs=[No 4K]");
  });

  it("handles an empty catalog without emitting a dangling section", () => {
    const { user } = alternativeAdvisorPrompt({ ...input, alternatives: [] });
    expect(user).toContain("(none available)");
  });

  it("is deterministic for identical input", () => {
    expect(alternativeAdvisorPrompt(input)).toEqual(alternativeAdvisorPrompt(input));
  });
});
