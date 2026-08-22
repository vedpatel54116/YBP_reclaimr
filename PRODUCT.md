# ReclaimR — Product Definition

> **Reclaim your money.** See the waste. Stop the waste. Never overpay again.

ReclaimR is a personal finance app that links a user's bank and card accounts, detects
subscriptions and recurring bills, cancels what the user doesn't want, negotiates bills
down, automates savings, and alerts the user the moment a price increases or a free
trial converts to paid.

---

## 1. Product Vision

**Every month, people lose money they never chose to spend** — forgotten subscriptions,
silent price hikes, trials that quietly rolled into paid plans, and bills that were
never negotiated. The waste is invisible, and even when it's visible, fixing it takes
time, phone calls, and confrontation most people avoid.

ReclaimR exists to close that gap:

1. **Make the invisible visible.** Show users, in dollars, exactly what their recurring
   spending really costs — the number is always bigger than they think.
2. **Convert intent into action.** Knowing about waste isn't enough; ReclaimR does the
   cancelling and negotiating _for_ the user — the unpleasant work they keep meaning
   to do.
3. **Make saving effortless.** Small, automated transfers at moments the user can
   afford them, with overdraft protection built in.
4. **Never get ripped off silently again.** Real-time alerts for price increases and
   trial conversions, before the next charge lands.

**Long-term vision:** ReclaimR becomes the user's financial defense layer — the app
that watches every dollar leaving their accounts and fights to keep more of it in
their pocket.

---

## 2. Target Users

### Primary personas

