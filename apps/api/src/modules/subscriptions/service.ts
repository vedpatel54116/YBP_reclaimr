import type { PrismaClient } from "@prisma/client";
import type {
  CreateSubscriptionInput,
  ListSubscriptionsQuery,
  Paginated,
  Subscription,
  UpdateSubscriptionInput,
} from "@reclaimr/shared";
import { toSubscription, toDateOnly } from "./mapper";

/**
 * Subscription persistence. Every method is scoped by `userId` — the user id
 * from the verified access token, never a client-supplied value.
 */
export class SubscriptionService {
  constructor(private readonly prisma: PrismaClient) {}

  async list(userId: string, query: ListSubscriptionsQuery): Promise<Paginated<Subscription>> {
    const where = { userId, ...(query.status ? { status: query.status } : {}) };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.subscription.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.subscription.count({ where }),
    ]);

    return {
      data: rows.map(toSubscription),
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    };
  }

  async create(userId: string, input: CreateSubscriptionInput): Promise<Subscription> {
    const row = await this.prisma.subscription.create({
      data: {
        userId,
        name: input.name,
        amountCents: input.amountCents,
        cadence: input.cadence,
        nextBillingDate: toDateOnly(input.nextBillingDate),
      },
    });
    return toSubscription(row);
  }

  async findOwned(userId: string, id: string): Promise<Subscription | null> {
    const row = await this.prisma.subscription.findFirst({ where: { id, userId } });
    return row ? toSubscription(row) : null;
  }

  async update(
    userId: string,
    id: string,
    patch: UpdateSubscriptionInput,
  ): Promise<Subscription | null> {
    const existing = await this.prisma.subscription.findFirst({ where: { id, userId } });
    if (!existing) return null;

    const row = await this.prisma.subscription.update({
      where: { id },
      data: {
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.amountCents !== undefined ? { amountCents: patch.amountCents } : {}),
        ...(patch.cadence !== undefined ? { cadence: patch.cadence } : {}),
        ...(patch.status !== undefined ? { status: patch.status } : {}),
        ...(patch.nextBillingDate !== undefined
          ? { nextBillingDate: toDateOnly(patch.nextBillingDate) }
          : {}),
      },
    });
    return toSubscription(row);
  }

  async remove(userId: string, id: string): Promise<boolean> {
    // deleteMany keeps the userId scope in the DELETE itself.
    const result = await this.prisma.subscription.deleteMany({ where: { id, userId } });
    if (result.count === 0) return false;

    // AiSuggestion.subjectId is polymorphic, so the database cannot cascade
    // here. Without this, deleting a subscription would leave its cached advice
    // behind forever — unreadable, but growing without bound.
    await this.prisma.aiSuggestion.deleteMany({ where: { userId, subjectId: id } });
    return true;
  }
}
