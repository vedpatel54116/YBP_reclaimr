import type { PrismaClient } from "@prisma/client";
import {
  isTerminalCaseStatus,
  monthlyEquivalentCents,
  TERMINAL_CASE_STATUSES,
  appendTimeline,
  type CaseStatus,
} from "@reclaimr/core";
import type {
  CancellationCase,
  CreateCancellationInput,
  ListCancellationsQuery,
  Paginated,
} from "@reclaimr/shared";
import { assertTransition } from "../../lib/case-transitions";
import { badRequest, conflict, notFound } from "../../lib/errors";
import type { AuditService, RequestContext } from "../../services/audit";
import type { SavingsLedger } from "../../services/savings-ledger";
import {
  CANCELLATION_INCLUDE,
  toCancellationCase,
  toJsonTimeline,
  toTimeline,
  type CancellationCaseRow,
} from "./mapper";

/** Staff-initiated transition, called by the admin module. */
export interface ConciergeAdvanceOptions {
  note?: string;
  /** AdminUser.id — recorded on the audit trail, never on the member's case. */
  adminId: string;
  ctx: RequestContext;
}

/**
 * Concierge cancellation cases.
 *
 * Member-facing methods are scoped by `userId` from the verified access token.
 * The `advanceAsConcierge` method deliberately is not: staff act across
 * tenants by design, which is why it is a separate method reachable only from
 * the admin realm rather than a `userId`-optional parameter on the others.
 */
