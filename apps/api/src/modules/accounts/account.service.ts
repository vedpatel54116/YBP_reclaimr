import type { PrismaClient } from "@prisma/client";
import type { Account, ListQuery, Paginated } from "@reclaimr/shared";
import { toAccount } from "./mapper";

/**
 * Linked-account reads. Every method is scoped by `userId` — the id from the
 * verified access token, never a client-supplied value.
 */
export class AccountService {
  constructor(private readonly prisma: PrismaClient) {}

  async list(userId: string, query: ListQuery): Promise<Paginated<Account>> {
    const where = { userId };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.connectedAccount.findMany({
        where,
        orderBy: { createdAt: "asc" },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.connectedAccount.count({ where }),
    ]);
    return {
      data: rows.map(toAccount),
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    };
  }

  async get(userId: string, id: string): Promise<Account | null> {
    const row = await this.prisma.connectedAccount.findFirst({ where: { id, userId } });
    return row ? toAccount(row) : null;
  }

  /**
   * Resolve the Plaid item that owns an account (sync operates per item, not
   * per account — one credential grant may cover several accounts).
   */
  async findItemIdForAccount(userId: string, accountId: string): Promise<string | null> {
    const row = await this.prisma.connectedAccount.findFirst({
      where: { id: accountId, userId },
      select: { plaidItemId: true },
    });
    return row?.plaidItemId ?? null;
  }
}
