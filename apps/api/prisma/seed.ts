import { PrismaClient, type Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { monthlyEquivalentCents, settleNegotiation, type TimelineEvent } from "@reclaimr/core";
import { TokenCipher } from "../src/adapters/crypto/token-cipher";
import { adminTokenSecret, env } from "../src/env";

/**
 * Development and staging seed.
 *
 * Goals, in order:
 *  1. Idempotent. Re-running replaces demo data rather than duplicating it.
 *  2. Internally consistent. Resolved cases have matching ledger entries with
 *     the right fee arithmetic, so the reclaimed counter shown in the app is a
 *     number the case detail pages can actually justify.
 *  3. Complete enough to demo every state: a free member and a premium one, a
 *     case in every interesting status, and one negotiation sitting at
 *     `offer_pending` so the approve/reject screen has something to render.
 *
 * Never run against production: the credentials below are public.
 */

const prisma = new PrismaClient();

const DEMO_EMAIL = "demo@reclaimr.app";
const FREE_EMAIL = "free@reclaimr.app";
const DEMO_PASSWORD = "reclaimr-demo-2026";

const ADMIN_PASSWORD = "reclaimr-admin-2026";
/**
 * Fixed base32 TOTP seed so a developer can enrol it in an authenticator app
 * once and keep using it. Obviously not a secret.
 */
const DEMO_MFA_SECRET = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

const CONSENT_VERSION = "2026-01-01";

function daysFromNow(days: number): Date {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + days);
  return date;
}

/** Timeline builder: statuses walked in order, one day apart, ending today. */
function timeline(
  steps: Array<{ status: TimelineEvent["status"]; actor: TimelineEvent["actor"]; note?: string }>,
): Prisma.InputJsonValue {
  const events: TimelineEvent[] = steps.map((step, index) => ({
    at: daysFromNow(index - steps.length).toISOString(),
    status: step.status,
    actor: step.actor,
    note: step.note ?? null,
  }));
  return events as unknown as Prisma.InputJsonValue;
}

// ─── Merchants ──────────────────────────────────────────────────────────────

/**
 * Canonical merchants. `negotiable` is the flag that decides whether a member
 * may open a negotiation case, so the recurring-service providers here are
 * deliberately split between negotiable utilities and non-negotiable
 * subscriptions.
 */
const MERCHANTS = [
  {
    canonicalName: "Streaming Plus",
    normalizedKey: "streaming plus",
    category: "entertainment",
    isSubscriptionProvider: true,
    negotiable: false,
    aliases: ["STREAMINGPLUS.COM", "STREAMING PLUS MONTHLY"],
  },
  {
    canonicalName: "Music Family",
    normalizedKey: "music family",
    category: "entertainment",
    isSubscriptionProvider: true,
    negotiable: false,
    aliases: ["MUSICFAMILY", "MUSIC FAMILY PLAN"],
  },
  {
    canonicalName: "Cloud Vault",
    normalizedKey: "cloud vault",
    category: "subscriptions",
    isSubscriptionProvider: true,
    negotiable: false,
    aliases: ["CLOUDVAULT 2TB"],
  },
  {
    canonicalName: "Iron Gym",
    normalizedKey: "iron gym",
    category: "fitness",
    isSubscriptionProvider: true,
    negotiable: true,
    aliases: ["IRON GYM MEMBERSHIP"],
  },
  {
    canonicalName: "City Internet",
    normalizedKey: "city internet",
    category: "telecommunications",
    isSubscriptionProvider: false,
    negotiable: true,
    aliases: ["CITYINTERNET", "CITY INTERNET BROADBAND"],
  },
  {
    canonicalName: "Northwind Mobile",
    normalizedKey: "northwind mobile",
    category: "telecommunications",
    isSubscriptionProvider: false,
    negotiable: true,
    aliases: ["NORTHWIND WIRELESS"],
  },
  {
    canonicalName: "Metro Power",
    normalizedKey: "metro power",
    category: "utilities",
    isSubscriptionProvider: false,
    negotiable: false,
    aliases: ["METRO POWER & LIGHT"],
  },
  {
    canonicalName: "Harbor Insurance",
    normalizedKey: "harbor insurance",
    category: "insurance",
    isSubscriptionProvider: false,
    negotiable: true,
    aliases: ["HARBOR INS AUTO"],
  },
  {
    canonicalName: "Daily Ledger",
    normalizedKey: "daily ledger",
    category: "subscriptions",
    isSubscriptionProvider: true,
    negotiable: false,
    aliases: ["DAILY LEDGER NEWS"],
  },
  {
    canonicalName: "Domain Registrar",
    normalizedKey: "domain registrar",
    category: "subscriptions",
    isSubscriptionProvider: true,
    negotiable: false,
    aliases: ["DOMAINREG RENEWAL"],
  },
] as const;

