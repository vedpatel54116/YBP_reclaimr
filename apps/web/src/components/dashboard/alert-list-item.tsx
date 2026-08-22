import {
  AlertIcon,
  BellIcon,
  CalendarIcon,
  BanIcon,
  type InfoIcon,
  CreditCardIcon,
  TrendingUpIcon,
  SystemIcon,
} from "@reclaimr/ui";
import { cn } from "@reclaimr/ui";
import type { AlertItem, AlertType } from "@/lib/domain";
import { formatRelativeTime } from "@/lib/format";

const TYPE_ICON: Record<AlertType, typeof InfoIcon> = {
  price_increase: TrendingUpIcon,
  new_subscription_detected: CreditCardIcon,
  upcoming_bill: CalendarIcon,
  low_balance: AlertIcon,
  subscription_canceled: BanIcon,
  large_purchase: CreditCardIcon,
  bank_connection_error: SystemIcon,
};

const TYPE_LABEL: Record<AlertType, string> = {
  price_increase: "Price increase",
  new_subscription_detected: "New subscription",
  upcoming_bill: "Upcoming bill",
  low_balance: "Low balance",
  subscription_canceled: "Canceled",
  large_purchase: "Large purchase",
  bank_connection_error: "Connection",
};

/** Severity and read-state are expressed by weight and fill — never color. */
export function AlertListItem({ alert }: { alert: AlertItem }) {
  const Icon = TYPE_ICON[alert.type] ?? BellIcon;
  const unread = alert.readAt === null;

  return (
    <article
      className={cn(
        "flex items-start gap-3 border-b px-4 py-3.5 last:border-b-0 transition-colors",
        unread ? "bg-muted/50" : "bg-transparent",
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full border",
          unread ? "border-foreground bg-foreground text-background" : "text-muted-foreground",
        )}
      >
        <Icon className="size-4" />
      </span>
      <div className="flex min-w-0 flex-col gap-0.5">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className={cn("text-sm", unread ? "font-bold" : "font-medium")}>{alert.title}</p>
          <span className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
            {TYPE_LABEL[alert.type]}
          </span>
          {alert.severity === "warning" ? (
            <span className="rounded-full border border-foreground px-1.5 py-px text-[10px] font-semibold tracking-wider uppercase">
              Action
            </span>
          ) : null}
        </div>
        <p className="line-clamp-2 text-sm text-muted-foreground">{alert.body}</p>
      </div>
      <div className="ml-auto flex shrink-0 flex-col items-end gap-1 pl-2">
        <time
          dateTime={alert.createdAt}
          className="font-mono text-xs whitespace-nowrap text-muted-foreground tabular-nums"
        >
          {formatRelativeTime(alert.createdAt)}
        </time>
        {unread ? <span aria-label="Unread" className="size-2 rounded-full bg-foreground" /> : null}
      </div>
    </article>
  );
}
