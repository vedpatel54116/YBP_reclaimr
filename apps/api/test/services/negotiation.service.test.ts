import { beforeEach, describe, expect, it } from "vitest";
import { AuditService } from "../../src/services/audit";
import { SavingsLedger } from "../../src/services/savings-ledger";
import { NegotiationService } from "../../src/modules/negotiations/service";
import { createFakePrisma, type FakePrisma } from "../support/fake-prisma";
import { silentLogger, useTestEnv } from "../support/harness";

useTestEnv();

const CTX = { ip: "203.0.113.9", userAgent: "vitest" };
const ADMIN = { adminId: "22222222-2222-4222-8222-222222222222", ctx: CTX };

let db: FakePrisma;
let service: NegotiationService;
let userId: string;
let billId: string;

async function seedBill(overrides: Record<string, unknown> = {}): Promise<string> {
  const bill = await db.bill.create({
    data: {
      userId,
      name: "City Internet",
      category: "telecommunications",
      dueDay: 12,
      cadence: "monthly",
      lastAmountCents: 9_000,
      negotiable: true,
      ...overrides,
    },
  });
  return bill.id as string;
}

beforeEach(async () => {
  db = createFakePrisma();
  const prisma = db.asPrisma();
  service = new NegotiationService(
    prisma,
    new AuditService(prisma, silentLogger()),
    new SavingsLedger(prisma),
  );

  const user = await db.user.create({ data: { email: "member@example.com", passwordHash: "x" } });
  userId = user.id as string;
  billId = await seedBill();
});

/** Take a case all the way to a published offer. */
async function openOffer(offered = 24_000, feePercent = 40): Promise<string> {
  const created = await service.create(userId, { billId, feePercent }, CTX);
  await service.advanceAsConcierge(created.id, "in_review", ADMIN);
  await service.advanceAsConcierge(created.id, "in_progress", ADMIN);
  await service.advanceAsConcierge(created.id, "offer_pending", {
    ...ADMIN,
    offeredAnnualSavingsCents: offered,
    offerNote: "Retention plan: $60/mo for 12 months",
  });
  return created.id;
}

