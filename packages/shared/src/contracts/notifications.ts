import { API_ROUTES } from "../constants";
import { idParamSchema } from "../schemas/common";
import { listNotificationsQuerySchema, notificationSchema } from "../schemas/notification";
import { paginatedSchema } from "../schemas/pagination";
import { markAllReadResponseSchema } from "../schemas/alert";

export const notificationsContract = {
  list: {
    method: "GET",
    path: API_ROUTES.notifications.list,
    query: listNotificationsQuerySchema,
    response: paginatedSchema(notificationSchema),
  },
  read: {
    method: "POST",
    path: `${API_ROUTES.notifications.read("{id}")}`,
    params: idParamSchema,
    response: notificationSchema,
  },
  readAll: {
    method: "POST",
    path: API_ROUTES.notifications.readAll,
    response: markAllReadResponseSchema,
  },
} as const;
