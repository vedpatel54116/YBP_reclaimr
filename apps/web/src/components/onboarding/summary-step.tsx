"use client";

import { useRouter } from "next/navigation";
import { Badge, Button, EmptyState } from "@reclaimr/ui";
import { formatCadence, formatMoney } from "@/lib/format";
import { monogramFor, summarizeDetections, type DetectedCharge } from "@/lib/onboarding";
import { setOnboardingComplete } from "@/lib/auth";

export function SummaryStep({
  detections,
  onBackToLink,
}: {
  detections: DetectedCharge[] | null;
  onBackToLink: () => void;
}) {
  const router = useRouter();

  if (!detections || detections.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="font-heading text-3xl font-bold tracking-tight text-balance">
          No findings — yet.
        </h1>
        <EmptyState
          title="No recurring charges found"
          description="Without a linked account there's nothing to scan. Link a bank and run detection to see what you could reclaim."
          action={
            <Button variant="secondary" onClick={onBackToLink}>
              Link an account
            </Button>
          }
        />
        <FinishButton onClick={() => finish(router)} label="Go to dashboard anyway" />
      </div>
    );
  }

  const { monthlyCents, annualCents, count } = summarizeDetections(detections);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <Badge variant="outline">Initial scan</Badge>
        <h1 className="font-heading text-3xl font-bold tracking-tight text-balance md:text-4xl">
          We found <span className="font-mono">{formatMoney(monthlyCents)}</span> of monthly
          charges.
        </h1>
        <p className="text-sm text-muted-foreground">
          {count} recurring charges detected across your linked accounts. Cancel the ones you no
          longer use and that&apos;s{" "}
          <strong className="text-foreground">{formatMoney(annualCents)} a year</strong> back in
          your pocket.
        </p>
      </div>

      <dl className="grid grid-cols-1 gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-3">
        <div className="flex flex-col gap-1 bg-background p-4">
          <dd className="font-mono text-2xl font-bold tracking-tight tabular-nums">
            {formatMoney(monthlyCents)}
          </dd>
          <dt className="text-xs text-muted-foreground">Per month</dt>
        </div>
        <div className="flex flex-col gap-1 bg-background p-4">
          <dd className="font-mono text-2xl font-bold tracking-tight tabular-nums">
            {formatMoney(annualCents)}
          </dd>
          <dt className="text-xs text-muted-foreground">Per year</dt>
        </div>
        <div className="flex flex-col gap-1 bg-background p-4">
          <dd className="font-mono text-2xl font-bold tracking-tight tabular-nums">{count}</dd>
          <dt className="text-xs text-muted-foreground">Charges detected</dt>
        </div>
      </dl>

      <ul className="flex flex-col divide-y rounded-lg border" aria-label="Detected charges">
        {detections.map(({ subscription, confidence, occurrences }) => (
          <li key={subscription.id} className="flex items-center gap-3 p-3.5">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-md border font-mono text-xs font-bold">
              {monogramFor(subscription.name)}
            </span>
            <div className="flex min-w-0 flex-col">
              <p className="truncate text-sm font-medium">{subscription.name}</p>
              <p className="text-xs text-muted-foreground">
                {formatMoney(subscription.amountCents)} {formatCadence(subscription.cadence)} ·{" "}
                {occurrences} charges seen
              </p>
            </div>
            <Badge variant={confidence === "high" ? "solid" : "muted"} className="ml-auto">
              {confidence === "high" ? "High confidence" : "Review"}
            </Badge>
          </li>
        ))}
      </ul>

      <FinishButton onClick={() => finish(router)} label="Go to dashboard" />
    </div>
  );
}

function finish(router: ReturnType<typeof useRouter>): void {
  setOnboardingComplete();
  router.push("/dashboard");
}

function FinishButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <Button size="lg" fullWidth onClick={onClick}>
      {label}
    </Button>
  );
}
