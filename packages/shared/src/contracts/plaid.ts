import { API_ROUTES } from "../constants";
import {
  createLinkTokenResponseSchema,
  exchangePublicTokenRequestSchema,
  exchangePublicTokenResponseSchema,
} from "../schemas/plaid";

/**
 * Plaid Link flow. The member's browser talks to Plaid directly with the
 * link token; the API only mints tokens and exchanges the single-use public
 * token for a long-lived access token (stored encrypted, never returned).
 */
export const plaidContract = {
  createLinkToken: {
    method: "POST",
    path: API_ROUTES.plaid.createLinkToken,
    response: createLinkTokenResponseSchema,
  },
  exchangePublicToken: {
    method: "POST",
    path: API_ROUTES.plaid.exchangePublicToken,
    body: exchangePublicTokenRequestSchema,
    response: exchangePublicTokenResponseSchema,
  },
} as const;
