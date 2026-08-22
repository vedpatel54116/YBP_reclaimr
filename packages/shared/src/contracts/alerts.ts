import { API_ROUTES } from "../constants";
import { idParamSchema } from "../schemas/common";
import { alertSchema, listAlertsQuerySchema, markAllReadResponseSchema } from "../schemas/alert";
import { paginatedSchema } from "../schemas/pagination";

export const alertsContract = {
  list: {
    method: "GET",
    path: API_ROUTES.alerts.list,
    query: listAlertsQuerySchema,
    response: paginatedSchema(alertSchema),
  },
  read: {
    method: "POST",
    path: `${API_ROUTES.alerts.read("{id}")}`,
    params: idParamSchema,
    response: alertSchema,
  },
  readAll: {
    method: "POST",
    path: API_ROUTES.alerts.readAll,
    response: markAllReadResponseSchema,
  },
} as const;
