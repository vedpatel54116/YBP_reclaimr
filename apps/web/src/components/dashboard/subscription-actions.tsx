"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Modal, useToast } from "@reclaimr/ui";
import { updateSubscription } from "@/lib/api";
import type { DataSource } from "@/lib/data";

interface SubscriptionActionProps {
  subscriptionId: string;
  name: string;
  source: DataSource;
  /** Render size for the trigger button. */
  size?: "sm" | "md";
}

async function setStatus(
  subscriptionId: string,
  status: "active" | "canceled",
  source: DataSource,
): Promise<boolean> {
  if (source === "demo") {
    // No live record to mutate; simulate latency so the UI behaves identically.
    await new Promise((resolve) => setTimeout(resolve, 600));
    return true;
  }
  return (await updateSubscription(subscriptionId, { status })) !== null;
}

/** Opens a confirmation dialog, then cancels the subscription. */
export function CancelSubscriptionButton({
  subscriptionId,
  name,
  source,
  size = "sm",
}: SubscriptionActionProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const router = useRouter();

  async function onConfirm() {
    setLoading(true);
    const ok = await setStatus(subscriptionId, "canceled", source);
    setLoading(false);
    setOpen(false);
    if (ok) {
      toast({
        variant: "success",
        title: "Cancellation started",
        description:
          source === "demo"
            ? `${name} marked as canceled (demo mode — connect the API to persist).`
            : `${name} is now marked as canceled.`,
      });
      router.refresh();
    } else {
      toast({
        variant: "error",
        title: "Couldn't cancel",
        description: "The API rejected the request. Try again in a moment.",
      });
    }
  }

  return (
    <>
      <Button variant="secondary" size={size} onClick={() => setOpen(true)}>
        Cancel
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={`Cancel ${name}?`}
        description="The concierge submits the cancellation and confirms by email. You keep access until the end of the paid period."
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Keep it
            </Button>
            <Button variant="primary" loading={loading} onClick={onConfirm}>
              Cancel subscription
            </Button>
          </>
        }
      >
        <p className="text-muted-foreground">
          Future charges stop once the provider confirms. This appears in your savings total as
          reclaimed money.
        </p>
      </Modal>
    </>
  );
}

/** Inline button that flips a paused/canceled subscription back to active. */
export function ReactivateSubscriptionButton({
  subscriptionId,
  name,
  source,
  size = "sm",
}: SubscriptionActionProps) {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const router = useRouter();

  async function onClick() {
    setLoading(true);
    const ok = await setStatus(subscriptionId, "active", source);
    setLoading(false);
    if (ok) {
      toast({ variant: "success", title: `${name} reactivated` });
      router.refresh();
    } else {
      toast({
        variant: "error",
        title: "Couldn't reactivate",
        description: "The API rejected the request. Try again in a moment.",
      });
    }
  }

  return (
    <Button variant="secondary" size={size} loading={loading} onClick={onClick}>
      Reactivate
    </Button>
  );
}
