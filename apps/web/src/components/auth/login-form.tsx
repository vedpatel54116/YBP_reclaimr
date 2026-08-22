"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { API_ROUTES, type AuthResponse } from "@reclaimr/shared";
import { Button, Field, Input } from "@reclaimr/ui";
import { createDemoSession, hasCompletedOnboarding, saveSession } from "@/lib/auth";
import { ApiRequestError, jsonRequest } from "@/lib/http";
import { AuthCard, FormError } from "./auth-card";

const loginSchema = z.object({
  email: z.string().min(1, "Enter your email address").email("Enter a valid email address"),
  password: z.string().min(1, "Enter your password"),
});
type LoginValues = z.infer<typeof loginSchema>;

export function LoginForm() {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const form = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    setServerError(null);
    try {
      const auth = await jsonRequest<AuthResponse>(API_ROUTES.auth.login, {
        method: "POST",
        body: JSON.stringify(values),
      });
      saveSession(auth);
      router.push(hasCompletedOnboarding() ? "/dashboard" : "/onboarding");
    } catch (error) {
      if (error instanceof ApiRequestError && error.status === 401) {
        setServerError("That email and password combination didn't match. Try again.");
      } else if (error instanceof ApiRequestError && error.status === 0) {
        setServerError(
          "We can't reach the sign-in service right now. Check your connection and try again.",
        );
      } else {
        setServerError("Something went wrong signing you in. Try again in a moment.");
      }
    }
  });

  const startDemo = () => {
    createDemoSession();
    router.push("/onboarding");
  };

  return (
    <AuthCard
      title="Welcome back"
      description="Sign in to keep reclaiming your money."
      footer={
        <>
          New to ReclaimR?{" "}
          <Link href="/signup" className="font-semibold underline-offset-4 hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      <FormError message={serverError} />
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <Field label="Email" error={form.formState.errors.email?.message}>
          <Input
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            {...form.register("email")}
          />
        </Field>
        <Field label="Password" error={form.formState.errors.password?.message}>
          <Input
            type="password"
            autoComplete="current-password"
            placeholder="••••••••••"
            {...form.register("password")}
          />
        </Field>
        <Button type="submit" size="lg" fullWidth loading={form.formState.isSubmitting}>
          Sign in
        </Button>
      </form>

      <div className="flex items-center gap-3 text-xs tracking-wider text-muted-foreground uppercase">
        <span className="h-px flex-1 bg-border" aria-hidden="true" />
        or
        <span className="h-px flex-1 bg-border" aria-hidden="true" />
      </div>

      <div className="flex flex-col gap-3">
        <Button variant="secondary" size="lg" fullWidth onClick={startDemo}>
          Explore with a demo account
        </Button>
        <Link
          href="/forgot-password"
          className="text-center text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
        >
          Forgot your password?
        </Link>
      </div>
    </AuthCard>
  );
}
