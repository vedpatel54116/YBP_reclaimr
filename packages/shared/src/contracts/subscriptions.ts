import { API_ROUTES } from "../constants";
import { idParamSchema } from "../schemas/common";
import {
  createSubscriptionSchema,
  detectSubscriptionsResponseSchema,
  listSubscriptionsQuerySchema,
  paginatedSubscriptionSchema,
  subscriptionSchema,
  updateSubscriptionSchema,
} from "../schemas/subscription";

/**
 * API contract for the subscription endpoints. The routes in apps/api and
 * the clients in apps/web both import these schemas, so request and response
 * shapes can never drift between server and frontend.
 */
export const subscriptionsContract = {
  list: {
    method: "GET",
    path: API_ROUTES.subscriptions.list,
    query: listSubscriptionsQuerySchema,
    response: paginatedSubscriptionSchema,
  },
  create: {
    method: "POST",
    path: API_ROUTES.subscriptions.create,
    body: createSubscriptionSchema,
    response: subscriptionSchema,
  },
  /** Run the detection engine over linked transactions (async job). */
  detect: {
    method: "POST",
    path: API_ROUTES.subscriptions.detect,
    response: detectSubscriptionsResponseSchema,
  },
  get: {
    method: "GET",
    path: `${API_ROUTES.subscriptions.detail("{id}")}`,
    params: idParamSchema,
    response: subscriptionSchema,
  },
  update: {
    method: "PATCH",
    path: `${API_ROUTES.subscriptions.detail("{id}")}`,
    params: idParamSchema,
    body: updateSubscriptionSchema,
    response: subscriptionSchema,
  },
  remove: {
    method: "DELETE",
    path: `${API_ROUTES.subscriptions.detail("{id}")}`,
    params: idParamSchema,
  },
} as const;
