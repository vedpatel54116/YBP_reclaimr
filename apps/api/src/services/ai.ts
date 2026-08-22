import type { PrismaClient } from "@prisma/client";
import type { JobProducer } from "@reclaimr/queue";
import { createLlmAdapter, type LlmAdapter } from "../adapters/llm";
import type { Env } from "../env";
import { AlternativeAdvisorService } from "../modules/ai/alternative-advisor.service";

export interface AiServices {
  advisor: AlternativeAdvisorService;
}

/** Test/dev seam: swap the model provider without touching configuration. */
export interface AiServiceOverrides {
  adapter?: LlmAdapter;
}

/**
 * Composition root for the AI feature graph. Built once per process — by the
 * Fastify app for reads and inline generation, and by apps/worker for queued
 * generation — so both run the exact same services, mirroring
 * createBankingServices.
 */
export function createAiServices(
  prisma: PrismaClient,
  config: Env,
  options: { queue?: JobProducer | null } & AiServiceOverrides = {},
): AiServices {
  const adapter = options.adapter ?? createLlmAdapter(config);
  const queue = options.queue ?? null;

  return {
    advisor: new AlternativeAdvisorService(prisma, adapter, queue),
  };
}
