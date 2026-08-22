import type { Prisma, PrismaClient } from "@prisma/client";
import { TERMINAL_CASE_STATUSES } from "@reclaimr/core";
import type {
  AdminMember,
  ListMembersQuery,
  Merchant,
  AdminCreateMerchantInput,
  AdminUpdateMerchantInput,
  AuditLogEntry,
  ListAuditLogsQuery,
  Paginated,
} from "@reclaimr/shared";
import { conflict, notFound } from "../../lib/errors";
import type { AuditService, RequestContext } from "../../services/audit";

/** Prisma's unique-constraint violation. */
const UNIQUE_VIOLATION = "P2002";

function paginate<T>(data: T[], total: number, page: number, pageSize: number): Paginated<T> {
  return { data, page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

/**
 * Read-only member directory for staff.
 *
 * Everything here is aggregate or identifying-only. Notably absent: password
 * hashes, bank tokens, and transactions. Concierge work needs to know *who* a
 * member is and *what* they asked for, not what they spend money on, so the
 * console cannot expose it even to an authorized agent.
 */
export class AdminMemberService {
  constructor(private readonly prisma: PrismaClient) {}

  async list(query: ListMembersQuery): Promise<Paginated<AdminMember>> {
    const where: Prisma.UserWhereInput = query.search
      ? {
          OR: [
            { email: { contains: query.search, mode: "insensitive" } },
            { name: { contains: query.search, mode: "insensitive" } },
          ],
        }
      : {};

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        include: MEMBER_INCLUDE,
        orderBy: { createdAt: "desc" },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.user.count({ where }),
    ]);

    // Savings totals are a per-member aggregate, so they are fetched in one
    // grouped query rather than N+1 per row.
    const totals = await this.savingsTotals(rows.map((row) => row.id));

    return paginate(
      rows.map((row) => toAdminMember(row, totals.get(row.id) ?? 0)),
      total,
      query.page,
      query.pageSize,
    );
  }

  async get(id: string): Promise<AdminMember> {
    const row = await this.prisma.user.findUnique({ where: { id }, include: MEMBER_INCLUDE });
    if (!row) throw notFound("Member not found");

    const totals = await this.savingsTotals([id]);
    return toAdminMember(row, totals.get(id) ?? 0);
  }

  private async savingsTotals(userIds: string[]): Promise<Map<string, number>> {
    if (userIds.length === 0) return new Map();
    const groups = await this.prisma.savingsEvent.groupBy({
      by: ["userId"],
      where: { userId: { in: userIds } },
      _sum: { amountCents: true },
    });
    return new Map(groups.map((group) => [group.userId, group._sum.amountCents ?? 0]));
  }
}

const MEMBER_INCLUDE = {
  premium: { select: { status: true } },
  _count: {
    select: {
      subscriptions: true,
      cancellationCases: { where: { status: { notIn: [...TERMINAL_CASE_STATUSES] } } },
      negotiationCases: { where: { status: { notIn: [...TERMINAL_CASE_STATUSES] } } },
    },
  },
} as const satisfies Prisma.UserInclude;

type MemberRow = Prisma.UserGetPayload<{ include: typeof MEMBER_INCLUDE }>;

