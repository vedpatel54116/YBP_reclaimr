import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";

/**
 * In-memory Prisma test double.
 *
 * Service-layer code (sync, detection, alerts) is mostly *reconciliation*
 * logic: read current state, diff it against a computed desired state, write
 * the delta. That logic is where the interesting bugs live, and it cannot be
 * exercised by the pure-function tests in @reclaimr/core because it needs a
 * database. Standing up Postgres would make `pnpm test` depend on Docker, so
 * instead this double implements the narrow slice of the Prisma delegate API
 * those services actually call.
 *
 * Deliberate limitations — this is a test double, not a Postgres emulator:
 * - Supported filter operators only: equality, `in`, `not`, `gt`, `gte`,
 *   `lt`, `lte`, and nested `is`/scalar-object equality. Anything else throws
 *   loudly rather than silently matching the wrong rows.
 * - `select` is ignored (the full row is returned). Returning a superset is
 *   safe because callers only read the fields they asked for.
 * - `include` is supported only for the relations the services traverse.
 * - No referential integrity, no cascades, no isolation levels.
 *
 * It throws on anything it does not understand, so a service that starts
 * using a new operator fails the test rather than passing against wrong
 * semantics.
 */

// ─── Row plumbing ───────────────────────────────────────────────────────────

type Row = Record<string, unknown>;
type Where = Record<string, unknown>;

const OPERATORS = new Set([
  "in",
  "notIn",
  "not",
  "gt",
  "gte",
  "lt",
  "lte",
  "equals",
  "contains",
  "startsWith",
  "endsWith",
  "has",
  "mode",
]);

/** Logical combinators supported by `matches`. */
const COMBINATORS = new Set(["OR", "AND", "NOT"]);

function compare(a: unknown, b: unknown): number {
  const left = a instanceof Date ? a.getTime() : a;
  const right = b instanceof Date ? b.getTime() : b;
  if (typeof left === "number" && typeof right === "number") return left - right;
  if (typeof left === "string" && typeof right === "string") {
    return left < right ? -1 : left > right ? 1 : 0;
  }
  throw new Error(`fake-prisma: cannot compare ${String(a)} and ${String(b)}`);
}

function equals(a: unknown, b: unknown): boolean {
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  if (a instanceof Date && typeof b === "string") return a.toISOString() === b;
  return a === b;
}

/** Evaluate one field constraint, which is either a literal or an operator object. */
function matchesField(value: unknown, constraint: unknown): boolean {
  if (constraint === null) return value === null || value === undefined;
  if (constraint instanceof Date || typeof constraint !== "object") {
    return equals(value, constraint);
  }

  const spec = constraint as Record<string, unknown>;
  const keys = Object.keys(spec);
  const unknownKey = keys.find((key) => !OPERATORS.has(key));
  if (unknownKey) {
    throw new Error(`fake-prisma: unsupported filter operator "${unknownKey}"`);
  }

  // `mode: "insensitive"` is a modifier on the sibling string operators, not a
  // constraint of its own.
  const insensitive = spec.mode === "insensitive";
  const fold = (value: unknown): unknown =>
    insensitive && typeof value === "string" ? value.toLowerCase() : value;

  for (const [operator, operand] of Object.entries(spec)) {
    switch (operator) {
      case "mode":
        break;
      case "equals":
        if (!equals(fold(value), fold(operand))) return false;
        break;
      case "in":
        if (!(operand as unknown[]).some((candidate) => equals(value, candidate))) return false;
        break;
      case "notIn":
        if ((operand as unknown[]).some((candidate) => equals(value, candidate))) return false;
        break;
      case "not":
        if (matchesField(value, operand)) return false;
        break;
      case "gt":
        if (value === null || compare(value, operand) <= 0) return false;
        break;
      case "gte":
        if (value === null || compare(value, operand) < 0) return false;
        break;
      case "lt":
        if (value === null || compare(value, operand) >= 0) return false;
        break;
      case "lte":
        if (value === null || compare(value, operand) > 0) return false;
        break;
      case "contains": {
        const haystack = fold(value);
        if (typeof haystack !== "string") return false;
        if (!haystack.includes(String(fold(operand)))) return false;
        break;
      }
      case "startsWith": {
        const haystack = fold(value);
        if (typeof haystack !== "string") return false;
        if (!haystack.startsWith(String(fold(operand)))) return false;
        break;
      }
      case "endsWith": {
        const haystack = fold(value);
        if (typeof haystack !== "string") return false;
        if (!haystack.endsWith(String(fold(operand)))) return false;
        break;
      }
      // Scalar-list membership, e.g. `aliases: { has: "netflix" }`.
      case "has":
        if (!Array.isArray(value) || !value.some((entry) => equals(entry, operand))) return false;
        break;
    }
  }
  return true;
}

