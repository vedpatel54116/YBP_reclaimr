import { beforeEach, describe, expect, it } from "vitest";
import { AuditService } from "../../src/services/audit";
import { SavingsLedger } from "../../src/services/savings-ledger";
import { CancellationService } from "../../src/modules/cancellations/service";
import { createFakePrisma, type FakePrisma } from "../support/fake-prisma";
import { silentLogger, useTestEnv } from "../support/harness";

useTestEnv();

const CTX = { ip: "203.0.113.4", userAgent: "vitest" };
const ADMIN = { adminId: "11111111-1111-4111-8111-111111111111", ctx: CTX };

let db: FakePrisma;
let service: CancellationService;
let userId: string;
let subscriptionId: string;

async function seed(overrides: Record<string, unknown> = {}): Promise<void> {
  const user = await db.user.create({
    data: { email: "member@example.com", passwordHash: "x" },
  });
  userId = user.id as string;

  const subscription = await db.subscription.create({
    data: {
      userId,
      name: "Streaming Plus",
      amountCents: 1_599,
      cadence: "monthly",
      nextBillingDate: new Date("2026-09-01"),
      ...overrides,
    },
  });
  subscriptionId = subscription.id as string;
}

beforeEach(async () => {
  db = createFakePrisma();
  const prisma = db.asPrisma();
  service = new CancellationService(
    prisma,
    new AuditService(prisma, silentLogger()),
    new SavingsLedger(prisma),
  );
  await seed();
});

describe("create", () => {
  it("opens a submitted case and seeds the timeline", async () => {
    const created = await service.create(userId, { subscriptionId }, CTX);

    expect(created.status).toBe("submitted");
    expect(created.subscriptionName).toBe("Streaming Plus");
    expect(created.resolvedAt).toBeNull();
    expect(created.timeline).toHaveLength(1);
    expect(created.timeline[0]).toMatchObject({ status: "submitted", actor: "member" });
  });

  it("snapshots the monthly-equivalent cost", async () => {
    const created = await service.create(userId, { subscriptionId }, CTX);
    expect(created.monthlyAmountCents).toBe(1_599);
  });

  it("normalizes a non-monthly cadence into the snapshot", async () => {
    db = createFakePrisma();
    const prisma = db.asPrisma();
    service = new CancellationService(
      prisma,
      new AuditService(prisma, silentLogger()),
      new SavingsLedger(prisma),
    );
    await seed({ amountCents: 4_500, cadence: "annual" });

    const created = await service.create(userId, { subscriptionId }, CTX);
    // ~$45/yr is ~$3.75/mo.
    expect(created.monthlyAmountCents).toBeGreaterThan(360);
    expect(created.monthlyAmountCents).toBeLessThan(390);
  });

  it("flags the subscription as cancel_requested", async () => {
    await service.create(userId, { subscriptionId }, CTX);
    const subscription = await db.subscription.findUnique({ where: { id: subscriptionId } });
    expect(subscription?.status).toBe("cancel_requested");
  });

  it("stores the member's reason", async () => {
    const created = await service.create(userId, { subscriptionId, reason: "Too pricey" }, CTX);
    expect(created.reason).toBe("Too pricey");
  });

  it("writes an audit entry", async () => {
    await service.create(userId, { subscriptionId }, CTX);
    const logs = await db.auditLog.findMany({ where: { action: "cancellation.created" } });
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ actorType: "member", userId });
  });

  it("refuses a subscription belonging to someone else", async () => {
    const other = await db.user.create({ data: { email: "b@example.com", passwordHash: "x" } });
    await expect(service.create(other.id as string, { subscriptionId }, CTX)).rejects.toMatchObject(
      { statusCode: 404 },
    );
  });

  it("refuses an already-canceled subscription", async () => {
    await db.subscription.update({ where: { id: subscriptionId }, data: { status: "canceled" } });
    await expect(service.create(userId, { subscriptionId }, CTX)).rejects.toMatchObject({
      statusCode: 400,
      code: "ALREADY_CANCELED",
    });
  });

  it("refuses a second open case for the same subscription", async () => {
    await service.create(userId, { subscriptionId }, CTX);
    await expect(service.create(userId, { subscriptionId }, CTX)).rejects.toMatchObject({
      statusCode: 409,
      code: "CASE_ALREADY_OPEN",
    });
  });

  it("allows a new case once the previous one is resolved", async () => {
    const first = await service.create(userId, { subscriptionId }, CTX);
    await service.withdraw(userId, first.id, CTX);
    await expect(service.create(userId, { subscriptionId }, CTX)).resolves.toMatchObject({
      status: "submitted",
    });
  });
});

