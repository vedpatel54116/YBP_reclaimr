import type { Prisma, PrismaClient } from "@prisma/client";
import type {
  AdminListCasesQuery,
  CancellationCase,
  NegotiationCase,
  Paginated,
} from "@reclaimr/shared";
import { notFound } from "../../lib/errors";
import { CANCELLATION_INCLUDE, toCancellationCase } from "../cancellations/mapper";
import { NEGOTIATION_INCLUDE, toNegotiationCase } from "../negotiations/mapper";

/**
 * Concierge work queues.
 *
 * These are the only reads in the product that deliberately cross the tenancy
 * boundary, which is why they live behind the staff realm and a `cases.read`
 * capability rather than being a `userId`-optional flag on the member services.
 * The default ordering is oldest-first: a queue should surface the member who
 * has been waiting longest, not the most recent arrival.
 */
export class AdminCaseService {
  constructor(private readonly prisma: PrismaClient) {}

  async listCancellations(query: AdminListCasesQuery): Promise<Paginated<CancellationCase>> {
    const where: Prisma.CancellationCaseWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.memberId ? { userId: query.memberId } : {}),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.cancellationCase.findMany({
        where,
        include: CANCELLATION_INCLUDE,
        orderBy: { createdAt: "asc" },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.cancellationCase.count({ where }),
    ]);

    return {
      data: rows.map(toCancellationCase),
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    };
  }

  async getCancellation(id: string): Promise<CancellationCase> {
    const row = await this.prisma.cancellationCase.findUnique({
      where: { id },
      include: CANCELLATION_INCLUDE,
    });
    if (!row) throw notFound("Cancellation case not found");
    return toCancellationCase(row);
  }

  async listNegotiations(query: AdminListCasesQuery): Promise<Paginated<NegotiationCase>> {
    const where: Prisma.NegotiationCaseWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.memberId ? { userId: query.memberId } : {}),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.negotiationCase.findMany({
        where,
        include: NEGOTIATION_INCLUDE,
        orderBy: { createdAt: "asc" },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.negotiationCase.count({ where }),
    ]);

    return {
      data: rows.map(toNegotiationCase),
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    };
  }

  async getNegotiation(id: string): Promise<NegotiationCase> {
    const row = await this.prisma.negotiationCase.findUnique({
      where: { id },
      include: NEGOTIATION_INCLUDE,
    });
    if (!row) throw notFound("Negotiation case not found");
    return toNegotiationCase(row);
  }
}
