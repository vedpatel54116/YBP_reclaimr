import { API_ROUTES } from "../constants";
import {
  createSavingsEventSchema,
  listSavingsEventsQuerySchema,
  savingsEventSchema,
  savingsSummarySchema,
} from "../schemas/savings";
import { paginatedSchema } from "../schemas/pagination";

/** The reclaimed-money ledger and its dashboard aggregate. */
export const savingsContract = {
  summary: {
    method: "GET",
    path: API_ROUTES.savings.summary,
    response: savingsSummarySchema,
  },
  listEvents: {
    method: "GET",
    path: API_ROUTES.savings.events,
    query: listSavingsEventsQuerySchema,
    response: paginatedSchema(savingsEventSchema),
  },
  /** Manual adjustments only — case-generated events are immutable. */
  createEvent: {
    method: "POST",
    path: API_ROUTES.savings.createEvent,
    body: createSavingsEventSchema,
    response: savingsEventSchema,
  },
} as const;
