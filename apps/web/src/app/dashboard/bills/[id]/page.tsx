import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Card, CardSection, CheckIcon } from "@reclaimr/ui";
import { NegotiateBillButton } from "@/components/dashboard/negotiate-bill-button";
import { PageHeader } from "@/components/dashboard/page-header";
import { getBill } from "@/lib/data";
import { nextDueDate } from "@/lib/domain";
import { daysUntil, formatDate, formatMoney, formatMoneyRounded } from "@/lib/format";

interface BillDetailPageProps {
  params: Promise<{ id: string }>;
}

const CATEGORY_LABEL: Record<string, string> = {
  utilities: "Utilities",
  telecommunications: "Telecom",
  insurance: "Insurance",
  housing: "Housing",
  fitness: "Fitness",
  other: "Other",
};

export async function generateMetadata({ params }: BillDetailPageProps): Promise<Metadata> {
  const resolved = params ? await params : { id: "" };
  const bill = getBill(resolved.id);
  return { title: bill ? bill.name : "Bill" };
}

const NEGOTIATION_STEPS = [
  {
    title: "You hand us the bill",
    description: "We analyze your current rate against promotions and market rates for your area.",
  },
  {
    title: "Our agents negotiate",
    description:
      "A human negotiator calls the provider and works the retention desk on your behalf — 3 to 5 business days, typically.",
  },
  {
    title: "You only pay on success",
    description:
      "If we win, the one-time success fee comes out of your first-year savings. If we don't, the case closes free.",
  },
] as const;

export default async function BillDetailPage({ params }: BillDetailPageProps) {
  const resolved = params ? await params : { id: "" };
  const id = resolved.id;
  const bill = getBill(id);
  if (!bill) notFound();

  const due = nextDueDate(bill.dueDay);
  const days = daysUntil(due);
  const yearlyCost =
    bill.lastAmountCents * (bill.cadence === "monthly" ? 12 : bill.cadence === "quarterly" ? 4 : 1);
  const projection = bill.projectedAnnualSavingsCents ?? 0;

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/dashboard/bills"
        className="inline-flex w-fit items-center gap-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        ← All bills
      </Link>

      <PageHeader
        title={bill.name}
        description={`${CATEGORY_LABEL[bill.category]} · charged to •${bill.accountMask}`}
        actions={
          bill.negotiable ? (
            <NegotiateBillButton
              billId={bill.id}
              billName={bill.name}
              projectedAnnualSavingsCents={projection}
              size="md"
            />
          ) : undefined
        }
      />

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-3">
        {/* ── Bill summary ──────────────────────────────────────────────── */}
        <Card className="lg:col-span-2">
          <div className="flex flex-wrap items-end justify-between gap-4 border-b pb-5">
            <div className="flex flex-col gap-1">
              {bill.autopay ? <Badge variant="outline">Autopay on</Badge> : null}
              <p className="font-mono text-5xl font-bold tracking-tight tabular-nums">
                {formatMoney(bill.lastAmountCents)}
              </p>
              <p className="text-sm text-muted-foreground">
                {bill.cadence === "monthly"
                  ? "per month"
                  : bill.cadence === "quarterly"
                    ? "per quarter"
                    : "per year"}{" "}
                · <span className="font-mono tabular-nums">{formatMoney(yearlyCost)}</span> per year
              </p>
            </div>
            <div className="flex flex-col items-end gap-1 text-right">
              <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                Next due
              </p>
              <p className="font-mono text-lg font-bold tabular-nums">{formatDate(due)}</p>
              <p className="text-xs font-semibold">
                {days === 0 ? "Due today" : days === 1 ? "Due tomorrow" : `in ${days} days`}
              </p>
            </div>
          </div>

          <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-md border bg-border sm:grid-cols-4">
            {[
              { label: "Expected", value: formatMoney(bill.expectedAmountCents) },
              { label: "Last charge", value: formatMoney(bill.lastAmountCents) },
              { label: "Due day", value: `${bill.dueDay} of the month` },
              { label: "Negotiable", value: bill.negotiable ? "Yes" : "No" },
            ].map((item) => (
              <div key={item.label} className="flex flex-col gap-1 bg-background p-3">
                <dt className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                  {item.label}
                </dt>
                <dd className="font-mono text-sm font-semibold tabular-nums">{item.value}</dd>
              </div>
            ))}
          </dl>

          {bill.lastAmountCents > bill.expectedAmountCents ? (
            <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
              Last charge came in{" "}
              <span className="font-mono font-bold text-foreground tabular-nums">
                {formatMoney(bill.lastAmountCents - bill.expectedAmountCents)}
              </span>{" "}
              above the expected amount — a classic promo-expiry bump.
            </p>
          ) : null}
        </Card>

        {/* ── Negotiation panel ─────────────────────────────────────────── */}
        <div className="flex flex-col gap-4">
          {bill.negotiable ? (
            <Card className="border-foreground">
              <CardSection
                title="Negotiate this bill"
                description="Projected from your rate vs. current market offers."
              />
              <p className="font-mono text-3xl font-bold tracking-tight tabular-nums">
                {formatMoneyRounded(projection)}
                <span className="text-sm font-normal text-muted-foreground"> /yr projected</span>
              </p>
              <NegotiateBillButton
                billId={bill.id}
                billName={bill.name}
                projectedAnnualSavingsCents={projection}
                size="md"
                variant="primary"
              />
              <p className="text-xs text-muted-foreground">
                That&apos;s {Math.round((projection / yearlyCost) * 100)}% of your{" "}
                {formatMoneyRounded(yearlyCost)} yearly cost — typical for{" "}
                {(CATEGORY_LABEL[bill.category] ?? "other").toLowerCase()} bills.
              </p>
            </Card>
          ) : (
            <Card>
              <CardSection
                title="Negotiation not offered"
                description={`${CATEGORY_LABEL[bill.category]} rates in your area are regulated — there's usually no retention desk to negotiate with.`}
              />
              <p className="text-sm text-muted-foreground">
                We still track the amount and due date, and alert you if the charge jumps.
              </p>
            </Card>
          )}

          <Card>
            <CardSection title="How negotiation works" />
            <ol className="flex flex-col gap-3">
              {NEGOTIATION_STEPS.map((step, index) => (
                <li key={step.title} className="flex items-start gap-3">
                  <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border font-mono text-[10px] font-bold tabular-nums">
                    {index + 1}
                  </span>
                  <div className="flex flex-col gap-0.5">
                    <p className="text-sm font-semibold">{step.title}</p>
                    <p className="text-xs text-muted-foreground">{step.description}</p>
                  </div>
                </li>
              ))}
            </ol>
            <p className="flex items-center gap-2 border-t pt-3 text-xs text-muted-foreground">
              <CheckIcon className="size-3.5 shrink-0" />
              Members save an average of {formatMoneyRounded(15000)} per negotiated bill.
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}
