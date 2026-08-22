import type { Metadata } from "next";
import type { ReactNode } from "react";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  EmptyState,
  Field,
  Input,
  Label,
  Skeleton,
  SkeletonText,
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeadCell,
  TableRow,
  ThemeToggle,
} from "@reclaimr/ui";
import { formatCadence, formatMoney } from "@/lib/format";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { LoadingButtonDemo, ModalDemo, ToastDemo } from "@/components/design/interactive-demos";

export const metadata: Metadata = {
  title: "Design system",
  description: "The ReclaimR black-and-white design system: tokens, type, and primitives.",
};

const SAMPLE_SUBSCRIPTIONS = [
  { name: "Streaming Plus", amountCents: 1599, cadence: "monthly", status: "active" },
  { name: "Cloud Storage 2TB", amountCents: 999, cadence: "monthly", status: "active" },
  { name: "News Daily", amountCents: 2500, cadence: "quarterly", status: "paused" },
  { name: "Fitness Club", amountCents: 4500, cadence: "annual", status: "canceled" },
] as const;

const STATUS_BADGE = {
  active: "solid",
  paused: "outline",
  canceled: "muted",
} as const;

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="border-b">
      <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6">
        <div className="mb-6 flex flex-col gap-1">
          <h2 className="font-heading text-2xl font-bold tracking-tight">{title}</h2>
          {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
        </div>
        {children}
      </div>
    </section>
  );
}

const TOKEN_SWATCHES = [
  { name: "background", className: "bg-background", text: "bg-background" },
  { name: "foreground", className: "bg-foreground", text: "bg-foreground" },
  { name: "muted", className: "bg-muted", text: "bg-muted" },
  { name: "muted-foreground", className: "bg-muted-foreground", text: "bg-muted-foreground" },
  { name: "border", className: "bg-border", text: "bg-border" },
] as const;

