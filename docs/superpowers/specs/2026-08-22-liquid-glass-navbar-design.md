# Liquid Glass Navbar — Design Spec

Date: 2026-08-22
Status: Approved (brainstorming)

## Goal

Restyle all ReclaimR navigation surfaces with the "liquid glass" material from the provided sample: floating glass pills/panels with SVG displacement refraction, chromatic channel splitting, frost tint, and layered inset highlights — while preserving the strict monochrome design system, accessibility, and current navigation behavior.

## Scope

In scope:

1. Marketing site header (`apps/web/src/components/site-header.tsx`) — used on `/` and `/design`.
2. Dashboard desktop sidebar (`apps/web/src/app/dashboard/layout.tsx` aside).
3. Dashboard mobile header + horizontal nav row (same layout file).

Out of scope: `SiteFooter`, page content, `SidebarNav` item styling/active states, auth pages, onboarding.

## Reference sample behavior

The sample achieves glass via `backdrop-filter: url(#glass-filter) saturate(1.2)` where the SVG filter:

1. Loads a base64 PNG displacement map (`feImage`).
2. Runs three `feDisplacementMap` passes (scales −20 / −24 / −28) splitting R, G, B channels via `feColorMatrix`.
3. Recombines channels with `feBlend mode="screen"`.
4. Applies `feGaussianBlur stdDeviation="3"`.

Surface styling: frost tint `hsl(0 0% 0% / 0.1)`, `border-radius: 9999px`, layered inset box-shadows (white highlights at 35%/15% + faint dark inner shadows).

## Design

### 1. Shared glass recipe (`@reclaimr/ui`)

New exports from `packages/ui`:

- `LiquidGlassFilter` — React component rendering the hidden SVG filter definition once, with static id `rr-glass`. Mounted once in `apps/web/src/app/layout.tsx` (root layout) so every page has exactly one definition and no id collisions. The base64 displacement map from the sample is embedded verbatim.
- `.liquid-glass` CSS class (added to `packages/ui/src/styles.css`):
  - `backdrop-filter: url(#rr-glass) saturate(var(--glass-saturation, 1.2))` (prefixed `-webkit-backdrop-filter` too).
  - Frost tint: `background: color-mix(in srgb, var(--background) 10%, transparent)` — theme-aware, grayscale-only.
  - Inset box-shadows from the sample, expressed with grayscale-compatible rgba whites/blacks that read correctly in both themes.
  - Fallback: `@supports not (backdrop-filter: url(#rr-glass)) { backdrop-filter: blur(20px) saturate(1.2); }` for Firefox and other non-supporting engines.
  - CSS variables `--glass-frost` (default 0.1) and `--glass-saturation` (default 1.2) for tuning.

### 2. Marketing header — split floating pills

`SiteHeader` becomes a `fixed inset-x-0 top-0 z-40` wrapper with `pointer-events-none`; each pill re-enables `pointer-events-auto`. All pills: `h-12`, `rounded-full`, `liquid-glass`, positioned with `top-3` and `px-3` viewport insets.

- Left pill: wordmark (existing classes).
- Center pill: the 4 nav links, `hidden md:flex` (unchanged behavior).
- Right pill: `ThemeToggle` + "Log in" (ghost) + "Get started" (primary); auth buttons remain `hidden sm:inline-flex`.

Mobile (< md): wordmark pill + actions pill only — identical to current behavior (no mobile menu exists today).

Consequences:

- Header no longer has `border-b` / opaque background.
- Landing sections already use `scroll-mt-20` for anchor targets — retained.
- Pages using `SiteHeader` need top padding so content isn't hidden under the fixed pills: add `pt-20` (or equivalent) to the page wrapper where the header previously occupied flow.

### 3. Dashboard desktop sidebar — floating glass panel

The `aside` becomes: `fixed inset-y-3 left-3 z-40 hidden w-60 flex-col rounded-3xl liquid-glass lg:flex` (pill radius is inappropriate for a tall panel; `rounded-3xl` keeps the capsule language). Inner structure unchanged: logo row, scrollable `SidebarNav`, premium CTA, user/theme row. `border-r` removed.

Body offset updates from `lg:pl-60` to `lg:pl-[17.5rem]` (240px panel + 12px left inset + 16px gap).

### 4. Dashboard mobile header — floating pills

The `lg:hidden` sticky header becomes two fixed glass pills (top insets `top-3`, `px-3`):

- Pill 1 (`h-14`): wordmark + `ThemeToggle`.
- Pill 2: horizontally scrollable `SidebarNav` row (`variant="horizontal"`) inside a `rounded-full liquid-glass` container.

Content below gains matching top padding (replacing the previous in-flow header height).

### 5. Accessibility & behavior (unchanged)

- Global `:focus-visible` ring applies to pills' interactive children.
- `aria-current` active states, alerts badge, keyboard navigation, `aria-label`s all preserved.
- Glass is purely material; no interaction model changes.
- `prefers-reduced-motion` already global; glass adds no animation.

### 6. Performance

- SVG displacement backdrop-filter is GPU-composited but non-trivial; applied only to nav surfaces (small areas), never over the dashboard's scrolling content region.
- Filter SVG rendered once per page (root layout), not per component.

## Files touched

- `packages/ui/src/styles.css` — `.liquid-glass` class + variables.
- `packages/ui/src/components/liquid-glass-filter.tsx` (new) + `packages/ui/src/index.ts` export.
- `apps/web/src/app/layout.tsx` — mount `LiquidGlassFilter`.
- `apps/web/src/components/site-header.tsx` — split pills rewrite.
- `apps/web/src/app/page.tsx`, `apps/web/src/app/design/page.tsx` — top padding for fixed header.
- `apps/web/src/app/dashboard/layout.tsx` — glass sidebar + mobile pills + offset adjustment.

## Verification

- `pnpm lint` / typecheck pass.
- Visual check in light + dark theme on `/`, `/design`, `/dashboard` (desktop + mobile widths).
- Firefox fallback check via `@supports` branch (or devtools emulation).
- Keyboard tab order and focus rings intact on all nav surfaces.
