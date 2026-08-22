"use client";

import { useState } from "react";
import { Button, useToast } from "@reclaimr/ui";

/**
 * Marks every unread alert as read. The endpoint doesn't exist yet, so this
 * optimistically reports the action; wire it to PATCH when alerts land.
 */
export function MarkAllReadButton({ count }: { count: number }) {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  async function onMarkAll() {
    setLoading(true);
    await new Promise((resolve) => setTimeout(resolve, 500));
    setLoading(false);
    toast({ variant: "success", title: `Marked ${count} alert${count === 1 ? "" : "s"} as read` });
  }

  return (
    <Button
      variant="secondary"
      size="sm"
      loading={loading}
      disabled={count === 0}
      onClick={onMarkAll}
    >
      Mark all read
    </Button>
  );
}