describe("withdraw", () => {
  it("cancels the case and appends to the timeline", async () => {
    const created = await service.create(userId, { subscriptionId }, CTX);
    const withdrawn = await service.withdraw(userId, created.id, CTX);

    expect(withdrawn?.status).toBe("canceled");
    expect(withdrawn?.resolvedAt).not.toBeNull();
    expect(withdrawn?.timeline).toHaveLength(2);
  });

  it("releases the subscription back to active", async () => {
    const created = await service.create(userId, { subscriptionId }, CTX);
    await service.withdraw(userId, created.id, CTX);

    const subscription = await db.subscription.findUnique({ where: { id: subscriptionId } });
    expect(subscription?.status).toBe("active");
  });

  it("returns null for another member's case", async () => {
    const created = await service.create(userId, { subscriptionId }, CTX);
    const other = await db.user.create({ data: { email: "c@example.com", passwordHash: "x" } });
    expect(await service.withdraw(other.id as string, created.id, CTX)).toBeNull();
  });

  it("refuses to withdraw a resolved case", async () => {
    const created = await service.create(userId, { subscriptionId }, CTX);
    await service.advanceAsConcierge(created.id, "in_review", ADMIN);
    await service.advanceAsConcierge(created.id, "in_progress", ADMIN);
    await service.advanceAsConcierge(created.id, "succeeded", ADMIN);

    await expect(service.withdraw(userId, created.id, CTX)).rejects.toMatchObject({
      statusCode: 409,
      code: "INVALID_TRANSITION",
    });
  });

  it("records no savings for a withdrawn case", async () => {
    const created = await service.create(userId, { subscriptionId }, CTX);
    await service.withdraw(userId, created.id, CTX);
    expect(await db.savingsEvent.count()).toBe(0);
  });
});

