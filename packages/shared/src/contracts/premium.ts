import { API_ROUTES } from "../constants";
import {
  premiumStateSchema,
  upgradePremiumResponseSchema,
  upgradePremiumSchema,
} from "../schemas/premium";

/**
 * Premium membership. Choose-your-price ($7–$14/mo) billed monthly or yearly
 * (yearly charges 10 months up front), with an optional 7-day trial.
 * Cancellation is at period end — members keep access until then.
 */
export const premiumContract = {
  get: {
    method: "GET",
    path: API_ROUTES.premium.get,
    response: premiumStateSchema,
  },
  /**
   * Starts a Stripe Checkout session and returns its URL. The membership is
   * not active until Stripe confirms it over the webhook — the response state
   * still reflects the pre-checkout status by design.
   */
  upgrade: {
    method: "POST",
    path: API_ROUTES.premium.upgrade,
    body: upgradePremiumSchema,
    response: upgradePremiumResponseSchema,
  },
  cancel: {
    method: "POST",
    path: API_ROUTES.premium.cancel,
    response: premiumStateSchema,
  },
  resume: {
    method: "POST",
    path: API_ROUTES.premium.resume,
    response: premiumStateSchema,
  },
} as const;

/**
 * Stripe webhook sink. Not part of the member API: the request is
 * authenticated by its `Stripe-Signature` header, the body must be consumed
 * raw for that verification to work, and the response is always 200 once the
 * signature is valid (Stripe retries anything else).
 */
export const billingContract = {
  webhook: {
    method: "POST",
    path: API_ROUTES.billing.webhook,
    contentType: "application/json",
  },
} as const;
