/** Canonical application name, used for titles, logs, and copy. */
export const APP_NAME = "ReclaimR" as const;

/** Versioned prefix every API route is mounted under. */
export const API_PREFIX = "/api/v1" as const;

/** Default port the Fastify API listens on. */
export const API_PORT_DEFAULT = 3001 as const;

/** Pagination defaults shared by clients and the API. */
export const DEFAULT_PAGE_SIZE = 20 as const;
export const MAX_PAGE_SIZE = 100 as const;

/** US-only, USD-only in v1. */
export const DEFAULT_CURRENCY = "USD" as const;

/** Bill-negotiation success fee bounds (percent of first-year savings). */
export const FEE_PERCENT_MIN = 35 as const;
export const FEE_PERCENT_MAX = 60 as const;

/** Choose-your-price premium bounds, in cents per month ($7–$14). */
export const PREMIUM_PRICE_MIN_CENTS = 700 as const;
export const PREMIUM_PRICE_MAX_CENTS = 1400 as const;

/** Premium trial length in days. */
export const PREMIUM_TRIAL_DAYS = 7 as const;

/**
 * Months charged on the yearly plan. Members pick a monthly price ($7–$14)
 * and the yearly plan bills that price × 10 up front — two months free — so
 * there is exactly one price dimension to reason about instead of two
 * independent price tables.
 */
export const PREMIUM_YEARLY_MONTHS_CHARGED = 10 as const;

/**
 * Maximum size of a statement uploaded to support a negotiation case.
 * Enforced by the multipart parser (hard limit) and by the service.
 */
export const STATEMENT_MAX_BYTES = 10 * 1024 * 1024;

/** Content types accepted for negotiation statement uploads. */
export const STATEMENT_CONTENT_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
] as const;

/** Maximum statements attached to a single negotiation case. */
export const STATEMENT_MAX_PER_CASE = 10 as const;

/**
 * Detection confidence floor: auto-detected subscriptions only surface to
 * members at or above this score (PRODUCT §10 precision target).
 */
export const DETECTION_CONFIDENCE_THRESHOLD = 0.97 as const;

/** Version of the legal documents members consent to at signup. */
export const CURRENT_CONSENT_VERSION = "2026-01-01" as const;

/**
 * GDPR/CCPA deletion window: DELETE /users/me soft-deletes immediately and a
 * retention job purges the account after this many days (grace period for
 * reconsideration and chargeback reconciliation).
 */
export const ACCOUNT_DELETION_RETENTION_DAYS = 30 as const;

/**
 * Route paths as a single source of truth, grouped by resource. The API
 * mounts these routes and the web client builds fetch URLs from the same
 * constants; `contracts/*` reference them so paths cannot drift.
 */
