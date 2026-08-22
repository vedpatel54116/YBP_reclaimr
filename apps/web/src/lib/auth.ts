import { authResponseSchema, type AuthResponse, type TokenPair, type User } from "@reclaimr/shared";

/**
 * Client-side session persistence. Until the API ships httpOnly cookie
 * sessions, the token pair from register/login is stored in localStorage and
 * validated against the shared auth schema on every read — treat it as a
 * display session, not a security boundary (the guard is UX, not auth).
 */

const SESSION_KEY = "reclaimr.session";
const ONBOARDING_COMPLETE_KEY = "reclaimr.onboarding-complete";

export type Session = AuthResponse;

/** Reads and schema-validates the stored session; null when absent/corrupt. */
export function getSession(): Session | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = authResponseSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function saveSession(session: Session): void {
  window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

/** Updates the stored user in place (e.g. after editing the profile). */
export function updateSessionUser(user: User): Session | null {
  const session = getSession();
  if (!session) return null;
  const next = { ...session, user };
  saveSession(next);
  return next;
}

export function clearSession(): void {
  window.localStorage.removeItem(SESSION_KEY);
  window.localStorage.removeItem(ONBOARDING_COMPLETE_KEY);
}

export function hasCompletedOnboarding(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(ONBOARDING_COMPLETE_KEY) === "true";
}

export function setOnboardingComplete(): void {
  window.localStorage.setItem(ONBOARDING_COMPLETE_KEY, "true");
}

const DEMO_SESSION: Session = {
  user: {
    id: "00000000-0000-4000-8000-000000000001",
    email: "demo@reclaimr.local",
    name: "Demo User",
    createdAt: new Date(0).toISOString(),
  },
  tokens: {
    // Structurally valid per the shared schema; never accepted by the API.
    accessToken: "demo-access-token-000000000000",
    refreshToken: "demo-refresh-token-000000000000000000000000",
    expiresIn: 60 * 60,
  },
};

/** Creates a local-only session so the product can be explored without the API. */
export function createDemoSession(): Session {
  saveSession(DEMO_SESSION);
  return DEMO_SESSION;
}

export type { TokenPair, User };
