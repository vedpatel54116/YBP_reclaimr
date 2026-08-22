import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Card, CardSection, CheckIcon, XIcon } from "@reclaimr/ui";
import { PageHeader } from "@/components/dashboard/page-header";
import { PricingCard } from "./pricing-card";
import {
  getBills,
  getPotentialMonthlySavingsCents,
  getSavingsEvents,
  getSavingsSummary,
  loadSubscriptions,
} from "@/lib/data";
import { UNUSED_SUBSCRIPTION_IDS } from "@/lib/demo";
import { formatMoney, formatMoneyRounded } from "@/lib/format";

export const metadata: Metadata = { title: "Premium" };

const COMPARISON: { feature: string; free: string; premium: string }[] = [
  {
    feature: "Subscription detection & monitoring",
    free: "Unlimited",
    premium: "Unlimited",
  },
  {
    feature: "Cancel subscriptions",
    free: "Self-serve links",
    premium: "Unlimited concierge cancellations",
  },
  {
    feature: "Bill negotiation",
    free: "Standard queue",
    premium: "Priority queue + provider playbook",
  },
  {
    feature: "Custom budgets",
    free: "2 categories",
    premium: "Unlimited",
  },
  {
    feature: "Price-increase & trial alerts",
    free: "Daily email digest",
    premium: "Real-time, the moment it lands",
  },
  {
    feature: "Savings autopilot",
    free: "—",
    premium: "Included",
  },
];

export default async function PremiumPage() {
  const [{ subscriptions }, bills, savingsEvents] = await Promise.all([
    loadSubscriptions(),
    getBills(),
    getSavingsEvents(),
  ]);
  const potential = getPotentialMonthlySavingsCents(subscriptions, UNUSED_SUBSCRIPTION_IDS, bills);
  const savings = getSavingsSummary(savingsEvents);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Premium"
        description="Free finds the waste. Premium removes it — the concierge cancels and negotiates for you, and you keep the difference."
      />

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-3">
        {/* ── Pitch + comparison ─────────────────────────────────────────── */}
        <div className="flex flex-col gap-4 lg:col-span-2">
          <Card className="border-foreground">
            <CardSection
              title="The math, honestly"
              description="Premium costs less than the waste it removes for almost every member."
            />
            <div className="grid grid-cols-1 gap-px overflow-hidden rounded-md border bg-border sm:grid-cols-3">
              <div className="flex flex-col gap-1 bg-background p-4">
                <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                  On the table now
                </p>
                <p className="font-mono text-2xl font-bold tabular-nums">
                  {formatMoney(potential)}
                  <span className="text-sm font-normal text-muted-foreground"> /mo</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  Unused subs + negotiable bills in your account
                </p>
              </div>
              <div className="flex flex-col gap-1 bg-background p-4">
                <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                  Already reclaimed
                </p>
                <p className="font-mono text-2xl font-bold tabular-nums">
                  {formatMoneyRounded(savings.totalSavedCents)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {savings.count} events across cancellations &amp; negotiations
                </p>
              </div>
              <div className="flex flex-col gap-1 bg-background p-4">
                <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                  Premium price
                </p>
                <p className="font-mono text-2xl font-bold tabular-nums">
                  $7–14
                  <span className="text-sm font-normal text-muted-foreground"> /mo</span>
                </p>
                <p className="text-xs text-muted-foreground">You choose the number</p>
              </div>
            </div>
          </Card>

          <Card className="gap-0 overflow-hidden p-0">
            <CardSection title="What's included" className="px-4 pt-4" />
            <div className="mt-4 overflow-x-auto">
              <table className="w-full caption-bottom text-sm">
                <thead>
                  <tr className="border-b-2 border-foreground">
                    <th
                      scope="col"
                      className="h-10 px-4 text-left align-middle text-xs font-semibold tracking-wider text-muted-foreground uppercase"
                    >
                      Feature
                    </th>
                    <th
                      scope="col"
                      className="h-10 px-4 text-center align-middle text-xs font-semibold tracking-wider text-muted-foreground uppercase"
                    >
                      Free
                    </th>
                    <th
                      scope="col"
                      className="h-10 px-4 text-center align-middle text-xs font-semibold tracking-wider uppercase"
                    >
                      Premium
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {COMPARISON.map((row) => (
                    <tr key={row.feature} className="border-b border-border last:border-b-0">
                      <td className="px-4 py-3 font-semibold">{row.feature}</td>
                      <td className="px-4 py-3 text-center text-muted-foreground">
                        {row.free === "—" ? (
                          <XIcon className="mx-auto size-4" aria-label="Not included" />
                        ) : (
                          row.free
                        )}
                      </td>
                      <td className="px-4 py-3 text-center font-semibold">
                        {row.premium === "Included" || row.premium === "Unlimited" ? (
                          <span className="inline-flex items-center gap-1.5">
                            <CheckIcon className="size-4" aria-hidden="true" />
                            {row.premium}
                          </span>
                        ) : (
                          row.premium
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        {/* ── Pricing ────────────────────────────────────────────────────── */}
        <div className="flex flex-col gap-4">
          <PricingCard />
          <Card>
            <CardSection title="Questions" />
            <div className="flex flex-col gap-3 text-sm">
              <div className="flex flex-col gap-1">
                <p className="font-semibold">How do success fees work?</p>
                <p className="text-muted-foreground">
                  Negotiation is pay-on-success: 35–60% of confirmed first-year savings, your
                  choice. Premium itself is the flat monthly price above.
                </p>
              </div>
              <div className="flex flex-col gap-1">
                <p className="font-semibold">Can I cancel Premium?</p>
                <p className="text-muted-foreground">
                  Anytime, from this page. You keep every dollar already reclaimed.
                </p>
              </div>
            </div>
          </Card>
        </div>
      </div>

      <p className="text-center text-xs text-muted-foreground">
        Not ready?{" "}
        <Link href="/dashboard" className="font-semibold underline underline-offset-2">
          Keep using the free tier
        </Link>{" "}
        — detection and alerts stay on. <Badge variant="muted">No card required to look</Badge>
      </p>
    </div>
  );
}
