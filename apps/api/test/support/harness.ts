import type { FastifyBaseLogger } from "fastify";

/**
 * Test environment for modules that read `env()`.
 *
 * `env()` memoizes on first call, so these must be set before the code under
 * test is imported. Vitest isolates test files per worker, so each file gets a
 * clean cache.
 */
export function useTestEnv(overrides: Record<string, string> = {}): void {
  process.env.NODE_ENV = "test";
  process.env.DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";
  process.env.JWT_ACCESS_SECRET ??= "test-secret-that-is-at-least-32-characters-long";
  process.env.JWT_ADMIN_SECRET ??= "admin-test-secret-at-least-32-characters-long";
  for (const [key, value] of Object.entries(overrides)) process.env[key] = value;
}

/**
 * Logger that swallows output. Services log audit failures rather than throwing,
 * so tests need a logger that records nothing but does not crash.
 */
export function silentLogger(): FastifyBaseLogger {
  const noop = (): void => undefined;
  const logger = {
    info: noop,
    error: noop,
    warn: noop,
    debug: noop,
    fatal: noop,
    trace: noop,
    silent: noop,
    level: "silent",
  };
  return { ...logger, child: () => logger } as unknown as FastifyBaseLogger;
}
