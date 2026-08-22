"use client";

import { useId, useState } from "react";
import { computeRotScore, type RotScoreResult } from "@reclaimr/core";
import { Button, Card, CardSection } from "@reclaimr/ui";
import { formatMoney } from "@/lib/format";

interface RotScoreCardProps {
  monthlyPriceCents: number;
  currency?: string;
  initialHoursUsed: number;
  benchmarkHours?: number;
  shapeExponent?: number;
  notes?: string;
  subscriptionName: string;
}

export function RotScoreCard({
  monthlyPriceCents,
  currency = "USD",
  initialHoursUsed,
  benchmarkHours = 20,
  shapeExponent = 0.5,
  notes,
  subscriptionName,
}: RotScoreCardProps) {
  const [hoursUsed, setHoursUsed] = useState<number>(initialHoursUsed);
  const [showFormula, setShowFormula] = useState<boolean>(false);
  const sliderId = useId();

  const rot: RotScoreResult = computeRotScore({
    hoursUsedMonth: hoursUsed,
    monthlyPriceCents,
    benchmarkHoursMonth: benchmarkHours,
    shapeExponent,
  });

  const isModified = Math.abs(hoursUsed - initialHoursUsed) > 0.01;
  const maxSliderHours = Math.max(benchmarkHours * 1.5, 30);

  return (
    <Card className="flex flex-col gap-5">
      <div className="flex items-start justify-between gap-3">
        <CardSection
          title="Rot Score & Value Efficiency"
          description="Evaluates subscription waste using the non-linear diminishing returns curve R(S,P) = P · (1 − √(S/S_cap))."
        />
        <span
          className={`rounded px-2.5 py-1 text-xs font-extrabold tracking-wider uppercase ${
            rot.tier === "high_rot"
              ? "bg-red-500/20 text-red-500 border border-red-500/40 shadow-xs"
              : rot.tier === "moderate_rot"
              ? "border border-foreground/40 bg-muted text-foreground font-bold"
              : "border border-border text-muted-foreground font-semibold"
          }`}
        >
          {rot.tierLabel}
        </span>
      </div>

      {/* ── Main metric row ────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div
          className={`flex flex-col gap-1.5 rounded-xl border p-4 ${
            rot.tier === "high_rot"
              ? "border-red-500/40 bg-red-500/10"
              : "border-foreground/30 bg-muted/30"
          }`}
        >
          <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
            Rot Score (Waste Rate)
          </span>
          <div className="flex items-baseline gap-2">
            <span
              className={`font-mono text-4xl font-black tracking-tight tabular-nums ${
                rot.tier === "high_rot" ? "text-red-500" : "text-foreground"
              }`}
            >
              {rot.rotScore}%
            </span>
            <span
              className={`text-xs font-bold uppercase ${
                rot.tier === "high_rot" ? "text-red-500" : "text-muted-foreground"
              }`}
            >
              {rot.tierLabel}
            </span>
          </div>
          <div className="relative mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                rot.tier === "high_rot"
                  ? "bg-red-500"
                  : rot.tier === "moderate_rot"
                  ? "bg-foreground/75"
                  : "bg-muted-foreground/50"
              }`}
              style={{ width: `${rot.rotScore}%` }}
            />
          </div>
        </div>

        <div
          className={`flex flex-col gap-1.5 rounded-xl border p-4 ${
            rot.tier === "high_rot"
              ? "border-red-500/40 bg-red-500/10"
              : "border-foreground/30 bg-muted/30"
          }`}
        >
          <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
            Money Wasted
          </span>
          <div className="flex items-baseline gap-1.5">
            <span
              className={`font-mono text-4xl font-black tracking-tight tabular-nums ${
                rot.tier === "high_rot" ? "text-red-500" : "text-foreground"
              }`}
            >
              {formatMoney(rot.wastedMonthlyCents, currency)}
            </span>
            <span className="text-xs font-medium text-muted-foreground">/mo</span>
          </div>
          <span
            className={`font-mono text-xs font-semibold ${
              rot.tier === "high_rot" ? "text-red-500" : "text-muted-foreground"
            }`}
          >
            {formatMoney(rot.wastedMonthlyCents * 12, currency)} /yr leak
          </span>
        </div>

        <div className="flex flex-col gap-1.5 rounded-xl border border-foreground/30 bg-muted/30 p-4">
          <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
            Effective Cost / Hr
          </span>
          <div className="flex items-baseline gap-1.5">
            <span className="font-mono text-4xl font-black tracking-tight tabular-nums text-foreground">
              {rot.costPerHourUsedCents !== null
                ? `${formatMoney(rot.costPerHourUsedCents, currency)}`
                : "—"}
            </span>
            {rot.costPerHourUsedCents !== null ? (
              <span className="text-xs font-medium text-muted-foreground">/hr</span>
            ) : null}
          </div>
          <span className="text-xs font-medium text-muted-foreground">
            {hoursUsed > 0 ? `${hoursUsed.toFixed(1)} hrs logged this month` : "0 hrs logged"}
          </span>
        </div>
      </div>

      {/* ── Interactive Screen Time Simulator ──────────────────────────── */}
      <div className="flex flex-col gap-3 rounded-md border bg-muted/30 p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex flex-col">
            <label
              htmlFor={sliderId}
              className="text-sm font-semibold text-foreground cursor-pointer"
            >
              Screen Time Simulator
            </label>
            <span className="text-xs text-muted-foreground">
              Adjust monthly usage hours (S) to see real-time value captured vs. rot
            </span>
          </div>
          {isModified ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setHoursUsed(initialHoursUsed)}
              className="text-xs"
            >
              Reset ({initialHoursUsed.toFixed(1)} hrs)
            </Button>
          ) : null}
        </div>

        <div className="flex items-center gap-4 pt-1">
          <input
            id={sliderId}
            type="range"
            min={0}
            max={maxSliderHours}
            step={0.5}
            value={hoursUsed}
            onChange={(e) => setHoursUsed(parseFloat(e.target.value))}
            className="h-2 w-full cursor-pointer accent-foreground focus:outline-none"
            aria-label="Screen time used this month in hours"
          />
          <div className="flex items-center gap-1 font-mono text-base font-bold whitespace-nowrap tabular-nums">
            <span>{hoursUsed.toFixed(1)}</span>
            <span className="text-xs font-normal text-muted-foreground">/ {benchmarkHours} hrs target</span>
          </div>
        </div>

        {/* Usage preset chips */}
        <div className="flex flex-wrap gap-1.5 pt-1" role="group" aria-label="Usage quick presets">
          {[
            { label: "0 hrs (Unused)", value: 0 },
            { label: "2 hrs", value: 2 },
            { label: "5 hrs", value: 5 },
            { label: "10 hrs", value: 10 },
            { label: `${benchmarkHours} hrs (Full value)`, value: benchmarkHours },
          ].map((preset) => (
            <button
              key={preset.label}
              type="button"
              onClick={() => setHoursUsed(preset.value)}
              className={`rounded border px-2.5 py-1 text-xs font-medium transition-colors ${
                Math.abs(hoursUsed - preset.value) < 0.2
                  ? "border-transparent bg-foreground text-background"
                  : "border-border bg-background text-muted-foreground hover:border-foreground hover:text-foreground"
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>

        {notes && !isModified ? (
          <p className="text-xs text-muted-foreground italic pt-1">
            Telemetry note: {notes}
          </p>
        ) : null}
      </div>

      {/* ── Value capture vs. Waste summary ────────────────────────────── */}
      <div className="flex flex-col gap-2 rounded-md border p-3 text-xs">
        <div className="flex justify-between items-center text-muted-foreground">
          <span>Monthly Subscription Cost (P)</span>
          <span className="font-mono font-semibold text-foreground tabular-nums">
            {formatMoney(monthlyPriceCents, currency)}
          </span>
        </div>
        <div className="flex justify-between items-center text-muted-foreground">
          <span>Captured Value ({((1 - rot.rotRatio) * 100).toFixed(0)}%)</span>
          <span className="font-mono font-semibold text-foreground tabular-nums">
            {formatMoney(rot.capturedValueMonthlyCents, currency)}
          </span>
        </div>
        <div className="flex justify-between items-center text-muted-foreground border-t pt-2">
          <span className="font-medium text-foreground">Wasted Dollars (Rot)</span>
          <span className="font-mono font-bold text-foreground tabular-nums">
            {formatMoney(rot.wastedMonthlyCents, currency)}
          </span>
        </div>
      </div>

      {/* ── Formula explanation ────────────────────────────────────────── */}
      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={() => setShowFormula((prev) => !prev)}
          className="flex w-fit items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <span>{showFormula ? "Hide" : "Show"} Rot Score Mathematical Model</span>
          <span className="font-mono">{showFormula ? "▲" : "▼"}</span>
        </button>

        {showFormula ? (
          <div className="flex flex-col gap-2 rounded-md border bg-muted/20 p-3 text-xs leading-relaxed text-muted-foreground">
            <p className="font-mono text-foreground font-semibold">
              R(S, P) = P · (1 − u<sup>{shapeExponent}</sup>) &nbsp; where &nbsp; u = min(S / {benchmarkHours}, 1)
            </p>
            <p>
              • <strong>S</strong> = {hoursUsed.toFixed(1)} hrs screen time logged this month.
              <br />
              • <strong>S_cap</strong> = {benchmarkHours} hrs benchmark usage for {subscriptionName}.
              <br />
              • <strong>Exponent a = {shapeExponent}</strong> provides a square-root diminishing returns curve: using even 2 hours sharply drops rot from 100% to under 70%, reflecting real value captured from initial use.
            </p>
          </div>
        ) : null}
      </div>
    </Card>
  );
}
