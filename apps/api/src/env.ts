import { z } from "zod";

/**
 * Environment contract, validated once at startup (fail fast). Parsed lazily
 * via `env()` so env files can be loaded before the first access.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_PORT: z.coerce.number().int().min(1).max(65536).default(3001),
  /** Comma-separated allowed origins; empty string allows all (dev only). */
  CORS_ORIGIN: z.string().default(""),
  /** PostgreSQL connection string (docker-compose provides a default). */
  DATABASE_URL: z.string().min(1),
  /** Optional; without it the API runs with in-memory rate limiting. */
  REDIS_URL: z.string().optional(),
  /** HS256 signing secret for access tokens. Generate with `openssl rand -base64 32`. */
  JWT_ACCESS_SECRET: z.string().min(32, "must be at least 32 characters"),
  JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().min(60).default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).default(30),

  // ── Plaid ────────────────────────────────────────────────────────────────
  /** Plaid environment; sandbox works with the free developer keys. */
  PLAID_ENV: z.enum(["sandbox", "development", "production"]).default("sandbox"),
  /** Both must be set to use the real Plaid adapter; otherwise the
   *  deterministic mock adapter is used (local dev + tests, no keys needed). */
  PLAID_CLIENT_ID: z.string().optional(),
  PLAID_SECRET: z.string().optional(),

  /** AES key material for encrypting aggregator access tokens at rest.
   *  Falls back to the JWT secret in development (never in production). */
  BANK_TOKEN_ENCRYPTION_KEY: z.string().min(16).optional(),

  // ── Staff realm ──────────────────────────────────────────────────────────
  /** HS256 secret for admin access tokens. MUST differ from the member secret
   *  so a stolen member token can never be replayed as a staff token, and so
   *  rotating one realm's key does not sign the other out. */
  JWT_ADMIN_SECRET: z.string().min(32, "must be at least 32 characters").optional(),
  /** Admin sessions are short by design; staff re-authenticate often. */
  JWT_ADMIN_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(900),
  /** When true, staff accounts without TOTP enrolled cannot log in.
   *  Forced on in production regardless of this value. */
  ADMIN_MFA_REQUIRED: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),

  // ── Stripe ───────────────────────────────────────────────────────────────
  /** Both must be set to bill for real; otherwise the deterministic mock
   *  billing adapter is used (local dev + tests, no keys, no network). */
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  /** Where Stripe Checkout returns the member. */
  STRIPE_SUCCESS_URL: z.string().url().default("http://localhost:3000/settings/premium?status=ok"),
  STRIPE_CANCEL_URL: z
    .string()
    .url()
    .default("http://localhost:3000/settings/premium?status=canceled"),

  // ── Statement storage ────────────────────────────────────────────────────
  /** Directory for uploaded negotiation statements. Must be a durable volume
   *  in production (or swap in an object-storage adapter). */
  STATEMENT_STORAGE_DIR: z.string().default("./.data/statements"),

  // ── LLM ─────────────────────────────────────────────────────────────────
  /** Leave unset to use the deterministic mock adapter (no network). */
  LLM_API_KEY: z.string().optional(),
  /** Any OpenAI-compatible chat-completions base URL. */
  LLM_BASE_URL: z.string().url().default("https://api.openai.com/v1"),
  LLM_MODEL: z.string().default("gpt-4o-mini"),
  LLM_TIMEOUT_MS: z.coerce.number().int().min(1000).default(30000),
});

/**
 * Cross-field rules that only bite in production. Keeping them out of the
 * field definitions means local dev needs no billing or staff configuration at
 * all, while a production boot cannot come up half-configured — a live Stripe
 * key with no webhook secret would accept payments and then silently fail to
 * grant premium.
 */
const envRefinements = envSchema.superRefine((config, ctx) => {
  if (config.NODE_ENV !== "production") return;

  if (config.STRIPE_SECRET_KEY && !config.STRIPE_WEBHOOK_SECRET) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["STRIPE_WEBHOOK_SECRET"],
      message: "is required when STRIPE_SECRET_KEY is set (webhooks grant premium access)",
    });
  }
  if (!config.JWT_ADMIN_SECRET) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["JWT_ADMIN_SECRET"],
      message: "is required in production",
    });
  }
  if (!config.BANK_TOKEN_ENCRYPTION_KEY) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["BANK_TOKEN_ENCRYPTION_KEY"],
      message: "is required in production",
    });
  }
});

/** True when real Stripe credentials are configured. */
export function stripeEnabled(config: Env): boolean {
  return Boolean(config.STRIPE_SECRET_KEY);
}

/** Resolved secret for signing staff tokens. */
export function adminTokenSecret(config: Env): string {
  if (config.JWT_ADMIN_SECRET) return config.JWT_ADMIN_SECRET;
  if (config.NODE_ENV === "production") {
    throw new Error("JWT_ADMIN_SECRET is required in production");
  }
  // Development fallback: derive a distinct secret from the member key so the
  // two realms still cannot forge each other's tokens.
  return `admin:${config.JWT_ACCESS_SECRET}`;
}

/** MFA is optional locally, mandatory in production. */
export function adminMfaRequired(config: Env): boolean {
  return config.NODE_ENV === "production" || config.ADMIN_MFA_REQUIRED;
}

/** True when real Plaid credentials are configured. */
export function plaidEnabled(config: Env): boolean {
  return Boolean(config.PLAID_CLIENT_ID && config.PLAID_SECRET);
}

/** True when a real LLM API key is configured; otherwise the mock adapter is used. */
export function llmEnabled(config: Env): boolean {
  return Boolean(config.LLM_API_KEY);
}

/** Resolved key for bank-token encryption (explicit key or derived fallback). */
export function bankTokenKey(config: Env): string {
  if (config.BANK_TOKEN_ENCRYPTION_KEY) return config.BANK_TOKEN_ENCRYPTION_KEY;
  if (config.NODE_ENV === "production") {
    throw new Error("BANK_TOKEN_ENCRYPTION_KEY is required in production");
  }
  return config.JWT_ACCESS_SECRET;
}

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

export function env(): Env {
  if (cached) return cached;
  const parsed = envRefinements.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  ${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}

/** Split CORS_ORIGIN into a list, or `true` (allow all) when unset. */
export function corsOrigin(config: Env): string[] | true {
  if (!config.CORS_ORIGIN) return true;
  return config.CORS_ORIGIN.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}
