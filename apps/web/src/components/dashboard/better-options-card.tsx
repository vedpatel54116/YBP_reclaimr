import type { AlternativeAdviceContent } from "@reclaimr/shared";
import { Badge, Card, CardSection } from "@reclaimr/ui";
import { formatMoney } from "@/lib/format";

interface BetterOptionsCardProps {
  content: AlternativeAdviceContent;
  currency: string;
}

/**
 * Ranked cheaper alternatives for one subscription.
 *
 * Monochrome by design: savings are conveyed with bold tabular figures and an
 * outlined badge rather than color, so the hierarchy survives both themes and
 * stays legible to anyone who cannot distinguish green from red.
 */
export function BetterOptionsCard({ content, currency }: BetterOptionsCardProps) {
  if (content.picks.length === 0) return null;

  const bestSavings = Math.max(...content.picks.map((pick) => pick.monthlySavingsCents));

  return (
    <Card>
      <CardSection
        title="Better options"
        description="Cheaper plans that cover the same need, ranked by what you would keep."
      />

      <p className="font-mono text-3xl font-bold tracking-tight tabular-nums">
        {formatMoney(bestSavings * 12, currency)}
        <span className="text-sm font-normal text-muted-foreground"> /yr saved</span>
      </p>

      <ul className="flex flex-col gap-2">
        {content.picks.map((pick) => (
          <li key={pick.name} className="flex flex-col gap-1.5 rounded-md border p-3">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm font-semibold">{pick.name}</span>
              <span className="font-mono text-sm font-semibold whitespace-nowrap tabular-nums">
                {formatMoney(pick.monthlyPriceCents, currency)}
                <span className="text-xs font-normal text-muted-foreground">/mo</span>
              </span>
            </div>

            {pick.monthlySavingsCents > 0 ? (
              <Badge variant="outline" className="w-fit">
                Save {formatMoney(pick.monthlySavingsCents, currency)}/mo
              </Badge>
            ) : null}

            <p className="text-sm text-muted-foreground">{pick.rationale}</p>
          </li>
        ))}
      </ul>

      {content.verdict ? (
        <p className="text-xs text-subtle-foreground">{content.verdict}</p>
      ) : null}
    </Card>
  );
}
