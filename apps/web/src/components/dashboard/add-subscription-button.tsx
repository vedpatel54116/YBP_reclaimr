"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button, Field, Input, Modal, PlusIcon, useToast } from "@reclaimr/ui";
import { createSubscription } from "@/lib/api";
import type { DataSource } from "@/lib/data";

const CADENCE_OPTIONS = [
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "annual", label: "Annual" },
] as const;

interface AddSubscriptionButtonProps {
  source: DataSource;
}

/** Modal form that adds a manually-tracked subscription. */
export function AddSubscriptionButton({ source }: AddSubscriptionButtonProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const { toast } = useToast();
  const router = useRouter();

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") ?? "").trim();
    const amount = Number(form.get("amount"));
    const cadence = String(form.get("cadence"));
    const nextBillingDate = String(form.get("nextBillingDate"));

    if (!name || !Number.isFinite(amount) || amount <= 0 || !nextBillingDate) {
      setError("Fill in every field — amount must be greater than zero.");
      return;
    }

    setLoading(true);
    let created: boolean;
    if (source === "live") {
      created =
        (await createSubscription({
          name,
          amountCents: Math.round(amount * 100),
          cadence: cadence as "weekly" | "monthly" | "quarterly" | "annual",
          nextBillingDate,
        })) !== null;
    } else {
      // No live record to create; simulate latency so the UI behaves identically.
      await new Promise((resolve) => setTimeout(resolve, 600));
      created = true;
    }
    setLoading(false);

    if (created) {
      setOpen(false);
      setError(undefined);
      toast({
        variant: "success",
        title: `${name} added`,
        description:
          source === "demo"
            ? "Demo mode — connect the API to persist new subscriptions."
            : "It's now tracked alongside detected charges.",
      });
      router.refresh();
    } else {
      setError("The API rejected the request. Check the fields and try again.");
    }
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <PlusIcon className="size-4" />
        Add subscription
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Add a subscription"
        description="Track a charge manually — useful for anything detection missed."
      >
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <Field label="Merchant" hint="As it appears on your statement">
            <Input name="name" placeholder="e.g. Streaming Plus" required maxLength={120} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Amount (USD)" hint="Per charge">
              <Input
                name="amount"
                type="number"
                min="0.01"
                step="0.01"
                inputMode="decimal"
                placeholder="14.99"
                required
                className="font-mono tabular-nums"
              />
            </Field>
            <Field label="Frequency">
              <select
                name="cadence"
                defaultValue="monthly"
                className="h-10 w-full cursor-pointer rounded-md border border-foreground bg-background px-3 text-sm transition-colors focus-visible:outline-2"
              >
                {CADENCE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Next charge" hint="When the next payment is due">
            <Input name="nextBillingDate" type="date" required className="font-mono tabular-nums" />
          </Field>
          {error ? (
            <p role="alert" className="text-sm font-semibold">
              {error}
            </p>
          ) : null}
          <div className="mt-2 flex justify-end gap-2">
            <Button variant="ghost" type="button" onClick={() => setOpen(false)}>
              Discard
            </Button>
            <Button type="submit" loading={loading}>
              Add subscription
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
