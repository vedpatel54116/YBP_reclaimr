import { describe, expect, it } from "vitest";
import {
  findLargePurchases,
  findLowBalanceAccounts,
  findUpcomingBills,
  nextDueDate,
} from "../src/alerts/rules";
import { day, NOW } from "./fixtures";

describe("findLowBalanceAccounts", () => {
  it("flags checking/savings accounts under the threshold", () => {
    const drafts = findLowBalanceAccounts(
      [
        { accountId: "a1", name: "Premier Checking", type: "checking", balanceCents: 3_200 },
        { accountId: "a2", name: "Everyday Savings", type: "savings", balanceCents: 50_000 },
        { accountId: "a3", name: "Platinum Card", type: "credit_card", balanceCents: -1_000 },
      ],
      5_000,
    );
    expect(drafts).toHaveLength(1);
    expect(drafts[0]!.type).toBe("low_balance");
    expect(drafts[0]!.severity).toBe("warning");
    expect(drafts[0]!.dedupKey).toBe("low_balance:a1:3200");
  });

  it("skips null balances and non-cash accounts", () => {
    expect(
      findLowBalanceAccounts(
        [
          { accountId: "a1", name: "Checking", type: "checking", balanceCents: null },
          { accountId: "a3", name: "Card", type: "credit_card", balanceCents: -99_999 },
        ],
        5_000,
      ),
    ).toHaveLength(0);
  });
});

describe("findLargePurchases", () => {
  it("flags charges over the threshold", () => {
    const drafts = findLargePurchases(
      [
        { transactionId: "t1", merchantName: "APPLE STORE", amountCents: 129_900 },
        { transactionId: "t2", merchantName: "COFFEE", amountCents: 480 },
      ],
      25_000,
    );
    expect(drafts).toHaveLength(1);
    expect(drafts[0]!.dedupKey).toBe("large_purchase:t1");
  });
});

describe("nextDueDate", () => {
  it("returns this month's date when still in the future", () => {
    // NOW is 2026-08-22; the 28th is still ahead.
    const due = nextDueDate(28, NOW);
    expect(due.toISOString().slice(0, 10)).toBe("2026-08-28");
  });

  it("rolls to next month when the day has passed", () => {
    const due = nextDueDate(5, NOW);
    expect(due.toISOString().slice(0, 10)).toBe("2026-09-05");
  });

  it("clips due day 31 in a 30-day month", () => {
    const due = nextDueDate(31, day("2026-09-15")); // September has 30 days
    expect(due.toISOString().slice(0, 10)).toBe("2026-09-30");
  });

  it("treats today as due (window includes day 0)", () => {
    const due = nextDueDate(22, NOW);
    expect(due.toISOString().slice(0, 10)).toBe("2026-08-22");
  });
});

describe("findUpcomingBills", () => {
  it("includes bills due within the window", () => {
    const matches = findUpcomingBills(
      [
        {
          billId: "b1",
          name: "Xfinity Internet",
          dueDay: 25,
          expectedAmountCents: 8_999,
          lastAmountCents: null,
        },
        {
          billId: "b2",
          name: "Rent",
          dueDay: 1,
          expectedAmountCents: 215_000,
          lastAmountCents: null,
        },
      ],
      NOW,
      3,
    );
    expect(matches).toHaveLength(1);
    expect(matches[0]!.billId).toBe("b1");
    expect(matches[0]!.draft.dedupKey).toBe("upcoming_bill:b1:2026-08-25");
  });

  it("falls back to lastAmountCents when no expectation exists", () => {
    const matches = findUpcomingBills(
      [
        {
          billId: "b1",
          name: "Con Edison",
          dueDay: 24,
          expectedAmountCents: null,
          lastAmountCents: 9_240,
        },
      ],
      NOW,
      3,
    );
    expect(matches[0]!.draft.data.amountCents).toBe(9_240);
  });
});
