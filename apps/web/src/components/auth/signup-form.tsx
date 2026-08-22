"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { API_ROUTES, type AuthResponse } from "@reclaimr/shared";
import { Button, Field, Input } from "@reclaimr/ui";
import { saveSession } from "@/lib/auth";
import { ApiRequestError, jsonRequest } from "@/lib/http";
import { AuthCard, FormError } from "./auth-card";

const signupSchema = z.object({
  name: z.string().max(120, "Name is too long"),
  email: z.string().min(1, "Enter your email address").email("Enter a valid email address"),
  // Mirrors the wire contract's minimum; the API enforces strength on top.
  password: z.string().min(10, "Use at least 10 characters").max(128),
});
type SignupValues = z.infer<typeof signupSchema>;

export function SignupForm() {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const form = useForm<SignupValues>({
    resolver: zodResolver(signupSchema),
    defaultValues: { name: "", email: "", password: "" },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    setServerError(null);
    try {
      const auth = await jsonRequest<AuthResponse>(API_ROUTES.auth.register, {
        method: "POST",
        body: JSON.stringify(values),
      });
      saveSession(auth);
      router.push("/onboarding");
    } catch (error) {
      if (
        error instanceof ApiRequestError &&
        (error.status === 409 || error.code === "EMAIL_TAKEN")
      ) {
        setServerError("An account with this email already exists. Try logging in instead.");
      } else if (error instanceof ApiRequestError && error.status === 0) {
        setServerError(
          "We can't reach the sign-up service right now. Check your connection and try again.",
        );
      } else {
        setServerError("Something went wrong creating your account. Try again in a moment.");
      }
    }
  });

  return (
    <AuthCard
      title="Create your account"
      description="Find forgotten charges in under a minute after signup."
      footer={
        <>
          Already have an account?{" "}
          <Link href="/login" className="font-semibold underline-offset-4 hover:underline">
            Log in
          </Link>
        </>
      }
    >
      <FormError message={serverError} />
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <Field label="Name" hint="Optional" error={form.formState.errors.name?.message}>
          <Input autoComplete="name" placeholder="Alex Morgan" {...form.register("name")} />
        </Field>
        <Field label="Email" error={form.formState.errors.email?.message}>
          <Input
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            {...form.register("email")}
          />
        </Field>
        <Field
          label="Password"
          hint="At least 10 characters"
          error={form.formState.errors.password?.message}
        >
          <Input
            type="password"
            autoComplete="new-password"
            placeholder="••••••••••"
            {...form.register("password")}
          />
        </Field>
        <Button type="submit" size="lg" fullWidth loading={form.formState.isSubmitting}>
          Create account
        </Button>
      </form>
    </AuthCard>
  );
}
