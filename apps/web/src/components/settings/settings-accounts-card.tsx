"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Badge, buttonClasses, EmptyState } from "@reclaimr/ui";
import { getInstitution } from "@/lib/onboarding";

/** Accounts linked during onboarding, with a path back to link more. */
export function SettingsAccountsCard() {
  const [linkedIds, setLinkedIds] = useState<string[] | null>(null);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem("reclaimr.onboarding");
      const parsed = raw ? (JSON.parse(raw) as { linkedAccountIds?: string[] }) : null;
      setLinkedIds(parsed?.linkedAccountIds ?? []);
    } catch {
      setLinkedIds([]);
    }
  }, []);

  const institutions = (linkedIds ?? [])
    .map((id) => getInstitution(id))
    .filter((institution): institution is NonNullable<typeof institution> => institution != null);

  return (
    <div className="flex flex-col gap-4 rounded-lg border bg-card p-5 text-card-foreground">
      <div className="flex flex-row items-start justify-between gap-2">
        <div className="flex flex-col gap-1">
          <h3 className="font-heading text-lg font-bold tracking-tight">Bank accounts</h3>
          <p className="text-sm text-muted-foreground">Read-only connections powering detection.</p>
        </div>
        {institutions.length > 0 ? (
          <Link
            href="/onboarding"
            className="inline-flex h-8 shrink-0 items-center justify-center rounded-md border border-foreground px-3 text-xs font-semibold transition-colors hover:bg-foreground hover:text-background"
          >
            Link another
          </Link>
        ) : null}
      </div>

      {linkedIds === null ? (
        <div className="h-20 animate-pulse rounded-md bg-foreground/10" />
      ) : institutions.length === 0 ? (
        <EmptyState
          title="No accounts connected"
          description="Link a bank account so ReclaimR can detect recurring charges."
          action={
            <Link href="/onboarding" className={buttonClasses("secondary", "sm")}>
              Link an account
            </Link>
          }
        />
      ) : (
        <ul className="flex flex-col divide-y">
          {institutions.map((institution) => (
            <li key={institution.id} className="flex items-center gap-3 py-3.5">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-md border font-mono text-xs font-bold">
                {institution.monogram}
              </span>
              <span className="min-w-0 truncate text-sm font-medium">{institution.name}</span>
              <Badge variant="muted" className="ml-auto">
                Read-only
              </Badge>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