function matches(row: Row, where: Where | undefined): boolean {
  if (!where) return true;

  return Object.entries(where).every(([field, constraint]) => {
    if (!COMBINATORS.has(field)) return matchesField(row[field], constraint);

    // Prisma accepts either a single filter or an array for each combinator.
    const clauses = (Array.isArray(constraint) ? constraint : [constraint]) as Where[];
    switch (field) {
      case "OR":
        return clauses.some((clause) => matches(row, clause));
      case "AND":
        return clauses.every((clause) => matches(row, clause));
      default:
        return !clauses.some((clause) => matches(row, clause));
    }
  });
}

/**
 * Flatten a compound-unique `where` (e.g.
 * `{ plaidItemId_externalAccountId: { plaidItemId, externalAccountId } }`)
 * into a plain field filter.
 */
function flattenWhere(where: Where, compoundKeys: readonly string[]): Where {
  const flat: Where = {};
  for (const [field, constraint] of Object.entries(where)) {
    if (compoundKeys.includes(field) && constraint && typeof constraint === "object") {
      Object.assign(flat, constraint as Row);
    } else {
      flat[field] = constraint;
    }
  }
  return flat;
}

interface ModelSpec {
  /** Column defaults applied on create, mirroring the Prisma schema. */
  defaults?: Row;
  /** Compound-unique argument names, e.g. `plaidItemId_externalAccountId`. */
  compoundKeys?: readonly string[];
  /** Relation name → how to resolve it for `include`. */
  relations?: Record<string, (row: Row, store: Store) => unknown>;
  /**
   * Relation name → the related rows, used to compute `_count`. Separate from
   * `relations` because a countable relation is always a list, while an
   * includable one may be a single row.
   */
  counts?: Record<string, (row: Row, store: Store) => Row[]>;
  /**
   * Unique constraints, as field-name tuples. Enforced on create and upsert by
   * throwing a P2002-shaped error, because the exactly-once guarantees in the
   * savings ledger and the webhook handler are implemented by *relying* on that
   * failure — a double that silently accepted duplicates would let those tests
   * pass while production double-counted.
   *
   * Follows Postgres NULL semantics: a row with a NULL in any constrained column
   * never conflicts.
   */
  uniques?: readonly (readonly string[])[];
}

/** Mirrors Prisma's unique-constraint error closely enough for `catch` blocks. */
class FakeUniqueViolation extends Error {
  readonly code = "P2002";

  constructor(
    model: string,
    readonly fields: readonly string[],
  ) {
    super(`fake-prisma: unique constraint failed on ${model}(${fields.join(", ")})`);
    this.name = "PrismaClientKnownRequestError";
  }
}

// ─── Delegate ───────────────────────────────────────────────────────────────

interface FindArgs {
  where?: Where;
  orderBy?: Record<string, "asc" | "desc"> | Array<Record<string, "asc" | "desc">>;
  include?: Record<string, unknown>;
  select?: Record<string, unknown>;
  take?: number;
  skip?: number;
}

class Delegate {
  readonly rows: Row[] = [];

  constructor(
    private readonly name: string,
    private readonly spec: ModelSpec,
    private readonly store: Store,
  ) {}

  private compound(): readonly string[] {
    return this.spec.compoundKeys ?? [];
  }

  private hydrate(row: Row, args: FindArgs = {}): Row {
    const result: Row = { ...row };

    for (const [relation, selector] of Object.entries(args.include ?? {})) {
      if (!selector || relation === "_count") continue;
      const resolve = this.spec.relations?.[relation];
      if (!resolve) {
        throw new Error(`fake-prisma: ${this.name} has no include support for "${relation}"`);
      }
      result[relation] = resolve(row, this.store);
    }

    // `_count` may arrive under either `include` or `select`.
    const countSpec = args.include?._count ?? args.select?._count;
    if (countSpec) result._count = this.countRelations(row, countSpec);

    return result;
  }

  private countRelations(row: Row, spec: unknown): Row {
    const select = (spec as { select?: Record<string, unknown> }).select ?? {};
    const counts: Row = {};

    for (const [relation, arg] of Object.entries(select)) {
      if (!arg) continue;
      const resolve = this.spec.counts?.[relation];
      if (!resolve) {
        throw new Error(`fake-prisma: ${this.name} has no _count support for "${relation}"`);
      }
      // A counted relation may carry its own filter, e.g. only open cases.
      const related = resolve(row, this.store);
      const where = (arg as { where?: Where }).where;
      counts[relation] = where
        ? related.filter((candidate) => matches(candidate, where)).length
        : related.length;
    }
    return counts;
  }

