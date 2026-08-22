/**
 * Recurring money: detected subscriptions and bills.
 *
 * Subscriptions = discretionary recurring charges (streaming, software,
 * fitness...). Bills = fixed life admin (utilities, telecom, insurance) —
 * negotiable, not cancellable.
 */
import type {
  CalendarDateString,
  ISODateString,
  MerchantId,
  SubscriptionId,
  BillId,
  UserId,
} from './common.js';
import { BillStatus, FrequencyType, SubscriptionStatus } from './enums.js';

/** A recurring charge series detected by the detection engine. */
export interface Subscription {
  id: SubscriptionId;
  userId: UserId;
  merchantId: MerchantId | null;
  /** Denormalized display name (`merchantKey` → `Netflix`). */
  merchantName: string;
  /** Current recurring charge amount. */
  amountCents: number;
  /** Prior charge level when a price increase was detected; null otherwise. */
  previousAmountCents: number | null;
  /** True while the latest charge differs materially from the prior level. */
  priceChanged: boolean;
  frequency: FrequencyType;
  /** Median observed interval in days; refines the band for next-charge prediction. */
  cadenceDays: number;
  status: SubscriptionStatus;
  /** Detection confidence in [0, 1]; detections surface in the UI at >= 0.97. */
  confidence: number;
  /** Charges observed in the lookback window. */
  occurrenceCount: number;
  /** Normalized monthly cost — the number the dashboard totals ("$312/mo"). */
  monthlyEquivalentCents: number;
  firstDetectedAt: ISODateString;
  lastChargeDate: CalendarDateString | null;
  nextChargeDate: CalendarDateString | null;
  /** Set while status is TRIAL: the date the paid plan begins. */
  trialEndDate: CalendarDateString | null;
  /** Last engagement signal; stale values flag zombie subscriptions. */
  lastUsedAt: ISODateString | null;
  /** Set when the user marks the detection as not-a-subscription. */
  ignoredAt: ISODateString | null;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

/** A detected recurring bill (utilities, telecom, insurance, ...). */
export interface Bill {
  id: BillId;
  userId: UserId;
  merchantId: MerchantId | null;
  merchantName: string;
  /** Last known charge; null for variable bills before first observation. */
  amountCents: number | null;
  /** Predicted next charge for variable bills (utilities). */
  estimatedAmountCents: number | null;
  frequency: FrequencyType;
  status: BillStatus;
  /** Predicted day-of-month (1–31) when a due-day pattern exists. */
  dueDayOfMonth: number | null;
  nextDueDate: CalendarDateString | null;
  lastPaidDate: CalendarDateString | null;
  /** Whether the provider charges via autopay (cancellation safety check). */
  isAutopay: boolean;
  /** True for categories the concierge can negotiate down. */
  isNegotiable: boolean;
  /** Bill category (Utilities, Telecom, Insurance, ...). */
  category: string;
  /** Set when a negotiation case lowered the rate; the pre-negotiation amount. */
  originalAmountCents: number | null;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}
