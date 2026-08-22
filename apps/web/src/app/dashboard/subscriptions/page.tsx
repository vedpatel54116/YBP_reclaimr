import type { Metadata } from "next";
import Link from "next/link";
import {
  Badge,
  Card,
  EmptyState,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeadCell,
  TableRow,
} from "@reclaimr/ui";
import { cn } from "@reclaimr/ui";
import { AddSubscriptionButton } from "@/components/dashboard/add-subscription-button";
import { PageHeader } from "@/components/dashboard/page-header";
import {
  CancelSubscriptionButton,
  ReactivateSubscriptionButton,
} from "@/components/dashboard/subscription-actions";
import {
  loadSubscriptions,
  getDemoAdviceSavings,
  getSubscriptionRotScores,
  getPortfolioRotSummary,
} from "@/lib/data";
import {
  getRotTier,
  isStatusFilter,
  previousChargeDate,
  rotBadgeVariant,
  statusBadgeVariant,
  summarizeSubscriptions,
  STATUS_FILTERS,
  type StatusFilter,
} from "@/lib/domain";
import { formatCadence, formatDateShort, formatMoney, formatMoneyRounded } from "@/lib/format";

export const metadata: Metadata = { title: "Subscriptions" };

const FILTER_LABEL: Record<StatusFilter, string> = {
  all: "All",
  active: "Active",
  paused: "Paused",
  cancel_requested: "Cancel requested",
  canceled: "Canceled",
};

interface SubscriptionsPageProps {
  searchParams?: Promise<{ status?: string }>;
}