  private sorted(rows: Row[], orderBy: FindArgs["orderBy"]): Row[] {
    if (!orderBy) return rows;
    const clauses = Array.isArray(orderBy) ? orderBy : [orderBy];
    return [...rows].sort((a, b) => {
      for (const clause of clauses) {
        for (const [field, direction] of Object.entries(clause)) {
          const delta = compare(a[field] ?? 0, b[field] ?? 0);
          if (delta !== 0) return direction === "desc" ? -delta : delta;
        }
      }
      return 0;
    });
  }

  private select(args: FindArgs = {}): Row[] {
    const filtered = this.rows.filter((row) =>
      matches(row, args.where ? flattenWhere(args.where, this.compound()) : undefined),
    );
    const ordered = this.sorted(filtered, args.orderBy);
    const skipped = args.skip ? ordered.slice(args.skip) : ordered;
    return args.take === undefined ? skipped : skipped.slice(0, args.take);
  }

  async findMany(args: FindArgs = {}): Promise<Row[]> {
    return this.select(args).map((row) => this.hydrate(row, args));
  }

  async findFirst(args: FindArgs = {}): Promise<Row | null> {
    const [first] = this.select(args);
    return first ? this.hydrate(first, args) : null;
  }

  async findUnique(args: FindArgs): Promise<Row | null> {
    return this.findFirst(args);
  }

  async findUniqueOrThrow(args: FindArgs): Promise<Row> {
    const found = await this.findFirst(args);
    if (!found) throw new Error(`fake-prisma: no ${this.name} row matched findUniqueOrThrow`);
    return found;
  }

  async findFirstOrThrow(args: FindArgs = {}): Promise<Row> {
    const found = await this.findFirst(args);
    if (!found) throw new Error(`fake-prisma: no ${this.name} row matched findFirstOrThrow`);
    return found;
  }

  async count(args: FindArgs = {}): Promise<number> {
    return this.select(args).length;
  }

  /**
   * Reject a row that would duplicate a unique constraint. Postgres treats NULLs
   * as distinct, so a constraint containing a NULL never conflicts — the savings
   * ledger depends on exactly that, since manual adjustments carry a null
   * `sourceId` and must remain unconstrained.
   */
  private assertUnique(candidate: Row, ignore?: Row): void {
    for (const fields of this.spec.uniques ?? []) {
      if (fields.some((field) => candidate[field] === null || candidate[field] === undefined)) {
        continue;
      }
      const clash = this.rows.find(
        (row) => row !== ignore && fields.every((field) => equals(row[field], candidate[field])),
      );
      if (clash) throw new FakeUniqueViolation(this.name, fields);
    }
  }

  async create(args: { data: Row; include?: Record<string, unknown> }): Promise<Row> {
    const now = new Date();
    const row: Row = {
      id: randomUUID(),
      createdAt: now,
      updatedAt: now,
      ...this.spec.defaults,
      ...args.data,
    };
    this.assertUnique(row);
    this.rows.push(row);
    return this.hydrate(row, { include: args.include });
  }

  async createMany(args: { data: Row[] }): Promise<{ count: number }> {
    for (const data of args.data) await this.create({ data });
    return { count: args.data.length };
  }

  async update(args: { where: Where; data: Row; include?: Record<string, unknown> }): Promise<Row> {
    const target = this.rows.find((row) => matches(row, flattenWhere(args.where, this.compound())));
    if (!target) {
      // Mirrors Prisma's P2025: services rely on `.catch(() => null)` here.
      throw new Error(`fake-prisma: no ${this.name} row matched update`);
    }
    this.assertUnique({ ...target, ...args.data }, target);
    Object.assign(target, args.data, { updatedAt: new Date() });
    return this.hydrate(target, { include: args.include });
  }

  async updateMany(args: { where?: Where; data: Row }): Promise<{ count: number }> {
    const targets = this.select({ where: args.where });
    for (const target of targets) Object.assign(target, args.data, { updatedAt: new Date() });
    return { count: targets.length };
  }