async function seedMerchants(): Promise<Map<string, string>> {
  const ids = new Map<string, string>();
  for (const merchant of MERCHANTS) {
    const row = await prisma.merchant.upsert({
      where: { normalizedKey: merchant.normalizedKey },
      update: {
        canonicalName: merchant.canonicalName,
        category: merchant.category,
        isSubscriptionProvider: merchant.isSubscriptionProvider,
        negotiable: merchant.negotiable,
        aliases: [...merchant.aliases],
      },
      create: {
        canonicalName: merchant.canonicalName,
        normalizedKey: merchant.normalizedKey,
        category: merchant.category,
        isSubscriptionProvider: merchant.isSubscriptionProvider,
        negotiable: merchant.negotiable,
        aliases: [...merchant.aliases],
      },
    });
    ids.set(merchant.normalizedKey, row.id);
  }
  return ids;
}

// ─── Staff ──────────────────────────────────────────────────────────────────

async function seedAdmins(): Promise<void> {
  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 12);
  // MFA seeds are encrypted at rest under their own key-derivation domain.
  const cipher = new TokenCipher(adminTokenSecret(env()), "reclaimr:admin-mfa:v1");

  const staff = [
    { email: "agent@reclaimr.app", name: "Ada Agent", role: "agent" as const, mfa: false },
    {
      email: "finance@reclaimr.app",
      name: "Finn Finance",
      role: "finance_ops" as const,
      mfa: false,
    },
    // Only the highest-privilege account is enrolled, mirroring the production
    // rule that audit-log access requires a second factor.
    { email: "admin@reclaimr.app", name: "Rae Root", role: "admin" as const, mfa: true },
  ];

  for (const member of staff) {
    await prisma.adminUser.upsert({
      where: { email: member.email },
      update: { name: member.name, role: member.role, isActive: true },
      create: {
        email: member.email,
        name: member.name,
        role: member.role,
        passwordHash,
        mfaSecret: member.mfa ? cipher.encrypt(DEMO_MFA_SECRET) : null,
      },
    });
  }
}

// ─── Members ────────────────────────────────────────────────────────────────

