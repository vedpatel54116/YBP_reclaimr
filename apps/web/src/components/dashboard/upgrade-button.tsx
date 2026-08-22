"use client";

import { useState } from "react";
import { Button, useToast } from "@reclaimr/ui";

/**
 * Starts the Premium trial. Billing is not wired yet; the button confirms the
 * intent and will redirect to Stripe checkout when that integration lands.
 */
export function UpgradeButton({ priceCents }: { priceCents: number }) {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  async function onUpgrade() {
    setLoading(true);
    await new Promise((resolve) => setTimeout(resolve, 900));
    setLoading(false);
    toast({
      variant: "success",
      title: `Trial started — $${(priceCents / 100).toFixed(0)}/mo after 7 days`,
      description: "Cancel anytime from this page. Concierge features unlock immediately.",
    });
  }

  return (
    <Button size="lg" fullWidth loading={loading} onClick={onUpgrade}>
      Start 7-day free trial
    </Button>
  );
}