  async upsert(args: { where: Where; create: Row; update: Row }): Promise<Row> {
    const existing = this.rows.find((row) =>
      matches(row, flattenWhere(args.where, this.compound())),
    );
    if (existing) {
      Object.assign(existing, args.update, { updatedAt: new Date() });
      return { ...existing };
    }
    // Prisma applies the unique selector to the created row.
    return this.create({ data: { ...flattenWhere(args.where, this.compound()), ...args.create } });
  }

  async delete(args: { where: Where }): Promise<Row> {
    const flat = flattenWhere(args.where, this.compound());
    const index = this.rows.findIndex((row) => matches(row, flat));
    if (index === -1) throw new Error(`fake-prisma: no ${this.name} row matched delete`);
    const [removed] = this.rows.splice(index, 1);
    return { ...(removed as Row) };
  }

  async deleteMany(args: { where?: Where } = {}): Promise<{ count: number }> {
    const doomed = new Set(this.select({ where: args.where }));
    let count = 0;
    for (let i = this.rows.length - 1; i >= 0; i--) {
      const row = this.rows[i];
      if (row && doomed.has(row)) {
        this.rows.splice(i, 1);
        count += 1;
      }
    }
    return { count };
  }

  async aggregate(args: { where?: Where; _sum?: Record<string, boolean> }): Promise<Row> {
    const rows = this.select({ where: args.where });
    return { _sum: sumFields(rows, args._sum) };
  }

  async groupBy(args: {
    by: string[];
    where?: Where;
    _sum?: Record<string, boolean>;
  }): Promise<Row[]> {
    const rows = this.select({ where: args.where });
    const groups = new Map<string, Row[]>();
    for (const row of rows) {
      const key = JSON.stringify(args.by.map((field) => row[field]));
      const bucket = groups.get(key);
      if (bucket) bucket.push(row);
      else groups.set(key, [row]);
    }
    return [...groups.values()].map((bucket) => {
      const group: Row = {};
      for (const field of args.by) group[field] = bucket[0]?.[field];
      group._sum = sumFields(bucket, args._sum);
      return group;
    });
  }
}

/** Prisma returns null (not 0) for a sum over zero rows. */
function sumFields(rows: readonly Row[], spec: Record<string, boolean> | undefined): Row {
  const sums: Row = {};
  for (const field of Object.keys(spec ?? {})) {
    sums[field] =
      rows.length === 0 ? null : rows.reduce((total, row) => total + Number(row[field] ?? 0), 0);
  }
  return sums;
}

// ─── Store ──────────────────────────────────────────────────────────────────

