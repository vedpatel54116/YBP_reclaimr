import { API_ROUTES } from "../constants";
import { subscriptionSuggestionsResponseSchema } from "../schemas/ai";
import { idParamSchema } from "../schemas/common";

/**
 * API contract for AI suggestion reads. Generation is a background job, so
 * there is no "create" endpoint here — the routes only serve the cache.
 */
export const aiContract = {
  subscriptionSuggestions: {
    method: "GET",
    path: `${API_ROUTES.ai.suggestionsForSubscription("{id}")}`,
    params: idParamSchema,
    response: subscriptionSuggestionsResponseSchema,
  },
} as const;
