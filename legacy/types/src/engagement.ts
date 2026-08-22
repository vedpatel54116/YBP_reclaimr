/**
 * Engagement & monetization: alerts, delivered notifications, premium
 * subscription state, and the savings ("money reclaimed") ledger.
 */
import type {
  AlertId,
  CaseId,
  ConsentRecordId,
  Currency,
  ISODateString,
  NotificationId,
  PremiumSubscriptionId,
  SavingsEventId,
  SubscriptionId,
  BillId,
  TransactionId,
  UserId,
} from './common.js';
import {
  AlertSeverity,
  AlertType,
  FrequencyType,
  MembershipTier,
  NotificationChannel,
  NotificationDeliveryStatus,
  PremiumStatus,
  SavingsEventType,
} from './enums.js';

/**
 * A condition the alerting engine detected. Free tier, forever. The
 * notification center renders alerts; notifications record their delivery.
 */
export interface Alert {
  id: AlertId;
  userId: UserId;
  type: AlertType;
  severity: AlertSeverity;
  title: string;
  body: string;
  /** Dollar impact when applicable (e.g. monthly price-increase delta). */
  amountCents: number | null;
  /** Entity the alert is about — exactly the set relevant to its type. */
  subscriptionId: SubscriptionId | null;
  billId: BillId | null;
  transactionId: TransactionId | null;
  /** In-app route for the alert's primary action, e.g. `/subscriptions/sub_12`. */
  deepLink: string | null;
  isRead: boolean;
  readAt: ISODateString | null;
  triggeredAt: ISODateString;
  createdAt: ISODateString;
}

/** A message delivered on one channel, usually produced by an Alert. */
export interface Notification {
  id: NotificationId;
  userId: UserId;
  /** Originating alert; null for direct messages (digests, receipts). */
  alertId: AlertId | null;
  channel: NotificationChannel;
  /** Marketing messages require explicit opt-in (CAN-SPAM / TCPA). */
  isMarketing: boolean;
  title: string;
  body: string;
  deepLink: string | null;
  deliveryStatus: NotificationDeliveryStatus;
  sentAt: ISODateString;
  readAt: ISODateString | null;
  createdAt: ISODateString;
}

/**
 * The user's premium membership. Price is chosen by the user on the $7–14
 * monthly slider; the 7-day trial converts only after explicit disclosure.
 */
export interface PremiumSubscription {
  id: PremiumSubscriptionId;
  userId: UserId;
  status: PremiumStatus;
  /** Chosen monthly price in cents (700–1400). */
  priceCents: number;
  currency: Currency;
  billingCycle: 'monthly';
  /** ROSCA consent to the trial's explicit conversion terms. */
  consentRecordId: ConsentRecordId;
  trialStartedAt: ISODateString | null;
  trialEndsAt: ISODateString | null;
  currentPeriodStart: ISODateString;
  currentPeriodEnd: ISODateString;
  /** True once cancelled; premium stays active until the period ends. */
  cancelAtPeriodEnd: boolean;
  cancelledAt: ISODateString | null;
  /** PCI-compliant provider identifiers; card data never touches our systems. */
  paymentProviderCustomerId: string | null;
  paymentProviderSubscriptionId: string | null;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

/**
 * One entry in the savings ledger — everything ReclaimR reclaimed for the
 * user. The dashboard's "reclaimed" counter is the sum of these events.
 */
export interface SavingsEvent {
  id: SavingsEventId;
  userId: UserId;
  type: SavingsEventType;
  /** Impact of the event. For run-rate events (cancellations, wins) this is
   *  the per-period amount described by `frequency`. */
  amountCents: number;
  /** Cadence the amount represents; null for one-time events (fee refunds). */
  frequency: FrequencyType | null;
  /** The case that produced this event, when there was one. */
  sourceCaseId: CaseId | null;
  sourceSubscriptionId: SubscriptionId | null;
  sourceBillId: BillId | null;
  description: string;
  occurredAt: ISODateString;
  createdAt: ISODateString;
}

/** Convenience union of the two membership representations. */
export type MembershipStatus = MembershipTier | PremiumStatus;
