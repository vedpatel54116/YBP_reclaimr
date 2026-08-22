"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { Skeleton, SkeletonText } from "@reclaimr/ui";
import { getSession } from "@/lib/auth";

/**
 * Client-side gate for the dashboard area: no stored session → back to the
 * login page. While the storage check resolves, a page-shaped skeleton keeps
 * the shell from flashing. Until the API ships cookie sessions this is a UX
 * guard, not a security boundary — every dashboard fetch still requires a
 * valid token server-side.
 */
export function AuthGuard({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [status, setStatus] = useState<"checking" | "allowed">("checking");

  useEffect(() => {
    if (getSession()) {
      setStatus("allowed");
    } else {
      router.replace("/login");
    }
  }, [router]);

  if (status === "checking") {
    return (
      <div className="flex flex-col gap-6 py-4" aria-label="Loading">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-4 w-80 max-w-full" />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
        <div className="flex flex-col gap-3 rounded-lg border p-5">
          <Skeleton className="h-5 w-40" />
          <SkeletonText lines={3} />
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
