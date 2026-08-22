"use client";

import type { InputHTMLAttributes, ReactNode, Ref } from "react";
import { cn } from "../cn";
import { CheckIcon } from "../icons";

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  ref?: Ref<HTMLInputElement>;
}

/**
 * Monochrome checkbox: the native control is restyled in place (keeps forms
 * and screen readers working with zero wiring) and inverts when checked, with
 * a themed check glyph overlaid via peer utilities.
 */
export function Checkbox({ className, ...props }: CheckboxProps) {
  return (
    <span className="relative inline-flex size-5 shrink-0">
      <input
        type="checkbox"
        className={cn(
          "peer size-full cursor-pointer appearance-none rounded-[4px] border border-foreground bg-background transition-colors",
          "checked:border-transparent checked:bg-foreground",
          "disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        {...props}
      />
      <CheckIcon
        className="pointer-events-none absolute inset-0 m-auto size-3 text-background opacity-0 transition-opacity peer-checked:opacity-100"
        strokeWidth={3.5}
      />
    </span>
  );
}

/** Checkbox with a wrapped label and optional description, as one hit target. */
export function CheckboxField({
  label,
  description,
  error,
  // Destructured to swallow it: children are typed `never` and must never
  // reach the underlying input through the prop spread.
  children: _children,
  className,
  ...props
}: CheckboxProps & {
  label: ReactNode;
  description?: ReactNode;
  /** Validation message shown instead of the description. */
  error?: string;
  children?: never;
}) {
  const detail = error ?? description;
  return (
    <label className={cn("flex cursor-pointer items-start gap-3", className)}>
      <Checkbox aria-invalid={error ? true : undefined} {...props} />
      <span className="flex flex-col gap-0.5">
        <span className="text-sm leading-snug font-semibold text-foreground">{label}</span>
        {detail ? (
          <span
            className={cn(
              "text-xs leading-relaxed",
              error ? "font-semibold text-foreground" : "text-muted-foreground",
            )}
          >
            {detail}
          </span>
        ) : null}
      </span>
    </label>
  );
}
