import type { ReactNode } from "react";
import { cn } from "../cn";
import { InboxIcon } from "../icons";

export interface EmptyStateProps {
  title: string;
  description?: string;
  /** Defaults to an inbox glyph; pass any icon node to customize. */
  icon?: ReactNode;
  /** Primary action, usually a Button. */
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ title, description, icon, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex w-full flex-col items-center justify-center gap-4 rounded-lg border border-dashed px-6 py-14 text-center",
        className,
      )}
    >
      <span className="flex size-12 items-center justify-center rounded-full border text-muted-foreground">
        {icon ?? <InboxIcon className="size-5" />}
      </span>
      <div className="flex flex-col gap-1">
        <p className="font-heading text-base font-semibold tracking-tight">{title}</p>
        {description ? (
          <p className="mx-auto max-w-sm text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}
