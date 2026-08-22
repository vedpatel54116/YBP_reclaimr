"use client";

import { useState } from "react";
import { Button, Field, Input, Modal, useToast } from "@reclaimr/ui";

/** Button with an async action: shows the loading state for a beat. */
export function LoadingButtonDemo() {
  const [saving, setSaving] = useState(false);

  const onSave = () => {
    setSaving(true);
    setTimeout(() => setSaving(false), 1500);
  };

  return (
    <Button onClick={onSave} loading={saving}>
      {saving ? "Saving" : "Save changes"}
    </Button>
  );
}

export function ModalDemo() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Open dialog
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Cancel subscription"
        description="We contact the merchant for you. Access continues until the end of the billing period."
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Keep it
            </Button>
            <Button onClick={() => setOpen(false)}>Cancel subscription</Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <div className="flex items-baseline justify-between rounded-md bg-muted p-3">
            <span className="text-sm font-medium">Streaming Plus</span>
            <span className="font-mono text-sm font-semibold tabular-nums">$15.99/mo</span>
          </div>
          <Field label="Reason (optional)" hint="Helps us negotiate better outcomes.">
            <Input name="cancel-reason" placeholder="Price increased" autoComplete="off" />
          </Field>
        </div>
      </Modal>
    </>
  );
}

export function ToastDemo() {
  const { toast } = useToast();

  return (
    <div className="flex flex-wrap gap-2">
      <Button
        size="sm"
        variant="secondary"
        onClick={() =>
          toast({ title: "Detection finished", description: "12 recurring charges found." })
        }
      >
        Info toast
      </Button>
      <Button
        size="sm"
        variant="secondary"
        onClick={() =>
          toast({
            title: "Subscription canceled",
            description: "Streaming Plus is gone.",
            variant: "success",
          })
        }
      >
        Success toast
      </Button>
      <Button
        size="sm"
        variant="secondary"
        onClick={() =>
          toast({
            title: "Bank connection failed",
            description: "Re-link the account to resume syncing.",
            variant: "error",
            duration: 8000,
          })
        }
      >
        Error toast
      </Button>
    </div>
  );
}
