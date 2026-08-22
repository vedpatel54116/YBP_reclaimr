import type { LlmAdapter, LlmCompletionInput, LlmCompletionResult } from "./types";

/**
 * Deterministic mock LLM. Routes on the `[feature:<kind>]` marker that each
 * prompt builder embeds in its system prompt. Same input → byte-identical
 * output, so the whole AI pipeline is exercised in CI with no keys, no
 * network, and no flakiness — exactly like MockPlaidAdapter.
 *
 * The advisor fixture is generated *from the prompt* rather than hardcoded:
 * it parses the catalog lines and picks the two cheapest options. That keeps
 * it deterministic while making local development genuinely useful — the
 * ids it returns are real catalog ids, so the full generate → cache → render
 * path works without an API key.
 */

const GENERIC_FIXTURE = JSON.stringify({ ok: true, note: "mock response" });

const OPTION_LINE = /optionId=(\S+) name="([^"]+)" monthlyPriceCents=(\d+)/g;

interface ParsedOption {
  optionId: string;
  name: string;
  monthlyPriceCents: number;
}

function parseOptions(user: string): ParsedOption[] {
  const options: ParsedOption[] = [];
  for (const match of user.matchAll(OPTION_LINE)) {
    options.push({
      optionId: match[1]!,
      name: match[2]!,
      monthlyPriceCents: Number(match[3]),
    });
  }
  return options;
}

function alternativeAdviceFixture(user: string): string {
  const cheapestFirst = parseOptions(user)
    .slice()
    .sort((a, b) => a.monthlyPriceCents - b.monthlyPriceCents || a.name.localeCompare(b.name))
    .slice(0, 2);

  return JSON.stringify({
    picks: cheapestFirst.map((option, index) => ({
      optionId: option.optionId,
      rationale:
        index === 0
          ? `${option.name} covers the same need at the lowest price in this category.`
          : `${option.name} is the next cheapest option if the top pick does not fit.`,
    })),
    verdict: cheapestFirst.length
      ? "A cheaper plan covers the same need — switching is the highest-value move here."
      : "No cheaper alternative is available for this subscription.",
  });
}

function featureOf(system: string): string | null {
  const match = system.match(/\[feature:([a-z_]+)\]/);
  return match ? match[1]! : null;
}

export class MockLlmAdapter implements LlmAdapter {
  async complete(input: LlmCompletionInput): Promise<LlmCompletionResult> {
    const content =
      featureOf(input.system) === "alternative_advice"
        ? alternativeAdviceFixture(input.user)
        : GENERIC_FIXTURE;

    return {
      content,
      model: "mock",
      usage: { promptTokens: 10, completionTokens: 20 },
    };
  }

  async *stream(input: LlmCompletionInput): AsyncIterable<string> {
    const { content } = await this.complete(input);
    // Yield in fixed-size chunks so consumers exercise the streaming path.
    for (let i = 0; i < content.length; i += 24) {
      yield content.slice(i, i + 24);
    }
  }
}
