"use client";

import { useState } from "react";
import { Card, CheckIcon } from "@reclaimr/ui";
import { cn } from "@reclaimr/ui";
import { UpgradeButton } from "@/components/dashboard/upgrade-button";

const PRICE_OPTIONS = [
  { cents: 700, label: "$7", note: "The essentials" },
  { cents: 1000, label: "$10", note: "Most popular" },
  { cents: 1400, label: "$14", note: "Power user" },
] as const;

/** Choose-your-price card — the member picks the monthly amount ($7–$14). */
export function PricingCard() {
  const [selected, setSelected] = useState<number>(1000);

  return (
    <Card className="sticky top-6 border-foreground gap-4">
      <div className="flex flex-col gap-1">
        <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
          ReclaimR Premium
        </p>
        <p className="font-mono text-5xl font-bold tracking-tight tabular-nums">
          ${(selected / 100).toFixed(0)}
          <span className="text-base font-normal text-muted-foreground"> /month</span>
        </p>
        <p className="text-sm text-muted-foreground">
          Pick the price that feels fair. Every tier unlocks everything — cancel anytime.
        </p>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="sr-only">Choose your monthly price</legend>
        {PRICE_OPTIONS.map((option) => {
          const active = option.cents === selected;
          return (
            <button
              key={option.cents}
              type="button"
              onClick={() => setSelected(option.cents)}
              aria-pressed={active}
              aria-label={`$${option.cents / 100} per month — ${option.note}`}
              className={cn(
                "flex cursor-pointer items-center justify-between gap-3 rounded-md border px-3 py-2.5 text-left transition-colors",
                active
                  ? "border-foreground bg-foreground text-background"
                  : "border-border text-foreground hover:border-foreground",
              )}
            >
              <span className="flex flex-col">
                <span className="font-mono text-lg font-bold tabular-nums">{option.label}</span>
                <span className="text-xs opacity-70">{option.note}</span>
              </span>
              <span
                className={cn(
                  "flex size-5 items-center justify-center rounded-full border",
                  active ? "border-background" : "border-muted-foreground",
                )}
              >
                {active ? <CheckIcon className="size-3" /> : null}
              </span>
            </button>
          );
        })}
      </fieldset>

      <UpgradeButton priceCents={selected} />

      <p className="text-xs text-muted-foreground">
        7-day free trial · no charge if you cancel before it ends · negotiation success fees are
        separate and charged only on confirmed savings.
      </p>
    </Card>
  );
}
