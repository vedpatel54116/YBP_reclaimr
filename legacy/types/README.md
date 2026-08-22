# @reclaimr/types

Shared TypeScript domain types and enums for ReclaimR. One import surface for
the API server, web client, and internal tooling:

```ts
import { Bill, CaseStatus, FrequencyType, NegotiationCase } from '@reclaimr/types';
```

## Usage

Build once, then depend on it from any package in the repo (file dependency
until a workspace root exists):

```jsonc
// server/package.json (or web/package.json)
{
  "dependencies": {
    "@reclaimr/types": "file:../packages/types"
  }
}
```

```sh
cd packages/types
npm install
npm run build   # emits ESM + .d.ts to dist/
```

Consumers should also enable `strict` in their tsconfig; these types assume it.

## What's inside

| File | Contents |
|---|---|
| `src/common.ts` | Primitives: date strings, currency, entity id aliases, `JSONValue` |
| `src/enums.ts` | All domain enums (see below) |
| `src/identity.ts` | `User`, `Session`, `AdminUser`, `ConsentRecord` |
| `src/financial.ts` | `FinancialInstitution`, `ConnectedAccount`, `Transaction`, `Merchant` |
| `src/recurring.ts` | `Subscription`, `Bill` |
| `src/cases.ts` | `CancellationCase`, `NegotiationCase`, `NegotiationOffer`, `CaseTimelineEvent`, `CaseNote`, `DocumentUpload` |
| `src/engagement.ts` | `Alert`, `Notification`, `PremiumSubscription`, `SavingsEvent` |
| `src/audit.ts` | `AuditLog`, `AuditChange` |

Core domain enums: `SubscriptionStatus`, `BillStatus`, `CaseStatus`,
`TransactionType`, `AlertType`, `NegotiationOfferStatus`, `CancellationMethod`,
`FrequencyType`. Supporting enums (account types, consent kinds, roles,
delivery/premium/document states, audit actions, ...) live in the same file.

## Conventions

- **Money** — integer cents, always (`amountCents: 1599` = $15.99). Transaction
  and balance amounts are **signed**: positive = money leaving the account,
  negative = money coming in. This matches the detection engine and seed data.
- **Dates** — timestamps are ISO-8601 strings (`ISODateString`); date-only
  values (posting dates, due dates) are calendar dates (`CalendarDateString`).
- **Nullability** — absent data is `null`, never `undefined`. `undefined` is
  reserved for "field not present in this payload shape".
- **Enum values are the wire format** — lowercase snake_case, stable, and used
  verbatim in API payloads and the JSON store.
- **Ids** — opaque prefixed strings (`usr_1`, `txn_42`). The alias types are
  structural (`string`) for ergonomics; tighten to branded types later if
  cross-id mixups ever bite.
- **Strictness** — compiled with `strict`, `exactOptionalPropertyTypes`,
  `noUncheckedIndexedAccess`, and friends; no `any` anywhere.
