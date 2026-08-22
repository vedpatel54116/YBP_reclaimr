# Rocket Money → ReclaimR: Full Product Analysis & Build Plan

---

# PART 1 — ROCKET MONEY, ANALYZED IN FULL

## 1.1 What Rocket Money is

Rocket Money (formerly **Truebill**) is a consumer personal-finance app whose core promise is:
**"Stop wasting money."** While Mint-class apps answer _"where did my money go?"_, Rocket Money
answers _"where is my money being wasted — and we'll fix it for you."_

- Founded 2015 as Truebill (Haroon, Yahya, and Idris Mokhtarzada) in Silver Spring, MD.
- Acquired by **Rocket Companies** (Quicken Loans / Rocket Mortgage parent) in December 2021
  in a deal reported at roughly **$1.275 billion**.
- Rebranded to Rocket Money in 2022. Claims **10M+ members**.
- Mobile-first (iOS/Android), with web access as a Premium perk.

## 1.2 The core product loop (the secret sauce)

Everything in Rocket Money serves one flywheel:

```
  Link accounts (Plaid)
        │
        ▼
  Aggregate transactions ──► auto-categorize ──► detect recurring charges
        │                                            │
        ▼                                            ▼
  Surface "waste" insights              ┌─────────────────────────┐
  ($312/mo in subscriptions!)           │  THE MONETIZATION MOMENT │
        │                               └─────────────────────────┘
        ▼                                            │
  User feels pain ──► asks app to FIX IT ───────────┤
        │                                           ▼
        │                        ┌─────────────────────────────────┐
        │                        │ Concierge does the unpleasant   │
        │                        │ work: cancel subscriptions,     │
        │                        │ negotiate bills down            │
        │                        └─────────────────────────────────┘
        ▼                                           │
  User sees real dollars saved ──► trusts app ──────┤
        │                                           ▼
        ▼                        Premium subscription, success fees,
  Deeper usage: budgets, goals,    referral revenue
  net worth, credit score
```

Two things make this machine work:

1. **Aggregation makes the waste visible.** Humans systematically underestimate
   subscription spend (studies show people guess ~$20-40/mo when the real number is
   often $200+/mo). Showing the true number creates the emotional hook.
2. **Concierge converts intent to action.** Everyone _means_ to cancel that gym
   membership. Rocket Money's differentiator is doing it _for_ you — a high-friction,
   high-anxiety task delegated to an app. That's worth paying for.

## 1.3 Feature-by-feature breakdown

### A. Account aggregation (Free)

- Connect 10,000+ institutions (checking, savings, credit cards, loans, investments)
  via **Plaid** — read-only credentials, bank-level 256-bit encryption.
- Unified balance view; refresh cadence ranges from ~1-4 hours to daily.
- Reddit's frequent complaint: Plaid Link asks for login credentials directly —
  standard for aggregation, but a trust hurdle for Mint refugees.

### B. Subscription detection & management (Free to detect, Premium to have them cancel)

- The signature feature. An algorithm "works its magic to find all of your recurring
  subscriptions and bills":
  - Scans linked transactions for recurring merchants
  - Detects cadence (weekly/biweekly/monthly/quarterly/annual), amount changes
    (price hikes get flagged!), and zombie subscriptions you forgot about
- Free tier: detection + monitoring + reminders.
- **Premium tier: the concierge cancels them for you** (typically 2-10 business days).
  This asymmetry — free to _see_ waste, paid to _remove_ waste — is the single most
  important monetization mechanic in the whole app.

### C. Bill negotiation / "Lower your bills" (Free to request; pay on success)

- A human-agent concierge negotiates with providers (internet, cable, cell phone,
  TV, satellite radio, etc.) to get better rates on your existing bills.
- Also handles: **bank overdraft / late-fee refund guidance**, and **car insurance
  shopping** (connect policy → see better options).
- Fee model: **35%–60% of first-year savings, user chooses the %** — charged only
  if the negotiation succeeds. You keep 100% of savings after year one.
  Example: $300/yr saved → $105 (35%) to $180 (60%) one-time fee.
  (Complaint on Reddit: the fee is charged _upfront_ based on projected annual savings.)

### D. Budgeting (Free basic, Premium unlimited)

- Automatic categorization of transactions into default categories.
- Free: one total budget + default category budgets (income, bills, utilities,
  general spending) + **max 2 custom category budgets**.
- Premium: unlimited budgets, plus transaction-level power tools — custom categories,
  rules (auto-rename/recategorize), splits, notes, manual transactions, CSV export.
- Design intent: the budget limit is a soft paywall that bites exactly when the user
  gets serious about the product.

### E. Smart Savings™ autopilot + Goals (Premium)

- "Turn on autopilot to save money without thinking about it."
- Algorithm studies checking balance + upcoming bills + spending rhythm, then moves
  small amounts ($5-$50) into a savings bucket **every 1-3 business days** at moments
  the user can afford it — with overdraft protection logic.
