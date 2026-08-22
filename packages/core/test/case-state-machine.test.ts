import { describe, expect, it } from "vitest";
import {
  CANCELLATION_TRANSITIONS,
  canTransition,
  checkTransition,
  isTerminalCaseStatus,
  NEGOTIATION_TRANSITIONS,
  nextStatuses,
  TERMINAL_CASE_STATUSES,
  transitionsFor,
} from "../src/cases/state-machine";
import type { CaseActor, CaseStatus } from "../src/types";

const ALL_STATUSES: CaseStatus[] = [
  "submitted",
  "in_review",
  "in_progress",
  "offer_pending",
  "succeeded",
  "failed",
  "canceled",
];

const ACTORS: CaseActor[] = ["member", "concierge", "system"];

describe("terminal statuses", () => {
  it("treats succeeded, failed, and canceled as terminal", () => {
    expect(TERMINAL_CASE_STATUSES).toEqual(["succeeded", "failed", "canceled"]);
    for (const status of TERMINAL_CASE_STATUSES) {
      expect(isTerminalCaseStatus(status)).toBe(true);
    }
  });

  it("treats every working status as non-terminal", () => {
    for (const status of ["submitted", "in_review", "in_progress", "offer_pending"] as const) {
      expect(isTerminalCaseStatus(status)).toBe(false);
    }
  });

  it("allows no transition out of a terminal status, for either case type", () => {
    for (const kind of ["cancellation", "negotiation"] as const) {
      for (const status of TERMINAL_CASE_STATUSES) {
        expect(nextStatuses(kind, status)).toEqual([]);
        for (const actor of ACTORS) {
          for (const to of ALL_STATUSES) {
            expect(canTransition(kind, status, to, actor)).toBe(false);
          }
        }
      }
    }
  });
});

describe("cancellation lifecycle", () => {
  it("walks submitted → in_review → in_progress → succeeded as the concierge", () => {
    expect(canTransition("cancellation", "submitted", "in_review", "concierge")).toBe(true);
    expect(canTransition("cancellation", "in_review", "in_progress", "concierge")).toBe(true);
    expect(canTransition("cancellation", "in_progress", "succeeded", "concierge")).toBe(true);
  });

  it("lets the concierge fail a case from review or progress", () => {
    expect(canTransition("cancellation", "in_review", "failed", "concierge")).toBe(true);
    expect(canTransition("cancellation", "in_progress", "failed", "concierge")).toBe(true);
  });

  it("refuses to skip review", () => {
    const check = checkTransition("cancellation", "submitted", "in_progress", "concierge");
    expect(check).toEqual({ ok: false, reason: "illegal" });
  });

  it("refuses to succeed straight from submitted", () => {
    expect(canTransition("cancellation", "submitted", "succeeded", "concierge")).toBe(false);
  });

  it("never uses the negotiation-only offer_pending state", () => {
    expect(CANCELLATION_TRANSITIONS.offer_pending).toEqual([]);
    for (const status of ALL_STATUSES) {
      expect(canTransition("cancellation", status, "offer_pending", "concierge")).toBe(false);
    }
  });
});

describe("negotiation lifecycle", () => {
  it("walks submitted → in_review → in_progress → offer_pending as the concierge", () => {
    expect(canTransition("negotiation", "submitted", "in_review", "concierge")).toBe(true);
    expect(canTransition("negotiation", "in_review", "in_progress", "concierge")).toBe(true);
    expect(canTransition("negotiation", "in_progress", "offer_pending", "concierge")).toBe(true);
  });

  it("lets the member approve a pending offer", () => {
    expect(canTransition("negotiation", "offer_pending", "succeeded", "member")).toBe(true);
  });

  it("lets the member reject a pending offer", () => {
    expect(canTransition("negotiation", "offer_pending", "failed", "member")).toBe(true);
  });

  it("lets the concierge pull an offer back to in_progress when a provider reneges", () => {
    expect(canTransition("negotiation", "offer_pending", "in_progress", "concierge")).toBe(true);
  });

  it("requires an offer before success: in_progress cannot succeed directly", () => {
    expect(canTransition("negotiation", "in_progress", "succeeded", "member")).toBe(false);
    expect(canTransition("negotiation", "in_progress", "succeeded", "concierge")).toBe(false);
  });
});

/**
 * The load-bearing security property: `succeeded` books a success fee, so no
 * actor other than the member may ever reach it on a negotiation.
 */
describe("fee authority", () => {
  it("forbids the concierge from succeeding a negotiation from any status", () => {
    for (const from of ALL_STATUSES) {
      const check = checkTransition("negotiation", from, "succeeded", "concierge");
      expect(check.ok).toBe(false);
      // From offer_pending the transition exists but the actor is wrong, which is
      // a 403; elsewhere it does not exist at all, which is a 409.
      if (from === "offer_pending") {
        expect(check).toEqual({ ok: false, reason: "forbidden_actor" });
      }
    }
  });

  it("forbids the system actor from succeeding a negotiation", () => {
    for (const from of ALL_STATUSES) {
      expect(canTransition("negotiation", from, "succeeded", "system")).toBe(false);
    }
  });

  it("names the member as the only actor on the negotiation success edge", () => {
    const edge = NEGOTIATION_TRANSITIONS.offer_pending.find((t) => t.to === "succeeded");
    expect(edge?.actors).toEqual(["member"]);
  });

  it("forbids the member from awarding themselves an offer to approve", () => {
    for (const from of ALL_STATUSES) {
      expect(canTransition("negotiation", from, "offer_pending", "member")).toBe(false);
    }
  });
});

describe("withdrawal authority", () => {
  it("lets the member withdraw any unresolved case of either kind", () => {
    for (const kind of ["cancellation", "negotiation"] as const) {
      for (const from of ALL_STATUSES.filter((status) => !isTerminalCaseStatus(status))) {
        // offer_pending is unreachable for cancellations, so skip it there.
        if (kind === "cancellation" && from === "offer_pending") continue;
        expect(canTransition(kind, from, "canceled", "member")).toBe(true);
      }
    }
  });

  it("does not let staff withdraw on a member's behalf", () => {
    for (const kind of ["cancellation", "negotiation"] as const) {
      for (const from of ALL_STATUSES) {
        expect(canTransition(kind, from, "canceled", "concierge")).toBe(false);
      }
    }
  });
});

describe("structural invariants", () => {
  it("refuses a no-op transition, so the timeline cannot record a repeat", () => {
    for (const kind of ["cancellation", "negotiation"] as const) {
      for (const status of ALL_STATUSES) {
        for (const actor of ACTORS) {
          expect(canTransition(kind, status, status, actor)).toBe(false);
        }
      }
    }
  });

  it("declares an entry for every status in both machines", () => {
    for (const kind of ["cancellation", "negotiation"] as const) {
      const map = transitionsFor(kind);
      for (const status of ALL_STATUSES) {
        expect(map[status]).toBeDefined();
      }
    }
  });

  it("lists at least one permitted actor on every declared transition", () => {
    for (const kind of ["cancellation", "negotiation"] as const) {
      for (const transitions of Object.values(transitionsFor(kind))) {
        for (const transition of transitions) {
          expect(transition.actors.length).toBeGreaterThan(0);
        }
      }
    }
  });
});