export default function DesignPage() {
  return (
    <>
      <SiteHeader />

      <main className="flex-1 pt-20">
        <div className="border-b">
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-12 sm:px-6">
            <Badge variant="outline">Living style guide</Badge>
            <h1 className="font-heading text-4xl font-bold tracking-tight">Design system</h1>
            <p className="max-w-2xl text-muted-foreground">
              Strict black-and-white, grayscale only. Light and dark themes are token swaps — state
              is communicated with contrast, borders, weight, and labels, never color.
            </p>
          </div>
        </div>

        <Section
          title="Themes"
          description="Two themes, one set of utilities. Toggle light → dark → system with the control on the right."
        >
          <div className="flex flex-col gap-6">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
              {TOKEN_SWATCHES.map((swatch) => (
                <div key={swatch.name} className="flex flex-col gap-2">
                  <div className={`h-16 rounded-md border ${swatch.className}`} />
                  <code className="font-mono text-xs text-muted-foreground">{swatch.text}</code>
                </div>
              ))}
            </div>
            <div>
              <ThemeToggle />
            </div>
          </div>
        </Section>

        <Section
          title="Typography"
          description="Space Grotesk for headings, Inter for body, JetBrains Mono for numbers and financial amounts."
        >
          <div className="flex flex-col gap-6 rounded-lg border p-6">
            <div className="flex flex-col gap-1">
              <span className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                Display · Space Grotesk
              </span>
              <p className="font-heading text-5xl font-bold tracking-tight">Reclaim $2,348/yr</p>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                Body · Inter
              </span>
              <p className="max-w-xl">
                ReclaimR detects recurring charges across your linked accounts, flags price
                increases the moment they land, and cancels what you no longer use — with
                confirmation at every step.
              </p>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                Numbers · JetBrains Mono
              </span>
              <div className="flex flex-wrap gap-8 font-mono tabular-nums">
                <span className="text-3xl font-bold">$1,240.50</span>
                <span className="text-3xl font-bold">$64.99</span>
                <span className="text-3xl font-bold text-muted-foreground">−$312.00</span>
              </div>
            </div>
          </div>
        </Section>

        <Section
          title="Buttons"
          description="Primary, secondary, ghost · three sizes · loading and disabled states."
        >
          <div className="flex flex-col gap-6">
            <div className="flex flex-wrap items-center gap-3">
              <Button>Primary</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="ghost">Ghost</Button>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button size="sm">Small</Button>
              <Button size="md">Medium</Button>
              <Button size="lg">Large</Button>
              <Button disabled>Disabled</Button>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <LoadingButtonDemo />
              <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                <Spinner className="size-4" /> Spinner
              </span>
            </div>
          </div>
        </Section>

        <Section
          title="Badges"
          description="Solid for emphasis, outline for neutral status, muted for de-emphasis."
        >
          <div className="flex flex-wrap gap-3">
            <Badge>Active</Badge>
            <Badge variant="outline">Paused</Badge>
            <Badge variant="muted">Canceled</Badge>
            <Badge variant="outline">Beta</Badge>
          </div>
        </Section>

        <Section
          title="Forms"
          description="Accessible fields with wired label, hint, and error announcements."
        >
          <div className="grid max-w-3xl gap-6 sm:grid-cols-2">
            <Field label="Email" hint="We never share your address.">
              <Input name="email" type="email" placeholder="you@example.com" autoComplete="email" />
            </Field>
            <Field label="Monthly budget" hint="Amounts are in USD.">
              <Input name="budget" type="number" min={0} placeholder="250" inputMode="decimal" />
            </Field>
            <Field label="Password" error="Must be at least 10 characters.">
              <Input
                name="password"
                type="password"
                defaultValue="short"
                autoComplete="new-password"
              />
            </Field>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="demo-disabled">Disabled</Label>
              <Input id="demo-disabled" disabled placeholder="Locked" />
              <p className="text-xs tracking-wider text-muted-foreground uppercase">
                Unavailable in free tier
              </p>
            </div>
          </div>
        </Section>

        <Section title="Cards" description="Composable surfaces for dashboards and summaries.">
          <div className="grid max-w-3xl gap-4 sm:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Monthly spend</CardTitle>
                <CardDescription>Across 8 linked accounts</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="font-mono text-3xl font-bold tabular-nums">$312.44</p>
                <p className="text-sm text-muted-foreground">
                  <span className="font-semibold">+ $24.00</span> vs last month
                </p>
              </CardContent>
              <CardFooter className="justify-between text-sm text-muted-foreground">
                <span>12 subscriptions</span>
                <Badge variant="outline">Detected</Badge>
              </CardFooter>
            </Card>
            <Card className="justify-between">
              <CardHeader>
                <CardTitle>Reclaimed total</CardTitle>
                <CardDescription>Since you joined</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="font-mono text-3xl font-bold tabular-nums">$1,240.50</p>
                <p className="text-sm text-muted-foreground">4 cancellations · 2 negotiations</p>
              </CardContent>
              <CardFooter>
                <Button size="sm">View history</Button>
              </CardFooter>
            </Card>
          </div>
        </Section>

        <Section
          title="Table"
          description="Strong rule under the header, soft rules between rows, mono tabular figures for money."
        >
          <Card className="p-0">
            <Table>
              <TableHead>
                <TableRow className="hover:bg-transparent">
                  <TableHeadCell>Subscription</TableHeadCell>
                  <TableHeadCell>Cadence</TableHeadCell>
                  <TableHeadCell className="text-right">Amount</TableHeadCell>
                  <TableHeadCell className="text-right">Status</TableHeadCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {SAMPLE_SUBSCRIPTIONS.map((subscription) => (
                  <TableRow key={subscription.name}>
                    <TableCell className="font-medium">{subscription.name}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatCadence(subscription.cadence)}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {formatMoney(subscription.amountCents)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge variant={STATUS_BADGE[subscription.status]}>
                        {subscription.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </Section>

        <Section title="Overlays" description="Focus-trapped dialogs and monochrome toasts.">
          <div className="flex flex-col gap-6">
            <ModalDemo />
            <ToastDemo />
          </div>
        </Section>

        <Section title="Empty & loading states" description="Realistic nothing and waiting.">
          <div className="grid gap-4 lg:grid-cols-2">
            <EmptyState
              title="No subscriptions detected yet"
              description="Link a bank account and ReclaimR will scan your transactions for recurring charges."
              action={
                <Button size="sm" variant="secondary">
                  Connect account
                </Button>
              }
            />
            <Card>
              <CardHeader>
                <Skeleton className="h-5 w-40" />
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <Skeleton className="h-8 w-28" />
                <SkeletonText lines={3} />
                <div className="flex items-center justify-between border-t pt-4">
                  <Skeleton className="h-8 w-24 rounded-md" />
                  <Skeleton className="size-8 rounded-full" />
                </div>
              </CardContent>
            </Card>
          </div>
        </Section>
      </main>

      <SiteFooter />
    </>
  );
}
