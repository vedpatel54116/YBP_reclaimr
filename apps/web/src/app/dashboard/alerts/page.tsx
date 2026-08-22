import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardSection, EmptyState } from "@reclaimr/ui";
import { cn } from "@reclaimr/ui";
import { AlertListItem } from "@/components/dashboard/alert-list-item";
import { MarkAllReadButton } from "@/components/dashboard/alert-actions";
import { PageHeader } from "@/components/dashboard/page-header";
import { getAlerts } from "@/lib/data";

export const metadata: Metadata = { title: "Alerts" };

const FILTERS = ["all", "unread"] as const;
type AlertFilter = (typeof FILTERS)[number];

interface AlertsPageProps {
  searchParams?: Promise<{ filter?: string }>;
}

export default async function AlertsPage({ searchParams }: AlertsPageProps) {
  const resolved = searchParams ? await searchParams : undefined;
  const filter = resolved?.filter;
  const activeFilter: AlertFilter = filter === "unread" ? "unread" : "all";
  const alerts = getAlerts();
  const unread = alerts.filter((alert) => alert.readAt === null);
  const visible = activeFilter === "unread" ? unread : alerts;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Alerts"
        description={
          unread.length > 0
            ? `${unread.length} unread — price hikes, new charges, and account issues land here first.`
            : "You're all caught up."
        }
        actions={<MarkAllReadButton count={unread.length} />}
      />

      <div className="flex gap-1" role="tablist" aria-label="Filter alerts">
        {FILTERS.map((option) => {
          const active = option === activeFilter;
          const count = option === "all" ? alerts.length : unread.length;
          return (
            <Link
              key={option}
              role="tab"
              aria-selected={active}
              href={option === "all" ? "/dashboard/alerts" : "/dashboard/alerts?filter=unread"}
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold capitalize transition-colors",
                active
                  ? "border-transparent bg-foreground text-background"
                  : "border-border text-muted-foreground hover:border-foreground hover:text-foreground",
              )}
            >
              {option}
              <span className="font-mono tabular-nums">{count}</span>
            </Link>
          );
        })}
      </div>

      {visible.length > 0 ? (
        <Card className="gap-0 overflow-hidden p-0">
          <CardSection
            title={activeFilter === "unread" ? "Unread alerts" : "All alerts"}
            description="Newest first. Severity is marked by weight — outlined icons need action."
            className="px-4 pt-4"
          />
          <div className="mt-4 border-t">
            {visible.map((alert) => (
              <AlertListItem key={alert.id} alert={alert} />
            ))}
          </div>
        </Card>
      ) : (
        <EmptyState
          title={activeFilter === "unread" ? "No unread alerts" : "No alerts yet"}
          description={
            activeFilter === "unread"
              ? "Everything has been seen. New alerts appear the moment a charge changes."
              : "We monitor every linked account for price increases, trial conversions, and unusual charges."
          }
        />
      )}
    </div>
  );
}
