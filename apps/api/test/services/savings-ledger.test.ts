import { beforeEach, describe, expect, it } from "vitest";
import { SavingsLedger } from "../../src/services/savings-ledger";
import { createFakePrisma, type FakePrisma } from "../support/fake-prisma";
import { useTestEnv } from "../support/harness";

useTestEnv();

const CASE_ID = "33333333-3333-4333-8333-333333333333";
const OTHER_CASE_ID = "44444444-4444-4444-8444-444444444444";
const AT = new Date("2026-06-15T14:22:00.000Z");

let db: FakePrisma;
let ledger: SavingsLedger;
let userId: string;

beforeEach(async () => {
  db = createFakePrisma();
  ledger = new SavingsLedger(db.asPrisma());
  const user = await db.user.create({ data: { email: "member@example.com", passwordHash: "x" } });
  userId = user.id as string;
});

describe("record", () => {
  it("writes a positive saving and returns the row", async () => {
    const result = await ledger.record({
      userId,
      kind: "manual_adjustment",
      amountCents: 2_500,
      description: "Haggled the gym down",
      occurredAt: AT,
      sourceType: "manual",
      sourceId: null,
    });

    expect(result.created).toBe(true);
    expect(result.amountCents).toBe(2_500);
    expect(result.event).not.toBeNull();
    expect(result.event?.description).toBe("Haggled the gym down");
  });

  it("stores occurredAt as a calendar day in UTC", async () => {
    const result = await ledger.record({
      userId,
      kind: "manual_adjustment",
      amountCents: 100,
      description: "x",
      occurredAt: AT,
      sourceType: "manual",
      sourceId: null,
    });
    expect((result.event?.occurredAt as Date).toISOString()).toBe("2026-06-15T00:00:00.000Z");
  });

  it("skips a zero or negative amount instead of writing an invalid row", async () => {
    for (const amountCents of [0, -1, -5_000]) {
      const result = await ledger.record({
        userId,
        kind: "manual_adjustment",
        amountCents,
        description: "nothing",
        occurredAt: AT,
        sourceType: "manual",
        sourceId: null,
      });
      expect(result).toEqual({ created: false, amountCents: 0, event: null });
    }
    expect(await db.savingsEvent.count()).toBe(0);
  });

  it("credits a given source exactly once", async () => {
    const entry = {
      userId,
      kind: "subscription_canceled" as const,
      amountCents: 19_188,
      description: "Canceled Streaming Plus",
      occurredAt: AT,
      sourceType: "cancellation" as const,
      sourceId: CASE_ID,
    };

    const first = await ledger.record(entry);
    const second = await ledger.record(entry);

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.event).toBeNull();
    expect(await db.savingsEvent.count()).toBe(1);
  });

  it("still reports the amount when it loses the exactly-once race", async () => {
    const entry = {
      userId,
      kind: "bill_negotiated" as const,
      amountCents: 14_400,
      description: "Negotiated internet",
      occurredAt: AT,
      sourceType: "negotiation" as const,
      sourceId: CASE_ID,
    };
    await ledger.record(entry);
    const second = await ledger.record(entry);

    // The caller learns the credit exists without a second row being written.
    expect(second).toMatchObject({ created: false, amountCents: 14_400 });
  });

  it("treats distinct sources of the same type independently", async () => {
    const base = {
      userId,
      kind: "bill_negotiated" as const,
      amountCents: 1_000,
      description: "x",
      occurredAt: AT,
      sourceType: "negotiation" as const,
    };
    await ledger.record({ ...base, sourceId: CASE_ID });
    await ledger.record({ ...base, sourceId: OTHER_CASE_ID });
    expect(await db.savingsEvent.count()).toBe(2);
  });

  it("treats the same id under different source types independently", async () => {
    const base = {
      userId,
      amountCents: 1_000,
      description: "x",
      occurredAt: AT,
      sourceId: CASE_ID,
    };
    await ledger.record({ ...base, kind: "subscription_canceled", sourceType: "cancellation" });
    await ledger.record({ ...base, kind: "bill_negotiated", sourceType: "negotiation" });
    expect(await db.savingsEvent.count()).toBe(2);
  });

  /**
   * Manual adjustments carry a null sourceId. Postgres treats NULLs as distinct,
   * so the exactly-once index must not collapse them into one row.
   */
  it("allows many manual adjustments, which carry no source id", async () => {
    for (const description of ["First", "Second", "Third"]) {
      const result = await ledger.record({
        userId,
        kind: "manual_adjustment",
        amountCents: 500,
        description,
        occurredAt: AT,
        sourceType: "manual",
        sourceId: null,
      });
      expect(result.created).toBe(true);
    }
    expect(await db.savingsEvent.count()).toBe(3);
  });
});

describe("recordCancellation", () => {
  it("credits a year of the monthly cost", async () => {
    const result = await ledger.recordCancellation({
      userId,
      caseId: CASE_ID,
      subscriptionName: "Streaming Plus",
      monthlyAmountCents: 1_599,
      resolvedAt: AT,
    });

    expect(result.created).toBe(true);
    expect(result.amountCents).toBe(1_599 * 12);
    expect(result.event).toMatchObject({
      kind: "subscription_canceled",
      description: "Canceled Streaming Plus",
      sourceType: "cancellation",
      sourceId: CASE_ID,
    });
  });

  it("is idempotent per case", async () => {
    const input = {
      userId,
      caseId: CASE_ID,
      subscriptionName: "Streaming Plus",
      monthlyAmountCents: 1_599,
      resolvedAt: AT,
    };
    await ledger.recordCancellation(input);
    await ledger.recordCancellation(input);
    expect(await db.savingsEvent.count()).toBe(1);
  });

  it("writes nothing for a free subscription", async () => {
    const result = await ledger.recordCancellation({
      userId,
      caseId: CASE_ID,
      subscriptionName: "Free tier",
      monthlyAmountCents: 0,
      resolvedAt: AT,
    });
    expect(result.created).toBe(false);
    expect(await db.savingsEvent.count()).toBe(0);
  });
});

describe("recordNegotiation", () => {
  it("credits the member's net share, not the gross savings", async () => {
    const result = await ledger.recordNegotiation({
      userId,
      caseId: CASE_ID,
      billName: "City Internet",
      confirmedAnnualSavingsCents: 24_000,
      feePercent: 40,
      resolvedAt: AT,
    });

    expect(result.amountCents).toBe(14_400);
    expect(result.event).toMatchObject({
      kind: "bill_negotiated",
      description: "Negotiated City Internet",
      amountCents: 14_400,
    });
  });

  it("is idempotent per case", async () => {
    const input = {
      userId,
      caseId: CASE_ID,
      billName: "City Internet",
      confirmedAnnualSavingsCents: 24_000,
      feePercent: 40,
      resolvedAt: AT,
    };
    await ledger.recordNegotiation(input);
    await ledger.recordNegotiation(input);
    expect(await db.savingsEvent.count()).toBe(1);
  });

  it("writes nothing when the fee consumes the entire saving", async () => {
    const result = await ledger.recordNegotiation({
      userId,
      caseId: CASE_ID,
      billName: "Tiny",
      confirmedAnnualSavingsCents: 1,
      feePercent: 60,
      resolvedAt: AT,
    });
    expect(result.created).toBe(false);
    expect(await db.savingsEvent.count()).toBe(0);
  });
});