- Financial Goals: named targets (Emergency fund, Vacation…), progress bars,
  optional autopilot linkage. "Custom Savings" = manual recurring transfers.

### F. Net worth tracking (Premium)

- Assets vs liabilities across all linked accounts + manually-added assets
  (home value, car, etc.) with historical trend line.

### G. Credit score (Free score; Premium full report)

- VantageScore-style score with history, alerts on changes, factor breakdown.
- Doubles as a lead-gen funnel into Rocket's lending ecosystem (referral revenue).

### H. Alerts & insights (Free)

- Low-balance alerts, high credit-utilization alerts, large-purchase alerts,
  upcoming-bill reminders, subscription price-increase flags.

### I. Paycheck advance

- Not on the homepage feature set; Rocket's broader ecosystem offers wage-advance
  products. Out of scope for ReclaimR v1.

## 1.4 Pricing model (unusual — and worth copying)

|                                            | **Free**                       | **Premium ($7–14/mo, you pick the price)** |
| ------------------------------------------ | ------------------------------ | ------------------------------------------ |
| Link accounts / balances / alerts          | ✅                             | ✅                                         |
| Subscription **detection**                 | ✅                             | ✅                                         |
| Subscription **cancellation by concierge** | ❌                             | ✅ (2-10 days)                             |
| Bill negotiation access                    | ✅                             | ✅ (success fee applies)                   |
| Budgets                                    | 1 total + 4 default + 2 custom | Unlimited + rules/splits/notes             |
| Net worth tracking                         | ❌                             | ✅ (+ manual assets)                       |
| Smart Savings autopilot + Goals            | ❌                             | ✅                                         |
| Credit score / full report                 | Score only                     | Score + full report                        |
| Web access, widgets, account sharing       | ❌                             | ✅                                         |
| 7-day free trial                           | —                              | ✅                                         |

**"Pay what you think is fair" ($7–$14/mo):** a choose-your-own-price slider. Clever
psychology: it converts price-sensitive users who'd bail at a fixed $14, and the
framing ("what's fair for saving you $85/mo?") anchors to value.

## 1.5 Business model (4 revenue streams)

1. **Premium subscriptions** — $7-14/mo × members (the recurring base).
2. **Bill-negotiation success fees** — 35-60% of first-year savings, per win.
3. **Referral commissions** — financial product recommendations (cards, insurance,
   savings accounts) routed through partner funnels; credit-score funnel feeds
   Rocket Mortgage refis.
4. **Ecosystem leverage** — Rocket Companies bought Truebill to own the top of the
   funnel (the PFM app that sees your cash flow) and feed the bottom (loans,
   mortgage refis, card offers).

## 1.6 Under the hood (inferred architecture)

- **Aggregation:** Plaid (auth + transactions + balances + identity webhooks).
- **Classification pipeline:** merchant normalization (strip store #, card prefixes,
  noise) → canonical merchant entity table → rules + ML categorization →
  recurring-charge detection:
  - Group by normalized merchant (+/- amount bucket)
  - ≥3 repeat charges with interval regularity (7d, 14d, 28-31d, 90d, 365d bands)
  - Amount variance under threshold → confidence score
  - Flag **price changes** (same merchant, new amount level)
- **Concierge orchestration:** request queue → human/agent work → status timeline
  surfaced in-app (submitted → in review → negotiating → outcome).
- **Smart Savings engine:** cash-flow forecaster (upcoming bills, balance, income
  schedule) → affordability scoring → scheduled micro-transfers with overdraft guard.
- **Client:** React Native-style mobile app + web app; push notification infra.

## 1.7 Criticisms (what ReclaimR should do better)

- Upfront negotiation fee based on _projected_ savings feels like a gotcha →
  ReclaimR charges only on confirmed provider acceptance.
- Cancellation/negotiation requests can take days with little visibility →
  ReclaimR shows a live timeline with every event.
