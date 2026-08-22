import type { ReactNode } from "react";
import type { DataSource } from "@/lib/data";

interface PageHeaderProps {
  title: string;
  description?: string;
  /** Right-aligned actions (buttons, filters). */
  actions?: ReactNode;
  /** When "demo", a subtle note explains that the live API is unreachable. */
  source?: DataSource;
}

/** Consistent page intro: heading, lede, actions, optional provenance note. */
export function PageHeader({ title, description, actions, source }: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex flex-col gap-1.5">
        <h1 className="font-heading text-2xl font-bold tracking-tight text-balance md:text-3xl">
          {title}
        </h1>
        {description ? (
          <p className="max-w-2xl text-sm text-muted-foreground">{description}</p>
        ) : null}
        {source === "demo" ? (
          <p className="text-xs text-subtle-foreground">
            Live API unavailable — showing demo data. Start the API with{" "}
            <code className="font-mono">pnpm dev:api</code> to see real numbers.
          </p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
