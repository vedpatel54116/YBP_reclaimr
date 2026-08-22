"use client";

import { useMemo, useState } from "react";
import { Button, Modal, useToast } from "@reclaimr/ui";
import { formatMoney, formatMoneyRounded } from "@/lib/format";

/**
 * Fee shares the concierge offers (mirrors the NegotiationCase contract:
 * user-chosen success fee, 35–60%).
 */
const FEE_CHOICES = [35, 45, 55, 60] as const;

interface NegotiateBillButtonProps {
  billId: string;
  billName: string;
  /** Projected first-year savings in cents. */
  projectedAnnualSavingsCents: number;
  /** Compact trigger inside table rows. */
  size?: "sm" | "md" | "lg";
  variant?: "primary" | "secondary" | "ghost";
}

/**
 * Opens the negotiation flow: pick a success fee, see the exact fee amount and
 * net savings, then submit the case. The fee is charged only if the provider
 * confirms savings.
 */
export function NegotiateBillButton({
  billId: _billId,
  billName,
  projectedAnnualSavingsCents,
  size = "sm",
  variant = "primary",
}: NegotiateBillButtonProps) {
  const [open, setOpen] = useState(false);
  const [feePercent, setFeePercent] = useState<number>(45);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const feePreview = useMemo(
    () => Math.round((projectedAnnualSavingsCents * feePercent) / 100),
    [projectedAnnualSavingsCents, feePercent],
  );

  async function onSubmit() {
    setLoading(true);
    // Negotiation cases have no endpoint yet; simulate the submission round-trip.
    await new Promise((resolve) => setTimeout(resolve, 700));
    setLoading(false);
    setOpen(false);
    toast({
      variant: "success",
      title: "Negotiation started",
      description: `Our team is on ${billName}. You'll hear back within 3–5 business days — you pay nothing unless we save you money.`,
    });
  }

  return (
    <>
      <Button variant={variant} size={size} onClick={() => setOpen(true)}>
        Negotiate
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={`Negotiate ${billName}`}
        description="Our concierge negotiates your rate down. You keep 100% of the savings after year one."
        size="md"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Not now
            </Button>
            <Button loading={loading} onClick={onSubmit}>
              Start negotiation
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-5">
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-md border bg-border">
            <div className="flex flex-col gap-1 bg-background p-3">
              <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                Projected savings
              </p>
              <p className="font-mono text-xl font-bold tabular-nums">
                {formatMoneyRounded(projectedAnnualSavingsCents)}
                <span className="text-sm font-normal text-muted-foreground"> /yr</span>
              </p>
            </div>
            <div className="flex flex-col gap-1 bg-background p-3">
              <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                Success fee ({feePercent}%)
              </p>
              <p className="font-mono text-xl font-bold tabular-nums">{formatMoney(feePreview)}</p>
            </div>
          </div>

          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-semibold">Choose your success fee</legend>
            <p className="text-xs text-muted-foreground">
              A higher fee prioritizes your case. Charged once, only on confirmed first-year savings
              — never on projections.
            </p>
            <div className="grid grid-cols-4 gap-2">
              {FEE_CHOICES.map((choice) => (
                <button
                  key={choice}
                  type="button"
                  onClick={() => setFeePercent(choice)}
                  aria-pressed={feePercent === choice}
                  className={
                    feePercent === choice
                      ? "cursor-pointer rounded-md border-transparent bg-foreground px-2 py-2 font-mono text-sm font-bold tabular-nums text-background"
                      : "cursor-pointer rounded-md border border-foreground bg-transparent px-2 py-2 font-mono text-sm font-bold tabular-nums text-foreground hover:bg-muted"
                  }
                >
                  {choice}%
                </button>
              ))}
            </div>
          </fieldset>

          <p className="border-t pt-3 text-xs text-muted-foreground">
            If {billName} won&apos;t budge, the case closes and you owe nothing. Savings appear in
            your ReclaimR total the day the provider confirms.
          </p>
        </div>
      </Modal>
    </>
  );
}
