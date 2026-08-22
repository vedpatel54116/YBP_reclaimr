import type { Processor } from "bullmq";
import type { AiServices } from "@reclaimr/api/services";
import { aiGenerateJobSchema } from "@reclaimr/queue";

/**
 * Generate or refresh one cached AI suggestion.
 *
 * Dispatches on `kind` so every AI feature shares one queue, one retry policy,
 * and one concurrency budget against the model provider. v1 handles
 * alternative advice; the remaining kinds land with their features.
 */
export function aiGenerateProcessor(ai: AiServices): Processor {
  return async (job) => {
    const { userId, kind, subjectId } = aiGenerateJobSchema.parse(job.data);

    if (kind === "alternative_advice") {
      const suggestion = await ai.advisor.generateForSubscription(userId, subjectId);
      job.log(`alternative_advice ${subjectId}: ${suggestion ? "generated" : "no advice"}`);
      return { kind, generated: suggestion !== null };
    }

    // Unknown-but-valid kinds are skipped rather than thrown: a queued job from
    // a newer deploy must not retry five times against an older worker.
    job.log(`ai.generate: kind "${kind}" is not handled by this worker — skipped`);
    return { kind, generated: false };
  };
}
