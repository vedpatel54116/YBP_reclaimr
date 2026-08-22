import { API_ROUTES } from "../constants";
import { idParamSchema } from "../schemas/common";
import {
  cancellationCaseSchema,
  createCancellationSchema,
  listCancellationsQuerySchema,
} from "../schemas/cancellation";
import { paginatedSchema } from "../schemas/pagination";

/**
 * Concierge cancellation requests. Creating a case requires an active
 * premium membership (free tier sees detection only) — enforced by the
 * requireTier guard in apps/api, not by the contract shape.
 */
export const cancellationsContract = {
  list: {
    method: "GET",
    path: API_ROUTES.cancellations.list,
    query: listCancellationsQuerySchema,
    response: paginatedSchema(cancellationCaseSchema),
  },
  create: {
    method: "POST",
    path: API_ROUTES.cancellations.create,
    body: createCancellationSchema,
    response: cancellationCaseSchema,
  },
  get: {
    method: "GET",
    path: `${API_ROUTES.cancellations.detail("{id}")}`,
    params: idParamSchema,
    response: cancellationCaseSchema,
  },
  /** Member withdraws the request before resolution. */
  withdraw: {
    method: "POST",
    path: `${API_ROUTES.cancellations.withdraw("{id}")}`,
    params: idParamSchema,
    response: cancellationCaseSchema,
  },
} as const;
