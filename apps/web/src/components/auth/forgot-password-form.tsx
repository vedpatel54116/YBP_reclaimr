"use client";

import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button, Field, Input, MailIcon } from "@reclaimr/ui";
import { AuthCard } from "./auth-card";

const forgotPasswordSchema = z.object({
  email: z.string().min(1, "Enter your email address").email("Enter a valid email address"),
});
type ForgotPasswordValues = z.infer<typeof forgotPasswordSchema>;

/**
 * Frontend-only until the reset endpoint lands: submitting simulates the
 * request and always shows the neutral confirmation the real endpoint would
 * return (never revealing whether the address has an account).
 */
export function ForgotPasswordForm() {
  const [submittedEmail, setSubmittedEmail] = useState<string | null>(null);
  const form = useForm<ForgotPasswordValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    await new Promise((resolve) => setTimeout(resolve, 800));
    setSubmittedEmail(values.email);
  });

  if (submittedEmail) {
    return (
      <AuthCard title="Check your inbox">
        <div className="flex flex-col items-center gap-4 py-4 text-center">
          <span className="flex size-14 items-center justify-center rounded-full border">
            <MailIcon className="size-6" />
          </span>
          <p className="text-sm text-muted-foreground">
            If an account exists for{" "}
            <span className="font-semibold text-foreground">{submittedEmail}</span>, a reset link is
            on its way. The link expires in 30 minutes.
          </p>
        </div>
        <div className="flex flex-col gap-3">
          <Button
            variant="secondary"
            size="lg"
            fullWidth
            onClick={() => {
              setSubmittedEmail(null);
              form.reset();
            }}
          >
            Use a different email
          </Button>
          <Link
            href="/login"
            className="text-center text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
          >
            Back to log in
          </Link>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Reset your password"
      description="Enter the email you signed up with and we'll send a reset link."
      footer={
        <>
          Remembered it?{" "}
          <Link href="/login" className="font-semibold underline-offset-4 hover:underline">
            Back to log in
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <Field label="Email" error={form.formState.errors.email?.message}>
          <Input
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            {...form.register("email")}
          />
        </Field>
        <Button type="submit" size="lg" fullWidth loading={form.formState.isSubmitting}>
          Send reset link
        </Button>
      </form>
    </AuthCard>
  );
}