export const API_ROUTES = {
  health: "/health",
  ready: "/ready",

  auth: {
    register: `${API_PREFIX}/auth/register`,
    login: `${API_PREFIX}/auth/login`,
    refresh: `${API_PREFIX}/auth/refresh`,
    logout: `${API_PREFIX}/auth/logout`,
    me: `${API_PREFIX}/auth/me`,
  },

  users: {
    me: `${API_PREFIX}/users/me`,
    updateMe: `${API_PREFIX}/users/me`,
    deleteMe: `${API_PREFIX}/users/me`,
    export: `${API_PREFIX}/users/me/export`,
    consents: `${API_PREFIX}/users/me/consents`,
    recordConsent: `${API_PREFIX}/users/me/consents`,
  },

  plaid: {
    createLinkToken: `${API_PREFIX}/plaid/create-link-token`,
    exchangePublicToken: `${API_PREFIX}/plaid/exchange-public-token`,
  },

  accounts: {
    list: `${API_PREFIX}/accounts`,
    detail: (id: string) => `${API_PREFIX}/accounts/${id}`,
    sync: (id: string) => `${API_PREFIX}/accounts/${id}/sync`,
  },

  transactions: {
    list: `${API_PREFIX}/transactions`,
    detail: (id: string) => `${API_PREFIX}/transactions/${id}`,
  },

  subscriptions: {
    list: `${API_PREFIX}/subscriptions`,
    create: `${API_PREFIX}/subscriptions`,
    detect: `${API_PREFIX}/subscriptions/detect`,
    detail: (id: string) => `${API_PREFIX}/subscriptions/${id}`,
  },

  bills: {
    list: `${API_PREFIX}/bills`,
    create: `${API_PREFIX}/bills`,
    upcoming: `${API_PREFIX}/bills/upcoming`,
    detail: (id: string) => `${API_PREFIX}/bills/${id}`,
  },

  cancellations: {
    list: `${API_PREFIX}/cancellations`,
    create: `${API_PREFIX}/cancellations`,
    detail: (id: string) => `${API_PREFIX}/cancellations/${id}`,
    withdraw: (id: string) => `${API_PREFIX}/cancellations/${id}/withdraw`,
  },

  negotiations: {
    list: `${API_PREFIX}/negotiations`,
    create: `${API_PREFIX}/negotiations`,
    detail: (id: string) => `${API_PREFIX}/negotiations/${id}`,
    withdraw: (id: string) => `${API_PREFIX}/negotiations/${id}/withdraw`,
    /** Member accepts the rate the concierge secured; this books the fee. */
    approveOffer: (id: string) => `${API_PREFIX}/negotiations/${id}/offer/approve`,
    /** Member declines the offer; no fee is ever charged. */
    rejectOffer: (id: string) => `${API_PREFIX}/negotiations/${id}/offer/reject`,
    documents: (id: string) => `${API_PREFIX}/negotiations/${id}/documents`,
    document: (id: string, documentId: string) =>
      `${API_PREFIX}/negotiations/${id}/documents/${documentId}`,
  },

  savings: {
    summary: `${API_PREFIX}/savings/summary`,
    events: `${API_PREFIX}/savings/events`,
    createEvent: `${API_PREFIX}/savings/events`,
  },

  alerts: {
    list: `${API_PREFIX}/alerts`,
    read: (id: string) => `${API_PREFIX}/alerts/${id}/read`,
    readAll: `${API_PREFIX}/alerts/read-all`,
  },

  notifications: {
    list: `${API_PREFIX}/notifications`,
    read: (id: string) => `${API_PREFIX}/notifications/${id}/read`,
    readAll: `${API_PREFIX}/notifications/read-all`,
  },

  premium: {
    get: `${API_PREFIX}/premium`,
    upgrade: `${API_PREFIX}/premium/upgrade`,
    cancel: `${API_PREFIX}/premium/cancel`,
    resume: `${API_PREFIX}/premium/resume`,
  },

  billing: {
    /**
     * Stripe webhook sink. Unauthenticated by design — trust comes from the
     * Stripe-Signature header verified against STRIPE_WEBHOOK_SECRET, not
     * from a session.
     */
    webhook: `${API_PREFIX}/billing/webhook`,
  },

  admin: {
    login: `${API_PREFIX}/admin/auth/login`,
    me: `${API_PREFIX}/admin/auth/me`,
    cancellations: `${API_PREFIX}/admin/cancellations`,
    cancellationDetail: (id: string) => `${API_PREFIX}/admin/cancellations/${id}`,
    negotiations: `${API_PREFIX}/admin/negotiations`,
    negotiationDetail: (id: string) => `${API_PREFIX}/admin/negotiations/${id}`,
    members: `${API_PREFIX}/admin/members`,
    memberDetail: (id: string) => `${API_PREFIX}/admin/members/${id}`,
    merchants: `${API_PREFIX}/admin/merchants`,
    merchantDetail: (id: string) => `${API_PREFIX}/admin/merchants/${id}`,
    audit: `${API_PREFIX}/admin/audit-logs`,
  },

  ai: {
    /** Cached alternative advice for one subscription (read-only). */
    suggestionsForSubscription: (id: string) => `${API_PREFIX}/subscriptions/${id}/suggestions`,
  },
} as const;