const MODELS: Record<ModelName, ModelSpec> = {
  user: {
    uniques: [["email"]],
    relations: {
      premium: (row, store) =>
        store.premiumSubscription.rows.find((premium) => premium.userId === row.id) ?? null,
    },
    counts: {
      subscriptions: (row, store) => store.subscription.rows.filter((sub) => sub.userId === row.id),
      cancellationCases: (row, store) =>
        store.cancellationCase.rows.filter((item) => item.userId === row.id),
      negotiationCases: (row, store) =>
        store.negotiationCase.rows.filter((item) => item.userId === row.id),
    },
  },
  merchant: {
    defaults: {
      category: "other",
      isSubscriptionProvider: false,
      negotiable: false,
      aliases: [],
    },
    uniques: [["normalizedKey"]],
  },
  plaidItem: {
    defaults: { status: "connected", syncCursor: null, lastSyncedAt: null, lastSyncError: null },
    relations: {
      accounts: (row, store) =>
        store.connectedAccount.rows.filter((account) => account.plaidItemId === row.id),
    },
  },
  connectedAccount: {
    defaults: { status: "connected", currency: "USD", balanceCents: null, lastSyncedAt: null },
    compoundKeys: ["plaidItemId_externalAccountId"],
  },
  transaction: {
    defaults: { category: "other", isRecurring: false, isPending: false, note: null },
    relations: {
      merchant: (row, store) =>
        store.merchant.rows.find((merchant) => merchant.id === row.merchantId) ?? null,
    },
  },
  subscription: {
    defaults: {
      status: "active",
      currency: "USD",
      source: "manual",
      confidence: null,
      firstDetectedAt: null,
      lastChargedAt: null,
      priceChangedAt: null,
      canceledAt: null,
    },
    relations: {
      merchant: (row, store) =>
        store.merchant.rows.find((merchant) => merchant.id === row.merchantId) ?? null,
    },
  },
  bill: {
    defaults: {
      category: "utilities",
      cadence: "monthly",
      autopay: false,
      negotiable: false,
      isActive: true,
      confidence: null,
      expectedAmountCents: null,
      lastAmountCents: null,
    },
    counts: {
      negotiationCases: (row, store) =>
        store.negotiationCase.rows.filter((item) => item.billId === row.id),
    },
  },
  cancellationCase: {
    defaults: {
      status: "submitted",
      reason: null,
      timeline: [],
      resolvedAt: null,
      outcomeNote: null,
    },
    relations: {
      subscription: (row, store) =>
        store.subscription.rows.find((sub) => sub.id === row.subscriptionId) ?? null,
    },
  },
  negotiationCase: {
    defaults: {
      status: "submitted",
      projectedAnnualSavingsCents: null,
      offeredAnnualSavingsCents: null,
      offerNote: null,
      offeredAt: null,
      offerRespondedAt: null,
      confirmedAnnualSavingsCents: null,
      feeAmountCents: null,
      timeline: [],
      resolvedAt: null,
      outcomeNote: null,
    },
    relations: {
      bill: (row, store) => store.bill.rows.find((bill) => bill.id === row.billId) ?? null,
      documents: (row, store) =>
        store.negotiationDocument.rows.filter((doc) => doc.negotiationCaseId === row.id),
    },
    counts: {
      documents: (row, store) =>
        store.negotiationDocument.rows.filter((doc) => doc.negotiationCaseId === row.id),
    },
  },
  negotiationDocument: { uniques: [["storageKey"]] },
  premiumSubscription: {
    defaults: {
      status: "trialing",
      interval: "monthly",
      currentPeriodStart: null,
      currentPeriodEnd: null,
      trialEndsAt: null,
      cancelAtPeriodEnd: false,
      externalCustomerId: null,
      externalSubscriptionId: null,
    },
    uniques: [["userId"], ["externalSubscriptionId"]],
  },
  // The primary key is the provider's event id, which is exactly what makes
  // webhook handling idempotent.
  stripeEvent: { uniques: [["id"]] },
  adminUser: {
    defaults: { role: "agent", isActive: true, mfaSecret: null, lastLoginAt: null },
    uniques: [["email"]],
  },
  alert: { defaults: { severity: "info", data: null, readAt: null } },
  savingsEvent: {
    defaults: { sourceType: null, sourceId: null },
    uniques: [["sourceType", "sourceId"]],
  },
  auditLog: {},
  alternativeOption: {
    defaults: { highlights: [], tradeoffs: [], replaces: [], isActive: true },
  },
  aiSuggestion: {
    defaults: { summary: null },
    compoundKeys: ["kind_subjectId"],
  },
};

/** Models the double knows about. Declared explicitly so `Store` stays acyclic. */
type ModelName =
  | "user"
  | "merchant"
  | "plaidItem"
  | "connectedAccount"
  | "transaction"
  | "subscription"
  | "bill"
  | "cancellationCase"
  | "negotiationCase"
  | "negotiationDocument"
  | "premiumSubscription"
  | "stripeEvent"
  | "adminUser"
  | "alert"
  | "savingsEvent"
  | "auditLog"
  | "alternativeOption"
  | "aiSuggestion";

const MODEL_NAMES = Object.keys(MODELS) as ModelName[];

type Store = { [K in ModelName]: Delegate };

export type FakePrisma = Store & {
  /** Cast to the real client for injecting into services. */
  asPrisma(): PrismaClient;
  reset(): void;
};

/**
 * Build an empty in-memory database. Seed it by calling the delegates
 * directly, e.g. `db.transaction.create({ data: { ... } })`.
 */
export function createFakePrisma(): FakePrisma {
  const store = {} as Store;
  for (const name of MODEL_NAMES) {
    store[name] = new Delegate(name, MODELS[name], store);
  }

  const client = store as FakePrisma;
  client.asPrisma = () => client as unknown as PrismaClient;
  client.reset = () => {
    for (const name of MODEL_NAMES) store[name].rows.length = 0;
  };
  /**
   * `prisma.$transaction` in both forms.
   *
   * The array form is used by paginated reads; awaiting the handed-in promises is
   * equivalent here. The callback form is used where a case resolution and its
   * savings-ledger entry must land together — the double hands the same store
   * back as the "transaction client", so those writes are exercised even though
   * nothing is actually isolated or rolled back.
   *
   * The limitation is worth stating: a test cannot assert rollback behaviour with
   * this double. It verifies that the writes happen through one path, not that
   * they are atomic.
   */
  (client as unknown as Record<string, unknown>).$transaction = (
    operations: Array<Promise<unknown>> | ((tx: unknown) => Promise<unknown>),
  ) => (typeof operations === "function" ? operations(client) : Promise.all(operations));

  return client;
}