export default async function SubscriptionsPage({ searchParams }: SubscriptionsPageProps) {
  const resolvedParams = searchParams ? await searchParams : undefined;
  const status = resolvedParams?.status;
  const filter: StatusFilter = isStatusFilter(status) ? status : "all";
  const { subscriptions, source } = await loadSubscriptions();

  const summary = summarizeSubscriptions(subscriptions);
  // Best-known monthly saving per row. Fixture-backed for now: rendering a
  // badge must never cost one API call per row.
  const adviceSavings = getDemoAdviceSavings();
  const rotScores = getSubscriptionRotScores(subscriptions);
  const portfolioRot = getPortfolioRotSummary(subscriptions);
  const portfolioTier = getRotTier(portfolioRot.averageRotScore);
  const visible =
    filter === "all" ? subscriptions : subscriptions.filter((item) => item.status === filter);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Subscriptions"
        description={`${formatMoney(summary.totalMonthlyCents)} per month across ${summary.activeCount} active · ${formatMoneyRounded(summary.totalYearlyCents)} per year`}
        source={source}
        actions={<AddSubscriptionButton source={source} />}
      />

      {/* ── Rot Intelligence Banner ─────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="flex flex-col gap-1 rounded-xl border border-foreground/30 bg-muted/40 p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Portfolio Rot Score
            </span>
            <Badge variant={rotBadgeVariant(portfolioTier.tier)} className="px-2 py-0.5 font-bold uppercase">
              {portfolioTier.label}
            </Badge>
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="font-mono text-3xl font-black tracking-tight tabular-nums text-foreground">
              {portfolioRot.averageRotScore}%
            </span>
            <span className="text-xs text-muted-foreground font-medium">overall waste rate</span>
          </div>
        </div>

        <div className="flex flex-col gap-1 rounded-xl border border-foreground/30 bg-muted/40 p-4">
          <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Monthly Leakage
          </span>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="font-mono text-3xl font-black tracking-tight tabular-nums text-foreground">
              {formatMoney(portfolioRot.totalWastedMonthlyCents)}
            </span>
            <span className="text-xs text-muted-foreground font-medium">/ month wasted</span>
          </div>
        </div>

        <div className="flex flex-col gap-1 rounded-xl border border-foreground/30 bg-muted/40 p-4">
          <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            High Rot Subscriptions
          </span>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="font-mono text-3xl font-black tracking-tight tabular-nums text-foreground">
              {portfolioRot.highRotCount}
            </span>
            <span className="text-xs text-muted-foreground font-medium">
              of {summary.activeCount} active needing review
            </span>
          </div>
        </div>
      </div>

      {/* ── Status filter ───────────────────────────────────────────────── */}
      <div className="flex gap-1 overflow-x-auto" role="tablist" aria-label="Filter by status">
        {STATUS_FILTERS.map((option) => {
          const active = option === filter;
          const count =
            option === "all"
              ? subscriptions.length
              : subscriptions.filter((item) => item.status === option).length;
          return (
            <Link
              key={option}
              role="tab"
              aria-selected={active}
              href={
                option === "all"
                  ? "/dashboard/subscriptions"
                  : `/dashboard/subscriptions?status=${option}`
              }
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors",
                active
                  ? "border-transparent bg-foreground text-background"
                  : "border-border text-muted-foreground hover:border-foreground hover:text-foreground",
              )}
            >
              {FILTER_LABEL[option]}
              <span className="font-mono tabular-nums">{count}</span>
            </Link>
          );
        })}
      </div>

      {/* ── Table ───────────────────────────────────────────────────────── */}
      {visible.length > 0 ? (
        <Card className="gap-0 overflow-hidden p-0">
          <Table>
            <TableHead>
              <TableRow>
                <TableHeadCell>Merchant</TableHeadCell>
                <TableHeadCell className="text-right">Amount</TableHeadCell>
                <TableHeadCell className="min-w-[190px] font-bold text-foreground">
                  <div className="flex items-center gap-1.5">
                    <span>ROT SCORE</span>
                    <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[9px] font-bold tracking-wider text-muted-foreground uppercase">
                      Waste %
                    </span>
                  </div>
                </TableHeadCell>
                <TableHeadCell>Frequency</TableHeadCell>
                <TableHeadCell>Last charge</TableHeadCell>
                <TableHeadCell>Next charge</TableHeadCell>
                <TableHeadCell>Status</TableHeadCell>
                <TableHeadCell className="text-right">Actions</TableHeadCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {visible.map((subscription) => (
                <TableRow key={subscription.id}>
                  <TableCell className="font-semibold">
                    <div className="flex flex-col items-start gap-1">
                      <Link
                        href={`/dashboard/subscriptions/${subscription.id}`}
                        className="transition-colors hover:underline"
                      >
                        {subscription.name}
                      </Link>
                      {subscription.status !== "canceled" &&
                      adviceSavings.has(subscription.id) ? (
                        <Badge variant="outline">
                          Save {formatMoney(adviceSavings.get(subscription.id)!)}/mo
                        </Badge>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-mono font-semibold tabular-nums">
                    {formatMoney(subscription.amountCents, subscription.currency)}
                  </TableCell>
                  <TableCell className="min-w-[190px]">
                    {subscription.status === "canceled" ? (
                      <span className="text-xs text-muted-foreground">—</span>
                    ) : rotScores.has(subscription.id) ? (
                      (() => {
                        const rot = rotScores.get(subscription.id)!;
                        const isHigh = rot.tier === "high_rot";
                        const isMod = rot.tier === "moderate_rot";
                        return (
                          <div className="flex flex-col gap-1.5 py-1">
                            <div className="flex items-center gap-2">
                              <span
                                className={cn(
                                  "font-mono text-lg font-black tracking-tight tabular-nums",
                                  isHigh ? "text-foreground" : isMod ? "text-foreground/90" : "text-muted-foreground",
                                )}
                              >
                                {rot.rotScore}%
                              </span>
                              <span
                                className={cn(
                                  "inline-flex items-center rounded px-2 py-0.5 text-[10px] font-bold tracking-wider uppercase",
                                  isHigh
                                    ? "bg-foreground text-background font-black shadow-xs"
                                    : isMod
                                    ? "border border-foreground/40 bg-muted text-foreground font-bold"
                                    : "border border-border text-muted-foreground font-semibold",
                                )}
                              >
                                {rot.tierLabel}
                              </span>
                            </div>

                            {/* Mini visual progress track */}
                            <div className="relative h-1.5 w-32 overflow-hidden rounded-full bg-muted">
                              <div
                                className={cn(
                                  "h-full rounded-full transition-all duration-300",
                                  isHigh
                                    ? "bg-foreground"
                                    : isMod
                                    ? "bg-foreground/70"
                                    : "bg-muted-foreground/40",
                                )}
                                style={{ width: `${rot.rotScore}%` }}
                              />
                            </div>

                            <div className="flex items-center gap-1 font-mono text-[11px] tabular-nums">
                              <span className="font-bold text-foreground">
                                -{formatMoney(rot.wastedMonthlyCents, subscription.currency)}
                              </span>
                              <span className="text-muted-foreground">/mo wasted</span>
                            </div>
                          </div>
                        );
                      })()
                    ) : null}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatCadence(subscription.cadence)}
                  </TableCell>
                  <TableCell className="font-mono text-muted-foreground tabular-nums">
                    {formatDateShort(
                      previousChargeDate(subscription.nextBillingDate, subscription.cadence),
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-muted-foreground tabular-nums">
                    {subscription.status === "canceled"
                      ? "—"
                      : formatDateShort(subscription.nextBillingDate)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusBadgeVariant(subscription.status)}>
                      {subscription.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1.5">
                      <Link
                        href={`/dashboard/subscriptions/${subscription.id}`}
                        className="rounded-md px-2.5 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      >
                        Manage
                      </Link>
                      {subscription.status === "active" || subscription.status === "paused" ? (
                        <CancelSubscriptionButton
                          subscriptionId={subscription.id}
                          name={subscription.name}
                          source={source}
                        />
                      ) : (
                        <ReactivateSubscriptionButton
                          subscriptionId={subscription.id}
                          name={subscription.name}
                          source={source}
                        />
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      ) : (
        <EmptyState
          title={
            filter === "all"
              ? "No subscriptions yet"
              : `No ${FILTER_LABEL[filter].toLowerCase()} subscriptions`
          }
          description={
            filter === "all"
              ? "Connect an account and ReclaimR will find every recurring charge automatically — or add one by hand."
              : "Nothing matches this filter right now."
          }
          action={filter === "all" ? <AddSubscriptionButton source={source} /> : undefined}
        />
      )}
    </div>
  );
}
