import {
  LlmAdapterError,
  type LlmAdapter,
  type LlmCompletionInput,
  type LlmCompletionResult,
} from "./types";

export interface OpenAiAdapterOptions {
  apiKey: string;
  baseUrl: string;
  model: string;
  timeoutMs: number;
}

/**
 * Plain-fetch adapter for any OpenAI-compatible /chat/completions endpoint
 * (OpenAI, OpenRouter, local servers). No SDK dependency, so swapping
 * providers is a base-URL change.
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

      const promptTokens = body.usage?.prompt_tokens;
      const completionTokens = body.usage?.completion_tokens;

      return {
        content,
        model: this.options.model,
        usage:
          promptTokens !== undefined && completionTokens !== undefined
            ? { promptTokens, completionTokens }
            : undefined,
      };
    } catch (error) {
      if (error instanceof LlmAdapterError) throw error;
      throw new LlmAdapterError(error instanceof Error ? error.message : "LLM request failed");
    } finally {
      clearTimeout(timer);
    }
  }

  async *stream(input: LlmCompletionInput): AsyncIterable<string> {
    // v1 features are all batch; a true SSE stream lands with the chat
    // assistant. Yielding the full completion keeps the interface honest.
    const { content } = await this.complete(input);
    yield content;
  }
}
