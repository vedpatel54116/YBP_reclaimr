"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Button,
  Card,
  CardContent,
  CardSection,
  Field,
  Input,
  Skeleton,
  useToast,
} from "@reclaimr/ui";
import { getSession, updateSessionUser } from "@/lib/auth";

const profileSchema = z.object({
  name: z.string().min(1, "Enter a name").max(120, "Name is too long"),
  email: z.string().min(1, "Enter an email address").email("Enter a valid email address"),
});
type ProfileValues = z.infer<typeof profileSchema>;

/**
 * Profile editing. Saves locally to the session record until the profile
 * endpoint lands — the form is fully wired, so pointing it at the API is a
 * one-line change in `onSubmit`.
 */
export function SettingsProfileCard() {
  const { toast } = useToast();
  const [ready, setReady] = useState(false);
  const form = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: { name: "", email: "" },
  });

  // Defaults come from localStorage, so populate after mount to keep the
  // server and client renders identical.
  useEffect(() => {
    const session = getSession();
    if (session) {
      form.reset({ name: session.user.name ?? "", email: session.user.email });
    }
    setReady(true);
  }, [form]);

  const onSubmit = form.handleSubmit(async (values) => {
    const session = getSession();
    if (!session) return;
    updateSessionUser({ ...session.user, name: values.name, email: values.email });
    await new Promise((resolve) => setTimeout(resolve, 400));
    toast({
      title: "Profile saved",
      description: "Stored on this device — syncing to the server comes with the profile API.",
    });
  });

  return (
    <Card>
      <CardSection
        title="Profile"
        description="How ReclaimR addresses you and where alerts land."
      />
      <CardContent>
        {ready ? (
          <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
            <Field label="Name" error={form.formState.errors.name?.message}>
              <Input autoComplete="name" {...form.register("name")} />
            </Field>
            <Field
              label="Email"
              hint="Changes require re-verification once the API is live."
              error={form.formState.errors.email?.message}
            >
              <Input type="email" autoComplete="email" {...form.register("email")} />
            </Field>
            <div className="flex justify-end">
              <Button type="submit" loading={form.formState.isSubmitting}>
                Save changes
              </Button>
            </div>
          </form>
        ) : (
          <div className="flex flex-col gap-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <div className="flex justify-end">
              <Skeleton className="h-10 w-28" />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
