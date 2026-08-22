import { beforeEach, describe, expect, it } from "vitest";
import type { BillingSubscription } from "../../src/adapters/stripe";
import { BillingWebhookService } from "../../src/modules/billing/webhook.service";
import { AuditService } from "../../src/services/audit";
import { createFakePrisma, type FakePrisma } from "../support/fake-prisma";
import { silentLogger, useTestEnv } from "../support/harness";

useTestEnv();

let db: FakePrisma;
let service: BillingWebhookService;
let userId: string;

const SUB_ID = "sub_test_1";
const CUS_ID = "cus_test_1";

function subscription(overrides: Partial<BillingSubscription> = {}): BillingSubscription {
  return {
    id: SUB_ID,
    customerId: CUS_ID,
    status: "active",
    currentPeriodStart: new Date("2026-06-01T00:00:00.000Z"),
    currentPeriodEnd: new Date("2026-07-01T00:00:00.000Z"),
    trialEndsAt: null,
    cancelAtPeriodEnd: false,
    priceCentsMonthly: 900,
    interval: "monthly",
    userId,
    ...overrides,
  };
}

beforeEach(async () => {
  db = createFakePrisma();
  const prisma = db.asPrisma();
  service = new BillingWebhookService(
    prisma,
    new AuditService(prisma, silentLogger()),
    silentLogger(),
  );

  const user = await db.user.create({ data: { email: "member@example.com", passwordHash: "x" } });
  userId = user.id as string;
});

describe("idempotency", () => {
  it("applies an event the first time", async () => {
    const outcome = await service.handle({
      id: "evt_1",
      type: "checkout_completed",
      subscription: subscription(),
    });
    expect(outcome).toEqual({ applied: true, action: "granted" });
  });

  it("ignores a redelivery of the same event id", async () => {
    const event = {
      id: "evt_1",
      type: "checkout_completed" as const,
      subscription: subscription(),
    };
    await service.handle(event);
    const second = await service.handle(event);

    expect(second).toEqual({ applied: false, action: "duplicate" });
    expect(await db.premiumSubscription.count()).toBe(1);
  });

  it("records each processed event id once", async () => {
    const event = {
      id: "evt_a",
      type: "checkout_completed" as const,
      subscription: subscription(),
    };
    await service.handle(event);
    await service.handle(event);
    expect(await db.stripeEvent.count()).toBe(1);
  });

  it("does not record events it ignores, which have nothing to deduplicate", async () => {
    await service.handle({ id: "evt_x", type: "ignored", providerType: "customer.created" });
    await service.handle({ id: "evt_x", type: "ignored", providerType: "customer.created" });
    expect(await db.stripeEvent.count()).toBe(0);
  });

  it("does not let a duplicate overwrite a later state", async () => {
    await service.handle({
      id: "evt_1",
      type: "checkout_completed",
      subscription: subscription(),
    });
    await service.handle({
      id: "evt_2",
      type: "subscription_updated",
      subscription: subscription({ cancelAtPeriodEnd: true }),
    });
    // A redelivery of the first event must not undo the cancellation flag.
    await service.handle({
      id: "evt_1",
      type: "checkout_completed",
      subscription: subscription(),
    });

    const row = await db.premiumSubscription.findFirst({ where: { userId } });
    expect(row?.cancelAtPeriodEnd).toBe(true);
  });
});

describe("granting premium", () => {
  it("creates the local mirror from checkout", async () => {
    await service.handle({
      id: "evt_1",
      type: "checkout_completed",
      subscription: subscription(),
    });

    const row = await db.premiumSubscription.findFirst({ where: { userId } });
    expect(row).toMatchObject({
      status: "active",
      priceCentsMonthly: 900,
      interval: "monthly",
      externalCustomerId: CUS_ID,
      externalSubscriptionId: SUB_ID,
    });
  });

  it("stores a yearly plan's cadence", async () => {
    await service.handle({
      id: "evt_1",
      type: "checkout_completed",
      subscription: subscription({ interval: "yearly", priceCentsMonthly: 1_200 }),
    });
    const row = await db.premiumSubscription.findFirst({ where: { userId } });
    expect(row).toMatchObject({ interval: "yearly", priceCentsMonthly: 1_200 });
  });

  it("records a trial as trialing", async () => {
    await service.handle({
      id: "evt_1",
      type: "checkout_completed",
      subscription: subscription({
        status: "trialing",
        trialEndsAt: new Date("2026-06-08T00:00:00.000Z"),
      }),
    });
    const row = await db.premiumSubscription.findFirst({ where: { userId } });
    expect(row?.status).toBe("trialing");
    expect(row?.trialEndsAt).not.toBeNull();
  });

  it("audits the grant", async () => {
    await service.handle({
      id: "evt_1",
      type: "checkout_completed",
      subscription: subscription(),
    });
    const log = await db.auditLog.findFirst({ where: { action: "premium.granted" } });
    expect(log).toMatchObject({ actorType: "system", userId });
  });

  it("reports an update rather than a grant when a mirror already exists", async () => {
    await service.handle({
      id: "evt_1",
      type: "checkout_completed",
      subscription: subscription(),
    });
    const outcome = await service.handle({
      id: "evt_2",
      type: "subscription_updated",
      subscription: subscription({ status: "past_due" }),
    });
    expect(outcome.action).toBe("updated");
  });
});

