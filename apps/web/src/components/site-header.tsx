import Link from "next/link";
import { APP_NAME } from "@reclaimr/shared";
import { buttonClasses, ThemeToggle } from "@reclaimr/ui";

const NAV_LINKS = [
  { href: "/#how-it-works", label: "How it works" },
  { href: "/#features", label: "Features" },
  { href: "/design", label: "Design system" },
  { href: "/dashboard", label: "Dashboard" },
] as const;

/**
 * Floating liquid-glass header: three fixed pills (wordmark, nav links,
 * actions) inset from the top edge. The wrapper ignores pointer events so
 * the page behind the gaps stays clickable; each pill re-enables them.
 */
export function SiteHeader() {
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-40 flex items-center justify-between gap-3 p-3">
      <Link
        href="/"
        className="liquid-glass pointer-events-auto flex h-12 items-center rounded-full px-5 font-heading text-lg font-bold tracking-tight uppercase focus-visible:outline-2"
      >
        {APP_NAME}
      </Link>

      <nav
        aria-label="Main navigation"
        className="liquid-glass pointer-events-auto hidden h-12 items-center gap-6 rounded-full px-6 md:flex"
      >
        {NAV_LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            {link.label}
          </Link>
        ))}
      </nav>

      <div className="liquid-glass pointer-events-auto flex h-12 items-center gap-2 rounded-full px-3">
        <ThemeToggle />
        <Link href="/login" className={`${buttonClasses("ghost", "sm")} hidden sm:inline-flex`}>
          Log in
        </Link>
        <Link href="/signup" className={`${buttonClasses("primary", "sm")} hidden sm:inline-flex`}>
          Get started
        </Link>
      </div>
    </div>
  );
}
