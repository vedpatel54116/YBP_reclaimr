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
