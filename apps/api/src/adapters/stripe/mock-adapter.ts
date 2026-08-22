import { createHash } from "node:crypto";
import type { PremiumInterval } from "@reclaimr/shared";
import {
  BillingAdapterError,
  type BillingAdapter,
  type BillingEvent,
  type BillingSubscription,
  type CheckoutSession,
  type CreateCheckoutSession,
} from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Deterministic in-memory billing provider.
 *
 * Used whenever STRIPE_SECRET_KEY is absent, which covers local development and
 * the whole test suite: premium can be exercised end to end with no keys and no
 * network. Ids are derived from the user id by hash, so the same member always
 * gets the same customer and subscription id across runs — that makes fixtures
 * and webhook replays reproducible.
 *
 * The trade-off is explicit: this grants premium without taking money. It must
 * never be reachable in production, which `createBillingAdapter` enforces.
 */
export class MockBillingAdapter implements BillingAdapter {
  private readonly subscriptions = new Map<string, BillingSubscription>();

  constructor(private readonly now: () => Date = () => new Date()) {}

  private static id(prefix: string, seed: string): string {
    return `${prefix}_mock_${createHash("sha256").update(seed).digest("hex").slice(0, 20)}`;
  }

  async createCheckoutSession(input: CreateCheckoutSession): Promise<CheckoutSession> {
    const subscriptionId = MockBillingAdapter.id("sub", input.userId);
    const customerId = input.existingCustomerId ?? MockBillingAdapter.id("cus", input.userId);
    const start = this.now();
    const trialDays = input.trialDays ?? 0;

    this.subscriptions.set(subscriptionId, {
      id: subscriptionId,
      customerId,
      status: trialDays > 0 ? "trialing" : "active",
      currentPeriodStart: start,
      currentPeriodEnd: new Date(
        start.getTime() + periodLengthDays(input.interval, trialDays) * DAY_MS,
      ),
      trialEndsAt: trialDays > 0 ? new Date(start.getTime() + trialDays * DAY_MS) : null,
      cancelAtPeriodEnd: false,
      priceCentsMonthly: input.priceCentsMonthly,
      interval: input.interval,
      userId: input.userId,
    });

    const sessionId = MockBillingAdapter.id("cs", `${input.userId}:${start.getTime()}`);
    // Points back at the app's own success URL so a local checkout "completes"
    // by simply following the link.
    return { id: sessionId, url: `${input.successUrl}&mock_session=${sessionId}` };
  }

  async cancelAtPeriodEnd(subscriptionId: string): Promise<BillingSubscription> {
    return this.mutate(subscriptionId, (current) => ({ ...current, cancelAtPeriodEnd: true }));
  }

  async resume(subscriptionId: string): Promise<BillingSubscription> {
    return this.mutate(subscriptionId, (current) => ({ ...current, cancelAtPeriodEnd: false }));
  }

  /**
   * The mock has no signing key, so there is nothing to verify. It accepts a
   * JSON body shaped like a normalized {@link BillingEvent}, which lets tests
   * and local tooling drive the webhook handler directly.
   */
  parseWebhook(rawBody: Buffer, _signature: string | undefined): BillingEvent {
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawBody.toString("utf8"));
    } catch {
      throw new BillingAdapterError("invalid_signature", "Mock webhook body is not valid JSON");
    }

    const event = parsed as Partial<BillingEvent> & { id?: string; type?: string };
    if (typeof event.id !== "string" || typeof event.type !== "string") {
      throw new BillingAdapterError("invalid_signature", "Mock webhook needs an id and a type");
    }
    return event as BillingEvent;
  }

  /** Test helper: the subscription state the mock currently believes in. */
  peek(subscriptionId: string): BillingSubscription | null {
    return this.subscriptions.get(subscriptionId) ?? null;
  }

  private async mutate(
    subscriptionId: string,
    change: (current: BillingSubscription) => BillingSubscription,
  ): Promise<BillingSubscription> {
    const current = this.subscriptions.get(subscriptionId);
    if (!current) {
      throw new BillingAdapterError("not_found", `Unknown subscription ${subscriptionId}`);
    }
    const next = change(current);
    this.subscriptions.set(subscriptionId, next);
    return next;
  }
}

/** Trial length wins for the first period; afterwards the plan's own cadence. */
function periodLengthDays(interval: PremiumInterval, trialDays: number): number {
  if (trialDays > 0) return trialDays;
  return interval === "yearly" ? 365 : 30;
}
