import Link from "next/link";
import { buttonClasses, EmptyState } from "@reclaimr/ui";

/** Rendered when a detail page references an id that doesn't exist. */
export default function DashboardNotFound() {
  return (
    <EmptyState
      title="Not found"
      description="This record doesn't exist — it may have been deleted, or the link is stale."
      action={
        <Link href="/dashboard" className={buttonClasses("secondary", "md")}>
          Back to overview
        </Link>
      }
    />
  );
}
