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
