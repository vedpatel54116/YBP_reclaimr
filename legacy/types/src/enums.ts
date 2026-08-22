/**
 * ReclaimR domain enums.
 *
 * Enum string values are the wire/serialization format — they appear verbatim
 * in API payloads, the JSON store, and analytics events. Values are lowercase
 * snake_case throughout.
 *
 * Section 1 holds the core domain enums; section 2 holds supporting enums that
 * back specific model fields (account types, consent kinds, delivery states…).
 */

/* ------------------------------------------------------------------ *
 * 1. Core domain enums
 * ------------------------------------------------------------------ */

/**
 * Lifecycle of a detected subscription.
 *
 * Detection is free; `CANCEL_REQUESTED` is set when a concierge case is opened,
 * `IGNORED` when the user marks a detection as not-a-subscription.
 */
export enum SubscriptionStatus {
  /** Actively billing on a detected cadence. */
  ACTIVE = 'active',
  /** Free trial detected; `trialEndDate` is set — converts to paid on that date. */
  TRIAL = 'trial',
  /** A concierge cancellation case has been opened for this subscription. */
  CANCEL_REQUESTED = 'cancel_requested',
  /** Provider confirmed the cancellation; no further charges will occur. */
  CANCELLED = 'cancelled',
  /** Temporarily not billing (seasonal, paused by provider). */
  PAUSED = 'paused',
  /** User dismissed the detection; excluded from totals and monitoring. */
  IGNORED = 'ignored',
}

/** Lifecycle of a detected recurring bill relative to its due date. */
export enum BillStatus {
  /** Due in the normal window; nothing to act on. */
  UPCOMING = 'upcoming',
  /** Due within the reminder threshold (typically 3 days). */
  DUE_SOON = 'due_soon',
  /** Charged/paid for the current period. */
  PAID = 'paid',
  /** Expected charge has not appeared past the due date. */
  OVERDUE = 'overdue',
  /** Never charged and the window has fully elapsed. */
  MISSED = 'missed',
}

/**
 * Lifecycle shared by concierge cases (cancellations and negotiations).
 *
 * Both case kinds surface a live, event-by-event timeline; every status
 * transition appends a timeline event. Terminal states are `COMPLETED`,
 * `CANCELLED` (user withdrew the request), and `FAILED`.
 */
export enum CaseStatus {
  /** Request received; queued for a concierge agent. */
  SUBMITTED = 'submitted',
  /** Agent reviewing account/bill details and provider playbooks. */
  IN_REVIEW = 'in_review',
  /** Agent actively working with the provider. */
  IN_PROGRESS = 'in_progress',
  /** Waiting on the provider or the user; clock paused. */
  ON_HOLD = 'on_hold',
  /** Finished — see the case-specific outcome field for the result. */
  COMPLETED = 'completed',
  /** User withdrew the request before completion. */
  CANCELLED = 'cancelled',
  /** Could not be completed (provider refused, verification failed, ...). */
  FAILED = 'failed',
}

/**
 * How a transaction moves money. Independent of sign: a REFUND is a credit
 * (negative amount), a FEE is a debit (positive amount).
 */
export enum TransactionType {
  /** Purchase / charge — money leaving the account. */
  DEBIT = 'debit',
  /** Deposit / income — money entering the account. */
  CREDIT = 'credit',
  /** Returned charge from a merchant. */
  REFUND = 'refund',
  /** Overdraft, monthly, or late fee charged by the bank. */
  FEE = 'fee',
  /** Movement between the user's own accounts. */
  TRANSFER = 'transfer',
  /** Interest earned or paid. */
  INTEREST = 'interest',
  /** Loan/card payment posted to an account. */
  PAYMENT = 'payment',
  /** Provider-initiated correction (sign or amount fix). */
  ADJUSTMENT = 'adjustment',
}

/**
 * Conditions the alerting engine detects. All alerts are free-tier; each one
 * offers a direct action route (cancel / negotiate / monitor).
 */
