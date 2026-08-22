import type { PrismaClient, SavingsEvent as PrismaSavingsEvent } from "@prisma/client";
import type {
  ListSavingsEventsQuery,
  Paginated,
  SavingsEvent,
  CreateSavingsEventInput,
} from "@reclaimr/shared";
import { createSavingsEventSchema } from "@reclaimr/shared";
import type { AuditService, RequestContext } from "../../services/audit";
import type { SavingsLedger } from "../../services/savings-ledger";
import { badRequest } from "../../lib/errors";

/** Prisma row → shared shape. `occurredAt` is a DATE column, so date-only. */
export function toSavingsEvent(row: PrismaSavingsEvent): SavingsEvent {
  return {
    id: row.id,
    kind: row.kind,
    amountCents: row.amountCents,
    description: row.description,
    occurredAt: row.occurredAt.toISOString().slice(0, 10),
    sourceType: asSourceType(row.sourceType),
    sourceId: row.sourceId,
    createdAt: row.createdAt.toISOString(),
  };
}

const SOURCE_TYPES = ["cancellation", "negotiation", "refund", "manual"] as const;

/** The column is TEXT; narrow it to the wire union at the boundary. */
function asSourceType(value: string | null): SavingsEvent["sourceType"] {
  return value !== null && (SOURCE_TYPES as readonly string[]).includes(value)
    ? (value as SavingsEvent["sourceType"])
    : null;
}

/**
 * Reads of the reclaimed-money ledger, plus the one member-authored write.
 *
 * Case-generated entries are immutable and are only ever created by the case
 * services through {@link SavingsLedger}; this service never edits them.
 */
export class SavingsEventService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly ledger: SavingsLedger,
    private readonly audit: AuditService,
  ) {}

  async list(userId: string, query: ListSavingsEventsQuery): Promise<Paginated<SavingsEvent>> {
    const where = {
      userId,
      ...(query.kind ? { kind: query.kind } : {}),
      ...(query.from || query.to
        ? {
            occurredAt: {
              ...(query.from ? { gte: new Date(`${query.from}T00:00:00.000Z`) } : {}),
              ...(query.to ? { lte: new Date(`${query.to}T00:00:00.000Z`) } : {}),
            },
          }
        : {}),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.savingsEvent.findMany({
        where,
        orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.savingsEvent.count({ where }),
    ]);

    return {
      data: rows.map(toSavingsEvent),
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    };
  }

  /**
   * Member-recorded saving. Always `manual_adjustment`: a member may tell us
   * about money they reclaimed themselves, but they cannot mint an entry that
   * claims to come from one of our cases — that distinction is what keeps the
   * ledger's provenance meaningful.
   */
  async createManual(
    userId: string,
    input: CreateSavingsEventInput,
    ctx: RequestContext,
  ): Promise<SavingsEvent> {
    const parsed = createSavingsEventSchema.parse(input);
    const occurredAt = parsed.occurredAt
      ? new Date(`${parsed.occurredAt}T00:00:00.000Z`)
      : new Date();

    const result = await this.ledger.record({
      userId,
      kind: "manual_adjustment",
      amountCents: parsed.amountCents,
      description: parsed.description,
      occurredAt,
      sourceType: "manual",
      sourceId: null,
    });
    if (!result.event) {
      throw badRequest("That adjustment could not be recorded", "SAVINGS_NOT_RECORDED");
    }

    await this.audit.record({
      ...ctx,
      actorType: "member",
      actorId: userId,
      userId,
      action: "savings.manual_adjustment",
      targetType: "savings_event",
      targetId: result.event.id,
      metadata: { amountCents: parsed.amountCents },
    });

    return toSavingsEvent(result.event);
  }
}
