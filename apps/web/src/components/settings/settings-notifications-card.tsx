"use client";

import { useState } from "react";
import { Badge, Switch, useToast } from "@reclaimr/ui";

interface NotificationPreference {
  id: string;
  label: string;
  description: string;
  defaultOn: boolean;
}

const PREFERENCES: NotificationPreference[] = [
  {
    id: "price-alerts",
    label: "Price hike alerts",
    description: "The moment a recurring charge increases.",
    defaultOn: true,
  },
  {
    id: "weekly-digest",
    label: "Weekly digest",
    description: "A Monday summary of spend and savings.",
    defaultOn: true,
  },
  {
    id: "product-news",
    label: "Product news",
    description: "Occasional updates about new ReclaimR features.",
    defaultOn: false,
  },
];

/** Local-only until the notification-preferences endpoint lands. */
export function SettingsNotificationsCard() {
  const { toast } = useToast();
  const [preferences, setPreferences] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(PREFERENCES.map((preference) => [preference.id, preference.defaultOn])),
  );

  const toggle = (id: string, checked: boolean) => {
    setPreferences((current) => ({ ...current, [id]: checked }));
    const preference = PREFERENCES.find((item) => item.id === id);
    toast({
      title: `${preference?.label ?? "Preference"} ${checked ? "on" : "off"}`,
      description: "Saved on this device — server sync arrives with the preferences API.",
    });
  };

  return (
    <div className="flex flex-col gap-4 rounded-lg border bg-card p-5 text-card-foreground">
      <div className="flex flex-row items-start justify-between gap-2">
        <div className="flex flex-col gap-1">
          <h3 className="font-heading text-lg font-bold tracking-tight">Notifications</h3>
          <p className="text-sm text-muted-foreground">What ReclaimR tells you about, and when.</p>
        </div>
        <Badge variant="muted">Local only</Badge>
      </div>
      <ul className="flex flex-col divide-y">
        {PREFERENCES.map((preference) => (
          <li key={preference.id} className="flex items-center justify-between gap-4 py-3.5">
            <div className="flex min-w-0 flex-col">
              <p className="text-sm font-medium">{preference.label}</p>
              <p className="text-xs text-muted-foreground">{preference.description}</p>
            </div>
            <Switch
              checked={preferences[preference.id] ?? false}
              onCheckedChange={(checked) => toggle(preference.id, checked)}
              aria-label={preference.label}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