describe("create", () => {
  it("opens a submitted case with the chosen fee share", async () => {
    const created = await service.create(userId, { billId, feePercent: 40 }, CTX);

    expect(created.status).toBe("submitted");
    expect(created.feePercent).toBe(40);
    expect(created.billName).toBe("City Internet");
    expect(created.timeline).toHaveLength(1);
  });

  it("projects savings for expectation-setting, leaving the fee fields empty", async () => {
    const created = await service.create(userId, { billId, feePercent: 40 }, CTX);

    expect(created.projectedAnnualSavingsCents).toBeGreaterThan(0);
    expect(created.offeredAnnualSavingsCents).toBeNull();
    expect(created.confirmedAnnualSavingsCents).toBeNull();
    expect(created.feeAmountCents).toBeNull();
    expect(created.netAnnualSavingsCents).toBeNull();
  });

  it("starts with no statements attached", async () => {
    const created = await service.create(userId, { billId, feePercent: 40 }, CTX);
    expect(created.documents).toEqual([]);
  });

  it("refuses a bill that is not negotiable", async () => {
    const plain = await seedBill({ negotiable: false, name: "Rent" });
    await expect(
      service.create(userId, { billId: plain, feePercent: 40 }, CTX),
    ).rejects.toMatchObject({ statusCode: 400, code: "NOT_NEGOTIABLE" });
  });

  it("refuses another member's bill", async () => {
    const other = await db.user.create({ data: { email: "b@example.com", passwordHash: "x" } });
    await expect(
      service.create(other.id as string, { billId, feePercent: 40 }, CTX),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("refuses a second open case for the same bill", async () => {
    await service.create(userId, { billId, feePercent: 40 }, CTX);
    await expect(service.create(userId, { billId, feePercent: 40 }, CTX)).rejects.toMatchObject({
      statusCode: 409,
      code: "CASE_ALREADY_OPEN",
    });
  });
});

describe("concierge offer publication", () => {
  it("records the offer, its note, and the time it was made", async () => {
    const id = await openOffer(24_000);
    const found = await service.findOwned(userId, id);

    expect(found?.status).toBe("offer_pending");
    expect(found?.offeredAnnualSavingsCents).toBe(24_000);
    expect(found?.offerNote).toContain("Retention plan");
    expect(found?.offeredAt).not.toBeNull();
    expect(found?.offerRespondedAt).toBeNull();
  });

  it("books no fee and no savings merely by offering", async () => {
    const id = await openOffer();
    const found = await service.findOwned(userId, id);

    expect(found?.feeAmountCents).toBeNull();
    expect(found?.confirmedAnnualSavingsCents).toBeNull();
    expect(await db.savingsEvent.count()).toBe(0);
  });

  it("requires an amount when publishing an offer", async () => {
    const created = await service.create(userId, { billId, feePercent: 40 }, CTX);
    await service.advanceAsConcierge(created.id, "in_review", ADMIN);
    await service.advanceAsConcierge(created.id, "in_progress", ADMIN);

    await expect(
      service.advanceAsConcierge(created.id, "offer_pending", ADMIN),
    ).rejects.toMatchObject({ statusCode: 400, code: "OFFER_AMOUNT_REQUIRED" });
  });

  it("refuses to publish an offer before the case is in progress", async () => {
    const created = await service.create(userId, { billId, feePercent: 40 }, CTX);
    await expect(
      service.advanceAsConcierge(created.id, "offer_pending", {
        ...ADMIN,
        offeredAnnualSavingsCents: 1_000,
      }),
    ).rejects.toMatchObject({ statusCode: 409, code: "INVALID_TRANSITION" });
  });

  /** The central safety property of the whole flow. */
  it("forbids the concierge from succeeding the case themselves", async () => {
    const id = await openOffer();
    await expect(service.advanceAsConcierge(id, "succeeded", ADMIN)).rejects.toMatchObject({
      statusCode: 403,
      code: "TRANSITION_FORBIDDEN",
    });
    expect(await db.savingsEvent.count()).toBe(0);
  });

  it("lets the concierge pull the offer back when a provider reneges", async () => {
    const id = await openOffer();
    const updated = await service.advanceAsConcierge(id, "in_progress", ADMIN);
    expect(updated?.status).toBe("in_progress");
  });

  it("replaces the amount when a pulled-back offer is re-published", async () => {
    const id = await openOffer(24_000);
    await service.advanceAsConcierge(id, "in_progress", ADMIN);
    await service.advanceAsConcierge(id, "offer_pending", {
      ...ADMIN,
      offeredAnnualSavingsCents: 18_000,
      offerNote: "Provider reduced the term",
    });

    const found = await service.findOwned(userId, id);
    expect(found?.offeredAnnualSavingsCents).toBe(18_000);
    expect(found?.offerRespondedAt).toBeNull();
  });

  it("charges the fee against the re-published amount, not the original", async () => {
    const id = await openOffer(24_000, 50);
    await service.advanceAsConcierge(id, "in_progress", ADMIN);
    await service.advanceAsConcierge(id, "offer_pending", {
      ...ADMIN,
      offeredAnnualSavingsCents: 10_000,
    });

    const approved = await service.approveOffer(userId, id, {}, CTX);
    expect(approved?.confirmedAnnualSavingsCents).toBe(10_000);
    expect(approved?.feeAmountCents).toBe(5_000);
  });
});

describe("approveOffer", () => {
  it("succeeds the case and locks in the confirmed savings", async () => {
    const id = await openOffer(24_000, 40);
    const approved = await service.approveOffer(userId, id, {}, CTX);

    expect(approved?.status).toBe("succeeded");
    expect(approved?.confirmedAnnualSavingsCents).toBe(24_000);
    expect(approved?.offerRespondedAt).not.toBeNull();
    expect(approved?.resolvedAt).not.toBeNull();
  });

  it("computes the fee as the chosen percentage of confirmed savings", async () => {
    const id = await openOffer(24_000, 40);
    const approved = await service.approveOffer(userId, id, {}, CTX);

    expect(approved?.feeAmountCents).toBe(9_600);
    expect(approved?.netAnnualSavingsCents).toBe(14_400);
  });

  it("credits the member's net share to the savings ledger", async () => {
    const id = await openOffer(24_000, 40);
    await service.approveOffer(userId, id, {}, CTX);

    const events = await db.savingsEvent.findMany({});
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      userId,
      kind: "bill_negotiated",
      amountCents: 14_400,
      sourceType: "negotiation",
      sourceId: id,
      description: "Negotiated City Internet",
    });
  });

  it("keeps the gross figure on the case for the breakdown", async () => {
    const id = await openOffer(30_000, 50);
    const approved = await service.approveOffer(userId, id, {}, CTX);

    expect(approved?.confirmedAnnualSavingsCents).toBe(30_000);
    expect(approved?.feeAmountCents).toBe(15_000);
    const ledger = await db.savingsEvent.findFirst({});
    expect(ledger?.amountCents).toBe(15_000);
  });

  it("credits the ledger exactly once even if approval is retried", async () => {
    const id = await openOffer(24_000, 40);
    await service.approveOffer(userId, id, {}, CTX);

    await expect(service.approveOffer(userId, id, {}, CTX)).rejects.toMatchObject({
      statusCode: 409,
      code: "NO_PENDING_OFFER",
    });
    expect(await db.savingsEvent.count()).toBe(1);
  });

  it("refuses when there is no pending offer", async () => {
    const created = await service.create(userId, { billId, feePercent: 40 }, CTX);
    await expect(service.approveOffer(userId, created.id, {}, CTX)).rejects.toMatchObject({
      statusCode: 409,
      code: "NO_PENDING_OFFER",
    });
  });

  it("refuses an offer_pending case whose amount is missing", async () => {
    const id = await openOffer();
    await db.negotiationCase.update({
      where: { id },
      data: { offeredAnnualSavingsCents: null },
    });
    await expect(service.approveOffer(userId, id, {}, CTX)).rejects.toMatchObject({
      statusCode: 400,
      code: "OFFER_INCOMPLETE",
    });
  });

  it("returns null for another member's case", async () => {
    const id = await openOffer();
    const other = await db.user.create({ data: { email: "c@example.com", passwordHash: "x" } });
    expect(await service.approveOffer(other.id as string, id, {}, CTX)).toBeNull();
  });

  it("audits the fee it booked", async () => {
    const id = await openOffer(24_000, 40);
    await service.approveOffer(userId, id, {}, CTX);

    const log = await db.auditLog.findFirst({ where: { action: "negotiation.offer_approved" } });
    expect(log?.metadata).toMatchObject({
      confirmedAnnualSavingsCents: 24_000,
      feeAmountCents: 9_600,
      netAnnualSavingsCents: 14_400,
      feePercent: 40,
    });
  });

  it("never lets the fee exceed the saving", async () => {
    const id = await openOffer(1, 60);
    const approved = await service.approveOffer(userId, id, {}, CTX);

    expect(approved?.feeAmountCents).toBeLessThanOrEqual(1);
    expect(approved?.netAnnualSavingsCents).toBeGreaterThanOrEqual(0);
  });

  it("records no ledger entry when the member's net share rounds to zero", async () => {
    const id = await openOffer(1, 100 - 40);
    await service.approveOffer(userId, id, {}, CTX);
    // 60% of 1 cent rounds to 1 cent of fee, leaving 0 net — nothing to credit.
    expect(await db.savingsEvent.count()).toBe(0);
  });
});

describe("rejectOffer", () => {
  it("fails the case without charging anything", async () => {
    const id = await openOffer(24_000, 40);
    const rejected = await service.rejectOffer(userId, id, { note: "Not worth switching" }, CTX);

    expect(rejected?.status).toBe("failed");
    expect(rejected?.feeAmountCents).toBeNull();
    expect(rejected?.confirmedAnnualSavingsCents).toBeNull();
    expect(rejected?.outcomeNote).toBe("Not worth switching");
    expect(rejected?.offerRespondedAt).not.toBeNull();
  });

  it("records no savings", async () => {
    const id = await openOffer();
    await service.rejectOffer(userId, id, {}, CTX);
    expect(await db.savingsEvent.count()).toBe(0);
  });

  it("cannot be approved afterwards", async () => {
    const id = await openOffer();
    await service.rejectOffer(userId, id, {}, CTX);
    await expect(service.approveOffer(userId, id, {}, CTX)).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  it("refuses when there is no pending offer", async () => {
    const created = await service.create(userId, { billId, feePercent: 40 }, CTX);
    await expect(service.rejectOffer(userId, created.id, {}, CTX)).rejects.toMatchObject({
      code: "NO_PENDING_OFFER",
    });
  });
});

describe("withdraw", () => {
  it("cancels an unresolved case", async () => {
    const created = await service.create(userId, { billId, feePercent: 40 }, CTX);
    const withdrawn = await service.withdraw(userId, created.id, CTX);
    expect(withdrawn?.status).toBe("canceled");
  });

  it("can withdraw even while an offer is pending", async () => {
    const id = await openOffer();
    const withdrawn = await service.withdraw(userId, id, CTX);
    expect(withdrawn?.status).toBe("canceled");
    expect(await db.savingsEvent.count()).toBe(0);
  });

  it("refuses to withdraw a resolved case", async () => {
    const id = await openOffer();
    await service.approveOffer(userId, id, {}, CTX);
    await expect(service.withdraw(userId, id, CTX)).rejects.toMatchObject({ statusCode: 409 });
  });
});

describe("list", () => {
  it("scopes to the member and filters by status and bill", async () => {
    const id = await openOffer();

    const all = await service.list(userId, { page: 1, pageSize: 20 });
    expect(all.total).toBe(1);

    const pending = await service.list(userId, {
      page: 1,
      pageSize: 20,
      status: "offer_pending",
    });
    expect(pending.total).toBe(1);
    expect(pending.data[0]?.id).toBe(id);

    const byBill = await service.list(userId, { page: 1, pageSize: 20, billId });
    expect(byBill.total).toBe(1);

    const other = await db.user.create({ data: { email: "e@example.com", passwordHash: "x" } });
    const foreign = await service.list(other.id as string, { page: 1, pageSize: 20 });
    expect(foreign.total).toBe(0);
  });
});
