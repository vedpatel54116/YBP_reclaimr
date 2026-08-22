import { API_ROUTES } from "../constants";
import { idParamSchema } from "../schemas/common";
import { accountSchema, syncAccountResponseSchema } from "../schemas/account";
import { paginatedSchema } from "../schemas/pagination";
import { listQuerySchema } from "../schemas/pagination";

/**
 * Bank account linking (the Link handshake itself lives in contracts/plaid).
 * Members only ever exchange short-lived aggregator public tokens;
 * credentials never touch ReclaimR servers. Access is read-only.
 */
export const accountsContract = {
  list: {
    method: "GET",
    path: API_ROUTES.accounts.list,
    query: listQuerySchema,
    response: paginatedSchema(accountSchema),
  },
  get: {
    method: "GET",
    path: `${API_ROUTES.accounts.detail("{id}")}`,
    params: idParamSchema,
    response: accountSchema,
  },
  /** Trigger a balance/transaction sync for one linked account. */
  sync: {
    method: "POST",
    path: `${API_ROUTES.accounts.sync("{id}")}`,
    params: idParamSchema,
    response: syncAccountResponseSchema,
  },
  /** Unlink the account; cascades to its transactions. */
  remove: {
    method: "DELETE",
    path: `${API_ROUTES.accounts.detail("{id}")}`,
    params: idParamSchema,
  },
} as const;
