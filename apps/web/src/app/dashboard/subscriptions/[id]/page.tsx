import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Badge,
  buttonClasses,
  Card,
  CardSection,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeadCell,
  TableRow,
} from "@reclaimr/ui";
import { PageHeader } from "@/components/dashboard/page-header";
import { BetterOptionsCard } from "@/components/dashboard/better-options-card";
import { RotScoreCard } from "@/components/dashboard/rot-score-card";
import {
  CancelSubscriptionButton,
  ReactivateSubscriptionButton,
} from "@/components/dashboard/subscription-actions";
import { UNUSED_SUBSCRIPTION_IDS } from "@/lib/demo";
import { loadAdvice, loadSubscription, loadSubscriptionUsage } from "@/lib/data";
import {
  monthlyEquivalentCents,
  previousChargeDate,
  recentChargeDates,
  statusBadgeVariant,
  upcomingChargeDates,
} from "@/lib/domain";
import { formatCadence, formatDate, formatMoney } from "@/lib/format";

interface SubscriptionDetailPageProps {
  params?: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: SubscriptionDetailPageProps): Promise<Metadata> {
  const resolved = params ? await params : { id: "" };
  const result = await loadSubscription(resolved.id);
  return { title: result ? result.subscription.name : "Subscription" };
}

export default async function SubscriptionDetailPage({ params }: SubscriptionDetailPageProps) {
  const resolved = params ? await params : { id: "" };
  const id = resolved.id;
  const [result, usage] = await Promise.all([
    loadSubscription(id),
    loadSubscriptionUsage(id),
  ]);
  if (!result) notFound();

  const { subscription, source } = result;
  const advice = await loadAdvice(id);
  const monthly = monthlyEquivalentCents(subscription.amountCents, subscription.cadence);
  const lastCharge = previousChargeDate(subscription.nextBillingDate, subscription.cadence);
  const recent = recentChargeDates(subscription.nextBillingDate, subscription.cadence, 6);
  const upcoming = upcomingChargeDates(subscription.nextBillingDate, subscription.cadence, 3);
  const unusedReason = UNUSED_SUBSCRIPTION_IDS[subscription.id];
  const isActive = subscription.status === "active" || subscription.status === "paused";
  const historyRows = [
    ...upcoming
      .slice(0, 2)
      .reverse()
      .map((date) => ({ date, upcoming: true })),
    { date: subscription.nextBillingDate, upcoming: subscription.status !== "canceled" },
    ...recent.slice(0, 5).map((date) => ({ date, upcoming: false })),
  ].filter((row) => !row.upcoming || subscription.status !== "canceled");

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/dashboard/subscriptions"
        className="inline-flex w-fit items-center gap-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        ← All subscriptions
      </Link>

      <PageHeader
        title={subscription.name}
        description={`Tracked since ${formatDate(subscription.createdAt)}`}
        source={source}
        actions={
          <>
            {isActive ? (
              <CancelSubscriptionButton
                subscriptionId={subscription.id}
                name={subscription.name}
                source={source}
                size="md"
              />
            ) : (
              <ReactivateSubscriptionButton
                subscriptionId={subscription.id}
                name={subscription.name}
                source={source}
                size="md"
              />
            )}
          </>
        }
      />

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-3">
        {/* ── Main column: Summary & Rot Score ──────────────────────────── */}
        <div className="flex flex-col gap-4 lg:col-span-2">
          <Card>
            <div className="flex flex-wrap items-end justify-between gap-4 border-b pb-5">
              <div className="flex flex-col gap-1">
                <Badge variant={statusBadgeVariant(subscription.status)}>{subscription.status}</Badge>
                <p className="font-mono text-5xl font-bold tracking-tight tabular-nums">
                  {formatMoney(subscription.amountCents, subscription.currency)}
                </p>
                <p className="text-sm text-muted-foreground">
                  {formatCadence(subscription.cadence)} ·{" "}
                  <span className="font-mono tabular-nums">
                    {formatMoney(monthly, subscription.currency)}
                  </span>{" "}
                  per month equivalent
                </p>
              </div>
            </div>

            <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-md border bg-border sm:grid-cols-4">
              {[
                { label: "Last charge", value: formatDate(lastCharge) },
                {
                  label: "Next charge",
                  value:
                    subscription.status === "canceled"
                      ? "—"
                      : formatDate(subscription.nextBillingDate),
                },
                { label: "Yearly cost", value: formatMoney(monthly * 12, subscription.currency) },
                { label: "Currency", value: subscription.currency },
              ].map((item) => (
                <div key={item.label} className="flex flex-col gap-1 bg-background p-3">
                  <dt className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                    {item.label}
                  </dt>
                  <dd className="font-mono text-sm font-semibold tabular-nums">{item.value}</dd>
                </div>
              ))}
            </dl>

            <div>
              <h2 className="mb-3 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                Charge history
              </h2>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeadCell>Date</TableHeadCell>
                    <TableHeadCell>Kind</TableHeadCell>
                    <TableHeadCell className="text-right">Amount</TableHeadCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {historyRows.map((row) => (
                    <TableRow key={row.date}>
                      <TableCell className="font-mono tabular-nums">{formatDate(row.date)}</TableCell>
                      <TableCell>
                        {row.upcoming ? (
                          <Badge variant="outline">Upcoming</Badge>
                        ) : (
                          <span className="text-sm text-muted-foreground">Charged</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono font-semibold tabular-nums">
                        {formatMoney(subscription.amountCents, subscription.currency)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <p className="mt-2 text-xs text-subtle-foreground">
                History is derived from the billing cadence until transaction-level data is linked.
              </p>
            </div>
          </Card>

          {/* ── Rot Score & Value Efficiency Card ──────────────────────── */}
          {subscription.status !== "canceled" ? (
            <RotScoreCard
              monthlyPriceCents={monthly}
              currency={subscription.currency}
              initialHoursUsed={usage.hoursUsedMonth}
              benchmarkHours={usage.benchmarkHoursMonth}
              shapeExponent={usage.shapeExponent}
              notes={usage.notes}
              subscriptionName={subscription.name}
            />
          ) : null}
        </div>

        {/* ── Side column ────────────────────────────────────────────────── */}
        <div className="flex flex-col gap-4">
          {advice && isActive ? (
            <BetterOptionsCard content={advice.content} currency={subscription.currency} />
          ) : null}

          {unusedReason ? (
            <Card className="border-foreground">
              <CardSection title="Flagged as unused" description={unusedReason} />
              <p className="text-sm text-muted-foreground">
                Canceling reclaims{" "}
                <span className="font-mono font-bold text-foreground tabular-nums">
                  {formatMoney(monthly * 12, subscription.currency)}
                </span>{" "}
                per year.
              </p>
              {isActive ? (
                <CancelSubscriptionButton
                  subscriptionId={subscription.id}
                  name={subscription.name}
                  source={source}
                  size="md"
                />
              ) : null}
            </Card>
          ) : (
            <Card>
              <CardSection
                title="What canceling saves"
                description="Concierge handles the provider; you keep access to the paid period."
              />
              <p className="font-mono text-3xl font-bold tracking-tight tabular-nums">
                {formatMoney(monthly * 12, subscription.currency)}
                <span className="text-sm font-normal text-muted-foreground"> /yr</span>
              </p>
              {isActive ? (
                <Link href="/dashboard/premium" className={buttonClasses("secondary", "md")}>
                  Let the concierge cancel it
                </Link>
              ) : null}
            </Card>
          )}

          <Card>
            <CardSection title="Prefer to do it yourself?" />
            <p className="text-sm text-muted-foreground">
              Most providers bury the cancel flow. We keep deep links to every merchant&apos;s
              cancellation page, updated monthly.
            </p>
            <Link href="/dashboard/subscriptions" className={buttonClasses("ghost", "md")}>
              Browse merchant links
            </Link>
          </Card>
        </div>
      </div>
    </div>
  );
}
