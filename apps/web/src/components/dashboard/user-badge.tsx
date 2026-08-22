"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { LogOutIcon, useToast } from "@reclaimr/ui";
import { clearSession, getSession, type Session } from "@/lib/auth";
import { resetOnboardingState } from "@/lib/onboarding";

/**
 * Sidebar footer identity: the signed-in member's name with a sign-out
 * action. Renders a neutral placeholder until the session resolves (this
 * mounts inside a server layout, so the session only exists client-side).
 */
export function UserBadge() {
  const router = useRouter();
  const { toast } = useToast();
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    setSession(getSession());
  }, []);

  const displayName =
    session?.user.name?.trim() || session?.user.email?.split("@")[0] || "Signed in";

  const signOut = () => {
    clearSession();
    resetOnboardingState();
    toast({ title: "Signed out", description: "Your demo data was cleared." });
    router.push("/");
  };

  return (
    <div className="flex min-w-0 items-center gap-1">
      <span className="truncate text-xs text-muted-foreground" title={session?.user.email}>
        {displayName}
      </span>
      <button
        type="button"
        onClick={signOut}
        aria-label="Sign out"
        title="Sign out"
        className="inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <LogOutIcon className="size-3.5" />
      </button>
    </div>
  );
}
