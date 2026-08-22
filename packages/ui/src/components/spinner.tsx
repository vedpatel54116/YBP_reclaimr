import { cn } from "../cn";

export interface SpinnerProps {
  /** Announced to screen readers; the visual is a bare ring. */
  label?: string;
  className?: string;
}

/** SVG stroke spinner that inherits `currentColor`, so it adapts to any surface. */
export function Spinner({ label = "Loading", className }: SpinnerProps) {
  return (
    <svg
      className={cn("size-4 animate-spin", className)}
      viewBox="0 0 24 24"
      fill="none"
      role="status"
      aria-label={label}
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
      <path
        className="opacity-95"
        d="M12 2a10 10 0 0 1 10 10"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}
