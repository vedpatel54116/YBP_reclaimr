import type { Metadata } from "next";
import {
  Badge,
  Card,
  CardSection,
  EmptyState,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeadCell,
  TableRow,
} from "@reclaimr/ui";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { getSavingsEvents, getSavingsSummary } from "@/lib/data";
import type { SavingsKind } from "@/lib/domain";
import { formatDate, formatMoney, formatMoneyRounded } from "@/lib/format";

export const metadata: Metadata = { title: "Savings" };

const KIND_BADGE: Record<SavingsKind, { label: string; variant: "solid" | "outline" | "muted" }> = {
  subscription_canceled: { label: "Canceled sub", variant: "solid" },
  bill_negotiated: { label: "Negotiated", variant: "outline" },
  fee_refunded: { label: "Fee refund", variant: "muted" },
};

export default async function SavingsPage() {
  const events = getSavingsEvents();
  const summary = getSavingsSummary(events);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Savings"
        description="Every dollar ReclaimR put back in your pocket — cancellations, negotiations, refunds."
      />

      <section aria-label="Savings metrics" className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label="Total saved"
          value={formatMoney(summary.totalSavedCents)}
          hint={`Across ${summary.count} events — refunds included`}
        />
        <StatCard
          label="Monthly run rate"
          value={`${formatMoney(summary.monthlyRunRateCents)}/mo`}
          hint="Recurring savings from cancellations + negotiations"
        />
        <StatCard
          label="Yearly projected"
          value={formatMoneyRounded(summary.yearlyProjectedCents)}
          hint="Run rate over the next twelve months"
        />
      </section>

      {events.length > 0 ? (
        <Card className="gap-0 overflow-hidden p-0">
          <CardSection
            title="Savings history"
            description="Newest first. Cancellations and negotiations record first-year savings; refunds record the fee returned."
            className="px-4 pt-4"
          />
          <div className="mt-4">
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeadCell>Date</TableHeadCell>
                  <TableHeadCell>Type</TableHeadCell>
                  <TableHeadCell>Description</TableHeadCell>
                  <TableHeadCell className="text-right">Reclaimed</TableHeadCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {events.map((event) => {
                  const badge = KIND_BADGE[event.kind];
                  return (
                    <TableRow key={event.id}>
                      <TableCell className="font-mono whitespace-nowrap tabular-nums">
                        {formatDate(event.occurredAt)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={badge.variant}>{badge.label}</Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{event.description}</TableCell>
                      <TableCell className="text-right font-mono font-bold tabular-nums">
                        +{formatMoney(event.amountCents)}
                      </TableCell>
                    </TableRow>
                  );
                })}
                <TableRow>
                  <TableCell colSpan={3} className="text-right font-semibold">
                    Total reclaimed
                  </TableCell>
                  <TableCell className="text-right font-mono font-bold tabular-nums">
                    +{formatMoney(summary.totalSavedCents)}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </Card>
      ) : (
        <EmptyState
          title="No savings yet"
          description="Cancel an unused subscription or negotiate a bill — every win lands here with a dollar figure."
        />
      )}
    </div>
  );
}
