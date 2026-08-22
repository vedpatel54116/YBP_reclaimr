import type { Prisma, PrismaClient } from "@prisma/client";
import type {
  ListTransactionsQuery,
  Paginated,
  Transaction,
  TransactionCategory,
  UpdateTransactionInput,
} from "@reclaimr/shared";
import { toTransaction } from "./mapper";

/** Transaction ledger reads + member annotations (category, note). */
export class TransactionService {
  constructor(private readonly prisma: PrismaClient) {}

  private buildWhere(userId: string, query: ListTransactionsQuery): Prisma.TransactionWhereInput {
    const occurredAt: Prisma.DateTimeFilter = {
      ...(query.from ? { gte: new Date(`${query.from}T00:00:00.000Z`) } : {}),
      ...(query.to ? { lte: new Date(`${query.to}T23:59:59.999Z`) } : {}),
    };
    return {
      userId,
      ...(query.accountId ? { accountId: query.accountId } : {}),
      ...(query.category ? { category: query.category } : {}),
      ...(Object.keys(occurredAt).length > 0 ? { occurredAt } : {}),
      ...(query.search
        ? { merchantName: { contains: query.search, mode: "insensitive" as const } }
        : {}),
      ...(query.direction === "outflow"
        ? { amountCents: { gt: 0 } }
        : query.direction === "inflow"
          ? { amountCents: { lt: 0 } }
          : {}),
      ...(query.recurringOnly ? { isRecurring: true } : {}),
    };
  }

  async list(userId: string, query: ListTransactionsQuery): Promise<Paginated<Transaction>> {
    const where = this.buildWhere(userId, query);
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.transaction.findMany({
        where,
        orderBy: { occurredAt: "desc" },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.transaction.count({ where }),
    ]);
    return {
      data: rows.map(toTransaction),
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    };
  }

  async get(userId: string, id: string): Promise<Transaction | null> {
    const row = await this.prisma.transaction.findFirst({ where: { id, userId } });
    return row ? toTransaction(row) : null;
  }

  async update(
    userId: string,
    id: string,
    patch: UpdateTransactionInput,
  ): Promise<Transaction | null> {
    const existing = await this.prisma.transaction.findFirst({ where: { id, userId } });
    if (!existing) return null;
    const row = await this.prisma.transaction.update({
      where: { id },
      data: {
        ...(patch.category !== undefined
          ? { category: patch.category as TransactionCategory }
          : {}),
        ...(patch.note !== undefined ? { note: patch.note } : {}),
      },
    });
    return toTransaction(row);
  }
}
