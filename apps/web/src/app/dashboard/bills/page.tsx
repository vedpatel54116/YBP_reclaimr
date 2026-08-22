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
import { NegotiateBillButton } from "@/components/dashboard/negotiate-bill-button";
import { PageHeader } from "@/components/dashboard/page-header";
import { getBills } from "@/lib/data";
import { nextDueDate } from "@/lib/domain";
import { daysUntil, formatDateShort, formatMoney, formatMoneyRounded } from "@/lib/format";

export const metadata: Metadata = { title: "Bills" };

const CATEGORY_LABEL: Record<string, string> = {
  utilities: "Utilities",
  telecommunications: "Telecom",
  insurance: "Insurance",
  housing: "Housing",
  fitness: "Fitness",
  other: "Other",
};

function dueLabel(dueDay: number): string {
  const iso = nextDueDate(dueDay);
  const days = daysUntil(iso);
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  return `in ${days} days`;
}

export default async function BillsPage() {
  const bills = [...getBills()].sort((a, b) =>
    nextDueDate(a.dueDay).localeCompare(nextDueDate(b.dueDay)),
  );
  const monthlyTotal = bills.reduce(
    (sum, bill) => sum + (bill.cadence === "monthly" ? bill.lastAmountCents : 0),
    0,
  );
  const negotiableProjection = bills.reduce(
    (sum, bill) => sum + (bill.negotiable ? (bill.projectedAnnualSavingsCents ?? 0) : 0),
    0,
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Bills"
        description={`${bills.length} detected bills · ${formatMoneyRounded(monthlyTotal)} in monthly bills · ${formatMoneyRounded(negotiableProjection)} per year negotiable`}
      />

      {bills.length > 0 ? (
        <Card className="gap-0 overflow-hidden p-0">
          <Table>
            <TableHead>
              <TableRow>
                <TableHeadCell>Provider</TableHeadCell>
                <TableHeadCell className="text-right">Amount</TableHeadCell>
                <TableHeadCell>Due</TableHeadCell>
                <TableHeadCell>Autopay</TableHeadCell>
                <TableHeadCell>Negotiable</TableHeadCell>
                <TableHeadCell className="text-right">Actions</TableHeadCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {bills.map((bill) => {
                const due = nextDueDate(bill.dueDay);
                const days = daysUntil(due);
                return (
                  <TableRow key={bill.id}>
                    <TableCell>
                      <Link
                        href={`/dashboard/bills/${bill.id}`}
                        className="flex flex-col gap-0.5 font-semibold transition-colors hover:underline"
                      >
                        {bill.name}
                        <span className="text-xs font-normal text-muted-foreground">
                          {CATEGORY_LABEL[bill.category]} · •{bill.accountMask}
                        </span>
                      </Link>
                    </TableCell>
                    <TableCell className="text-right font-mono font-semibold tabular-nums">
                      {formatMoney(bill.lastAmountCents)}
                    </TableCell>
                    <TableCell>
                      <span className="flex items-baseline gap-1.5">
                        <span className="font-mono text-sm tabular-nums">
                          {formatDateShort(due)}
                        </span>
                        <span
                          className={
                            days <= 5 ? "text-xs font-bold" : "text-xs text-muted-foreground"
                          }
                        >
                          {dueLabel(bill.dueDay)}
                        </span>
                      </span>
                    </TableCell>
                    <TableCell>
                      {bill.autopay ? (
                        <Badge variant="outline">On</Badge>
                      ) : (
                        <span className="text-sm text-muted-foreground">Off</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {bill.negotiable ? (
                        <Badge>Yes</Badge>
                      ) : (
                        <span className="text-sm text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end">
                        {bill.negotiable ? (
                          <NegotiateBillButton
                            billId={bill.id}
                            billName={bill.name}
                            projectedAnnualSavingsCents={bill.projectedAnnualSavingsCents ?? 0}
                          />
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      ) : (
        <EmptyState
          title="No bills detected yet"
          description="Connect an account and ReclaimR will surface every recurring bill — utilities, telecom, insurance — with due dates and amounts."
        />
      )}
    </div>
  );
}
