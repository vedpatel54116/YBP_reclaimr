"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { APP_NAME } from "@reclaimr/shared";
import { ArrowLeftIcon, ProgressBar, Skeleton, ThemeToggle } from "@reclaimr/ui";
import { getSession } from "@/lib/auth";
import {
  loadOnboardingState,
  ONBOARDING_STEPS,
  saveOnboardingState,
  type DetectedCharge,
  type OnboardingState,
} from "@/lib/onboarding";
import { ConsentStep } from "./consent-step";
import { LinkBankStep } from "./link-bank-step";
import { SummaryStep } from "./summary-step";
import { SyncStep } from "./sync-step";
import { WelcomeStep } from "./welcome-step";

/**
 * Five-step onboarding: welcome → consent → link an account → scan →
 * findings. State persists to localStorage so a refresh resumes where the
 * member left off; finishing marks onboarding complete and lands on the
 * dashboard.
 */
export function OnboardingWizard() {
  const router = useRouter();
  const [state, setState] = useState<OnboardingState | null>(null);
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    if (!getSession()) {
      router.replace("/login");
      return;
    }
    setAuthed(true);
    setState(loadOnboardingState());
  }, [router]);

  const patch = useCallback((partial: Partial<OnboardingState>) => {
    setState((current) => {
      if (!current) return current;
      const next = { ...current, ...partial };
      saveOnboardingState(next);
      return next;
    });
  }, []);

  const goTo = useCallback((stepIndex: number) => patch({ stepIndex }), [patch]);

  if (!authed || !state) {
    return (
      <div className="mx-auto flex w-full max-w-xl flex-col gap-6 px-4 py-12 sm:px-6">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-1.5 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const stepIndex = state.stepIndex;
  const step = ONBOARDING_STEPS[stepIndex]!;
  const progress = (stepIndex / (ONBOARDING_STEPS.length - 1)) * 100;
  const canGoBack = stepIndex > 0 && step.id !== "sync";

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex items-center gap-3">
            {canGoBack ? (
              <button
                type="button"
                onClick={() => goTo(stepIndex - 1)}
                aria-label={`Back to ${ONBOARDING_STEPS[stepIndex - 1]!.title}`}
                className="inline-flex size-10 cursor-pointer items-center justify-center rounded-md border transition-colors hover:bg-muted"
              >
                <ArrowLeftIcon className="size-4" />
              </button>
            ) : (
              <Link
                href="/"
                className="font-heading text-lg font-bold tracking-tight uppercase focus-visible:outline-2"
              >
                {APP_NAME}
              </Link>
            )}
          </div>
          <div className="flex items-center gap-4">
            <p className="font-mono text-xs font-bold tracking-widest text-muted-foreground uppercase">
              Step {stepIndex + 1} of {ONBOARDING_STEPS.length} · {step.title}
            </p>
            <ThemeToggle />
          </div>
        </div>
        <ProgressBar
          value={progress}
          className="h-0.5 rounded-none"
          aria-label="Onboarding progress"
        />
      </header>

      <main className="flex flex-1 items-start justify-center px-4 py-10 sm:py-16">
        <div
          key={step.id}
          className="w-full max-w-xl animate-slide-up rounded-lg border bg-card p-6 text-card-foreground sm:p-8"
        >
          {step.id === "welcome" ? <WelcomeStep onNext={() => goTo(1)} /> : null}
          {step.id === "consent" ? (
            <ConsentStep onNext={() => patch({ consentsAccepted: true, stepIndex: 2 })} />
          ) : null}
          {step.id === "link" ? (
            <LinkBankStep
              linkedAccountIds={state.linkedAccountIds}
              onChange={(linkedAccountIds) => patch({ linkedAccountIds })}
              onNext={() => goTo(3)}
            />
          ) : null}
          {step.id === "sync" ? (
            <SyncStep
              linkedAccountIds={state.linkedAccountIds}
              onComplete={(detections: DetectedCharge[]) => patch({ detections, stepIndex: 4 })}
              onBackToLink={() => goTo(2)}
            />
          ) : null}
          {step.id === "summary" ? (
            <SummaryStep detections={state.detections} onBackToLink={() => goTo(2)} />
          ) : null}
        </div>
      </main>
    </div>
  );
}
