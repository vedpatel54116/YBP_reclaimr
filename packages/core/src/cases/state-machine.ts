import type { CaseActor, CaseKind, CaseStatus } from "../types";

/**
 * Concierge case state machines.
 *
 * Two things are encoded here, and both are security properties rather than
 * mere bookkeeping:
 *
 *  1. Which status may follow which — so a case cannot skip review, and a
 *     resolved case can never be reopened and re-billed.
 *  2. Who may perform each transition. This is the important one: a
 *     negotiation reaches `succeeded` only via the *member*, because
 *     `succeeded` is what books the success fee. No concierge action can
 *     charge a member who did not approve the rate.
 *
 * Pure and injected-time, like everything in @reclaimr/core, so the API layer
 * can ask "is this legal?" without a database.
 */

export interface CaseTransition {
  to: CaseStatus;
  /** Actors permitted to make this transition. */
  actors: readonly CaseActor[];
}

export type CaseTransitionMap = Readonly<Record<CaseStatus, readonly CaseTransition[]>>;

/** Statuses from which no further transition is legal. */
export const TERMINAL_CASE_STATUSES: readonly CaseStatus[] = ["succeeded", "failed", "canceled"];

export function isTerminalCaseStatus(status: CaseStatus): boolean {
  return TERMINAL_CASE_STATUSES.includes(status);
}

const RESOLVED: readonly CaseTransition[] = [];

/** Members may abandon any unresolved case; withdrawal is always their call. */
const MEMBER_WITHDRAW: CaseTransition = { to: "canceled", actors: ["member"] };

/**
 * Cancellation: submitted → in_review → in_progress → succeeded | failed.
 * The concierge owns the outcome here because the outcome is binary (the
 * subscription is either canceled or it is not) and nothing is billed for it.
 */
export const CANCELLATION_TRANSITIONS: CaseTransitionMap = {
  submitted: [{ to: "in_review", actors: ["concierge", "system"] }, MEMBER_WITHDRAW],
  in_review: [
    { to: "in_progress", actors: ["concierge"] },
    { to: "failed", actors: ["concierge"] },
    MEMBER_WITHDRAW,
  ],
  in_progress: [
    { to: "succeeded", actors: ["concierge"] },
    { to: "failed", actors: ["concierge"] },
    MEMBER_WITHDRAW,
  ],
  // Negotiation-only state; unreachable for cancellations.
  offer_pending: RESOLVED,
  succeeded: RESOLVED,
  failed: RESOLVED,
  canceled: RESOLVED,
};

/**
 * Negotiation: submitted → in_review → in_progress → offer_pending →
 * succeeded (member approved) | failed (member rejected).
 *
 * `offer_pending` is where the concierge hands control back: they publish the
 * rate they secured and stop. Only the member can convert that into
 * `succeeded`, which is the sole event that computes and books a fee. The
 * concierge retains an escape hatch back to `in_progress` (provider reneged
 * before the member answered) and to `failed` (offer withdrawn).
 */
export const NEGOTIATION_TRANSITIONS: CaseTransitionMap = {
  submitted: [{ to: "in_review", actors: ["concierge", "system"] }, MEMBER_WITHDRAW],
  in_review: [
    { to: "in_progress", actors: ["concierge"] },
    { to: "failed", actors: ["concierge"] },
    MEMBER_WITHDRAW,
  ],
  in_progress: [
    { to: "offer_pending", actors: ["concierge"] },
    { to: "failed", actors: ["concierge"] },
    MEMBER_WITHDRAW,
  ],
  offer_pending: [
    // Member approves the secured rate — the only path to a booked fee.
    { to: "succeeded", actors: ["member"] },
    // Member declines, or the concierge pulls the offer. Either way: no fee.
    { to: "failed", actors: ["member", "concierge"] },
    // Provider reneged; back to working the case.
    { to: "in_progress", actors: ["concierge"] },
    MEMBER_WITHDRAW,
  ],
  succeeded: RESOLVED,
  failed: RESOLVED,
  canceled: RESOLVED,
};

export function transitionsFor(kind: CaseKind): CaseTransitionMap {
  return kind === "cancellation" ? CANCELLATION_TRANSITIONS : NEGOTIATION_TRANSITIONS;
}

/** Statuses reachable from `from`, ignoring who is asking. */
export function nextStatuses(kind: CaseKind, from: CaseStatus): readonly CaseStatus[] {
  return transitionsFor(kind)[from].map((transition) => transition.to);
}

/**
 * Why a transition was refused. The API maps `illegal` to 409 (the case moved
 * on) and `forbidden_actor` to 403 (the caller may not do this), which are
 * genuinely different failures for a client to handle.
 */
export type TransitionRefusal = "illegal" | "forbidden_actor";

export type TransitionCheck = { ok: true } | { ok: false; reason: TransitionRefusal };

/**
 * Can `actor` move a `kind` case from `from` to `to`? A no-op transition
 * (from === to) is refused as illegal: statuses are the timeline, and
 * re-recording the current one would be a duplicate entry.
 */
export function checkTransition(
  kind: CaseKind,
  from: CaseStatus,
  to: CaseStatus,
  actor: CaseActor,
): TransitionCheck {
  const candidate = transitionsFor(kind)[from].find((transition) => transition.to === to);
  if (!candidate) return { ok: false, reason: "illegal" };
  if (!candidate.actors.includes(actor)) return { ok: false, reason: "forbidden_actor" };
  return { ok: true };
}

export function canTransition(
  kind: CaseKind,
  from: CaseStatus,
  to: CaseStatus,
  actor: CaseActor,
): boolean {
  return checkTransition(kind, from, to, actor).ok;
}
