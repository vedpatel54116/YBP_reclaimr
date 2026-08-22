"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BellIcon,
  CreditCardIcon,
  CrownIcon,
  HomeIcon,
  ReceiptIcon,
  SlidersIcon,
  TrendingUpIcon,
  type IconProps,
} from "@reclaimr/ui";
import { cn } from "@reclaimr/ui";

interface NavItem {
  href: string;
  label: string;
  icon: (props: IconProps) => React.ReactNode;
  /** Match the href exactly instead of by prefix (dashboard home). */
  exact?: boolean;
  badge?: "alerts";
}

const NAV_ITEMS: readonly NavItem[] = [
  { href: "/dashboard", label: "Overview", icon: HomeIcon, exact: true },
  { href: "/dashboard/subscriptions", label: "Subscriptions", icon: CreditCardIcon },
  { href: "/dashboard/bills", label: "Bills", icon: ReceiptIcon },
  { href: "/dashboard/alerts", label: "Alerts", icon: BellIcon, badge: "alerts" },
  { href: "/dashboard/savings", label: "Savings", icon: TrendingUpIcon },
  { href: "/dashboard/premium", label: "Premium", icon: CrownIcon },
  { href: "/dashboard/settings", label: "Settings", icon: SlidersIcon },
];

interface SidebarNavProps {
  /** unreadCount renders as a solid dot on the Alerts item. */
  unreadAlerts?: number;
  variant: "vertical" | "horizontal";
}

/**
 * Primary dashboard navigation. Vertical in the desktop sidebar; a
 * horizontally scrollable pill row under the header on mobile.
 */
export function SidebarNav({ unreadAlerts = 0, variant }: SidebarNavProps) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Dashboard navigation"
      className={cn(
        variant === "vertical" ? "flex flex-col gap-1" : "-mx-4 flex gap-1 overflow-x-auto px-4",
      )}
    >
      {NAV_ITEMS.map((item) => {
        const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
        const Icon = item.icon;
        const showDot = item.badge === "alerts" && unreadAlerts > 0;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-md text-sm font-medium whitespace-nowrap transition-colors",
              variant === "vertical" ? "px-3 py-2" : "px-3 py-1.5",
              active
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Icon className="size-4 shrink-0" />
            {item.label}
            {showDot ? (
              <span
                aria-label={`${unreadAlerts} unread`}
                className={cn(
                  "ml-auto inline-flex items-center justify-center rounded-full font-mono text-[10px] leading-none tabular-nums",
                  variant === "vertical" ? "min-w-5 px-1 py-1" : "min-w-5 px-1 py-0.5",
                  active ? "bg-background text-foreground" : "bg-foreground text-background",
                )}
              >
                {unreadAlerts}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
