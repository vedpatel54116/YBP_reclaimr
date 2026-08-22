import { z } from "zod";
import { booleanQuerySchema } from "./common";
import { listQuerySchema } from "./pagination";

export const notificationChannelSchema = z.enum(["in_app", "email", "push"]);
export type NotificationChannel = z.infer<typeof notificationChannelSchema>;

/** A delivered notification; in-app items double as the activity feed. */
export const notificationSchema = z.object({
  id: z.string().uuid(),
  channel: notificationChannelSchema,
  title: z.string().min(1),
  body: z.string().min(1),
  /** Originating alert, when the notification was fan-out from one. */
  alertId: z.string().uuid().nullable(),
  readAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
});
export type Notification = z.infer<typeof notificationSchema>;

export const listNotificationsQuerySchema = listQuerySchema.extend({
  unreadOnly: booleanQuerySchema,
});
export type ListNotificationsQuery = z.output<typeof listNotificationsQuerySchema>;
