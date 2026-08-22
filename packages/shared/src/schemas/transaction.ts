import { z } from "zod";
import { listQuerySchema } from "./pagination";

/** Single source of truth for categorization (members, transactions, bills). */
export const transactionCategorySchema = z.enum([
  "income",
  "housing",
  "utilities",
  "telecommunications",
  "groceries",
  "dining",
  "transportation",
  "health",
  "fitness",
  "insurance",
  "entertainment",
  "subscriptions",
  "shopping",
  "travel",
  "education",
  "fees",
  "transfers",
  "savings",
  "other",
]);
export type TransactionCategory = z.infer<typeof transactionCategorySchema>;

/**
 * A single ledger entry from a linked account. Sign convention follows the
 * aggregator: positive = money leaving the account, negative = money in.
 */
export const transactionSchema = z.object({
  id: z.string().uuid(),
  accountId: z.string().uuid(),
  merchantId: z.string().uuid().nullable(),
  merchantName: z.string().min(1),
  amountCents: z.number().int(),
  category: transactionCategorySchema,
  isRecurring: z.boolean(),
  isPending: z.boolean(),
  note: z.string().max(500).nullable(),
  occurredAt: z.string().datetime(),
  createdAt: z.string().datetime(),
});
export type Transaction = z.infer<typeof transactionSchema>;

export const listTransactionsQuerySchema = listQuerySchema.extend({
  accountId: z.string().uuid().optional(),
  category: transactionCategorySchema.optional(),
  /** Inclusive ISO date bounds (YYYY-MM-DD). */
  from: z.string().date().optional(),
  to: z.string().date().optional(),
  /** Free-text match on the merchant description. */
  search: z.string().min(1).max(120).optional(),
  direction: z.enum(["outflow", "inflow"]).optional(),
  recurringOnly: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
});
export type ListTransactionsQuery = z.output<typeof listTransactionsQuerySchema>;

/** Members may recategorize and annotate their own transactions. */
export const updateTransactionSchema = z
  .object({
    category: transactionCategorySchema.optional(),
    note: z.string().max(500).nullable().optional(),
  })
  .refine((patch) => Object.keys(patch).length > 0, {
    message: "At least one field is required",
  });
export type UpdateTransactionInput = z.infer<typeof updateTransactionSchema>;
