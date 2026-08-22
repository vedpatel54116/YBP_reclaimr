import {
  cloneElement,
  isValidElement,
  useId,
  type InputHTMLAttributes,
  type LabelHTMLAttributes,
  type ReactElement,
  type Ref,
} from "react";
import { cn } from "../cn";

const CONTROL_CLASS =
  "h-10 w-full rounded-md border border-foreground bg-background px-3 py-2 text-sm text-foreground transition-colors placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  /** Error state: dashed double border, no color (monochrome rule). */
  invalid?: boolean;
  ref?: Ref<HTMLInputElement>;
}

export function Input({ className, invalid, ...props }: InputProps) {
  return (
    <input
      className={cn(CONTROL_CLASS, invalid && "border-2 border-dashed", className)}
      aria-invalid={invalid || undefined}
      {...props}
    />
  );
}

export type LabelProps = LabelHTMLAttributes<HTMLLabelElement>;

export function Label({ className, ...props }: LabelProps) {
  return <label className={cn("text-sm font-semibold text-foreground", className)} {...props} />;
}

export interface FieldProps {
  label: string;
  /** Helper text shown when there is no error. */
  hint?: string;
  /** Validation message; replaces the hint and marks the control invalid. */
  error?: string;
  children: ReactElement;
  className?: string;
}

/**
 * Accessible form field: wires label → control → description via generated
 * ids, so every control is announced correctly without manual id plumbing.
 * Pass a single control (`<Input>`, `<select>`, ...) as children.
 */
export function Field({ label, hint, error, children, className }: FieldProps) {
  const id = useId();
  const description = error ?? hint;
  const descriptionId = description != null ? `${id}-description` : undefined;

  const control = isValidElement(children)
    ? cloneElement(children, {
        id,
        ...(descriptionId ? { "aria-describedby": descriptionId } : {}),
        ...(error ? { invalid: true, "aria-invalid": true } : {}),
      } as Record<string, unknown>)
    : children;

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={id}>{label}</Label>
      {control}
      {description != null ? (
        <p
          id={descriptionId}
          className={cn(
            "text-xs uppercase tracking-wider",
            error ? "font-semibold text-foreground" : "text-muted-foreground",
          )}
        >
          {description}
        </p>
      ) : null}
    </div>
  );
}