function toAdminMember(row: MemberRow, savingsTotalCents: number): AdminMember {
  const status = row.premium?.status;
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    // "Premium" for staff means currently entitled, matching what the member
    // experiences — not merely "has a billing row".
    isPremium: status === "active" || status === "trialing" || status === "past_due",
    subscriptionCount: row._count.subscriptions,
    savingsTotalCents,
    openCaseCount: row._count.cancellationCases + row._count.negotiationCases,
    deletionScheduledAt: row.deletionScheduledAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Merchant curation. This table drives detection for every member, so a careless
 * edit is a product-wide event — which is why writes sit behind the narrower
 * `finance_ops` capability rather than general case-working access.
 */
export class AdminMerchantService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly audit: AuditService,
  ) {}

  async list(query: ListMembersQuery): Promise<Paginated<Merchant>> {
    const where: Prisma.MerchantWhereInput = query.search
      ? {
          OR: [
            { canonicalName: { contains: query.search, mode: "insensitive" } },
            { normalizedKey: { contains: query.search, mode: "insensitive" } },
            { aliases: { has: query.search } },
          ],
        }
      : {};

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.merchant.findMany({
        where,
        orderBy: { canonicalName: "asc" },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.merchant.count({ where }),
    ]);

    return paginate(rows.map(toMerchant), total, query.page, query.pageSize);
  }

  async create(
    input: AdminCreateMerchantInput,
    actor: { adminId: string; ctx: RequestContext },
  ): Promise<Merchant> {
    const normalizedKey = input.normalizedKey.trim().toLowerCase();

    try {
      const row = await this.prisma.merchant.create({
        data: {
          canonicalName: input.canonicalName,
          normalizedKey,
          category: input.category ?? "other",
          isSubscriptionProvider: input.isSubscriptionProvider ?? false,
          negotiable: input.negotiable ?? false,
          aliases: input.aliases ?? [],
        },
      });

      await this.audit.record({
        ...actor.ctx,
        actorType: "admin",
        actorId: actor.adminId,
        action: "merchant.created",
        targetType: "merchant",
        targetId: row.id,
        metadata: { normalizedKey, canonicalName: row.canonicalName },
      });

      return toMerchant(row);
    } catch (error) {
      if ((error as { code?: unknown } | null)?.code === UNIQUE_VIOLATION) {
        throw conflict(`A merchant already uses the key "${normalizedKey}"`, "KEY_TAKEN");
      }
      throw error;
    }
  }

  async update(
    id: string,
    patch: AdminUpdateMerchantInput,
    actor: { adminId: string; ctx: RequestContext },
  ): Promise<Merchant> {
    const existing = await this.prisma.merchant.findUnique({ where: { id } });
    if (!existing) throw notFound("Merchant not found");

    try {
      const row = await this.prisma.merchant.update({
        where: { id },
        data: {
          ...(patch.canonicalName !== undefined ? { canonicalName: patch.canonicalName } : {}),
          ...(patch.normalizedKey !== undefined
            ? { normalizedKey: patch.normalizedKey.trim().toLowerCase() }
            : {}),
          ...(patch.category !== undefined ? { category: patch.category } : {}),
          ...(patch.isSubscriptionProvider !== undefined
            ? { isSubscriptionProvider: patch.isSubscriptionProvider }
            : {}),
          ...(patch.negotiable !== undefined ? { negotiable: patch.negotiable } : {}),
          ...(patch.aliases !== undefined ? { aliases: patch.aliases } : {}),
        },
      });

      await this.audit.record({
        ...actor.ctx,
        actorType: "admin",
        actorId: actor.adminId,
        action: "merchant.updated",
        targetType: "merchant",
        targetId: row.id,
        // Record the change, not just that a change happened — this is the trail
        // used to explain a detection regression after the fact.
        metadata: { before: describeMerchant(existing), after: describeMerchant(row) },
      });

      return toMerchant(row);
    } catch (error) {
      if ((error as { code?: unknown } | null)?.code === UNIQUE_VIOLATION) {
        throw conflict("Another merchant already uses that key", "KEY_TAKEN");
      }
      throw error;
    }
  }
}

type MerchantRow = Prisma.MerchantGetPayload<Record<string, never>>;

function toMerchant(row: MerchantRow): Merchant {
  return {
    id: row.id,
    canonicalName: row.canonicalName,
    normalizedKey: row.normalizedKey,
    category: row.category,
    isSubscriptionProvider: row.isSubscriptionProvider,
    negotiable: row.negotiable,
    aliases: row.aliases,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function describeMerchant(row: MerchantRow): Record<string, unknown> {
  return {
    canonicalName: row.canonicalName,
    normalizedKey: row.normalizedKey,
    category: row.category,
    isSubscriptionProvider: row.isSubscriptionProvider,
    negotiable: row.negotiable,
    aliases: row.aliases,
  };
}

/**
 * Audit trail search. Read-only with no write path at all: the model is
 * append-only, and offering staff any way to amend it would defeat its purpose
 * as the record of what staff did.
 */
export class AdminAuditService {
  constructor(private readonly prisma: PrismaClient) {}

  async list(query: ListAuditLogsQuery): Promise<Paginated<AuditLogEntry>> {
    const where: Prisma.AuditLogWhereInput = {
      ...(query.action ? { action: { startsWith: query.action } } : {}),
      ...(query.memberId ? { userId: query.memberId } : {}),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return paginate(rows.map(toAuditLogEntry), total, query.page, query.pageSize);
  }
}

function toAuditLogEntry(row: Prisma.AuditLogGetPayload<Record<string, never>>): AuditLogEntry {
  return {
    id: row.id,
    actorType: row.actorType,
    actorId: row.actorId,
    userId: row.userId,
    action: row.action,
    targetType: row.targetType,
    targetId: row.targetId,
    metadata: isRecord(row.metadata) ? row.metadata : null,
    ip: row.ip,
    createdAt: row.createdAt.toISOString(),
  };
}

/** The Json column can hold any shape; the contract promises an object or null. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
