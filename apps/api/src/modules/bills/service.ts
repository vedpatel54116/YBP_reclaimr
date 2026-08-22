import type { PrismaClient } from "@prisma/client";
import { addUtcDays, billOccurrences, startOfUtcDay } from "@reclaimr/core";
import type {
  Bill,
  CreateBillInput,
  ListBillsQuery,
  Paginated,
  UpcomingBill,
  UpcomingBillsQuery,
  UpcomingBillsResponse,
  UpdateBillInput,
} from "@reclaimr/shared";
import { toBill } from "./mapper";
/**
 * How far back the calendar looks for a due date that has already passed.
 * Showing a bill that came due three days ago as overdue is useful; showing one
 * from last quarter is noise the member can do nothing about.
 */
const OVERDUE_LOOKBACK_DAYS = 7;

/**
 * Recurring bills owed to a payee. Every method is scoped by `userId` — the id
 * from the verified access token, never a client-supplied value.
 */
export class BillService {
  constructor(private readonly prisma: PrismaClient) {}

  async list(userId: string, query: ListBillsQuery): Promise<Paginated<Bill>> {
    const where = { userId, ...(query.activeOnly ? { isActive: true } : {}) };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.bill.findMany({
        where,
        orderBy: [{ isActive: "desc" }, { dueDay: "asc" }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.bill.count({ where }),
    ]);

    return {
      data: rows.map(toBill),
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    };
  }

  async create(userId: string, input: CreateBillInput): Promise<Bill> {
    const row = await this.prisma.bill.create({
      data: {
        userId,
        name: input.name,
        category: input.category,
        dueDay: input.dueDay,
        cadence: input.cadence,
        expectedAmountCents: input.expectedAmountCents ?? null,
        autopay: input.autopay,
        negotiable: input.negotiable,
        merchantId: input.merchantId ?? null,
        connectedAccountId: input.connectedAccountId ?? null,
      },
    });
    return toBill(row);
  }

  async findOwned(userId: string, id: string): Promise<Bill | null> {
    const row = await this.prisma.bill.findFirst({ where: { id, userId } });
    return row ? toBill(row) : null;
  }

  async update(userId: string, id: string, patch: UpdateBillInput): Promise<Bill | null> {
    const existing = await this.prisma.bill.findFirst({ where: { id, userId } });
    if (!existing) return null;

    const row = await this.prisma.bill.update({
      where: { id },
      data: {
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.category !== undefined ? { category: patch.category } : {}),
        ...(patch.dueDay !== undefined ? { dueDay: patch.dueDay } : {}),
        ...(patch.cadence !== undefined ? { cadence: patch.cadence } : {}),
        ...(patch.expectedAmountCents !== undefined
          ? { expectedAmountCents: patch.expectedAmountCents }
          : {}),
        ...(patch.autopay !== undefined ? { autopay: patch.autopay } : {}),
        ...(patch.negotiable !== undefined ? { negotiable: patch.negotiable } : {}),
        ...(patch.merchantId !== undefined ? { merchantId: patch.merchantId } : {}),
        ...(patch.connectedAccountId !== undefined
          ? { connectedAccountId: patch.connectedAccountId }
          : {}),
        ...(patch.isActive !== undefined ? { isActive: patch.isActive } : {}),
      },
    });
    return toBill(row);
  }

  /**
   * Remove a bill. A bill with negotiation history is archived instead of
   * deleted: the cases reference it for their display name and audit trail, and
   * destroying that history to satisfy a tidy-up would lose the record of money
   * we charged a fee on.
   */
  async remove(userId: string, id: string): Promise<boolean> {
    const existing = await this.prisma.bill.findFirst({
      where: { id, userId },
      select: { id: true, _count: { select: { negotiationCases: true } } },
    });
    if (!existing) return false;

    if (existing._count.negotiationCases > 0) {
      await this.prisma.bill.update({ where: { id }, data: { isActive: false } });
      return true;
    }

    const result = await this.prisma.bill.deleteMany({ where: { id, userId } });
    return result.count > 0;
  }

  /**
   * Project active bills onto the next `days` days, plus any that came due in
   * the last week so a missed payment surfaces instead of silently vanishing
   * from the calendar.
   */
  async upcoming(
    userId: string,
    query: UpcomingBillsQuery,
    now: Date = new Date(),
  ): Promise<UpcomingBillsResponse> {
    const today = startOfUtcDay(now);
    const windowStart = addUtcDays(today, -OVERDUE_LOOKBACK_DAYS);
    const windowEnd = addUtcDays(today, query.days);

    const rows = await this.prisma.bill.findMany({ where: { userId, isActive: true } });

    const bills: UpcomingBill[] = rows.flatMap((row) =>
      billOccurrences(row.cadence, row.dueDay, windowStart, windowEnd).map((dueDate) => ({
        billId: row.id,
        name: row.name,
        dueDate: dueDate.toISOString().slice(0, 10),
        // Best-known amount: what it cost last time, else what we expect.
        amountCents: row.lastAmountCents ?? row.expectedAmountCents ?? null,
        isOverdue: dueDate.getTime() < today.getTime(),
      })),
    );

    bills.sort((a, b) => (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0));

    return { bills, asOf: now.toISOString() };
  }
}
