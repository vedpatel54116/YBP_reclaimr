import type { ReactNode } from "react";
import { AlertIcon, Card, CardContent, CardFooter } from "@reclaimr/ui";
import { cn } from "@reclaimr/ui";

/** Dashed-banner form-level error, mirroring the error toast treatment. */
export function FormError({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <div
      role="alert"
      className="flex items-start gap-2.5 rounded-md border-2 border-dashed border-foreground p-3 text-sm"
    >
      <AlertIcon className="mt-0.5 size-4 shrink-0" />
      <p>{message}</p>
    </div>
  );
}

/** The card every auth form sits in: title, lede, body, footer links. */
export function AuthCard({
  title,
  description,
  children,
  footer,
  className,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("gap-5 p-6 sm:p-8", className)}>
      <div className="flex flex-col gap-1.5">
        <h1 className="font-heading text-2xl font-bold tracking-tight text-balance">{title}</h1>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </div>
      <CardContent className="flex flex-col gap-4">{children}</CardContent>
      {footer ? (
        <CardFooter className=" justify-center text-sm text-muted-foreground">{footer}</CardFooter>
      ) : null}
    </Card>
  );
}
