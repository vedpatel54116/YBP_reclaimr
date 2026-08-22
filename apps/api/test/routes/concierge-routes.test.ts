import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { useTestEnv } from "../support/harness";

/**
 * Route-level guard tests over the real Fastify instance.
 *
 * These need no infrastructure: `buildApp()` constructs a PrismaClient lazily
 * (no connection until the first query) and every case below is rejected by a
 * guard before any database access. That makes them a cheap, honest check that
 * the wiring in app.ts actually protects each new endpoint — a route registered
 * without its preHandler would fail here.
 */

useTestEnv();

const ID = "0b9a6c8e-6f2a-4d4e-9d3a-2f5e8a1c7b33";
const DOC_ID = "1c8b7d9f-7a3b-4e5f-8e4b-3a6f9b2d8c44";

let app: FastifyInstance;

beforeAll(async () => {
  const { buildApp } = await import("../../src/app");
  app = await buildApp({ logger: false });
});

afterAll(async () => {
  await app.close();
});

describe("member endpoints require authentication", () => {
  const routes = [
    { method: "GET" as const, url: "/api/v1/bills" },
    { method: "POST" as const, url: "/api/v1/bills" },
    { method: "GET" as const, url: "/api/v1/bills/upcoming" },
    { method: "GET" as const, url: `/api/v1/bills/${ID}` },
    { method: "PATCH" as const, url: `/api/v1/bills/${ID}` },
    { method: "DELETE" as const, url: `/api/v1/bills/${ID}` },

    { method: "GET" as const, url: "/api/v1/cancellations" },
    { method: "POST" as const, url: "/api/v1/cancellations" },
    { method: "GET" as const, url: `/api/v1/cancellations/${ID}` },
    { method: "POST" as const, url: `/api/v1/cancellations/${ID}/withdraw` },

    { method: "GET" as const, url: "/api/v1/negotiations" },
    { method: "POST" as const, url: "/api/v1/negotiations" },
    { method: "GET" as const, url: `/api/v1/negotiations/${ID}` },
    { method: "POST" as const, url: `/api/v1/negotiations/${ID}/withdraw` },
    { method: "POST" as const, url: `/api/v1/negotiations/${ID}/offer/approve` },
    { method: "POST" as const, url: `/api/v1/negotiations/${ID}/offer/reject` },
    { method: "POST" as const, url: `/api/v1/negotiations/${ID}/documents` },
    { method: "GET" as const, url: `/api/v1/negotiations/${ID}/documents` },
    { method: "GET" as const, url: `/api/v1/negotiations/${ID}/documents/${DOC_ID}` },

    { method: "GET" as const, url: "/api/v1/savings/summary" },
    { method: "GET" as const, url: "/api/v1/savings/events" },
    { method: "POST" as const, url: "/api/v1/savings/events" },

    { method: "GET" as const, url: "/api/v1/premium" },
    { method: "POST" as const, url: "/api/v1/premium/upgrade" },
    { method: "POST" as const, url: "/api/v1/premium/cancel" },
    { method: "POST" as const, url: "/api/v1/premium/resume" },
  ];

  for (const route of routes) {
    it(`${route.method} ${route.url} → 401 without a token`, async () => {
      const response = await app.inject({ method: route.method, url: route.url, payload: {} });
      expect(response.statusCode).toBe(401);
      expect(response.json().error).toBe("Unauthorized");
    });
  }

  it("rejects a malformed bearer token", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/cancellations",
      headers: { authorization: "Bearer not-a-real-token" },
    });
    expect(response.statusCode).toBe(401);
  });
});

describe("admin endpoints reject member and anonymous callers", () => {
  const routes = [
    { method: "GET" as const, url: "/api/v1/admin/auth/me" },
    { method: "GET" as const, url: "/api/v1/admin/cancellations" },
    { method: "GET" as const, url: `/api/v1/admin/cancellations/${ID}` },
    { method: "PATCH" as const, url: `/api/v1/admin/cancellations/${ID}` },
    { method: "GET" as const, url: "/api/v1/admin/negotiations" },
    { method: "GET" as const, url: `/api/v1/admin/negotiations/${ID}` },
    { method: "PATCH" as const, url: `/api/v1/admin/negotiations/${ID}` },
    { method: "GET" as const, url: "/api/v1/admin/members" },
    { method: "GET" as const, url: `/api/v1/admin/members/${ID}` },
    { method: "GET" as const, url: "/api/v1/admin/merchants" },
    { method: "POST" as const, url: "/api/v1/admin/merchants" },
    { method: "PATCH" as const, url: `/api/v1/admin/merchants/${ID}` },
    { method: "GET" as const, url: "/api/v1/admin/audit-logs" },
  ];

  for (const route of routes) {
    it(`${route.method} ${route.url} → 401 without a token`, async () => {
      const response = await app.inject({ method: route.method, url: route.url, payload: {} });
      expect(response.statusCode).toBe(401);
    });
  }

  /**
   * Realm separation: a member's own token is signed with a different secret and
   * a different audience, so it can never satisfy an admin guard.
   */
  it("rejects a member access token on an admin route", async () => {
    const { signAccessToken } = await import("../../src/modules/auth/tokens");
    const { token } = await signAccessToken({ id: ID, email: "member@example.com" });

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/admin/members",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.statusCode).toBe(401);
  });

  it("rejects a staff token on a member route", async () => {
    const { signAdminToken } = await import("../../src/modules/admin/tokens");
    const { token } = await signAdminToken({
      id: ID,
      email: "agent@reclaimr.app",
      role: "admin",
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/cancellations",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.statusCode).toBe(401);
  });
});

describe("admin login stays public", () => {
  it("validates its body rather than demanding a token", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/admin/auth/login",
      payload: { email: "not-an-email" },
    });
    // 400 (not 401) proves the route is reachable and validating.
    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe("Bad Request");
  });
});

describe("billing webhook", () => {
  it("is not behind an auth guard", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/billing/webhook",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({ id: "evt_test", type: "ignored", providerType: "x" }),
    });
    // The mock adapter accepts any well-formed body, so this reaches the handler.
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ received: true });
  });

  it("rejects a body it cannot verify", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/billing/webhook",
      headers: { "content-type": "application/json" },
      payload: "not json at all",
    });
    expect(response.statusCode).toBe(401);
    expect(response.json().details).toMatchObject({ code: "INVALID_SIGNATURE" });
  });

  it("rejects a payload missing an event id", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/billing/webhook",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({ type: "ignored" }),
    });
    expect(response.statusCode).toBe(401);
  });

  /**
   * The webhook scope swaps in a raw-body parser. This asserts that swap stayed
   * scoped: a sibling JSON route must still parse and validate normally.
   */
  it("does not break JSON parsing on other routes", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/admin/auth/login",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({ email: "bad", password: "" }),
    });
    expect(response.statusCode).toBe(400);
  });
});

describe("public endpoints", () => {
  it("keeps /health open", async () => {
    const response = await app.inject({ method: "GET", url: "/health" });
    expect(response.statusCode).toBe(200);
  });
});
