"use client";

import { MoonIcon, SunIcon, SystemIcon, useTheme, type Theme } from "@reclaimr/ui";

const OPTIONS: { value: Theme; label: string; description: string; icon: typeof SunIcon }[] = [
  { value: "light", label: "Light", description: "White canvas, black ink", icon: SunIcon },
  { value: "dark", label: "Dark", description: "Black canvas, white ink", icon: MoonIcon },
  { value: "system", label: "System", description: "Follow your device", icon: SystemIcon },
];

export function SettingsAppearanceCard() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="flex flex-col gap-4 rounded-lg border bg-card p-5 text-card-foreground">
      <div className="flex flex-col gap-1">
        <h3 className="font-heading text-lg font-bold tracking-tight">Appearance</h3>
        <p className="text-sm text-muted-foreground">
          ReclaimR is strictly black &amp; white — pick which one leads.
        </p>
      </div>
      <div role="radiogroup" aria-label="Theme" className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {OPTIONS.map(({ value, label, description, icon: Icon }) => {
          const active = theme === value;
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setTheme(value)}
              className={
                active
                  ? "flex cursor-pointer items-start gap-3 rounded-md border border-foreground bg-foreground p-3.5 text-background transition-colors"
                  : "flex cursor-pointer items-start gap-3 rounded-md border p-3.5 transition-colors hover:bg-muted"
              }
            >
              <Icon className="mt-0.5 size-4 shrink-0" />
              <span className="flex flex-col items-start gap-0.5">
                <span className="text-sm font-semibold leading-tight">{label}</span>
                <span className="text-xs leading-tight opacity-70">{description}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
