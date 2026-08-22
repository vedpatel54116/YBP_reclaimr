import Link from "next/link";
import { APP_NAME } from "@reclaimr/shared";

export function SiteFooter() {
  return (
    <footer className="border-t">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-4 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <span>
          © {new Date().getFullYear()} {APP_NAME} — monochrome by design.
        </span>
        <Link href="/design" className="font-medium transition-colors hover:text-foreground">
          Design system
        </Link>
      </div>
    </footer>
  );
}
