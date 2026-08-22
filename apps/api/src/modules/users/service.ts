import type { Consent as PrismaConsent, PrismaClient, User as PrismaUser } from "@prisma/client";
import {
  ACCOUNT_DELETION_RETENTION_DAYS,
  type Consent,
  type ConsentType,
  type ListQuery,
  type UpdateUserInput,
  type User,
} from "@reclaimr/shared";
import { forbidden, notFound } from "../../lib/errors";
import type { AuditService, RequestContext } from "../../services/audit";

function toUser(row: PrismaUser): User {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    createdAt: row.createdAt.toISOString(),
  };
}

function toConsent(row: PrismaConsent): Consent {
  return {
    id: row.id,
    type: row.type,
    version: row.version,
    acceptedAt: row.acceptedAt.toISOString(),
    ip: row.ip,
  };
}

export class UserService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly audit: AuditService,
  ) {}

  async getProfile(userId: string): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.deletionScheduledAt) throw this.gone();
    return toUser(user);
  }

  async updateProfile(userId: string, patch: UpdateUserInput, ctx: RequestContext): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.deletionScheduledAt) throw this.gone();

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { name: patch.name },
    });

    await this.audit.record({
      ...ctx,
      actorType: "member",
      actorId: userId,
      userId,
      action: "user.profile_updated",
      targetType: "user",
      targetId: userId,
      metadata: { fields: Object.keys(patch) },
    });
    return toUser(updated);
  }

  /**
   * GDPR/CCPA erasure: soft-delete now (revoke every session immediately),
   * hard purge after the retention window via a retention job. The grace
   * period exists for reconsideration and chargeback reconciliation.
   */
  async requestDeletion(
    userId: string,
    ctx: RequestContext,
  ): Promise<{ deletionScheduledAt: string }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw notFound("User not found");
    if (user.deletionScheduledAt) {
      return { deletionScheduledAt: user.deletionScheduledAt.toISOString() };
    }

    const deletionScheduledAt = new Date(
      Date.now() + ACCOUNT_DELETION_RETENTION_DAYS * 24 * 60 * 60 * 1000,
    );

    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: userId }, data: { deletionScheduledAt } }),
      // Kill every session instantly; access tokens die within TTL.
      this.prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    await this.audit.record({
      ...ctx,
      actorType: "member",
      actorId: userId,
      userId,
      action: "user.delete_requested",
      targetType: "user",
      targetId: userId,
      metadata: { purgeAfterDays: ACCOUNT_DELETION_RETENTION_DAYS },
    });
    return { deletionScheduledAt: deletionScheduledAt.toISOString() };
  }

  /** Consent ledger is append-only: superseding a consent adds a new row. */
  async recordConsent(
    userId: string,
    input: { type: ConsentType; version: string },
    ctx: RequestContext,
  ): Promise<Consent> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.deletionScheduledAt) throw this.gone();

    const consent = await this.prisma.consent.create({
      data: {
        userId,
        type: input.type,
        version: input.version,
        ip: ctx.ip ?? null,
        userAgent: ctx.userAgent ?? null,
      },
    });

    await this.audit.record({
      ...ctx,
      actorType: "member",
      actorId: userId,
      userId,
      action: "consent.recorded",
      targetType: "consent",
      targetId: consent.id,
      metadata: { type: input.type, version: input.version },
    });
    return toConsent(consent);
  }

  async listConsents(
    userId: string,
    query: ListQuery,
  ): Promise<{
    data: Consent[];
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  }> {
    const total = await this.prisma.consent.count({ where: { userId } });
    const rows = await this.prisma.consent.findMany({
      where: { userId },
      orderBy: { acceptedAt: "desc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    });
    return {
      data: rows.map(toConsent),
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    };
  }

  private gone() {
    return forbidden("This account is scheduled for deletion", "ACCOUNT_DELETED");
  }
}
