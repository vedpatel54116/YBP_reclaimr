"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button, CheckboxField, ShieldIcon } from "@reclaimr/ui";

const consentSchema = z.object({
  dataAccess: z.boolean().refine((value) => value, {
    message: "Required — we can't scan without read-only access",
  }),
  terms: z.boolean().refine((value) => value, {
    message: "You must accept the terms to continue",
  }),
  marketing: z.boolean(),
});
type ConsentValues = z.infer<typeof consentSchema>;

export function ConsentStep({ onNext }: { onNext: () => void }) {
  const form = useForm<ConsentValues>({
    resolver: zodResolver(consentSchema),
    defaultValues: { dataAccess: false, terms: false, marketing: false },
  });

  const onSubmit = form.handleSubmit(() => onNext());

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6" noValidate>
      <div className="flex flex-col gap-4">
        <span className="flex size-11 items-center justify-center rounded-md border">
          <ShieldIcon className="size-5" />
        </span>
        <h1 className="font-heading text-3xl font-bold tracking-tight text-balance">
          One permission, used carefully.
        </h1>
        <p className="text-sm text-muted-foreground">
          ReclaimR connects to your accounts <strong className="text-foreground">read-only</strong>.
          We can see transactions to detect recurring charges — we can never move money.
        </p>
      </div>

      <div className="flex flex-col gap-4 rounded-lg border p-4 sm:p-5">
        <CheckboxField
          label="Read-only account access"
          description="Allow ReclaimR to view transactions and balances for detection and alerts."
          error={form.formState.errors.dataAccess?.message}
          {...form.register("dataAccess")}
        />
        <CheckboxField
          label="Terms of service & privacy policy"
          description="You accept the terms and understand how your data is used."
          error={form.formState.errors.terms?.message}
          {...form.register("terms")}
        />
        <CheckboxField
          label="Product emails"
          description="Occasional savings reports and price-hike warnings. Optional."
          {...form.register("marketing")}
        />
      </div>

      <Button type="submit" size="lg" fullWidth>
        Agree &amp; continue
      </Button>
    </form>
  );
}