export class CancellationService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly audit: AuditService,
    private readonly savings: SavingsLedger,
  ) {}

  async list(userId: string, query: ListCancellationsQuery): Promise<Paginated<CancellationCase>> {
    const where = {
      userId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.subscriptionId ? { subscriptionId: query.subscriptionId } : {}),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.cancellationCase.findMany({
        where,
        include: CANCELLATION_INCLUDE,
        orderBy: { createdAt: "desc" },
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

  async findOwned(userId: string, id: string): Promise<CancellationCase | null> {
    const row = await this.prisma.cancellationCase.findFirst({
      where: { id, userId },
      include: CANCELLATION_INCLUDE,
    });
    return row ? toCancellationCase(row) : null;
  }

  async create(
    userId: string,
    input: CreateCancellationInput,
    ctx: RequestContext,
  ): Promise<CancellationCase> {
    const subscription = await this.prisma.subscription.findFirst({
      where: { id: input.subscriptionId, userId },
    });
    if (!subscription) throw notFound("Subscription not found");

    if (subscription.status === "canceled") {
      throw badRequest("This subscription is already canceled", "ALREADY_CANCELED");
    }

    // One open case per subscription. Two concierges working the same
    // cancellation would call the provider twice and could book the saving
    // twice, so the constraint is enforced before any work is queued.
    const open = await this.prisma.cancellationCase.findFirst({
      where: {
        userId,
        subscriptionId: subscription.id,
        status: { notIn: [...TERMINAL_CASE_STATUSES] },
      },
    });
    if (open) {
      throw conflict(
        "A cancellation request is already open for this subscription",
        "CASE_ALREADY_OPEN",
      );
    }

    const now = new Date();
    // Snapshot the monthly cost now. The subscription row can change (or be
    // deleted) before the concierge finishes, and the saving we eventually
    // credit must reflect what the member was actually paying when they asked.
    const monthlyAmountCents = monthlyEquivalentCents(
      subscription.amountCents,
      subscription.cadence,
    );

    const [row] = await this.prisma.$transaction([
      this.prisma.cancellationCase.create({
        data: {
          userId,
          subscriptionId: subscription.id,
          status: "submitted",
          monthlyAmountCents,
          reason: input.reason ?? null,
          timeline: toJsonTimeline(
            appendTimeline([], {
              status: "submitted",
              actor: "member",
              note: input.reason ?? null,
              at: now,
            }),
          ),
        },
        include: CANCELLATION_INCLUDE,
      }),
      // Flag the subscription in the same write so the member never sees a
      // case without the subscription reflecting that it is being canceled.
      this.prisma.subscription.update({
        where: { id: subscription.id },
        data: { status: "cancel_requested" },
      }),
    ]);

    await this.audit.record({
      ...ctx,
      actorType: "member",
      actorId: userId,
      userId,
      action: "cancellation.created",
      targetType: "cancellation_case",
      targetId: row.id,
      metadata: { subscriptionId: subscription.id, monthlyAmountCents },
    });

    return toCancellationCase(row);
  }

  /** Member abandons the request. Returns null when the case is not theirs. */
  async withdraw(
    userId: string,
    id: string,
    ctx: RequestContext,
  ): Promise<CancellationCase | null> {
    const existing = await this.prisma.cancellationCase.findFirst({ where: { id, userId } });
    if (!existing) return null;

    assertTransition("cancellation", existing.status, "canceled", "member");

    const now = new Date();
    const [row] = await this.prisma.$transaction([
      this.prisma.cancellationCase.update({
        where: { id },
        data: {
          status: "canceled",
          resolvedAt: now,
          timeline: toJsonTimeline(
            appendTimeline(toTimeline(existing.timeline), {
              status: "canceled",
              actor: "member",
              note: "Withdrawn by member",
              at: now,
            }),
          ),
        },
        include: CANCELLATION_INCLUDE,
      }),
      // Release the flag, but only if this case is what set it — a scoped
      // updateMany avoids clobbering a status something else has since changed.
      this.prisma.subscription.updateMany({
        where: { id: existing.subscriptionId, userId, status: "cancel_requested" },
        data: { status: "active" },
      }),
    ]);

    await this.audit.record({
      ...ctx,
      actorType: "member",
      actorId: userId,
      userId,
      action: "cancellation.withdrawn",
      targetType: "cancellation_case",
      targetId: id,
    });

    return toCancellationCase(row);
  }

  /**
   * Concierge advances a case. Terminal transitions are the interesting ones:
   *
   * - `succeeded` retires the subscription and credits the ledger. Both happen
   *   in one transaction with the case update, because a case marked succeeded
   *   without the matching saving (or a saving with no case) is exactly the
   *   kind of discrepancy that destroys trust in the reclaimed counter.
   * - `failed` puts the subscription back to `active`. The member is still
   *   paying for it, and the app must stop implying otherwise.
   */
  async advanceAsConcierge(
    caseId: string,
    to: CaseStatus,
    options: ConciergeAdvanceOptions,
  ): Promise<CancellationCase | null> {
    const existing = await this.prisma.cancellationCase.findUnique({
      where: { id: caseId },
      include: CANCELLATION_INCLUDE,
    });
    if (!existing) return null;

    assertTransition("cancellation", existing.status, to, "concierge");

    const now = new Date();
    const timeline = toJsonTimeline(
      appendTimeline(toTimeline(existing.timeline), {
        status: to,
        actor: "concierge",
        note: options.note ?? null,
        at: now,
      }),
    );

    const row = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.cancellationCase.update({
        where: { id: caseId },
        data: {
          status: to,
          timeline,
          ...(isTerminalCaseStatus(to)
            ? { resolvedAt: now, outcomeNote: options.note ?? null }
            : {}),
        },
        include: CANCELLATION_INCLUDE,
      });

      if (to === "succeeded") {
        await tx.subscription.update({
          where: { id: existing.subscriptionId },
          data: { status: "canceled", canceledAt: now },
        });
        await this.savings.recordCancellation(
          {
            userId: existing.userId,
            caseId,
            subscriptionName: existing.subscription.name,
            monthlyAmountCents: existing.monthlyAmountCents,
            resolvedAt: now,
          },
          tx,
        );
      }

      if (to === "failed") {
        await tx.subscription.updateMany({
          where: { id: existing.subscriptionId, status: "cancel_requested" },
          data: { status: "active" },
        });
      }

      return updated as CancellationCaseRow;
    });

    await this.audit.record({
      ...options.ctx,
      actorType: "admin",
      actorId: options.adminId,
      userId: existing.userId,
      action: "cancellation.advanced",
      targetType: "cancellation_case",
      targetId: caseId,
      metadata: { from: existing.status, to },
    });

    return toCancellationCase(row);
  }
}
