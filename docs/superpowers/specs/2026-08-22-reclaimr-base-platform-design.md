# ReclaimR Base Platform Design

## Scope

Create the production-ready foundation for ReclaimR as a pnpm monorepo. The
first slice establishes the web app shell, shared contracts, API runtime,
database/cache/auth integration boundaries, and an accessible monochrome UI
primitive library. It does not implement bank aggregation, cancellation
providers, or bill negotiation workflows.

## Product Surface

The web app uses a familiar fintech dashboard posture without copying any
competitor branding, copy, or exact interface. Desktop uses a persistent
left navigation rail with Overview, Subscriptions, Savings, and Settings.
Mobile collapses navigation into a compact header and bottom navigation. The
initial Overview surface contains a recovery summary, financial metrics,
subscription table, and clear empty/loading/error/success states.

## Architecture

- `apps/web`: Next.js App Router with strict TypeScript, Tailwind CSS, server
  components by default, and small client islands for theme, modal, toast, and
  interactive controls.
- `apps/api`: Fastify application with route modules, Zod request validation,
  JWT auth utilities, Prisma client access, and Redis cache/session utilities.
- `packages/shared`: versioned domain types, API response contracts, Zod
  schemas, and constants shared by web and API.
- `packages/ui`: accessible presentational primitives and the shared Tailwind
  design tokens/styles consumed by the web app.
- PostgreSQL is the durable store through Prisma. Redis is an optional runtime
  dependency for cache and token/session invalidation, configured through
  environment variables rather than hard-coded credentials.

## Design System

All visual tokens are grayscale. Light theme is white canvas with near-black
ink; dark theme is black canvas with near-white ink. Neutral grays are used
for surfaces, borders, muted text, and disabled states. Body text uses Inter,
headings use Space Grotesk, and financial amounts use JetBrains Mono. Tokens
are exposed as CSS variables and mirrored into Tailwind semantic colors.

Focus indicators use a two-pixel high-contrast ring with an offset so keyboard
users can see the active control in either theme. Components must retain
semantic HTML, visible labels, keyboard operation, and appropriate ARIA only
where native semantics are insufficient.

## UI Primitives

`Button`, `Input`, `Card`, `Badge`, `Table`, `Modal`, `Toast`, `EmptyState`,
and `Skeleton` are reusable, typed components. Variants use semantic grayscale
tokens rather than raw color values. Modal and toast provide client-side
interaction boundaries while the rest remain safe for server rendering.

## Runtime Contracts

The API exposes a health endpoint and a validated subscription endpoint as the
first vertical slice. Auth is represented by JWT sign/verify helpers and a
Fastify request guard boundary, with secrets loaded from environment variables.
Prisma schema and Redis client modules are present and safe to initialize from
the API bootstrap; local development may run with those integrations disabled
until connection URLs are provided. Errors are returned in the shared
`ApiErrorResponse` shape.

## Verification

The scaffold is complete when workspace lint, typecheck, and production builds
pass; the API health route responds; the web app renders the dashboard shell;
theme switching changes the document theme without introducing non-grayscale
colors; and the component package exports all requested primitives.

## Explicit Non-Goals

- No competitor branding, logo, screenshots, or proprietary copy.
- No production bank credentials, payment processing, or real cancellation
  execution.
- No speculative domain models beyond the initial user and subscription
  foundation.
