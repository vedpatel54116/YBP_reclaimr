import { env, plaidEnabled, type Env } from "../../env";
import { PlaidHttpAdapter } from "./http-adapter";
import { MockPlaidAdapter } from "./mock-adapter";
import type { PlaidAdapter } from "./types";

/**
 * Adapter selection: real Plaid when credentials exist, deterministic mock
 * otherwise. Local dev and CI run with zero keys and zero network.
 */
export function createPlaidAdapter(config: Env = env()): PlaidAdapter {
  if (plaidEnabled(config)) {
    return new PlaidHttpAdapter({
      clientId: config.PLAID_CLIENT_ID!,
      secret: config.PLAID_SECRET!,
      env: config.PLAID_ENV,
    });
  }
  return new MockPlaidAdapter();
}

export { MockPlaidAdapter, PlaidHttpAdapter };
export * from "./types";