describe("resolving the member", () => {
  it("matches on the subscription id when metadata is absent", async () => {
    await service.handle({
      id: "evt_1",
      type: "checkout_completed",
      subscription: subscription(),
    });

    const outcome = await service.handle({
      id: "evt_2",
      type: "subscription_updated",
      subscription: subscription({ userId: null, status: "past_due" }),
    });

    expect(outcome.action).toBe("updated");
    const row = await db.premiumSubscription.findFirst({ where: { userId } });
    expect(row?.status).toBe("past_due");
  });

  it("acknowledges an event that matches no member", async () => {
    const outcome = await service.handle({
      id: "evt_1",
      type: "subscription_updated",
      subscription: subscription({ userId: null, id: "sub_unknown", customerId: "cus_unknown" }),
    });

    expect(outcome).toEqual({ applied: true, action: "unmatched" });
    expect(await db.premiumSubscription.count()).toBe(0);
  });

  it("ignores metadata naming a member who no longer exists", async () => {
    const outcome = await service.handle({
      id: "evt_1",
      type: "subscription_updated",
      subscription: subscription({
        userId: "99999999-9999-4999-8999-999999999999",
        id: "sub_orphan",
        customerId: "cus_orphan",
      }),
    });
    expect(outcome.action).toBe("unmatched");
  });
});

describe("price validation", () => {
  it("refuses a price above the published band", async () => {
    const outcome = await service.handle({
      id: "evt_1",
      type: "checkout_completed",
      subscription: subscription({ priceCentsMonthly: 90_000 }),
    });

    expect(outcome.action).toBe("unmatched");
    expect(await db.premiumSubscription.count()).toBe(0);
  });

  it("refuses a price below the published band", async () => {
    const outcome = await service.handle({
      id: "evt_1",
      type: "checkout_completed",
      subscription: subscription({ priceCentsMonthly: 1 }),
    });
    expect(outcome.action).toBe("unmatched");
  });

  it("keeps the stored price when an event carries none", async () => {
    await service.handle({
      id: "evt_1",
      type: "checkout_completed",
      subscription: subscription({ priceCentsMonthly: 1_400 }),
    });
    await service.handle({
      id: "evt_2",
      type: "subscription_updated",
      subscription: subscription({ priceCentsMonthly: null, interval: null }),
    });

    const row = await db.premiumSubscription.findFirst({ where: { userId } });
    expect(row?.priceCentsMonthly).toBe(1_400);
    expect(row?.interval).toBe("monthly");
  });

  it("refuses a first-time subscription with no price at all", async () => {
    const outcome = await service.handle({
      id: "evt_1",
      type: "checkout_completed",
      subscription: subscription({ priceCentsMonthly: null }),
    });
    expect(outcome.action).toBe("unmatched");
  });
});

describe("ending a subscription", () => {
  beforeEach(async () => {
    await service.handle({
      id: "evt_seed",
      type: "checkout_completed",
      subscription: subscription(),
    });
  });

  it("marks the membership canceled", async () => {
    const outcome = await service.handle({
      id: "evt_del",
      type: "subscription_deleted",
      subscription: subscription({ status: "canceled" }),
    });

    expect(outcome.action).toBe("ended");
    const row = await db.premiumSubscription.findFirst({ where: { userId } });
    expect(row?.status).toBe("canceled");
    expect(row?.cancelAtPeriodEnd).toBe(false);
  });

  it("audits the ending", async () => {
    await service.handle({
      id: "evt_del",
      type: "subscription_deleted",
      subscription: subscription({ status: "canceled" }),
    });
    expect(await db.auditLog.findFirst({ where: { action: "premium.ended" } })).not.toBeNull();
  });
});

describe("payment failure", () => {
  beforeEach(async () => {
    await service.handle({
      id: "evt_seed",
      type: "checkout_completed",
      subscription: subscription(),
    });
  });

  it("marks the membership past_due, keeping the entitlement alive", async () => {
    const outcome = await service.handle({
      id: "evt_fail",
      type: "payment_failed",
      subscriptionId: SUB_ID,
      customerId: CUS_ID,
    });

    expect(outcome.action).toBe("payment_failed");
    const row = await db.premiumSubscription.findFirst({ where: { userId } });
    expect(row?.status).toBe("past_due");
  });

  it("matches on the customer id when the subscription id is absent", async () => {
    const outcome = await service.handle({
      id: "evt_fail",
      type: "payment_failed",
      subscriptionId: null,
      customerId: CUS_ID,
    });
    expect(outcome.action).toBe("payment_failed");
  });

  it("does not resurrect a canceled membership as past_due", async () => {
    await service.handle({
      id: "evt_del",
      type: "subscription_deleted",
      subscription: subscription({ status: "canceled" }),
    });
    const outcome = await service.handle({
      id: "evt_fail",
      type: "payment_failed",
      subscriptionId: SUB_ID,
      customerId: CUS_ID,
    });

    expect(outcome.action).toBe("ignored");
    const row = await db.premiumSubscription.findFirst({ where: { userId } });
    expect(row?.status).toBe("canceled");
  });

  it("acknowledges a failure it cannot attribute", async () => {
    const outcome = await service.handle({
      id: "evt_fail",
      type: "payment_failed",
      subscriptionId: null,
      customerId: null,
    });
    expect(outcome).toEqual({ applied: true, action: "unmatched" });
  });
});

describe("unhandled event types", () => {
  it("acknowledges them so the provider stops retrying", async () => {
    const outcome = await service.handle({
      id: "evt_x",
      type: "ignored",
      providerType: "customer.created",
    });
    expect(outcome).toEqual({ applied: true, action: "ignored" });
  });
});
