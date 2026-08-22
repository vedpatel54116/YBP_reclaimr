import type { Prisma, PrismaClient } from "@prisma/client";
import type { FastifyBaseLogger } from "fastify";

/** Who performed the action. Passed to services from the route layer. */
export interface RequestContext {
  ip?: string | null;
  userAgent?: string | null;
}

export interface AuditEvent extends RequestContext {
  actorType: "member" | "admin" | "system";
  actorId?: string | null;
  /** The affected member, when the action concerns one. */
  userId?: string | null;
  /** Snake_case action, e.g. "auth.login", "user.delete_requested". */
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  metadata?: Record<string, unknown> | null;
}

/**
 * Append-only audit trail writer. Logging is best-effort by design: an audit
 * failure must never fail (or roll back) the member-facing operation, but it
 * is logged loudly enough to trip alerting.
 */
export class AuditService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly logger: FastifyBaseLogger,
  ) {}

  async record(event: AuditEvent): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          actorType: event.actorType,
          actorId: event.actorId ?? null,
          userId: event.userId ?? null,
          action: event.action,
          targetType: event.targetType ?? null,
          targetId: event.targetId ?? null,
          metadata: (event.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
          ip: event.ip ?? null,
          userAgent: event.userAgent ?? null,
        },
      });
    } catch (error) {
      this.logger.error({ err: error, action: event.action }, "Failed to write audit log");
    }
  }
}