| Persona                        | Profile                                                                                | Pain                                                                              | Hook                                            |
| ------------------------------ | -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ----------------------------------------------- |
| **The Subscription Collector** | 24–40, urban professional, 10+ subscriptions across streaming, software, fitness, news | Doesn't know the total; keeps meaning to cancel; got burned by a trial conversion | "$217/month in subscriptions detected"          |
| **The Household CFO**          | 30–50, manages family bills (utilities, internet, phone, insurance, kids' apps)        | Bills crept up year over year; hates negotiation phone calls                      | Concierge negotiates the internet bill and wins |
| **The Financial Reset**        | 25–45, paying down debt, rebuilding savings                                            | Feels out of control; needs a single view of money in/out                         | Dashboard + automated savings builds momentum   |

### Secondary personas

- **Freelancers / variable-income earners** — irregular cash flow makes bill timing and low-balance alerts especially valuable.
- **Young professionals linking their first accounts** — build the habit early; high lifetime value if retained.

### Anti-persona (explicitly out of scope for v1)

- Business/corporate expense management users.
- Active traders / investment research users.

---

## 3. Core Problems

| #   | Problem                                                                                                              | Why it persists                                            |
| --- | -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| P1  | **Subscription sprawl** — people guess they spend ~$20–40/month on subscriptions; the real number is typically $200+ | Charges are scattered across cards; memory doesn't scale   |
| P2  | **Zombie subscriptions** — services used once, forgotten, billing for years                                          | Cancellation flows are designed to be hard (dark patterns) |
| P3  | **Silent price increases** — a plan jumps $2–15/month with only a fine-print email                                   | Nobody diffs their own statements month over month         |
| P4  | **Trial conversions** — free trials convert to paid without a reminder                                               | Users forget the trial end date; no default alert          |
| P5  | **Bill overpayment** — loyalty is penalized; existing customers pay promo-expired rates                              | Negotiating requires time, patience, and confrontation     |
| P6  | **Saving requires willpower** — "save more" fails as a goal without automation                                       | Manual transfers lose to inertia                           |
| P7  | **Fragmented financial view** — money scattered across banks/cards/loans                                             | No single place shows what's coming in and going out       |

---

## 4. Core Value Proposition

> **ReclaimR finds money you're already losing — and gets it back for you.**

Positioned against two familiar alternatives:

- vs. _budgeting spreadsheets / willpower_: ReclaimR is automatic and **does the work for you**.
- vs. _doing nothing_: the average user's first scan surfaces hundreds of dollars a year
  in unwanted recurring charges.

The value loop:

```
Link accounts ──► Detect waste ──► Feel the pain ($ real numbers)
      ▲                                          │
      │                                          ▼
  Trust ───► See dollars saved ◄── ReclaimR acts (cancel / negotiate / auto-save)
                                                │
                                                ▼
                                    Premium upgrade + success fees
```

**Trust principles (brand promises):**

1. Detection and monitoring are **free forever** — seeing your waste never costs money.
2. Negotiation fees are charged **only on confirmed wins** — never upfront on projections.
3. Every concierge request shows a **live, event-by-event timeline** — no black box.
4. Bank connections are **read-only**; ReclaimR can never move money without explicit,
   separately-consed flows.

---

## 5. MVP Features

### 5.1 Free tier

| #   | Feature                             | Description                                                                                                                                                                                                                                    |
| --- | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1  | **Account linking**                 | Connect checking, savings, credit cards, and loans via an aggregation provider (read-only credentials, token-based; mock provider for demo). 10k+ institutions via aggregator.                                                                 |
| F2  | **Unified balances & transactions** | All linked accounts in one view; transactions auto-categorized into default categories; refresh cadence 1–4h.                                                                                                                                  |
| F3  | **Subscription detection engine**   | Merchant normalization → grouping → interval-band matching (weekly/biweekly/monthly/quarterly/annual ± tolerance) → amount-variance scoring → confidence score → next-charge prediction. This is the signature feature and the emotional hook. |
| F4  | **Recurring bill detection**        | Detects fixed and variable bills (utilities, telecom, insurance), due-day prediction, upcoming-bills timeline.                                                                                                                                 |
| F5  | **Alerts**                          | Upcoming-bill reminders, subscription **price-increase** flags, **trial-conversion** warnings, low-balance and large-purchase alerts. Push + in-app notification center.                                                                       |
| F6  | **Basic budgets**                   | One total budget + default category budgets (income, bills, utilities, general spending) + up to 2 custom categories.                                                                                                                          |
| F7  | **Bill negotiation requests**       | Anyone can request a negotiation; success fee applies on win only.                                                                                                                                                                             |
| F8  | **Cancellation requests**           | Detected for free; concierge execution is Premium (see monetization). Free users get guided self-serve instructions.                                                                                                                           |

### 5.2 Premium tier (gated in MVP)

| #   | Feature                                         | Description                                                                                                                                           |
| --- | ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| F9  | **Concierge cancellation**                      | ReclaimR submits and executes cancellation on the user's behalf; status timeline (submitted → in progress → cancelled), typically 2–10 business days. |
| F10 | **Savings goals + Smart-Save**                  | Named goals with progress; autopilot moves $5–50 into savings every 1–3 business days at affordable moments, with overdraft guard logic.              |
| F11 | **Unlimited budgets + transaction power tools** | Unlimited custom budgets; custom categories; rules (auto-rename/recategorize); splits; notes; manual transactions.                                    |

### 5.3 Platform (required to ship)

- Auth (email + password to start; MFA in V2), onboarding, and bank-link flow.
- Premium upgrade flow with 7-day free trial.
- Notification center + push/email delivery.
- Dashboard aggregating everything above.

---

## 6. V2 Features

| #     | Feature                                    | Description                                                                                                                                            |
| ----- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| V2-1  | **Net worth tracking**                     | Assets vs. liabilities across linked accounts + manually-added assets (home, vehicle) with historical trend line.                                      |
| V2-2  | **Credit score monitoring**                | Educational score with history, change alerts, and factor breakdown (grade + impact per factor).                                                       |
| V2-3  | **Overdraft & late-fee refund assistance** | Detect overdraft/late fees and file refund requests on the user's behalf.                                                                              |
| V2-4  | **Autopay & due-date management**          | Detect whether a bill is on autopay; bill-calendar view; "cancel autopay before cancelling service" safety check.                                      |
| V2-5  | **MFA + account sharing**                  | Multi-factor auth; share access with a partner/household member.                                                                                       |
| V2-6  | **CSV export & web widgets**               | Data portability; home-screen widgets.                                                                                                                 |
| V2-7  | **Referral marketplace**                   | Transparent, clearly-disclosed recommendations (savings accounts, cards, insurance shopping) — always labeled as sponsored, never disguised as advice. |
| V2-8  | **Household/combined view**                | Multiple members' linked accounts merged for the Household CFO.                                                                                        |
| V2-9  | **Chat with support/concierge**            | In-app messaging for concierge requests.                                                                                                               |
| V2-10 | **Cancellation dark-pattern assist**       | Provider-specific guided flows (exact buttons to press, retention-offer scripts, best phone numbers).                                                  |

---

## 7. User Roles

| Role                 | Who                       | Capabilities                                                                                                                                                  |
| -------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Member (Free)**    | End user                  | Link accounts, view transactions/balances, see detected subscriptions & bills, all alerts, basic budgets, request negotiation, self-serve cancellation guides |
| **Member (Premium)** | Paying end user           | Everything above + concierge cancellations, Smart-Save autopilot, unlimited budgets & power tools, net worth (V2)                                             |
| **Concierge Agent**  | Internal operations staff | Work cancellation/negotiation queues; update request status/timeline; record outcomes; must never see raw bank credentials                                    |
| **Finance Ops**      | Internal staff            | Merchant normalization rules, fee configuration (35–60% slider bounds), refund/dispute handling, provider playbooks                                           |
| **Admin**            | Internal staff            | User management, audit logs, feature flags, alert-template management                                                                                         |
| **Service (System)** | Background jobs           | Aggregation sync, detection runs, alert evaluation, autopilot transfer scheduling                                                                             |

---

## 8. Main User Journeys

### J1 — First-run: linking to "waste report" (the activation moment)

1. User signs up (email + password) → permission scoping explained in plain language.
2. Bank-link flow (aggregator modal; read-only emphasized).
3. ReclaimR pulls 6–12 months of history and runs detection.
4. **Dashboard reveals the number**: "$312/month in subscriptions — 4 you haven't used in 90 days."
5. User is shown potential actions (cancel, negotiate) → first premium upsell moment.

### J2 — Cancel an unwanted subscription (free detect → premium act)

1. Subscriptions screen shows detected items with cadence, amount, last/next charge, confidence.
2. User taps a zombie subscription → detail view with charge history.
3. **Free:** guided self-serve cancellation instructions.
   **Premium:** "Cancel it for me" → concierge request created → live timeline (submitted → in progress → cancelled) with push updates.
4. Outcome recorded; savings ledger updated; dashboard "reclaimed" counter increases.

### J3 — Negotiate a bill (pay only on success)

1. Bills screen flags negotiable providers (internet, phone, insurance, TV).
2. User selects a bill → projected savings estimate → chooses success-fee percentage on a **35–60% slider** (user picks; lower fee = keep more of year-one savings).
3. Concierge negotiates; timeline updates in app.
4. On confirmed win: one-time fee charged **only after provider confirmation**; savings ledger updated. On failure: user pays nothing.

### J4 — Price-increase alert → action

1. Detection engine flags same-merchant amount change (e.g., streaming plan $15.99 → $18.99).
2. Push alert: "Your [Service] price increased $3/month (+$36/yr)."
3. In-app options: cancel it for me / negotiate / accept & monitor.

### J5 — Trial-conversion alert → action

1. Engine identifies a new recurring charge pattern that started at $0 or promo price.
2. Alert N days before first real charge: "Your trial ends in 3 days — $22.99/month after."
3. One-tap: cancel before conversion (premium) or guided self-cancel (free).

### J6 — Save on autopilot

1. User creates a goal (name, icon, target).
2. Enables autopilot → engine studies balance, upcoming bills, income rhythm.
3. Micro-transfers ($5–50) every 1–3 business days, skipped when affordability is low (overdraft guard).
4. Progress bar + "safe to skip today" transparency; pause anytime.

### J7 — Upgrade to premium

1. User hits a premium gate (e.g., "Cancel it for me") or visits the premium screen.
2. Feature comparison table → **choose-your-price slider ($7–14/month)** anchored to detected savings ("is $9 fair for saving you $85/month?").
3. 7-day free trial with explicit conversion disclosure → payment method → premium active.

### J8 — Weekly habit loop (retention)

1. Push digest: upcoming bills this week, alerts, goal progress.
2. User opens dashboard → checks net worth / cash flow → resolves any new flags.
3. New detections (a new subscription appeared) restart J2/J4.

---

## 9. Monetization Model

### 9.1 Revenue streams

| Stream                           | Mechanic                                                                                                   | Notes                                                                                                                                  |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| **1. Premium subscription**      | Choose-your-price **$7–14/month**, 7-day free trial                                                        | The slider converts price-sensitive users and anchors to delivered value. Gating philosophy: free to _see_ waste, paid to _remove_ it. |
| **2. Negotiation success fees**  | **35–60% of first-year savings, user chooses the %**; charged **only after confirmed provider acceptance** | Key trust differentiator: never an upfront fee on projected savings. User keeps 100% of savings after year one.                        |
| **3. Referral commissions (V2)** | Sponsored placements (savings accounts, cards, insurance quotes)                                           | Always labeled; never affects detection results; suppressible in settings.                                                             |

### 9.2 What is free forever (trust charter)

- Account linking, balances, transactions
- Subscription & bill **detection** and monitoring
- All alerts (price increases, trial conversions, upcoming bills, low balance)
- Guided self-serve cancellation instructions
- One budget + default categories

### 9.3 Paywall gates (deliberate, transparent)

- Concierge cancellation → Premium
- Smart-Save autopilot & goals → Premium
- Unlimited budgets, custom categories, rules, splits → Premium
- Net worth, full credit report (V2) → Premium

### 9.4 Pricing psychology

- The choose-your-price slider frames payment as fairness against concrete detected savings.
- The 7-day trial requires explicit consent and easy cancellation (compliance-driven, see §13).

---

## 10. Key Metrics

### North star

**Dollars reclaimed per member per month** — total detected savings + negotiation wins + cancelled subscription run-rate + autopilot savings, per active member.

### Activation

- % of signups who link ≥1 account
- **Time-to-first-insight** (signup → first detected subscription list); target < 10 min
- % of new users with ≥1 detected subscription in first session

### Detection quality

- Precision / recall vs. labeled recurring charges (precision ≥ 97% before surfacing)
- % of recurring spend covered by detection
- False-positive rate on price-increase alerts

### Conversion & monetization

- Free → trial start rate; trial → paid conversion rate
- Distribution of chosen price points on the $7–14 slider
- Negotiation: request rate, **win rate**, average first-year savings per win, average chosen fee %
- Cancellation: request volume, success rate, median days-to-complete

### Engagement & retention

- DAU/WAU ratio; weekly habit-loop completion (J8)
- Alert → action conversion rate (alert leads to cancel/negotiate/upgrade)
- D30 / D90 / M6 retention; churn + win-back rate
- Autopilot adoption & % of goals funded on schedule

### Trust & quality

- NPS; complaint rate per 1,000 members; fee-dispute rate
- Median concierge-request latency; timeline-update freshness

### Unit economics

- CAC, LTV, LTV:CAC, payback period; gross margin per member (aggregation API costs vs. revenue)

---

## 11. Screens Required

| #   | Route (web/mobile)      | Screen                                                                                                                | Tier gate                 |
| --- | ----------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| S1  | /onboarding             | Welcome, value explanation, permission scoping                                                                        | —                         |
| S2  | /login, /signup         | Auth screens (+ MFA in V2)                                                                                            | —                         |
| S3  | /link                   | Bank & card linking flow (aggregator modal, read-only messaging)                                                      | —                         |
| S4  | /                       | **Dashboard**: cash-flow summary, upcoming bills timeline, subscription-spend card, alerts, goal progress             | Free                      |
| S5  | /accounts               | Accounts grouped by type (checking, savings, cards, loans, investments); link-new-account entry                       | Free                      |
| S6  | /transactions           | Search, filter, edit category/note; custom category gate                                                              | Free (+gates)             |
| S7  | /budgets                | Budget vs. actual progress; >2 custom budgets gate                                                                    | Free (+gates)             |
| S8  | /subscriptions          | Detected subscriptions list: amount, cadence, next charge, confidence, status                                         | Free detect               |
| S9  | /subscriptions/:id      | Subscription detail: charge history, price-change diff, self-serve guide / **Cancel-for-me** (premium), live timeline | Premium gate on concierge |
| S10 | /bills                  | Upcoming bills timeline, negotiable badges, autopay flags                                                             | Free                      |
| S11 | /bills/:id/negotiate    | Negotiation flow: projection, 35–60% fee slider, confirm, live status timeline                                        | Free request, fee on win  |
| S12 | /requests/:id           | Concierge request tracker (shared cancellation/negotiation timeline view)                                             | —                         |
| S13 | /goals                  | Goals list, progress, create goal, autopilot toggle & run log                                                         | Premium                   |
| S14 | /alerts                 | Notification center: filter by type, mark read, alert → action deep-links                                             | Free                      |
| S15 | /premium                | Feature comparison, choose-your-price slider, 7-day trial, manage/cancel subscription                                 | —                         |
| S16 | /settings               | Profile, notification preferences, linked institutions, security, data & privacy controls                             | Free                      |
| S17 | / (empty/error/loading) | Realistic empty states (no accounts, no detections), loading skeletons, error + retry states                          | —                         |
| V2  | /networth, /credit      | Net worth trend; score gauge, history, factor grades                                                                  | Premium                   |

**Every screen must ship with:** loading state, empty state, error state, and accessible
keyboard/focus behavior (per project design rules: strict monochrome, light/dark themes).

---

## 12. API Modules Required

### M1 — Auth & Identity

```
POST   /api/auth/signup          POST  /api/auth/login       POST /api/auth/logout
GET    /api/auth/me              (V2: POST /api/auth/mfa)
```

### M2 — Account Aggregation (provider adapter w/ mock fallback)

```
GET    /api/accounts             POST  /api/accounts/link     DELETE /api/accounts/:id
POST   /api/accounts/sync        # manual refresh trigger
Webhook: provider callbacks (item status, new transactions, errors)
```

### M3 — Transactions

```
GET    /api/transactions?accountId&from&to&category&q
PATCH  /api/transactions/:id     # category, note
(V2: splits, rules CRUD)
```

### M4 — Detection Engine (internal service + trigger endpoints)

```
POST   /api/subscriptions/detect       # run recurring-charge algorithm
# internals: merchant normalization, interval-band matching, variance scoring,
#            price-change diffing, trial-pattern detection, next-charge prediction
```

### M5 — Subscriptions

```
GET    /api/subscriptions        PATCH /api/subscriptions/:id  (status, ignore)
POST   /api/subscriptions/:id/cancel     # creates concierge request (premium)
```

### M6 — Cancellations (Concierge)

```
GET    /api/cancellations        GET   /api/cancellations/:id  # timeline events
PATCH  /api/cancellations/:id    # agent/ops status updates + timeline append
```

### M7 — Bills

```
GET    /api/bills                PATCH /api/bills/:id  (autopay, category)
POST   /api/bills/:id/negotiate  # { feePercent: 0.35–0.60 }
```

### M8 — Negotiations (Concierge)

```
GET    /api/negotiations         GET   /api/negotiations/:id  # timeline, outcome, fee
PATCH  /api/negotiations/:id     # agent/ops updates; on success computes fee
```

### M9 — Goals & Savings

```
GET|POST /api/goals              PATCH|DELETE /api/goals/:id
POST   /api/goals/:id/autopilot-run   # one affordability-scored transfer cycle
```

### M10 — Budgets

```
GET|POST|PATCH|DELETE /api/budgets
```

### M11 — Alerts & Notifications

```
GET    /api/notifications        POST  /api/notifications/:id/read
PATCH  /api/notifications/preferences    # per-channel toggles
```

### M12 — Premium & Billing

```
POST   /api/premium/upgrade      # { price: 7–14 } → starts trial, records intent
POST   /api/premium/cancel
GET    /api/premium/status       # tier, trial end, next renewal, chosen price
```

### M13 — Dashboard Aggregate

```
GET    /api/overview             # net positions, upcoming bills, spend cards,
                                 # active alerts, goal progress (single call)
```

### M14 — Admin & Ops (internal)

```
Queue management for concierge agents; merchant rules CRUD; fee config;
audit log; app-level feature flags.
```

### M15 — Analytics Events

```
POST   /api/events               # client telemetry (funnels, alert→action, gates hit)
```

**Cross-cutting:** request validation (strict schemas), auth middleware on every route,
rate limiting on auth/link endpoints, structured logging, idempotency keys on any
money-adjacent action (negotiation fee charges, autopilot transfers).

---

## 13. Compliance Considerations

| Area                                            | Requirement                                                   | ReclaimR approach                                                                                                                                                                                                                 |
| ----------------------------------------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Data security**                               | Bank-grade protection for financial data                      | Encryption in transit (TLS 1.2+) and at rest; SOC 2 Type II roadmap; secrets in environment variables; least-privilege internal access; no raw bank credentials ever stored (credentials go directly to the aggregation provider) |
| **Account aggregation**                         | Use a licensed aggregator; comply with provider ToS           | All bank access is read-only via token-based aggregator integration; write access only via explicit, separately-consed autopilot flows (V2, through a partner bank)                                                               |
| **Financial privacy (US: GLBA)**                | Safeguards for nonpublic personal information                 | Privacy notice at signup; data minimization; vendor due diligence; GLBA-compliant security program                                                                                                                                |
| **Consumer privacy (CCPA/CPRA, GDPR)**          | Rights to know, delete, opt out                               | In-app data controls: export, delete account/data; do-not-sell/share toggle for any future referrals; consent records                                                                                                             |
| **E-sign consent (ESIGN/UETA)**                 | Concierge acts on the user's behalf                           | Explicit, logged authorization per cancellation/negotiation request (what we'll do, what we won't do, revocable)                                                                                                                  |
| **Fee transparency (FTC truth-in-advertising)** | No misleading savings claims or hidden fees                   | Negotiation fee charged **only on confirmed success**; full fee math shown pre-request; no upfront charges on projections                                                                                                         |
| **Negative-option / trial rules (ROSCA)**       | Trial-to-paid conversions need clear disclosure + easy cancel | 7-day trial: explicit price, date, and cancel path shown at signup and in settings; cancel in ≤3 taps                                                                                                                             |
| **Payments (PCI DSS)**                          | Card data handling                                            | Delegated to a PCI-compliant payment service provider; no card data on ReclaimR servers                                                                                                                                           |
| **Money movement (Reg E / EFTA)**               | Electronic transfers, error resolution, overdraft claims      | Smart-Save transfers via partner bank/BaaS; Reg E disclosures; overdraft guard with no-fee skip logic; dispute process                                                                                                            |
| **Money transmission risk**                     | Moving funds between institutions can require licensing       | Transfers executed by chartered partner institutions; ReclaimR never holds user funds                                                                                                                                             |
| **Credit data (FCRA)**                          | Educational vs. regulated scores                              | V2 credit feature ships as **educational score only** with clear labeling; no FCRA-regulated furnishing or prescreening without a separate compliance track                                                                       |
| **Communications**                              | CAN-SPAM (email), TCPA (SMS/push marketing)                   | Transactional vs. marketing notification separation; opt-in records; unsubscribe honored everywhere                                                                                                                               |
| **Referrals/affiliate (V2)**                    | Material-connection disclosure                                | Every sponsored placement labeled; ranking of user's own detections never influenced by commercial relationships                                                                                                                  |
| **Accessibility**                               | WCAG 2.1 AA                                                   | High-contrast monochrome design, keyboard navigation, focus states, screen-reader labels — treated as a launch requirement, not a retrofit                                                                                        |

---

## Success definition (first 12 months)

- Median member sees ≥$50/month of detected reclaimable spend in their first session.
- ≥25% trial-to-paid conversion; ≥35% negotiation win rate with zero upfront-fee complaints at scale.
- D90 retention ≥ 40%; NPS ≥ 50.
- Every concierge request completes with a fully transparent timeline — trust is the moat.
