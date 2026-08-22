import { API_ROUTES } from "../constants";
import {
  consentSchema,
  deletionResponseSchema,
  exportRequestSchema,
  recordConsentSchema,
  updateUserSchema,
} from "../schemas/user";
import { userSchema } from "../schemas/auth";
import { paginatedSchema } from "../schemas/pagination";

/** Member profile, privacy, and consent endpoints. */
export const usersContract = {
  me: {
    method: "GET",
    path: API_ROUTES.users.me,
    response: userSchema,
  },
  update: {
    method: "PATCH",
    path: API_ROUTES.users.updateMe,
    body: updateUserSchema,
    response: userSchema,
  },
  /** GDPR/CCPA erasure; soft-deletes now, purge enforced by retention job. */
  delete: {
    method: "DELETE",
    path: API_ROUTES.users.deleteMe,
    response: deletionResponseSchema,
  },
  /** GDPR/CCPA data export; fulfilled asynchronously. */
  requestExport: {
    method: "POST",
    path: API_ROUTES.users.export,
    response: exportRequestSchema,
  },
  listConsents: {
    method: "GET",
    path: API_ROUTES.users.consents,
    response: paginatedSchema(consentSchema),
  },
  recordConsent: {
    method: "POST",
    path: API_ROUTES.users.recordConsent,
    body: recordConsentSchema,
    response: consentSchema,
  },
} as const;
