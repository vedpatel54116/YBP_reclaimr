"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Modal, useToast } from "@reclaimr/ui";
import { clearSession } from "@/lib/auth";
import { resetOnboardingState } from "@/lib/onboarding";

export function SettingsDangerCard() {
  const router = useRouter();
  const { toast } = useToast();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const signOut = () => {
    clearSession();
    resetOnboardingState();
    toast({ title: "Signed out", description: "Your local session data was cleared." });
    router.push("/");
  };

  // The account endpoint isn't live yet; the confirmation clears everything
  // stored on this device so the flow is honest about what it does today.
  const deleteAccount = async () => {
    setDeleting(true);
    await new Promise((resolve) => setTimeout(resolve, 600));
    clearSession();
    resetOnboardingState();
    setDeleting(false);
    setDeleteOpen(false);
    toast({
      title: "Account deleted (local)",
      description: "Server-side deletion activates with the account API.",
    });
    router.push("/");
  };

  return (
    <div className="flex flex-col gap-4 rounded-lg border-2 border-dashed bg-card p-5 text-card-foreground">
      <div className="flex flex-col gap-1">
        <h3 className="font-heading text-lg font-bold tracking-tight">Session &amp; account</h3>
        <p className="text-sm text-muted-foreground">
          Sign out on this device, or remove everything.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={signOut}>
          Sign out
        </Button>
        <Button variant="ghost" onClick={() => setDeleteOpen(true)}>
          Delete account…
        </Button>
      </div>

      <Modal
        open={deleteOpen}
        onClose={() => (deleting ? undefined : setDeleteOpen(false))}
        title="Delete your account?"
        description="This clears your session, linked accounts, and scan results stored on this device. Server-side deletion (history, tokens) arrives with the account API."
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleteOpen(false)} disabled={deleting}>
              Keep my account
            </Button>
            <Button loading={deleting} onClick={() => void deleteAccount()}>
              Delete everything
            </Button>
          </>
        }
      />
    </div>
  );
}
