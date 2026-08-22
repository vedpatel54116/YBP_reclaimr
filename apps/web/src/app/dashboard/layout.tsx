import Link from "next/link";
import type { ReactNode } from "react";
import { APP_NAME } from "@reclaimr/shared";
import { ArrowRightIcon, CrownIcon, ThemeToggle } from "@reclaimr/ui";
import { AuthGuard } from "@/components/dashboard/auth-guard";
import { SidebarNav } from "@/components/dashboard/sidebar-nav";
import { UserBadge } from "@/components/dashboard/user-badge";
import { getAlerts } from "@/lib/data";

export default async function DashboardLayout({ children }: Readonly<{ children: ReactNode }>) {
  const unreadAlerts = getAlerts().filter((alert) => alert.readAt === null).length;

  return (
    <div className="min-h-dvh lg:pl-[17.5rem]">
      {/* Desktop sidebar */}
      <aside className="liquid-glass fixed inset-y-3 left-3 z-40 hidden w-60 flex-col rounded-3xl lg:flex">
        <div className="flex h-16 items-center border-b px-5">
          <Link
            href="/"
            className="font-heading text-lg font-bold tracking-tight uppercase focus-visible:outline-2"
          >
            {APP_NAME}
          </Link>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-4">
          <SidebarNav variant="vertical" unreadAlerts={unreadAlerts} />
        </div>

        <div className="flex flex-col gap-3 border-t p-3">
          <Link
            href="/dashboard/premium"
            className="group flex items-center gap-3 rounded-md border border-foreground px-3 py-3 transition-colors hover:bg-foreground hover:text-background"
          >
            <CrownIcon className="size-4 shrink-0" />
            <span className="flex flex-col">
              <span className="text-sm font-semibold leading-tight">Go Premium</span>
              <span className="text-xs leading-tight opacity-70">
                Concierge cancel &amp; negotiate
              </span>
            </span>
            <ArrowRightIcon className="ml-auto size-4 shrink-0 transition-transform group-hover:translate-x-0.5" />
          </Link>
          <div className="flex items-center justify-between gap-2 px-2 py-1">
            <UserBadge />
            <ThemeToggle />
          </div>
        </div>
      </aside>

      <div className="flex min-h-dvh flex-col">
        {/* Mobile header + nav */}
        <header className="sticky top-0 z-30 border-b bg-background/85 backdrop-blur lg:hidden">
          <div className="flex h-14 items-center justify-between px-4">
            <Link
              href="/"
              className="font-heading text-base font-bold tracking-tight uppercase focus-visible:outline-2"
            >
              {APP_NAME}
            </Link>
            <ThemeToggle />
          </div>
          <div className="border-t pb-2 pt-2">
            <SidebarNav variant="horizontal" unreadAlerts={unreadAlerts} />
          </div>
        </header>

        <main className="flex-1">
          <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:py-10">
            <AuthGuard>{children}</AuthGuard>
          </div>
        </main>

        <footer className="border-t">
          <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-4 text-xs text-muted-foreground sm:px-6">
            <span>{APP_NAME} — reclaim your money.</span>
            <Link href="/" className="font-medium transition-colors hover:text-foreground">
              Marketing site
            </Link>
          </div>
        </footer>
      </div>
    </div>
  );
}
