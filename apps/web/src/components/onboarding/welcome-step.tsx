"use client";

import { Badge, BanIcon, Button, SearchIcon, TrendingUpIcon } from "@reclaimr/ui";

const HIGHLIGHTS = [
  {
    icon: SearchIcon,
    title: "Detect",
    description: "Scan every transaction for recurring charges — including the forgotten ones.",
  },
  {
    icon: BanIcon,
    title: "Cancel",
    description: "Drop the ones you no longer want in one click. We do the legwork.",
  },
  {
    icon: TrendingUpIcon,
    title: "Reclaim",
    description: "Keep score as every cancelled charge and negotiated bill adds up.",
  },
] as const;

export function WelcomeStep({ onNext }: { onNext: () => void }) {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-4">
        <Badge>Welcome</Badge>
        <h1 className="font-heading text-4xl leading-[1.05] font-bold tracking-tight text-balance md:text-5xl">
          Your money, reclaimed.
        </h1>
        <p className="text-base text-muted-foreground">
          Three quick steps: agree to a read-only connection, link a bank account, and we&apos;ll
          scan a year of transactions for money you can take back.
        </p>
      </div>

      <ul className="flex flex-col divide-y rounded-lg border">
        {HIGHLIGHTS.map(({ icon: Icon, title, description }) => (
          <li key={title} className="flex items-start gap-4 p-4 sm:p-5">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-md border">
              <Icon className="size-4.5" />
            </span>
            <div className="flex flex-col gap-0.5">
              <p className="text-sm font-semibold">{title}</p>
              <p className="text-sm text-muted-foreground">{description}</p>
            </div>
          </li>
        ))}
      </ul>

      <div className="flex flex-col gap-2">
        <Button type="button" size="lg" fullWidth onClick={onNext}>
          Get started
        </Button>
        <p className="text-center text-xs text-muted-foreground">Takes about a minute</p>
      </div>
    </div>
  );
}
