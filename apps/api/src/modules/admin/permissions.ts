import type { AdminRole } from "@reclaimr/shared";

/**
 * Staff permissions.
 *
 * Modelled as explicit capabilities rather than role checks scattered through
 * route handlers, so the blast radius of each role is readable in one place.
 * The split follows who is accountable for what:
 *
 * - `agent` works the concierge queues. They can move cases and read the member
 *   context needed to do that, and nothing else.
 * - `finance_ops` additionally curates merchants, which shapes detection for
 *   every member and so warrants a narrower group than case work.
 * - `admin` additionally reads the audit trail. Deliberately the smallest group:
 *   the audit log is the record used to review staff behaviour, including their
 *   own, so access to it is the most sensitive grant in the console.
 */
export type AdminCapability =
  | "cases.read"
  | "cases.write"
  | "members.read"
  | "merchants.read"
  | "merchants.write"
  | "audit.read";

const AGENT: readonly AdminCapability[] = [
  "cases.read",
  "cases.write",
  "members.read",
  "merchants.read",
];

const FINANCE_OPS: readonly AdminCapability[] = [...AGENT, "merchants.write"];

const ADMIN: readonly AdminCapability[] = [...FINANCE_OPS, "audit.read"];

export const ROLE_CAPABILITIES: Readonly<Record<AdminRole, readonly AdminCapability[]>> = {
  agent: AGENT,
  finance_ops: FINANCE_OPS,
  admin: ADMIN,
};

export function roleHasCapability(role: AdminRole, capability: AdminCapability): boolean {
  return ROLE_CAPABILITIES[role].includes(capability);
}
