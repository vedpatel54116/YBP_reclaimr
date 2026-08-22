import type { HTMLAttributes } from "react";
import { cn } from "../cn";

export type BadgeVariant = "solid" | "outline" | "muted";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

const VARIANT_CLASS: Record<BadgeVariant, string> = {
  solid: "border-transparent bg-foreground text-background",
  outline: "border-foreground bg-transparent text-foreground",
  muted: "border-transparent bg-muted text-muted-foreground",
};

export function Badge({ variant = "solid", className, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold tracking-wider whitespace-nowrap uppercase",
        VARIANT_CLASS[variant],
        className,
      )}
      {...props}
    />
  );
}
