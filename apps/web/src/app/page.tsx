import Link from "next/link";
import {
  Badge,
  buttonClasses,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@reclaimr/ui";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

const HERO_STATS = [
  { value: "$219", label: "Average monthly waste found" },
  { value: "9.4M", label: "Recurring charges detected" },
  { value: "3–10d", label: "Typical cancellation time" },
] as const;

const STEPS = [
  {
    number: "01",
    title: "Detect",
    description:
      "Connect your accounts and ReclaimR scans every transaction for recurring charges — including the ones you forgot about.",
  },
  {
    number: "02",
    title: "Cancel",
    description:
      "Review what you no longer use and cancel it in one click. We handle the emails, the phone trees, and the retention offers.",
  },
  {
    number: "03",
    title: "Reclaim",
    description:
      "Every cancelled charge and negotiated bill feeds a running total of reclaimed money. Watch the number climb.",
  },
] as const;

const FEATURES = [
  {
    title: "Subscription detection",
    description:
      "Merchant normalization, cadence matching, and confidence scoring surface subscriptions with ≥97% precision — and flag price hikes the moment they land.",
  },
  {
    title: "Bill negotiation",
    description:
      "Hand your internet, phone, and insurance bills to negotiators who work for a share of the savings. You only pay when you save.",
  },
  {
    title: "Savings autopilot",
    description:
      "Small, safe transfers into your goals timed around your bills and paycheck rhythm — with overdraft protection built in.",
  },
  {
    title: "Budgets that hold",
    description:
      "Automatic categorization, custom category budgets, and alerts before you overspend — not after.",
  },
] as const;

export default function HomePage() {
  return (
    <>
      <SiteHeader />

      <main className="flex-1 pt-20">
        {/* ── Hero ─────────────────────────────────────────────────────── */}
        <section className="border-b">
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-20 sm:px-6 md:py-28">
            <div className="flex max-w-3xl flex-col gap-5">
              <Badge>Subscription recovery</Badge>
              <h1 className="font-heading text-5xl leading-[1.02] font-bold tracking-tight text-balance md:text-7xl">
                Reclaim your money.
              </h1>
              <p className="max-w-xl text-lg text-muted-foreground">
                ReclaimR finds the recurring charges you forgot about, cancels the ones you
                don&apos;t want, and negotiates the bills you&apos;re overpaying — then keeps score
                of every dollar back.
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <Link href="/signup" className={buttonClasses("primary", "lg")}>
                  Get started
                </Link>
                <Link href="#how-it-works" className={buttonClasses("secondary", "lg")}>
                  How it works
                </Link>
              </div>
            </div>

            <dl className="grid grid-cols-1 gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-3">
              {HERO_STATS.map((stat) => (
                <div key={stat.label} className="flex flex-col gap-1 bg-background p-5">
                  <dd className="font-mono text-3xl font-bold tracking-tight tabular-nums">
                    {stat.value}
                  </dd>
                  <dt className="text-sm text-muted-foreground">{stat.label}</dt>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {/* ── How it works ─────────────────────────────────────────────── */}
        <section id="how-it-works" className="border-b scroll-mt-20">
          <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6">
            <div className="mb-10 flex max-w-2xl flex-col gap-3">
              <Badge variant="outline">How it works</Badge>
              <h2 className="font-heading text-3xl font-bold tracking-tight md:text-4xl">
                Three steps between you and your money.
              </h2>
            </div>
            <ol className="grid grid-cols-1 gap-4 md:grid-cols-3">
              {STEPS.map((step) => (
                <li key={step.number}>
                  <Card className="h-full">
                    <CardHeader>
                      <span className="font-mono text-sm font-bold tracking-widest text-muted-foreground">
                        {step.number}
                      </span>
                      <CardTitle>{step.title}</CardTitle>
                    </CardHeader>
                    <CardContent className="text-muted-foreground">{step.description}</CardContent>
                  </Card>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ── Features ─────────────────────────────────────────────────── */}
        <section id="features" className="border-b scroll-mt-20">
          <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6">
            <div className="mb-10 flex max-w-2xl flex-col gap-3">
              <Badge variant="outline">Features</Badge>
              <h2 className="font-heading text-3xl font-bold tracking-tight md:text-4xl">
                Everything that leaks money, plugged.
              </h2>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {FEATURES.map((feature) => (
                <Card key={feature.title}>
                  <CardHeader>
                    <CardTitle>{feature.title}</CardTitle>
                    <CardDescription>{feature.description}</CardDescription>
                  </CardHeader>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* ── Closing CTA ──────────────────────────────────────────────── */}
        <section>
          <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6">
            <div className="flex flex-col items-start gap-6 rounded-lg border border-foreground p-10 md:flex-row md:items-center md:justify-between">
              <div className="flex max-w-xl flex-col gap-2">
                <h2 className="font-heading text-3xl font-bold tracking-tight">
                  Stop paying for what you forgot.
                </h2>
                <p className="text-muted-foreground">
                  Connect an account and see your real subscription spend in under a minute.
                </p>
              </div>
              <Link href="/signup" className={buttonClasses("primary", "lg")}>
                Start reclaiming
              </Link>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}
