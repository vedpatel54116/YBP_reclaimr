"use client";

import type { ButtonHTMLAttributes } from "react";
import { cn } from "../cn";

export interface SwitchProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onChange"> {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}

/**
 * Monochrome toggle: the track inverts when on. Rendered as a real button
 * with role="switch" so it is keyboard operable and announced correctly.
 */
export function Switch({ checked, onCheckedChange, className, disabled, ...props }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border border-foreground px-0.5 transition-colors duration-150",
        "disabled:cursor-not-allowed disabled:opacity-50",
        checked ? "justify-end bg-foreground" : "justify-start bg-transparent",
        className,
      )}
      {...props}
    >
      <span
        className={cn(
          "size-4 rounded-full transition-colors duration-150",
          checked ? "bg-background" : "bg-foreground",
        )}
      />
    </button>
  );
}