async function seedPremiumMember(merchants: Map<string, string>): Promise<void> {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);

  const user = await prisma.user.create({
    data: {
      email: DEMO_EMAIL,
      name: "Demo Member",
      passwordHash,
      consents: {
        create: [
          { type: "terms_of_service", version: CONSENT_VERSION },
          { type: "privacy_policy", version: CONSENT_VERSION },
        ],
      },
      premium: {
        create: {
          status: "active",
          priceCentsMonthly: 900,
          interval: "monthly",
          currentPeriodStart: daysFromNow(-12),
          currentPeriodEnd: daysFromNow(18),
          externalCustomerId: "cus_seed_demo",
          externalSubscriptionId: "sub_seed_demo",
        },
      },
    },
  });

  // ── Subscriptions ────────────────────────────────────────────────────────
  const subscriptions = await Promise.all(
    [
      {
        name: "Streaming Plus",
        key: "streaming plus",
        amountCents: 1_599,
        cadence: "monthly" as const,
        nextBillingDate: daysFromNow(6),
        source: "auto" as const,
        confidence: 0.99,
      },
      {
        name: "Music Family Plan",
        key: "music family",
        amountCents: 1_699,
        cadence: "monthly" as const,
        nextBillingDate: daysFromNow(11),
        source: "auto" as const,
        confidence: 0.98,
      },
      {
        name: "Cloud Storage 2TB",
        key: "cloud vault",
        amountCents: 999,
        cadence: "monthly" as const,
        nextBillingDate: daysFromNow(2),
        source: "auto" as const,
        confidence: 0.99,
      },
      {
        name: "Iron Gym",
        key: "iron gym",
        amountCents: 4_500,
        cadence: "monthly" as const,
        nextBillingDate: daysFromNow(20),
        source: "manual" as const,
        confidence: null,
      },
      {
        name: "Daily Ledger",
        key: "daily ledger",
        amountCents: 2_500,
        cadence: "quarterly" as const,
        nextBillingDate: daysFromNow(34),
        status: "paused" as const,
        source: "manual" as const,
        confidence: null,
      },
      {
        name: "Domain Renewal",
        key: "domain registrar",
        amountCents: 1_499,
        cadence: "annual" as const,
        nextBillingDate: daysFromNow(300),
        source: "manual" as const,
        confidence: null,
      },
    ].map(({ key, ...data }) =>
      prisma.subscription.create({
        data: { userId: user.id, merchantId: merchants.get(key) ?? null, ...data },
      }),
    ),
  );

  // ── Bills ────────────────────────────────────────────────────────────────
  const bills = await Promise.all(
    [
      {
        name: "City Internet",
        key: "city internet",
        category: "telecommunications" as const,
        dueDay: 12,
        expectedAmountCents: 9_000,
        lastAmountCents: 9_000,
        negotiable: true,
        autopay: true,
        confidence: 0.98,
      },
      {
        name: "Northwind Mobile",
        key: "northwind mobile",
        category: "telecommunications" as const,
        dueDay: 3,
        expectedAmountCents: 7_200,
        lastAmountCents: 7_450,
        negotiable: true,
        autopay: true,
        confidence: 0.97,
      },
      {
        name: "Metro Power",
        key: "metro power",
        category: "utilities" as const,
        dueDay: 22,
        expectedAmountCents: 11_000,
        lastAmountCents: 13_400,
        negotiable: false,
        autopay: false,
        confidence: 0.97,
      },
      {
        name: "Harbor Auto Insurance",
        key: "harbor insurance",
        category: "insurance" as const,
        dueDay: 28,
        expectedAmountCents: 14_200,
        lastAmountCents: 14_200,
        negotiable: true,
        autopay: false,
        confidence: null,
      },
    ].map(({ key, ...data }) =>
      prisma.bill.create({
        data: { userId: user.id, merchantId: merchants.get(key) ?? null, ...data },
      }),
    ),
  );

  const [internet, mobile, , insurance] = bills;
  const [, , cloud, gym] = subscriptions;

  // ── Cancellation cases ───────────────────────────────────────────────────

  // Resolved: the subscription is retired and the ledger credits a full year.
  const canceledMonthly = monthlyEquivalentCents(gym!.amountCents, gym!.cadence);
  const succeededCancellation = await prisma.cancellationCase.create({
    data: {
      userId: user.id,
      subscriptionId: gym!.id,
      status: "succeeded",
      monthlyAmountCents: canceledMonthly,
      reason: "Never go any more",
      resolvedAt: daysFromNow(-2),
      outcomeNote: "Provider confirmed cancellation effective immediately.",
      timeline: timeline([
        { status: "submitted", actor: "member", note: "Never go any more" },
        { status: "in_review", actor: "concierge" },
        { status: "in_progress", actor: "concierge", note: "Retention call queued" },
        { status: "succeeded", actor: "concierge", note: "Confirmed by provider" },
      ]),
    },
  });
  await prisma.subscription.update({
    where: { id: gym!.id },
    data: { status: "canceled", canceledAt: daysFromNow(-2) },
  });

  // In flight, so the member has something to watch.
  await prisma.cancellationCase.create({
    data: {
      userId: user.id,
      subscriptionId: cloud!.id,
      status: "in_progress",
      monthlyAmountCents: monthlyEquivalentCents(cloud!.amountCents, cloud!.cadence),
      reason: "Only using 200GB",
      timeline: timeline([
        { status: "submitted", actor: "member", note: "Only using 200GB" },
        { status: "in_review", actor: "concierge" },
        { status: "in_progress", actor: "concierge", note: "Submitted cancellation form" },
      ]),
    },
  });
  await prisma.subscription.update({
    where: { id: cloud!.id },
    data: { status: "cancel_requested" },
  });

  // ── Negotiation cases ────────────────────────────────────────────────────

  // Resolved and approved: fee booked, member credited the net.
  const confirmedSavings = 24_000;
  const feePercent = 40;
  const settlement = settleNegotiation(confirmedSavings, feePercent);
  const succeededNegotiation = await prisma.negotiationCase.create({
    data: {
      userId: user.id,
      billId: internet!.id,
      status: "succeeded",
      feePercent,
      projectedAnnualSavingsCents: 16_200,
      offeredAnnualSavingsCents: confirmedSavings,
      offerNote: "Loyalty plan: $60/mo for 12 months, same speed.",
      offeredAt: daysFromNow(-9),
      offerRespondedAt: daysFromNow(-8),
      confirmedAnnualSavingsCents: settlement.confirmedAnnualSavingsCents,
      feeAmountCents: settlement.feeAmountCents,
      resolvedAt: daysFromNow(-8),
      outcomeNote: "Member approved the retention offer.",
      timeline: timeline([
        { status: "submitted", actor: "member" },
        { status: "in_review", actor: "concierge" },
        { status: "in_progress", actor: "concierge", note: "Negotiating with retention desk" },
        { status: "offer_pending", actor: "concierge", note: "Secured $60/mo for 12 months" },
        { status: "succeeded", actor: "member", note: "Offer approved" },
      ]),
    },
  });
  await prisma.bill.update({
    where: { id: internet!.id },
    data: { expectedAmountCents: 6_000, lastAmountCents: 6_000 },
  });

  // Awaiting the member's decision — the state the approve/reject UI needs.
  await prisma.negotiationCase.create({
    data: {
      userId: user.id,
      billId: mobile!.id,
      status: "offer_pending",
      feePercent: 45,
      projectedAnnualSavingsCents: 12_960,
      offeredAnnualSavingsCents: 9_600,
      offerNote: "Same data, $60/mo instead of $74.50, 12-month term.",
      offeredAt: daysFromNow(-1),
      timeline: timeline([
        { status: "submitted", actor: "member" },
        { status: "in_review", actor: "concierge" },
        { status: "in_progress", actor: "concierge" },
        { status: "offer_pending", actor: "concierge", note: "Awaiting member approval" },
      ]),
    },
  });

  // Just submitted, so the admin queue is not empty.
  await prisma.negotiationCase.create({
    data: {
      userId: user.id,
      billId: insurance!.id,
      status: "submitted",
      feePercent: 35,
      projectedAnnualSavingsCents: 25_560,
      timeline: timeline([{ status: "submitted", actor: "member" }]),
    },
  });

  // ── Savings ledger ───────────────────────────────────────────────────────
  // Written to match the resolved cases above, including the unique
  // (sourceType, sourceId) pairing the services rely on.
  await prisma.savingsEvent.createMany({
    data: [
      {
        userId: user.id,
        kind: "subscription_canceled",
        amountCents: canceledMonthly * 12,
        description: "Canceled Iron Gym",
        occurredAt: daysFromNow(-2),
        sourceType: "cancellation",
        sourceId: succeededCancellation.id,
      },
      {
        userId: user.id,
        kind: "bill_negotiated",
        // The member's share: confirmed savings minus our success fee.
        amountCents: settlement.netAnnualSavingsCents,
        description: "Negotiated City Internet",
        occurredAt: daysFromNow(-8),
        sourceType: "negotiation",
        sourceId: succeededNegotiation.id,
      },
      {
        userId: user.id,
        kind: "manual_adjustment",
        amountCents: 3_500,
        description: "Cancelled unused parking permit myself",
        occurredAt: daysFromNow(-20),
        sourceType: "manual",
        sourceId: null,
      },
    ],
  });

  // ── Alerts ───────────────────────────────────────────────────────────────
  await prisma.alert.createMany({
    data: [
      {
        userId: user.id,
        type: "price_increase",
        severity: "warning",
        title: "Northwind Mobile went up",
        body: "Your bill rose from $72.00 to $74.50 this month.",
        data: { previousCents: 7_200, currentCents: 7_450 },
      },
      {
        userId: user.id,
        type: "upcoming_bill",
        severity: "info",
        title: "Cloud Storage renews in 2 days",
        body: "$9.99 will be charged on your linked card.",
        data: { amountCents: 999 },
      },
    ],
  });

  await prisma.auditLog.create({
    data: {
      actorType: "system",
      userId: user.id,
      action: "seed.demo_data_created",
      targetType: "user",
      targetId: user.id,
      metadata: { subscriptions: subscriptions.length, bills: bills.length },
    },
  });
}

