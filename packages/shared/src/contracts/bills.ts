import { API_ROUTES } from "../constants";
import { idParamSchema } from "../schemas/common";
import {
  billSchema,
  createBillSchema,
  listBillsQuerySchema,
  updateBillSchema,
  upcomingBillsQuerySchema,
  upcomingBillsResponseSchema,
} from "../schemas/bill";
import { paginatedSchema } from "../schemas/pagination";

export const billsContract = {
  list: {
    method: "GET",
    path: API_ROUTES.bills.list,
    query: listBillsQuerySchema,
    response: paginatedSchema(billSchema),
  },
  create: {
    method: "POST",
    path: API_ROUTES.bills.create,
    body: createBillSchema,
    response: billSchema,
  },
  /** Calendar projection of due bills for the next N days. */
  upcoming: {
    method: "GET",
    path: API_ROUTES.bills.upcoming,
    query: upcomingBillsQuerySchema,
    response: upcomingBillsResponseSchema,
  },
  get: {
    method: "GET",
    path: `${API_ROUTES.bills.detail("{id}")}`,
    params: idParamSchema,
    response: billSchema,
  },
  update: {
    method: "PATCH",
    path: `${API_ROUTES.bills.detail("{id}")}`,
    params: idParamSchema,
    body: updateBillSchema,
    response: billSchema,
  },
  remove: {
    method: "DELETE",
    path: `${API_ROUTES.bills.detail("{id}")}`,
    params: idParamSchema,
  },
} as const;