describe("advanceAsConcierge", () => {
  async function openCase(): Promise<string> {
    const created = await service.create(userId, { subscriptionId }, CTX);
    return created.id;
  }

  it("walks the case to in_progress", async () => {
    const id = await openCase();
    await service.advanceAsConcierge(id, "in_review", ADMIN);
    const updated = await service.advanceAsConcierge(id, "in_progress", ADMIN);

    expect(updated?.status).toBe("in_progress");
    expect(updated?.resolvedAt).toBeNull();
    expect(updated?.timeline).toHaveLength(3);
    expect(updated?.timeline[2]).toMatchObject({ actor: "concierge" });
  });

  it("refuses to skip review", async () => {
    const id = await openCase();
    await expect(service.advanceAsConcierge(id, "in_progress", ADMIN)).rejects.toMatchObject({
      statusCode: 409,
      code: "INVALID_TRANSITION",
    });
  });

  it("returns null for an unknown case", async () => {
    expect(
      await service.advanceAsConcierge("00000000-0000-4000-8000-000000000000", "in_review", ADMIN),
    ).toBeNull();
  });

  describe("on success", () => {
    let caseId: string;

    beforeEach(async () => {
      caseId = await openCase();
      await service.advanceAsConcierge(caseId, "in_review", ADMIN);
      await service.advanceAsConcierge(caseId, "in_progress", ADMIN);
    });

    it("resolves the case", async () => {
      const updated = await service.advanceAsConcierge(caseId, "succeeded", ADMIN);
      expect(updated?.status).toBe("succeeded");
      expect(updated?.resolvedAt).not.toBeNull();
    });

    it("retires the subscription", async () => {
      await service.advanceAsConcierge(caseId, "succeeded", ADMIN);
      const subscription = await db.subscription.findUnique({ where: { id: subscriptionId } });
      expect(subscription?.status).toBe("canceled");
      expect(subscription?.canceledAt).not.toBeNull();
    });

    it("credits a year of the subscription to the savings ledger", async () => {
      await service.advanceAsConcierge(caseId, "succeeded", ADMIN);

      const events = await db.savingsEvent.findMany({});
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        userId,
        kind: "subscription_canceled",
        amountCents: 1_599 * 12,
        sourceType: "cancellation",
        sourceId: caseId,
      });
    });

    it("describes the saving with the subscription name", async () => {
      await service.advanceAsConcierge(caseId, "succeeded", ADMIN);
      const event = await db.savingsEvent.findFirst({});
      expect(event?.description).toBe("Canceled Streaming Plus");
    });

    it("cannot be re-succeeded, so the saving is credited once", async () => {
      await service.advanceAsConcierge(caseId, "succeeded", ADMIN);
      await expect(service.advanceAsConcierge(caseId, "succeeded", ADMIN)).rejects.toMatchObject({
        statusCode: 409,
      });
      expect(await db.savingsEvent.count()).toBe(1);
    });

    it("audits the transition against the acting admin", async () => {
      await service.advanceAsConcierge(caseId, "succeeded", ADMIN);
      const logs = await db.auditLog.findMany({ where: { action: "cancellation.advanced" } });
      const last = logs[logs.length - 1];
      expect(last).toMatchObject({ actorType: "admin", actorId: ADMIN.adminId, userId });
      expect(last?.metadata).toMatchObject({ from: "in_progress", to: "succeeded" });
    });
  });

  describe("on failure", () => {
    it("returns the subscription to active, because the member still pays it", async () => {
      const id = await openCase();
      await service.advanceAsConcierge(id, "in_review", ADMIN);
      await service.advanceAsConcierge(id, "failed", {
        ...ADMIN,
        note: "Provider requires a phone call",
      });

      const subscription = await db.subscription.findUnique({ where: { id: subscriptionId } });
      expect(subscription?.status).toBe("active");
    });

    it("records the outcome note and no savings", async () => {
      const id = await openCase();
      await service.advanceAsConcierge(id, "in_review", ADMIN);
      const updated = await service.advanceAsConcierge(id, "failed", { ...ADMIN, note: "Refused" });

      expect(updated?.status).toBe("failed");
      expect(updated?.outcomeNote).toBe("Refused");
      expect(await db.savingsEvent.count()).toBe(0);
    });
  });
});

describe("list", () => {
  it("paginates and filters by status", async () => {
    const created = await service.create(userId, { subscriptionId }, CTX);
    await service.advanceAsConcierge(created.id, "in_review", ADMIN);

    const all = await service.list(userId, { page: 1, pageSize: 20 });
    expect(all.total).toBe(1);
    expect(all.totalPages).toBe(1);

    const inReview = await service.list(userId, { page: 1, pageSize: 20, status: "in_review" });
    expect(inReview.total).toBe(1);

    const submitted = await service.list(userId, { page: 1, pageSize: 20, status: "submitted" });
    expect(submitted.total).toBe(0);
  });

  it("never returns another member's cases", async () => {
    await service.create(userId, { subscriptionId }, CTX);
    const other = await db.user.create({ data: { email: "d@example.com", passwordHash: "x" } });

    const page = await service.list(other.id as string, { page: 1, pageSize: 20 });
    expect(page.data).toEqual([]);
    expect(page.total).toBe(0);
  });
});
