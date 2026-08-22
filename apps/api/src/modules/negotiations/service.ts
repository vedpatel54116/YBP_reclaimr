import type { PrismaClient } from "@prisma/client";
import {
  appendTimeline,
  estimatedNegotiationSavingsCents,
  isTerminalCaseStatus,
  monthlyEquivalentCents,
  settleNegotiation,
  TERMINAL_CASE_STATUSES,
  type CaseStatus,
} from "@reclaimr/core";
import type {
  CreateNegotiationInput,
  ListNegotiationsQuery,
  NegotiationCase,
  Paginated,
  RespondToOfferInput,
} from "@reclaimr/shared";
import { assertTransition } from "../../lib/case-transitions";
import { badRequest, conflict, notFound } from "../../lib/errors";
import type { AuditService, RequestContext } from "../../services/audit";
import type { SavingsLedger } from "../../services/savings-ledger";
import {
  NEGOTIATION_INCLUDE,
  toJsonTimeline,
  toNegotiationCase,
  toTimeline,
  type NegotiationCaseRow,
} from "./mapper";

/** Staff-initiated transition, called by the admin module. */
export interface ConciergeNegotiationAdvance {
  note?: string;
  /** Required when publishing an offer. */
  offeredAnnualSavingsCents?: number;
  offerNote?: string;
  adminId: string;
  ctx: RequestContext;
}

/**
 * Bill negotiation cases.
 *
 * The flow exists to make one guarantee structural: we bill a success fee only
 * on savings the member has seen and accepted. The concierge can take a case as
 * far as `offer_pending` and no further; converting an offer into `succeeded`
 * (and thus into a fee and a ledger entry) is reachable only through
 * `approveOffer`, which requires the member's own token.
 */