export enum AlertType {
  /** Same-merchant recurring charge rose materially (e.g. $15.99 → $18.99). */
  PRICE_INCREASE = 'price_increase',
  /** Trial converts to a paid plan on `trialEndDate`. */
  TRIAL_CONVERSION = 'trial_conversion',
  /** Recurring bill due within the reminder window. */
  UPCOMING_BILL = 'upcoming_bill',
  /** Account balance fell below the user's threshold. */
  LOW_BALANCE = 'low_balance',
  /** Single charge exceeded the user's large-purchase threshold. */
  LARGE_PURCHASE = 'large_purchase',
  /** A previously unseen recurring charge pattern was detected. */
  NEW_SUBSCRIPTION = 'new_subscription',
}

/**
 * Lifecycle of a single offer exchanged during a bill negotiation. One case
 * can hold several offers as the provider counters.
 */
export enum NegotiationOfferStatus {
  SUBMITTED = 'submitted',
  UNDER_REVIEW = 'under_review',
  /** Provider responded with different terms. */
  COUNTERED = 'countered',
  /** Provider accepted — this is the win that unlocks the success fee. */
  ACCEPTED = 'accepted',
  REJECTED = 'rejected',
  /** Provider's window to respond elapsed. */
  EXPIRED = 'expired',
  /** Withdrawn by ReclaimR or the user. */
  WITHDRAWN = 'withdrawn',
}

/** How a cancellation is executed against the provider. */
export enum CancellationMethod {
  /** Premium: a ReclaimR concierge agent cancels on the user's behalf. */
  CONCIERGE = 'concierge',
  /** Free tier: user follows ReclaimR's provider-specific guided instructions. */
  SELF_SERVE = 'self_serve',
  PHONE = 'phone',
  EMAIL = 'email',
  WEB_FORM = 'web_form',
  LIVE_CHAT = 'live_chat',
  MAIL = 'mail',
  /** Cancelled inside the provider's own app or account portal. */
  IN_APP = 'in_app',
}

/**
 * Recurring cadence. Mirrors the detection engine's interval bands
 * (7 / 14 / 28–31 / 90 / 365 days ± tolerance).
 */
export enum FrequencyType {
  WEEKLY = 'weekly',
  BIWEEKLY = 'biweekly',
  MONTHLY = 'monthly',
  QUARTERLY = 'quarterly',
  ANNUALLY = 'annually',
}

/* ------------------------------------------------------------------ *
 * 2. Supporting enums
 * ------------------------------------------------------------------ */

/** Membership tier. Detection is free; acting on waste is premium. */
export enum MembershipTier {
  FREE = 'free',
  PREMIUM = 'premium',
}

/** Linked account product type. */
export enum AccountType {
  CHECKING = 'checking',
  SAVINGS = 'savings',
  CREDIT_CARD = 'credit_card',
  LOAN = 'loan',
  MORTGAGE = 'mortgage',
  INVESTMENT = 'investment',
}

/** Aggregation health of a linked account. */
export enum AccountSyncStatus {
  SYNCED = 'synced',
  SYNCING = 'syncing',
  /** Provider data is older than the refresh SLA (1–4h). */
  STALE = 'stale',
  /** Provider credentials expired; user must re-link before further sync. */
  REQUIRES_REAUTH = 'requires_reauth',
  ERROR = 'error',
}

/** Internal staff role (see PRODUCT.md §7). */
export enum AdminRole {
  /** Works the cancellation/negotiation queues and updates case timelines. */
  CONCIERGE_AGENT = 'concierge_agent',
  /** Merchant normalization rules, fee configuration, provider playbooks. */
  FINANCE_OPS = 'finance_ops',
  /** User management, audit logs, feature flags, alert templates. */
  ADMIN = 'admin',
}

/**
 * Kinds of consent ReclaimR records. Concierge cases require an explicit,
 * revocable e-sign authorization before ReclaimR acts on the user's behalf.
 */
export enum ConsentType {
  TERMS_OF_SERVICE = 'terms_of_service',
  PRIVACY_POLICY = 'privacy_policy',
  /** E-sign authorization for a concierge cancellation case. */
  ESIGN_CANCELLATION = 'esign_cancellation',
  /** E-sign authorization for a concierge negotiation case. */
  ESIGN_NEGOTIATION = 'esign_negotiation',
  /** Read-only bank link acknowledgment. */
  BANK_LINK_READ_ONLY = 'bank_link_read_only',
  /** ROSCA disclosure for the premium 7-day trial conversion. */
  TRIAL_CONVERSION_DISCLOSURE = 'trial_conversion_disclosure',
  /** Opt-in for marketing communications (CAN-SPAM / TCPA). */
  MARKETING_COMMUNICATIONS = 'marketing_communications',
}

