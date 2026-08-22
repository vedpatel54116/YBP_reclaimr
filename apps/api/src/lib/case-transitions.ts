import { checkTransition, type CaseActor, type CaseKind, type CaseStatus } from "@reclaimr/core";
import { conflict, forbidden } from "./errors";

/**
 * Bridge from the pure state machine in @reclaimr/core to HTTP semantics.
 *
 * The two refusal reasons are genuinely different failures and must not
 * collapse into one status: `illegal` means the case has already moved on (409
 * — refetch and try again), while `forbidden_actor` means the caller is not
 * allowed to make this move at all (403 — retrying will never help). The
 * second is load-bearing: it is what stops a concierge from driving a
 * negotiation to `succeeded` and booking a fee the member never approved.
 */
export function assertTransition(
  kind: CaseKind,
  from: CaseStatus,
  to: CaseStatus,
  actor: CaseActor,
): void {
  const check = checkTransition(kind, from, to, actor);
  if (check.ok) return;

  if (check.reason === "forbidden_actor") {
    throw forbidden(`A ${actor} may not move this case to "${to}"`, "TRANSITION_FORBIDDEN");
  }
  throw conflict(`A case in "${from}" cannot move to "${to}"`, "INVALID_TRANSITION");
}