- Aggressive Premium upsells; free tier is deliberately lobotomized → ReclaimR
  keeps gating (it's the business model) but is transparent about what's free.
- Privacy concerns about credential-based aggregation → read-only, clear data policy.

---

# PART 2 — ReclaimR: BUILD PLAN

## 2.1 Product definition

**ReclaimR** = a full-stack personal finance app that mirrors Rocket Money's core
loop with the name and UX language of its own brand:

> **Reclaim your money.** Detect waste. Cancel it. Negotiate bills. Save on autopilot.

## 2.2 Tech stack (chosen for zero-friction local run)

| Layer       | Choice                                                                      | Why                                                 |
| ----------- | --------------------------------------------------------------------------- | --------------------------------------------------- |
| Frontend    | **React 18 + Vite + Tailwind CSS + Recharts + React Router + lucide-react** | Fast, modern, charts included                       |
| Backend     | **Node 22 + Express**                                                       | Simple REST API                                     |
| Persistence | **JSON file store** (swappable module)                                      | Zero native deps — runs anywhere; small data volume |
| Aggregation | **Plaid adapter with mock provider fallback**                               | Real integration shape; demo works with no API keys |
| Auth        | Demo token auth (single user)                                               | This is a product demo, not production              |

Runs with `npm install` + `npm run dev` in two folders. No env vars required.

## 2.3 Data model

```
users            { id, name, email, isPremium, premiumPrice, trialEndsAt }
accounts         { id, name, institution, type[checking|savings|credit_card|loan|mortgage|investment],
                   mask, balance, plaidItemId }
transactions     { id, accountId, date, merchant, rawDescription, amount(+out/-in),
                   category, note, isRecurring }
budgets          { id, category, monthlyLimit }
subscriptions    { id, merchant, amount, cadence, lastCharged, nextCharge,
                   confidence, status[active|cancel_requested|cancelled] }
bills            { id, merchant, amount, dueDay, category, negotiable, autopay }
negotiations     { id, billId, status[submitted|in_review|negotiating|success|failed],
                   feePercent, projectedAnnualSavings, feeAmount, timeline[] }
cancellations    { id, subscriptionId, status[submitted|in_progress|cancelled], timeline[] }
goals            { id, name, icon, targetAmount, savedAmount, mode[autopilot|custom],
                   frequency, transferAmount }
netWorth         { date, assets, liabilities }[] snapshots
credit           { score, history[], factors[{name, grade, impact}] }
notifications    { id, type, title, body, read, createdAt }
```

## 2.4 API surface

```
POST /api/auth/login          GET  /api/auth/me
GET  /api/overview            ← dashboard aggregate
GET  /api/accounts            POST /api/accounts/link (mock Plaid flow)
GET  /api/transactions        PATCH /api/transactions/:id
GET|POST|PATCH|DELETE /api/budgets
GET  /api/subscriptions       POST /api/subscriptions/detect (run algorithm)
POST /api/subscriptions/:id/cancel        GET /api/cancellations
GET  /api/bills               POST /api/bills/:id/negotiate {feePercent}
GET  /api/negotiations
GET|POST /api/goals           POST /api/goals/:id/autopilot-run
GET  /api/networth            GET  /api/credit
GET  /api/notifications       POST /api/notifications/:id/read
POST /api/premium/upgrade {price}   POST /api/premium/cancel
```

## 2.5 Pages (frontend)

| Route          | Page                                                                                                                  | Free/Premium gate                      |
| -------------- | --------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| /login         | Onboarding + mock bank-link (Plaid-style modal)                                                                       | —                                      |
| /              | **Dashboard**: net worth hero, cash-flow bar, upcoming bills timeline, subscription-spend card, alerts, goal progress | Free                                   |
| /accounts      | Accounts grouped by type, link-new-account modal                                                                      | Free                                   |
| /transactions  | Search/filter/edit categories; custom category = premium                                                              | Free (+gates)                          |
| /budgets       | Budget vs actual progress; >2 custom budgets = premium                                                                | Free (+gates)                          |
| /subscriptions | Detected recurring charges, total waste, cancel flow w/ live timeline                                                 | Free detect / Premium concierge cancel |
| /bills         | Upcoming bills timeline + negotiation flow with 35-60% fee slider + live status                                       | Free                                   |
| /goals         | Goals, progress, Smart-Save autopilot demo runs                                                                       | Premium                                |
| /networth      | Assets vs liabilities chart + breakdown                                                                               | Premium                                |
| /credit        | Score gauge, history, factor grades                                                                                   | Free                                   |
| /premium       | Choose-your-price ($7–$14) slider, 7-day trial, feature table                                                         | —                                      |
| /settings      | Profile, notification toggles, institutions                                                                           | Free                                   |

## 2.6 The two "wow" engineering pieces (built for real)

1. **Recurring-charge detection algorithm** (`server/lib/detect.js`) — runs on real
   seeded transaction history: merchant normalization → grouping → interval-band
   matching (7/14/28-31/90/365d ±tolerance) → amount-variance scoring → confidence
   score → next-charge prediction. Exactly the class of algorithm Rocket Money's
   "magic" actually is.
2. **Concierge simulation engine** — negotiation/cancellation requests advance
   through realistic status timelines server-side (submitted → in review →
   negotiating → outcome) so the UI can poll and show live progress. Negotiation
   outcomes compute savings (10-35% off) and the 35-60% success fee honestly.

## 2.7 Seed data (the demo world)

- 8 months of transactions across 8 accounts (checking, savings, 2 credit cards,
  student loan, mortgage, brokerage, 401k).
- ~12 real subscriptions hiding in the noise (Netflix, Spotify, iCloud, NYT, Adobe,
  Planet Fitness, SiriusXM, Chewy, Dollar Shave…), including one recent **price hike**
  to trigger the flag.
- Bills: electric, internet, Verizon, auto insurance (negotiable ones marked).
- 2 goals, 24 months of net-worth history, 15 months of credit history, alerts.

## 2.8 Milestones

1. ✅ Research Rocket Money
2. ✅ This plan
3. Backend: store, seed, detection, concierge, REST API
4. Frontend: shell + all 12 pages
5. Run & verify end-to-end
6. Browser visual check + README
