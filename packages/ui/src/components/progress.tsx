import type { HTMLAttributes } from "react";
import { cn } from "../cn";

export type ProgressBarProps = HTMLAttributes<HTMLDivElement> & {
  /** Completion percentage, 0–100. Values outside the range are clamped. */
  value: number;
};

/** Determinate monochrome progress track. Size/shape it via className. */
export function ProgressBar({ value, className, ...props }: ProgressBarProps) {
  const clamped = Math.min(100, Math.max(0, value));
  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(clamped)}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn("h-1.5 w-full overflow-hidden rounded-full bg-foreground/10", className)}
      {...props}
    >
      <div
        className="h-full rounded-full bg-foreground transition-[width] duration-300 ease-out"
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
