/**
 * Identity & access: members, sessions, staff, and consent records.
 */
import type {
  AdminUserId,
  CaseId,
  ConsentRecordId,
  ISODateString,
  SessionId,
  UserId,
} from './common.js';
import { AdminRole, ConsentType, MembershipTier } from './enums.js';

/** A ReclaimR member (end user). */
export interface User {
  id: UserId;
  email: string;
  name: string;
  tier: MembershipTier;
  isEmailVerified: boolean;
  /** MFA is opt-in for v1; planned as a V2 default. */
  mfaEnabled: boolean;
  createdAt: ISODateString;
  updatedAt: ISODateString;
  /** Set when the user deletes their account; the row is retained for audit. */
  deletedAt: ISODateString | null;
}

/** An authenticated session. The raw token exists only client-side. */
export interface Session {
  id: SessionId;
  userId: UserId;
  /** SHA-256 hash of the bearer token; the plaintext token is never stored. */
  tokenHash: string;
  createdAt: ISODateString;
  expiresAt: ISODateString;
  lastSeenAt: ISODateString | null;
  revokedAt: ISODateString | null;
  userAgent: string | null;
  ipAddress: string | null;
}

/** Internal staff account (concierge agents, finance ops, admins). */
export interface AdminUser {
  id: AdminUserId;
  email: string;
  name: string;
  role: AdminRole;
  /** Staff are deactivated, never deleted, so audit history stays intact. */
  isActive: boolean;
  /** Required for all staff accounts. */
  mfaEnabled: boolean;
  lastLoginAt: ISODateString | null;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

/**
 * An explicit, logged consent (ESIGN/UETA authorization, privacy, marketing
 * opt-in, ...). Concierge cases reference their authorization record here.
 */
export interface ConsentRecord {
  id: ConsentRecordId;
  userId: UserId;
  type: ConsentType;
  /** Version of the consent document shown, e.g. `tos-2026-01`. */
  documentVersion: string;
  /** URL or storage key of the exact text the user agreed to. */
  documentUrl: string;
  grantedAt: ISODateString;
  revokedAt: ISODateString | null;
  /** Case this consent authorizes ReclaimR to act on (e-sign authorizations). */
  caseId: CaseId | null;
  ipAddress: string | null;
  userAgent: string | null;
}