/** A second member on the free tier, so the paywall can be exercised. */
async function seedFreeMember(merchants: Map<string, string>): Promise<void> {
  const user = await prisma.user.create({
    data: {
      email: FREE_EMAIL,
      name: "Free Tier Member",
      passwordHash: await bcrypt.hash(DEMO_PASSWORD, 12),
      consents: {
        create: [
          { type: "terms_of_service", version: CONSENT_VERSION },
          { type: "privacy_policy", version: CONSENT_VERSION },
        ],
      },
    },
  });

  await prisma.subscription.createMany({
    data: [
      {
        userId: user.id,
        merchantId: merchants.get("streaming plus") ?? null,
        name: "Streaming Plus",
        amountCents: 1_599,
        cadence: "monthly",
        nextBillingDate: daysFromNow(9),
        source: "auto",
        confidence: 0.98,
      },
      {
        userId: user.id,
        merchantId: merchants.get("music family") ?? null,
        name: "Music Family Plan",
        amountCents: 1_699,
        cadence: "monthly",
        nextBillingDate: daysFromNow(15),
        source: "auto",
        confidence: 0.97,
      },
    ],
  });

  await prisma.bill.create({
    data: {
      userId: user.id,
      merchantId: merchants.get("city internet") ?? null,
      name: "City Internet",
      category: "telecommunications",
      dueDay: 12,
      expectedAmountCents: 9_000,
      lastAmountCents: 9_000,
      negotiable: true,
      confidence: 0.97,
    },
  });
}

async function main(): Promise<void> {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Refusing to seed: the demo credentials in this file are public.");
  }

  const merchants = await seedMerchants();
  await seedAdmins();

  // Deleting the demo members cascades to everything they own, which makes
  // re-seeding genuinely idempotent instead of merely additive.
  await prisma.user.deleteMany({ where: { email: { in: [DEMO_EMAIL, FREE_EMAIL] } } });
  await seedPremiumMember(merchants);
  await seedFreeMember(merchants);

  console.log(
    [
      "Seed complete.",
      "",
      `  Premium member : ${DEMO_EMAIL} / ${DEMO_PASSWORD}`,
      `  Free member    : ${FREE_EMAIL} / ${DEMO_PASSWORD}`,
      "",
      `  Staff (agent)      : agent@reclaimr.app / ${ADMIN_PASSWORD}`,
      `  Staff (finance_ops): finance@reclaimr.app / ${ADMIN_PASSWORD}`,
      `  Staff (admin, MFA) : admin@reclaimr.app / ${ADMIN_PASSWORD}`,
      `  TOTP seed for admin: ${DEMO_MFA_SECRET}`,
      "",
      `  ${MERCHANTS.length} merchants, 1 pending negotiation offer awaiting approval.`,
    ].join("\n"),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
