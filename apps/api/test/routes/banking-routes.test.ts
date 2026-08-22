import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";

/**
 * Route smoke tests that need no infrastructure: buildApp() constructs a
 * PrismaClient lazily (no connection until the first query) and Redis is
 * absent in tests, so auth-guard rejections exercise the full plugin chain
 * without Postgres or Redis.
 */

process.env.NODE_ENV = "test";
process.env.DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";
process.env.JWT_ACCESS_SECRET ??= "test-secret-that-is-at-least-32-characters-long";

let app: FastifyInstance;

beforeAll(async () => {
  const { buildApp } = await import("../../src/app");
  app = await buildApp({ logger: false });
});

afterAll(async () => {
  await app.close();
});

describe("banking endpoints require authentication", () => {
  const protectedRoutes = [
    { method: "POST" as const, url: "/api/v1/plaid/create-link-token" },
    { method: "POST" as const, url: "/api/v1/plaid/exchange-public-token" },
    { method: "GET" as const, url: "/api/v1/accounts" },
    { method: "GET" as const, url: "/api/v1/transactions" },
    { method: "POST" as const, url: "/api/v1/accounts/0b9a6c8e-6f2a-4d4e-9d3a-2f5e8a1c7b33/sync" },
  ];

  for (const route of protectedRoutes) {
    it(`${route.method} ${route.url} → 401 without a token`, async () => {
      const response = await app.inject({ method: route.method, url: route.url, payload: {} });
      expect(response.statusCode).toBe(401);
      expect(response.json().error).toBe("Unauthorized");
    });
  }

  it("GET /health stays public", async () => {
    const response = await app.inject({ method: "GET", url: "/health" });
    expect(response.statusCode).toBe(200);
  });

  it("rejects a malformed bearer token", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/accounts",
      headers: { authorization: "Bearer not-a-real-token" },
    });
    expect(response.statusCode).toBe(401);
  });
});
