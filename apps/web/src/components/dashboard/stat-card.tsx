import type { ReactNode } from "react";
import { Card } from "@reclaimr/ui";

interface StatCardProps {
  /** Uppercase micro-label above the value. */
  label: string;
  /** The number itself — always rendered in mono with tabular figures. */
  value: string;
  /** Context line under the value. */
  hint?: ReactNode;
  /** Optional trailing affordance, usually a "View all" link. */
  action?: ReactNode;
}

/** KPI tile: micro-label, oversized mono figure, hint. The dashboard's atom. */
export function StatCard({ label, value, hint, action }: StatCardProps) {
  return (
    <Card className="gap-2 p-5">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
          {label}
        </p>
        {action}
      </div>
      <p className="font-mono text-3xl font-bold tracking-tight tabular-nums lg:text-4xl">
        {value}
      </p>
      {hint ? <div className="text-xs text-muted-foreground">{hint}</div> : null}
    </Card>
  );
}
