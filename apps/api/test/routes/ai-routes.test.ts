import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";

/**
 * Route smoke tests for the AI surface. buildApp() creates the PrismaClient
 * lazily (no connection until the first query) and Redis is absent in tests,
 * so auth-guard rejections exercise the full plugin chain without Postgres.
 */

process.env.NODE_ENV = "test";
process.env.DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";
process.env.JWT_ACCESS_SECRET ??= "test-secret-that-is-at-least-32-characters-long";

const SUBSCRIPTION_ID = "0b9a6c8e-6f2a-4d4e-9d3a-2f5e8a1c7b33";

let app: FastifyInstance;

beforeAll(async () => {
  const { buildApp } = await import("../../src/app");
  app = await buildApp({ logger: false });
});

afterAll(async () => {
  await app.close();
});

describe("AI suggestion endpoints", () => {
  it("GET /subscriptions/:id/suggestions → 401 without a token", async () => {
    const response = await app.inject({
      method: "GET",
      url: `/api/v1/subscriptions/${SUBSCRIPTION_ID}/suggestions`,
    });

    expect(response.statusCode).toBe(401);
    expect(response.json().error).toBe("Unauthorized");
  });

  it("rejects a malformed bearer token", async () => {
    const response = await app.inject({
      method: "GET",
      url: `/api/v1/subscriptions/${SUBSCRIPTION_ID}/suggestions`,
      headers: { authorization: "Bearer not-a-real-token" },
    });

    expect(response.statusCode).toBe(401);
  });
});