/** Delivery channel for a notification. */
export enum NotificationChannel {
  IN_APP = 'in_app',
  PUSH = 'push',
  EMAIL = 'email',
  SMS = 'sms',
}

/** Delivery state of a notification on its channel. */
export enum NotificationDeliveryStatus {
  QUEUED = 'queued',
  SENT = 'sent',
  DELIVERED = 'delivered',
  FAILED = 'failed',
}

/** Lifecycle of the user's premium subscription. */
export enum PremiumStatus {
  /** Inside the 7-day free trial. */
  TRIALING = 'trialing',
  ACTIVE = 'active',
  /** Payment failed; in the provider's dunning window. */
  PAST_DUE = 'past_due',
  /** Cancelled by the user; active until the period ends. */
  CANCELLED = 'cancelled',
  /** Fully lapsed — tier reverts to free. */
  EXPIRED = 'expired',
}

/** Kinds of entries in the savings ("money reclaimed") ledger. */
export enum SavingsEventType {
  /** A concierge or self-serve cancellation took effect. */
  SUBSCRIPTION_CANCELLED = 'subscription_cancelled',
  /** Negotiation won; provider confirmed a lower rate. */
  NEGOTIATION_WON = 'negotiation_won',
  /** Trial cancelled before converting to paid. */
  TRIAL_AVERTED = 'trial_averted',
  /** Overdraft or late fee refunded. */
  FEE_REFUNDED = 'fee_refunded',
  /** Smart-Save autopilot transfer into a savings goal. */
  AUTOPILOT_TRANSFER = 'autopilot_transfer',
}

/** How urgently an alert deserves attention (rendered without color). */
export enum AlertSeverity {
  INFO = 'info',
  WARNING = 'warning',
  CRITICAL = 'critical',
}

/** Who performed an action: the member, ReclaimR staff, or an automated job. */
export enum ActorType {
  USER = 'user',
  AGENT = 'agent',
  SYSTEM = 'system',
}

/** Scan/retention lifecycle of an uploaded case document. */
export enum DocumentStatus {
  /** Uploaded, awaiting malware/content scan. */
  PENDING_SCAN = 'pending_scan',
  /** Passed scan and is attached to the case. */
  APPROVED = 'approved',
  /** Failed scan or disallowed content; quarantined. */
  REJECTED = 'rejected',
  /** Soft-deleted at a user's request or by retention policy. */
  DELETED = 'deleted',
}

/** Outcome of a completed negotiation case. Null until the case completes. */
export enum NegotiationOutcome {
  /** Provider accepted an offer; success fee is charged. */
  WON = 'won',
  /** No savings achieved; the user pays nothing. */
  LOST = 'lost',
  /** Withdrawn before completion. */
  WITHDRAWN = 'withdrawn',
}

/** Security/compliance-relevant actions captured in the audit log. */
export enum AuditAction {
  USER_SIGNED_UP = 'user_signed_up',
  USER_LOGGED_IN = 'user_logged_in',
  USER_LOGGED_OUT = 'user_logged_out',
  SESSION_REVOKED = 'session_revoked',
  ACCOUNT_LINKED = 'account_linked',
  ACCOUNT_UNLINKED = 'account_unlinked',
  ACCOUNT_SYNCED = 'account_synced',
  TRANSACTION_UPDATED = 'transaction_updated',
  SUBSCRIPTION_STATUS_CHANGED = 'subscription_status_changed',
  CASE_CREATED = 'case_created',
  CASE_STATUS_UPDATED = 'case_status_updated',
  NEGOTIATION_FEE_CHARGED = 'negotiation_fee_charged',
  PREMIUM_UPGRADED = 'premium_upgraded',
  PREMIUM_CANCELLED = 'premium_cancelled',
  CONSENT_GRANTED = 'consent_granted',
  CONSENT_REVOKED = 'consent_revoked',
  DATA_EXPORTED = 'data_exported',
  USER_DELETED = 'user_deleted',
}
