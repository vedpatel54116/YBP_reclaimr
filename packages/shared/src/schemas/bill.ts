import { z } from "zod";
import { listQuerySchema } from "./pagination";
import { billingCadenceSchema } from "./subscription";
import { transactionCategorySchema } from "./transaction";

/** A recurring bill owed to a payee (utilities, internet, insurance, ...). */
export const billSchema = z.object({
  id: z.string().uuid(),
  merchantId: z.string().uuid().nullable(),
  connectedAccountId: z.string().uuid().nullable(),
  name: z.string().min(1).max(120),
  category: transactionCategorySchema,
  expectedAmountCents: z.number().int().min(0).nullable(),
  lastAmountCents: z.number().int().min(0).nullable(),
  /** Day of month the bill is due (1–31; clipped for shorter months). */
  dueDay: z.number().int().min(1).max(31),
  cadence: billingCadenceSchema,
  autopay: z.boolean(),
  /** Whether concierge negotiation is offered for this bill. */
  negotiable: z.boolean(),
  isActive: z.boolean(),
  /** Detection confidence in [0, 1]; null for manually added rows. */
  confidence: z.number().min(0).max(1).nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Bill = z.infer<typeof billSchema>;

export const createBillSchema = z.object({
  name: z.string().min(1).max(120),
  category: transactionCategorySchema,
  dueDay: z.number().int().min(1).max(31),
  cadence: billingCadenceSchema.default("monthly"),
  expectedAmountCents: z.number().int().min(0).optional(),
  autopay: z.boolean().default(false),
  negotiable: z.boolean().default(false),
  merchantId: z.string().uuid().optional(),
  connectedAccountId: z.string().uuid().optional(),
});
export type CreateBillInput = z.output<typeof createBillSchema>;

export const updateBillSchema = createBillSchema
  .partial()
  .extend({ isActive: z.boolean().optional() })
  .refine((patch) => Object.keys(patch).length > 0, {
    message: "At least one field is required",
  });
export type UpdateBillInput = z.output<typeof updateBillSchema>;

export const listBillsQuerySchema = listQuerySchema.extend({
  /** Defaults to active bills only; pass false to include archived ones. */
  activeOnly: z
    .enum(["true", "false"])
    .default("true")
    .transform((value) => value === "true"),
});
export type ListBillsQuery = z.output<typeof listBillsQuerySchema>;

/** A bill projected onto the calendar for the next N days. */
export const upcomingBillSchema = z.object({
  billId: z.string().uuid(),
  name: z.string().min(1),
  dueDate: z.string().date(),
  /** Best-known amount: last charged, else expected, else null. */
  amountCents: z.number().int().min(0).nullable(),
  isOverdue: z.boolean(),
});
export type UpcomingBill = z.infer<typeof upcomingBillSchema>;

export const upcomingBillsQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(90).default(30),
});
export type UpcomingBillsQuery = z.output<typeof upcomingBillsQuerySchema>;

export const upcomingBillsResponseSchema = z.object({
  bills: z.array(upcomingBillSchema),
  asOf: z.string().datetime(),
});
export type UpcomingBillsResponse = z.infer<typeof upcomingBillsResponseSchema>;
