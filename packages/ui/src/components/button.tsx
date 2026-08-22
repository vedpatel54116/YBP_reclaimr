import type { ButtonHTMLAttributes, Ref } from "react";
import { cn } from "../cn";
import { Spinner } from "./spinner";

export type ButtonVariant = "primary" | "secondary" | "ghost";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows a spinner and blocks interaction while an action is in flight. */
  loading?: boolean;
  fullWidth?: boolean;
  /** React 19 style ref-as-prop. */
  ref?: Ref<HTMLButtonElement>;
}

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  // Monochrome states: primary inverts, secondary inverts on hover, ghost
  // tints with the muted surface. No colors, ever.
  primary: "border-transparent bg-primary text-primary-foreground hover:opacity-80",
  secondary:
    "border-foreground bg-transparent text-foreground hover:bg-foreground hover:text-background",
  ghost: "border-transparent bg-transparent text-foreground hover:bg-muted",
};

const SIZE_CLASS: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-xs",
  md: "h-10 px-4 text-sm",
  lg: "h-12 px-6 text-base",
};

/** Class string for the button look, so <Link> can render as a button. */
export function buttonClasses(variant: ButtonVariant = "primary", size: ButtonSize = "md"): string {
  return cn(
    "inline-flex cursor-pointer select-none items-center justify-center gap-2 rounded-md border font-semibold leading-none whitespace-nowrap transition-[background-color,color,opacity] duration-100 disabled:pointer-events-none disabled:opacity-45",
    VARIANT_CLASS[variant],
    SIZE_CLASS[size],
  );
}

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  fullWidth = false,
  className,
  type = "button",
  disabled,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(buttonClasses(variant, size), fullWidth && "w-full", className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <Spinner className="size-3.5" /> : null}
      {children}
    </button>
  );
}
