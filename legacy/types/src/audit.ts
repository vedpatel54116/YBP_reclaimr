/**
 * Audit trail: append-only records of security- and compliance-relevant
 * actions (links, consent, case transitions, fee charges, data exports).
 */
import type { AuditLogId, ISODateString, JSONValue } from './common.js';
import { ActorType, AuditAction } from './enums.js';

/** One field-level change recorded in an audit entry. */
export interface AuditChange {
  /** Field path, e.g. `status` or `timeline[3].event`. */
  field: string;
  before: JSONValue | null;
  after: JSONValue | null;
}

/** An append-only audit record. Entries are never updated or deleted. */
export interface AuditLog {
  id: AuditLogId;
  action: AuditAction;
  actorType: ActorType;
  /** Id of the acting User or AdminUser; null for automated system jobs. */
  actorId: string | null;
  /** Entity the action touched, e.g. `NegotiationCase`, `User`, `Merchant`. */
  entityType: string;
  entityId: string | null;
  /** Field-level before/after diff, when the action modified an entity. */
  changes: AuditChange[] | null;
  ipAddress: string | null;
  userAgent: string | null;
  occurredAt: ISODateString;
}
