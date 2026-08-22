"use client";

import { useMemo, useState } from "react";
import {
  AlertIcon,
  Badge,
  BankIcon,
  Button,
  CheckIcon,
  Input,
  SearchIcon,
  Spinner,
} from "@reclaimr/ui";
import { getInstitution, INSTITUTIONS, type Institution } from "@/lib/onboarding";

const LINK_LATENCY_MS = 1200;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function LinkBankStep({
  linkedAccountIds,
  onChange,
  onNext,
}: {
  linkedAccountIds: string[];
  onChange: (ids: string[]) => void;
  onNext: () => void;
}) {
  const [query, setQuery] = useState("");
  const [connectingId, setConnectingId] = useState<string | null>(null);
  const [failedInstitution, setFailedInstitution] = useState<Institution | null>(null);

  const connected = linkedAccountIds
    .map((id) => getInstitution(id))
    .filter((institution): institution is Institution => institution != null);

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return INSTITUTIONS;
    return INSTITUTIONS.filter((institution) => institution.name.toLowerCase().includes(needle));
  }, [query]);

  async function connect(institution: Institution): Promise<void> {
    setFailedInstitution(null);
    setConnectingId(institution.id);
    await sleep(LINK_LATENCY_MS);
    setConnectingId(null);
    // Sandbox Merchant Bank always fails, exercising the error/retry path.
    if (institution.flaky) {
      setFailedInstitution(institution);
      return;
    }
    onChange([...linkedAccountIds, institution.id]);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4">
        <span className="flex size-11 items-center justify-center rounded-md border">
          <BankIcon className="size-5" />
        </span>
        <h1 className="font-heading text-3xl font-bold tracking-tight text-balance">
          Link your first account.
        </h1>
        <p className="text-sm text-muted-foreground">
          Pick a bank to connect. Linking is simulated in this build — no real credentials are
          collected.
        </p>
      </div>

      {connected.length > 0 ? (
        <ul className="flex flex-col divide-y rounded-lg border" aria-label="Connected accounts">
          {connected.map((institution) => (
            <li key={institution.id} className="flex items-center gap-3 p-3.5">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-foreground font-mono text-xs font-bold text-background">
                {institution.monogram}
              </span>
              <span className="text-sm font-medium">{institution.name}</span>
              <Badge variant="muted" className="ml-auto">
                <CheckIcon className="size-3" />
                Connected
              </Badge>
            </li>
          ))}
        </ul>
      ) : null}

      {failedInstitution ? (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-md border-2 border-dashed border-foreground p-3 text-sm"
        >
          <AlertIcon className="mt-0.5 size-4 shrink-0" />
          <p>
            Couldn&apos;t reach {failedInstitution.name}. This demo bank always fails — connect a
            different one to continue.
          </p>
        </div>
      ) : null}

      <div className="flex flex-col gap-3">
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search institutions"
            aria-label="Search institutions"
            className="pl-9"
          />
        </div>

        {results.length === 0 ? (
          <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
            No institutions match &ldquo;{query.trim()}&rdquo;.
          </p>
        ) : (
          <ul className="flex max-h-72 flex-col divide-y overflow-y-auto rounded-lg border">
            {results.map((institution) => {
              const isConnected = linkedAccountIds.includes(institution.id);
              const isConnecting = connectingId === institution.id;
              return (
                <li key={institution.id} className="flex items-center gap-3 p-3.5">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-md border font-mono text-xs font-bold">
                    {institution.monogram}
                  </span>
                  <span className="min-w-0 truncate text-sm font-medium">{institution.name}</span>
                  <span className="ml-auto shrink-0">
                    {isConnected ? (
                      <Badge variant="muted">Linked</Badge>
                    ) : isConnecting ? (
                      <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                        <Spinner className="size-3.5" />
                        Connecting…
                      </span>
                    ) : (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => void connect(institution)}
                      >
                        Connect
                      </Button>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row-reverse">
        <Button size="lg" fullWidth disabled={connected.length === 0} onClick={onNext}>
          {connected.length > 0 ? "Continue" : "Connect an account to continue"}
        </Button>
        <Button size="lg" variant="ghost" fullWidth onClick={onNext}>
          Skip for now
        </Button>
      </div>
    </div>
  );
}
