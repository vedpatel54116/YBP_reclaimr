import { API_ROUTES } from "../constants";
import { idParamSchema } from "../schemas/common";
import {
  listTransactionsQuerySchema,
  transactionSchema,
  updateTransactionSchema,
} from "../schemas/transaction";
import { paginatedSchema } from "../schemas/pagination";

export const transactionsContract = {
  list: {
    method: "GET",
    path: API_ROUTES.transactions.list,
    query: listTransactionsQuerySchema,
    response: paginatedSchema(transactionSchema),
  },
  get: {
    method: "GET",
    path: `${API_ROUTES.transactions.detail("{id}")}`,
    params: idParamSchema,
    response: transactionSchema,
  },
  /** Recategorize / annotate; everything else is immutable ledger data. */
  update: {
    method: "PATCH",
    path: `${API_ROUTES.transactions.detail("{id}")}`,
    params: idParamSchema,
    body: updateTransactionSchema,
    response: transactionSchema,
  },
} as const;
