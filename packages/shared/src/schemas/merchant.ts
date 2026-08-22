import { z } from "zod";
import { transactionCategorySchema } from "./transaction";

/**
 * Canonical merchant entity. Detection groups charges by normalizedKey and
 * aliases; finance ops curates this table via the admin API.
 */
export const merchantSchema = z.object({
  id: z.string().uuid(),
  canonicalName: z.string().min(1).max(120),
  normalizedKey: z.string().min(1).max(120),
  category: transactionCategorySchema,
  isSubscriptionProvider: z.boolean(),
  negotiable: z.boolean(),
  aliases: z.array(z.string().min(1).max(120)),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Merchant = z.infer<typeof merchantSchema>;