export class NegotiationService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly audit: AuditService,
    private readonly savings: SavingsLedger,
  ) {}

  async list(userId: string, query: ListNegotiationsQuery): Promise<Paginated<NegotiationCase>> {
    const where = {
      userId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.billId ? { billId: query.billId } : {}),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.negotiationCase.findMany({
        where,
        include: NEGOTIATION_INCLUDE,
        orderBy: { createdAt: "desc" },
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

  async findOwned(userId: string, id: string): Promise<NegotiationCase | null> {
    const row = await this.prisma.negotiationCase.findFirst({
      where: { id, userId },
      include: NEGOTIATION_INCLUDE,
    });
    return row ? toNegotiationCase(row) : null;
  }

  async create(
    userId: string,
    input: CreateNegotiationInput,
    ctx: RequestContext,
  ): Promise<NegotiationCase> {
    const bill = await this.prisma.bill.findFirst({ where: { id: input.billId, userId } });
    if (!bill) throw notFound("Bill not found");

    // We only accept cases we can actually work. Taking money-adjacent requests
    // for providers that do not negotiate would burn the member's time and our
    // credibility, so the refusal is upfront rather than a later "failed" case.
    if (!bill.negotiable) {
      throw badRequest("This bill is not eligible for negotiation", "NOT_NEGOTIABLE");
    }

    const open = await this.prisma.negotiationCase.findFirst({
      where: { userId, billId: bill.id, status: { notIn: [...TERMINAL_CASE_STATUSES] } },
    });
    if (open) {
      throw conflict("A negotiation is already open for this bill", "CASE_ALREADY_OPEN");
    }

    // Expectation-setting only. This projection is never the fee basis: the fee
    // is computed from the savings the provider actually agreed to and the
    // member approved.
    const billAmountCents = bill.lastAmountCents ?? bill.expectedAmountCents ?? 0;
    const projectedAnnualSavingsCents = estimatedNegotiationSavingsCents(
      monthlyEquivalentCents(billAmountCents, bill.cadence),
    );

    const now = new Date();
    const row = await this.prisma.negotiationCase.create({
      data: {
        userId,
        billId: bill.id,
        status: "submitted",
        feePercent: input.feePercent,
        projectedAnnualSavingsCents,
        timeline: toJsonTimeline(
          appendTimeline([], { status: "submitted", actor: "member", note: null, at: now }),
        ),
      },
      include: NEGOTIATION_INCLUDE,
    });

    await this.audit.record({
      ...ctx,
      actorType: "member",
      actorId: userId,
      userId,
      action: "negotiation.created",
      targetType: "negotiation_case",
      targetId: row.id,
      metadata: { billId: bill.id, feePercent: input.feePercent, projectedAnnualSavingsCents },
    });

    return toNegotiationCase(row);
  }

  async withdraw(userId: string, id: string, ctx: RequestContext): Promise<NegotiationCase | null> {
    const existing = await this.prisma.negotiationCase.findFirst({ where: { id, userId } });
    if (!existing) return null;

    assertTransition("negotiation", existing.status, "canceled", "member");

    const now = new Date();
    const row = await this.prisma.negotiationCase.update({
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
      include: NEGOTIATION_INCLUDE,
    });

    await this.audit.record({
      ...ctx,
      actorType: "member",
      actorId: userId,
      userId,
      action: "negotiation.withdrawn",
      targetType: "negotiation_case",
      targetId: id,
    });

    return toNegotiationCase(row);
  }

  /**
   * Member accepts the rate the concierge secured. This is the only path to
   * `succeeded`, and therefore the only place a success fee is ever booked.
   *
   * The case update and the ledger credit share one transaction: a case marked
   * succeeded with no corresponding saving — or a saving with no case to
   * explain it — is precisely the discrepancy that would make the reclaimed
   * counter untrustworthy.
   */
  async approveOffer(
    userId: string,
    id: string,
    input: RespondToOfferInput,
    ctx: RequestContext,
  ): Promise<NegotiationCase | null> {
    const existing = await this.prisma.negotiationCase.findFirst({
      where: { id, userId },
      include: NEGOTIATION_INCLUDE,
    });
    if (!existing) return null;

    if (existing.status !== "offer_pending") {
      throw conflict("This negotiation has no offer awaiting your approval", "NO_PENDING_OFFER");
    }
    if (existing.offeredAnnualSavingsCents === null) {
      // An offer_pending case without an amount means a bug published an
      // unpriced offer. Refuse rather than book a fee against a guess.
      throw badRequest("This offer is missing its savings amount", "OFFER_INCOMPLETE");
    }

    assertTransition("negotiation", existing.status, "succeeded", "member");

    const settlement = settleNegotiation(existing.offeredAnnualSavingsCents, existing.feePercent);
    const now = new Date();
    const timeline = toJsonTimeline(
      appendTimeline(toTimeline(existing.timeline), {
        status: "succeeded",
        actor: "member",
        note: input.note ?? "Offer approved by member",
        at: now,
      }),
    );

    const row = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.negotiationCase.update({
        where: { id },
        data: {
          status: "succeeded",
          confirmedAnnualSavingsCents: settlement.confirmedAnnualSavingsCents,
          feeAmountCents: settlement.feeAmountCents,
          offerRespondedAt: now,
          resolvedAt: now,
          outcomeNote: input.note ?? null,
          timeline,
        },
        include: NEGOTIATION_INCLUDE,
      });

      await this.savings.recordNegotiation(
        {
          userId,
          caseId: id,
          billName: existing.bill.name,
          confirmedAnnualSavingsCents: settlement.confirmedAnnualSavingsCents,
          feePercent: existing.feePercent,
          resolvedAt: now,
        },
        tx,
      );

      return updated as NegotiationCaseRow;
    });

    await this.audit.record({
      ...ctx,
      actorType: "member",
      actorId: userId,
      userId,
      action: "negotiation.offer_approved",
      targetType: "negotiation_case",
      targetId: id,
      metadata: {
        confirmedAnnualSavingsCents: settlement.confirmedAnnualSavingsCents,
        feeAmountCents: settlement.feeAmountCents,
        netAnnualSavingsCents: settlement.netAnnualSavingsCents,
        feePercent: existing.feePercent,
      },
    });

    return toNegotiationCase(row);
  }

  /**
   * Member declines the secured rate. The case fails, nothing is charged, and
   * no savings are recorded — declining must cost exactly nothing, or the
   * approval step would be coercive rather than a real choice.
   */
  async rejectOffer(
    userId: string,
    id: string,
    input: RespondToOfferInput,
    ctx: RequestContext,
  ): Promise<NegotiationCase | null> {
    const existing = await this.prisma.negotiationCase.findFirst({ where: { id, userId } });
    if (!existing) return null;

    if (existing.status !== "offer_pending") {
      throw conflict("This negotiation has no offer awaiting your approval", "NO_PENDING_OFFER");
    }

    assertTransition("negotiation", existing.status, "failed", "member");

    const now = new Date();
    const row = await this.prisma.negotiationCase.update({
      where: { id },
      data: {
        status: "failed",
        offerRespondedAt: now,
        resolvedAt: now,
        outcomeNote: input.note ?? "Offer declined by member",
        timeline: toJsonTimeline(
          appendTimeline(toTimeline(existing.timeline), {
            status: "failed",
            actor: "member",
            note: input.note ?? "Offer declined by member",
            at: now,
          }),
        ),
      },
      include: NEGOTIATION_INCLUDE,
    });

    await this.audit.record({
      ...ctx,
      actorType: "member",
      actorId: userId,
      userId,
      action: "negotiation.offer_rejected",
      targetType: "negotiation_case",
      targetId: id,
    });

    return toNegotiationCase(row);
  }

  /**
   * Concierge advances a case. Note what is absent: there is no branch for
   * `succeeded`. The state machine refuses that transition for the `concierge`
   * actor, so staff cannot book a fee here even by mistake — the omission is
   * the safety property, not an oversight.
   */
  async advanceAsConcierge(
    caseId: string,
    to: CaseStatus,
    options: ConciergeNegotiationAdvance,
  ): Promise<NegotiationCase | null> {
    const existing = await this.prisma.negotiationCase.findUnique({ where: { id: caseId } });
    if (!existing) return null;

    assertTransition("negotiation", existing.status, to, "concierge");

    if (to === "offer_pending" && options.offeredAnnualSavingsCents === undefined) {
      throw badRequest("An offer must state its savings amount", "OFFER_AMOUNT_REQUIRED");
    }

    const now = new Date();
    const row = await this.prisma.negotiationCase.update({
      where: { id: caseId },
      data: {
        status: to,
        ...(to === "offer_pending"
          ? {
              offeredAnnualSavingsCents: options.offeredAnnualSavingsCents,
              offerNote: options.offerNote ?? null,
              offeredAt: now,
              // A re-published offer supersedes the member's previous answer.
              offerRespondedAt: null,
            }
          : {}),
        ...(isTerminalCaseStatus(to) ? { resolvedAt: now, outcomeNote: options.note ?? null } : {}),
        timeline: toJsonTimeline(
          appendTimeline(toTimeline(existing.timeline), {
            status: to,
            actor: "concierge",
            note: options.offerNote ?? options.note ?? null,
            at: now,
          }),
        ),
      },
      include: NEGOTIATION_INCLUDE,
    });

    await this.audit.record({
      ...options.ctx,
      actorType: "admin",
      actorId: options.adminId,
      userId: existing.userId,
      action: "negotiation.advanced",
      targetType: "negotiation_case",
      targetId: caseId,
      metadata: {
        from: existing.status,
        to,
        ...(options.offeredAnnualSavingsCents !== undefined
          ? { offeredAnnualSavingsCents: options.offeredAnnualSavingsCents }
          : {}),
      },
    });

    return toNegotiationCase(row);
  }
}
