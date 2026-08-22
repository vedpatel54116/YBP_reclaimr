import type { Subscription } from "@reclaimr/shared";
import { DEMO_SUBSCRIPTIONS } from "./demo";
import { monthlyEquivalentCents } from "./domain";

/**
 * Onboarding state + the bank-linking mock. Until the Plaid integration
 * lands, linking is simulated locally (with one deliberately flaky
 * institution so the error/retry path stays honest) and detection derives
 * from the same demo fixtures the dashboard shows, so onboarding results
 * and dashboard data tell one consistent story.
 */

export interface Institution {
  id: string;
  name: string;
  /** 1–2 character monogram shown in the institution tile. */
  monogram: string;
  /** Demo affordance: this institution's link flow always fails. */
  flaky?: boolean;
}

export const INSTITUTIONS: Institution[] = [
  { id: "chase", name: "Chase", monogram: "CH" },
  { id: "bank-of-america", name: "Bank of America", monogram: "BA" },
  { id: "wells-fargo", name: "Wells Fargo", monogram: "WF" },
  { id: "citi", name: "Citi", monogram: "CI" },
  { id: "capital-one", name: "Capital One", monogram: "CO" },
  { id: "american-express", name: "American Express", monogram: "AX" },
  { id: "us-bank", name: "U.S. Bank", monogram: "US" },
  { id: "pnc", name: "PNC", monogram: "PN" },
  { id: "sandbox-merchant-bank", name: "Sandbox Merchant Bank", monogram: "SB", flaky: true },
];

export function getInstitution(id: string): Institution | undefined {
  return INSTITUTIONS.find((institution) => institution.id === id);
}

/** A recurring charge surfaced by the sync scan. */
export interface DetectedCharge {
  subscription: Subscription;
  confidence: "high" | "medium";
  /** Charges observed in the lookback window. */
  occurrences: number;
}

/**
 * Derives detections from the linked accounts. Deterministic: the same set of
 * accounts always produces the same findings, so a refresh mid-onboarding
 * does not reshuffle results.
 */
export function detectCharges(linkedAccountIds: string[]): DetectedCharge[] {
  if (linkedAccountIds.length === 0) return [];
  return DEMO_SUBSCRIPTIONS.filter((subscription) => subscription.status === "active").map(
    (subscription, index) => ({
      subscription,
      confidence: index % 3 === 2 ? "medium" : "high",
      occurrences: 3 + ((index * 7) % 21),
    }),
  );
}

export interface DetectionSummary {
  monthlyCents: number;
  annualCents: number;
  count: number;
}

export function summarizeDetections(charges: DetectedCharge[]): DetectionSummary {
  const monthlyCents = charges.reduce(
    (sum, charge) =>
      sum + monthlyEquivalentCents(charge.subscription.amountCents, charge.subscription.cadence),
    0,
  );
  return { monthlyCents, annualCents: monthlyCents * 12, count: charges.length };
}

// ─── Persisted wizard state ───────────────────────────────────────────────────

export type OnboardingStepId = "welcome" | "consent" | "link" | "sync" | "summary";

export const ONBOARDING_STEPS: { id: OnboardingStepId; title: string }[] = [
  { id: "welcome", title: "Welcome" },
  { id: "consent", title: "Consent" },
  { id: "link", title: "Link an account" },
  { id: "sync", title: "Scanning" },
  { id: "summary", title: "Your findings" },
];

export interface OnboardingState {
  stepIndex: number;
  consentsAccepted: boolean;
  linkedAccountIds: string[];
  /** Null until the sync step has run. */
  detections: DetectedCharge[] | null;
}

const ONBOARDING_KEY = "reclaimr.onboarding";

export const INITIAL_ONBOARDING_STATE: OnboardingState = {
  stepIndex: 0,
  consentsAccepted: false,
  linkedAccountIds: [],
  detections: null,
};

/** Reads the persisted wizard state; corrupt or missing data restarts fresh. */
export function loadOnboardingState(): OnboardingState {
  if (typeof window === "undefined") return INITIAL_ONBOARDING_STATE;
  try {
    const raw = window.localStorage.getItem(ONBOARDING_KEY);
    if (!raw) return INITIAL_ONBOARDING_STATE;
    const parsed = JSON.parse(raw) as Partial<OnboardingState>;
    return {
      ...INITIAL_ONBOARDING_STATE,
      ...parsed,
      stepIndex: Math.min(Math.max(0, parsed.stepIndex ?? 0), ONBOARDING_STEPS.length - 1),
    };
  } catch {
    return INITIAL_ONBOARDING_STATE;
  }
}

export function saveOnboardingState(state: OnboardingState): void {
  window.localStorage.setItem(ONBOARDING_KEY, JSON.stringify(state));
}

export function resetOnboardingState(): void {
  window.localStorage.removeItem(ONBOARDING_KEY);
}

/** Two-letter monogram from a display name, e.g. "Streaming Plus" → "SP". */
export function monogramFor(name: string): string {
  const words = name.split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
  return (words[0]![0]! + words[1]![0]!).toUpperCase();
}
