import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRightIcon,
  buttonClasses,
  Card,
  CardSection,
  ChevronRightIcon,
  EmptyState,
} from "@reclaimr/ui";
import { AlertListItem } from "@/components/dashboard/alert-list-item";
import { AddSubscriptionButton } from "@/components/dashboard/add-subscription-button";
import { PageHeader } from "@/components/dashboard/page-header";
import { RunScanButton } from "@/components/dashboard/quick-actions";
import { StatCard } from "@/components/dashboard/stat-card";
import {
  getAlerts,
  getBills,
  getPotentialMonthlySavingsCents,
  getSavingsEvents,
  getSavingsSummary,
  loadSubscriptions,
} from "@/lib/data";
import { summarizeSubscriptions } from "@/lib/domain";
import { UNUSED_SUBSCRIPTION_IDS } from "@/lib/demo";
import { formatMoney, formatMoneyRounded } from "@/lib/format";

export const metadata: Metadata = { title: "Overview" };

const QUICK_LINKS = [
  {
    href: "/dashboard/bills",
    title: "Negotiate a bill",
    description: "Hand an overpriced bill to the concierge.",
  },
  {
    href: "/dashboard/savings",
    title: "See savings history",
    description: "Every dollar reclaimed, logged.",
  },
  {
    href: "/dashboard/premium",
    title: "Go Premium",
    description: "Unlimited concierge cancel & negotiate.",
  },
] as const;

export default async function DashboardHomePage() {
  const [{ subscriptions, source }, bills, alerts, savingsEvents] = await Promise.all([
    loadSubscriptions(),
    getBills(),
    getAlerts(),
    getSavingsEvents(),
  ]);

  const summary = summarizeSubscriptions(subscriptions);
  const savings = getSavingsSummary(savingsEvents);
  const potentialCents = getPotentialMonthlySavingsCents(
    subscriptions,
    UNUSED_SUBSCRIPTION_IDS,
    bills,
  );
  const negotiableCount = bills.filter((bill) => bill.negotiable).length;
  const recentAlerts = alerts.slice(0, 5);

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Overview"
        description="Everything leaving your accounts on repeat — and everything ReclaimR is doing about it."
        source={source}
        actions={<RunScanButton />}
      />

      {/* ── KPI row ─────────────────────────────────────────────────────── */}
      <section
        aria-label="Key metrics"
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        <StatCard
          label="Monthly recurring"
          value={formatMoney(summary.totalMonthlyCents)}
          hint={`${summary.activeCount} active subscription${summary.activeCount === 1 ? "" : "s"} · ${formatMoneyRounded(summary.totalYearlyCents)} per year`}
        />
        <StatCard
          label="Potential savings"
          value={`${formatMoney(potentialCents)}/mo`}
          hint="Unused subscriptions + negotiable bills"
          action={
            <Link
              href="/dashboard/savings"
              className="text-muted-foreground transition-colors hover:text-foreground"
              aria-label="View savings"
            >
              <ChevronRightIcon className="size-4" />
            </Link>
          }
        />
        <StatCard
          label="Active subscriptions"
          value={String(summary.activeCount)}
          hint={
            summary.pausedCount > 0
              ? `${summary.pausedCount} paused · ${summary.canceledCount} canceled`
              : `${summary.canceledCount} canceled`
          }
          action={
            <Link
              href="/dashboard/subscriptions"
              className="text-muted-foreground transition-colors hover:text-foreground"
              aria-label="View subscriptions"
            >
              <ChevronRightIcon className="size-4" />
            </Link>
          }
        />
        <StatCard
          label="Detected bills"
          value={String(bills.length)}
          hint={`${negotiableCount} negotiable · ${formatMoneyRounded(bills.reduce((sum, bill) => sum + bill.lastAmountCents, 0))} per month`}
          action={
            <Link
              href="/dashboard/bills"
              className="text-muted-foreground transition-colors hover:text-foreground"
              aria-label="View bills"
            >
              <ChevronRightIcon className="size-4" />
            </Link>
          }
        />
      </section>

      {/* ── Alerts + quick actions ──────────────────────────────────────── */}
      <section className="grid grid-cols-1 items-start gap-4 lg:grid-cols-3">
        <Card className="gap-0 p-0 lg:col-span-2">
          <CardSection
            title="Recent alerts"
            description="Price hikes, new charges, and things needing attention."
            action={
              <Link
                href="/dashboard/alerts"
                className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                View all
                <ArrowRightIcon className="size-3.5" />
              </Link>
            }
          />
          <div className="mt-4 border-t">
            {recentAlerts.length > 0 ? (
              recentAlerts.map((alert) => <AlertListItem key={alert.id} alert={alert} />)
            ) : (
              <div className="p-4">
                <EmptyState
                  title="No alerts yet"
                  description="We'll flag price increases, trial conversions, and unusual charges here."
                />
              </div>
            )}
          </div>
        </Card>

        <Card>
          <CardSection title="Quick actions" description="Put ReclaimR to work." />
          <div className="flex flex-col gap-2">
            <RunScanButton />
            <AddSubscriptionButton source={source} />
            {QUICK_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="group flex items-center justify-between gap-3 rounded-md border px-3 py-2.5 transition-colors hover:bg-muted"
              >
                <span className="flex flex-col">
                  <span className="text-sm font-semibold">{link.title}</span>
                  <span className="text-xs text-muted-foreground">{link.description}</span>
                </span>
                <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </Link>
            ))}
          </div>
          <p className="border-t pt-3 text-xs text-muted-foreground">
            Reclaimed to date:{" "}
            <span className="font-mono font-bold text-foreground tabular-nums">
              {formatMoney(savings.totalSavedCents)}
            </span>{" "}
            across {savings.count} events.
          </p>
        </Card>
      </section>

      {/* ── Bottom nudge ────────────────────────────────────────────────── */}
      <section className="flex flex-col items-start justify-between gap-4 rounded-lg border border-foreground p-6 sm:flex-row sm:items-center">
        <div className="flex max-w-xl flex-col gap-1">
          <p className="font-heading text-lg font-bold tracking-tight">
            {formatMoney(potentialCents)} a month is on the table.
          </p>
          <p className="text-sm text-muted-foreground">
            Cancel what you don&apos;t use and let the concierge renegotiate the rest — most members
            recover the Premium price several times over.
          </p>
        </div>
        <Link href="/dashboard/premium" className={buttonClasses("primary", "md")}>
          Unlock concierge
        </Link>
      </section>
    </div>
  );
}
