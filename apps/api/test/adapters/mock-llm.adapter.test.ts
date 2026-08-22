import { describe, expect, it } from "vitest";
import { MockLlmAdapter } from "../../src/adapters/llm/mock-adapter";

const ADVISOR_SYSTEM = "[feature:alternative_advice] Rank the alternatives.";

const ADVISOR_USER = `Current subscription:
  name="Streaming Plus"
  monthlyAmountCents=1599
  cadence=monthly

Curated alternatives:
- optionId=aaaaaaaa-0000-4000-8000-000000000001 name="Mid Tier" monthlyPriceCents=1199
- optionId=aaaaaaaa-0000-4000-8000-000000000002 name="Budget Tier" monthlyPriceCents=699
- optionId=aaaaaaaa-0000-4000-8000-000000000003 name="Top Tier" monthlyPriceCents=1499`;

interface AdvisorFixture {
  picks: Array<{ optionId: string; rationale: string }>;
  verdict: string;
}

describe("MockLlmAdapter", () => {
  const adapter = new MockLlmAdapter();

  it("ranks the cheapest catalog options first, using real option ids", async () => {
    const result = await adapter.complete({
      system: ADVISOR_SYSTEM,
      user: ADVISOR_USER,
      jsonMode: true,
    });

    expect(result.model).toBe("mock");
    const parsed = JSON.parse(result.content) as AdvisorFixture;
    expect(parsed.picks.map((pick) => pick.optionId)).toEqual([
      "aaaaaaaa-0000-4000-8000-000000000002",
      "aaaaaaaa-0000-4000-8000-000000000001",
    ]);
    expect(parsed.verdict).toBeTruthy();
  });

  it("returns byte-identical content for identical input", async () => {
    const input = { system: ADVISOR_SYSTEM, user: ADVISOR_USER };
    const first = await adapter.complete(input);
    const second = await adapter.complete(input);
    expect(first.content).toBe(second.content);
  });

  it("returns no picks when the catalog section is empty", async () => {
    const result = await adapter.complete({
      system: ADVISOR_SYSTEM,
      user: "Curated alternatives:\n(none available)",
    });
    const parsed = JSON.parse(result.content) as AdvisorFixture;
    expect(parsed.picks).toEqual([]);
  });

  it("streams the full completion in multiple chunks", async () => {
    const chunks: string[] = [];
    for await (const chunk of adapter.stream({ system: ADVISOR_SYSTEM, user: ADVISOR_USER })) {
      chunks.push(chunk);
    }
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.join("")).toContain("picks");
  });

  it("falls back to a generic response for an unknown feature", async () => {
    const result = await adapter.complete({ system: "no marker here", user: "hello" });
    expect(JSON.parse(result.content)).toEqual({ ok: true, note: "mock response" });
  });
});
