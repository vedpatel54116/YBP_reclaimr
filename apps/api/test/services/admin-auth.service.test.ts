import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { TokenCipher } from "../../src/adapters/crypto/token-cipher";
import { env } from "../../src/env";
import { AdminAuthService } from "../../src/modules/admin/auth.service";
import { roleHasCapability, ROLE_CAPABILITIES } from "../../src/modules/admin/permissions";
import { verifyAdminToken } from "../../src/modules/admin/tokens";
import { verifyAccessToken } from "../../src/modules/auth/tokens";
import { hashPassword } from "../../src/modules/auth/password";
import { totp } from "../../src/modules/admin/totp";
import { base32Decode } from "../../src/modules/admin/totp";
import { AuditService } from "../../src/services/audit";
import { createFakePrisma, type FakePrisma } from "../support/fake-prisma";
import { silentLogger, useTestEnv } from "../support/harness";

useTestEnv();

const PASSWORD = "correct-horse-battery-staple";
const MFA_SECRET = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
const CTX = { ip: "198.51.100.7", userAgent: "vitest" };

let db: FakePrisma;
let service: AdminAuthService;
let cipher: TokenCipher;

/**
 * bcrypt at 12 rounds costs ~450ms. The cost is the point in production, but
 * re-paying it per test buys nothing, so the fixture hash is computed once.
 */
let passwordHash: string;

beforeAll(async () => {
  passwordHash = await hashPassword(PASSWORD);
});

async function seedAdmin(overrides: Record<string, unknown> = {}): Promise<string> {
  const admin = await db.adminUser.create({
    data: {
      email: "agent@reclaimr.app",
      name: "Ada Agent",
      passwordHash,
      role: "agent",
      ...overrides,
    },
  });
  return admin.id as string;
}

beforeEach(() => {
  db = createFakePrisma();
  const prisma = db.asPrisma();
  cipher = new TokenCipher(env().JWT_ADMIN_SECRET!, "reclaimr:admin-mfa:v1");
  service = new AdminAuthService(prisma, new AuditService(prisma, silentLogger()), cipher, env());
});

describe("login", () => {
  it("issues a staff token for valid credentials", async () => {
    await seedAdmin();
    const session = await service.login({ email: "agent@reclaimr.app", password: PASSWORD }, CTX);

    expect(session.admin).toMatchObject({
      email: "agent@reclaimr.app",
      name: "Ada Agent",
      role: "agent",
      mfaEnabled: false,
    });
    expect(session.accessToken.length).toBeGreaterThan(20);
    expect(session.expiresIn).toBeGreaterThan(0);
  });

  it("records the login time", async () => {
    const id = await seedAdmin();
    await service.login({ email: "agent@reclaimr.app", password: PASSWORD }, CTX);
    const admin = await db.adminUser.findUnique({ where: { id } });
    expect(admin?.lastLoginAt).not.toBeNull();
  });

  it("audits a successful login", async () => {
    await seedAdmin();
    await service.login({ email: "agent@reclaimr.app", password: PASSWORD }, CTX);
    const log = await db.auditLog.findFirst({ where: { action: "admin.login" } });
    expect(log).toMatchObject({ actorType: "admin", ip: CTX.ip });
  });

  it("rejects a wrong password", async () => {
    await seedAdmin();
    await expect(
      service.login({ email: "agent@reclaimr.app", password: "wrong" }, CTX),
    ).rejects.toMatchObject({ statusCode: 401, code: "INVALID_CREDENTIALS" });
  });

  it("rejects an unknown email with the same error", async () => {
    await expect(
      service.login({ email: "nobody@reclaimr.app", password: PASSWORD }, CTX),
    ).rejects.toMatchObject({ statusCode: 401, code: "INVALID_CREDENTIALS" });
  });

  it("rejects a deactivated account", async () => {
    await seedAdmin({ isActive: false });
    await expect(
      service.login({ email: "agent@reclaimr.app", password: PASSWORD }, CTX),
    ).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" });
  });

  it("audits each failure with the reason, without leaking it to the caller", async () => {
    await seedAdmin();
    await service.login({ email: "agent@reclaimr.app", password: "wrong" }, CTX).catch(() => null);

    const log = await db.auditLog.findFirst({ where: { action: "admin.login_failed" } });
    expect(log?.metadata).toMatchObject({ reason: "bad_password" });
  });
});

describe("login with MFA enrolled", () => {
  beforeEach(async () => {
    await seedAdmin({ mfaSecret: cipher.encrypt(MFA_SECRET), role: "admin" });
  });

  it("accepts a valid current code", async () => {
    const code = totp(base32Decode(MFA_SECRET));
    const session = await service.login(
      { email: "agent@reclaimr.app", password: PASSWORD, mfaCode: code },
      CTX,
    );
    expect(session.admin.mfaEnabled).toBe(true);
  });

  it("refuses to log in without a code", async () => {
    await expect(
      service.login({ email: "agent@reclaimr.app", password: PASSWORD }, CTX),
    ).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" });

    const log = await db.auditLog.findFirst({ where: { action: "admin.login_failed" } });
    expect(log?.metadata).toMatchObject({ reason: "mfa_required" });
  });

  it("refuses a wrong code", async () => {
    await expect(
      service.login({ email: "agent@reclaimr.app", password: PASSWORD, mfaCode: "000000" }, CTX),
    ).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" });
  });

  it("refuses a stale code from outside the drift window", async () => {
    const stale = totp(base32Decode(MFA_SECRET), new Date(Date.now() - 300_000));
    await expect(
      service.login({ email: "agent@reclaimr.app", password: PASSWORD, mfaCode: stale }, CTX),
    ).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" });
  });

  it("refuses when the stored secret cannot be decrypted", async () => {
    const wrongKey = new TokenCipher("some-other-secret-entirely-long-enough", "other:domain");
    await db.adminUser.updateMany({
      where: { email: "agent@reclaimr.app" },
      data: { mfaSecret: wrongKey.encrypt(MFA_SECRET) },
    });

    const code = totp(base32Decode(MFA_SECRET));
    await expect(
      service.login({ email: "agent@reclaimr.app", password: PASSWORD, mfaCode: code }, CTX),
    ).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" });
  });
});

describe("MFA enforcement", () => {
  it("blocks an unenrolled account when MFA is required", async () => {
    process.env.ADMIN_MFA_REQUIRED = "true";
    const db2 = createFakePrisma();
    const prisma = db2.asPrisma();
    // A fresh env cache is not available in-process, so exercise the flag by
    // constructing the service with an overridden config object.
    const strict = new AdminAuthService(prisma, new AuditService(prisma, silentLogger()), cipher, {
      ...env(),
      ADMIN_MFA_REQUIRED: true,
    });
    await db2.adminUser.create({
      data: {
        email: "agent@reclaimr.app",
        name: "Ada",
        passwordHash,
        role: "agent",
      },
    });

    await expect(
      strict.login({ email: "agent@reclaimr.app", password: PASSWORD }, CTX),
    ).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" });

    const log = await db2.auditLog.findFirst({ where: { action: "admin.login_failed" } });
    expect(log?.metadata).toMatchObject({ reason: "mfa_not_enrolled" });
    delete process.env.ADMIN_MFA_REQUIRED;
  });
});

describe("token realms", () => {
  it("issues a token the admin verifier accepts", async () => {
    const id = await seedAdmin({ role: "finance_ops" });
    const session = await service.login({ email: "agent@reclaimr.app", password: PASSWORD }, CTX);

    const subject = await verifyAdminToken(session.accessToken);
    expect(subject).toMatchObject({ sub: id, email: "agent@reclaimr.app", role: "finance_ops" });
  });

  /** A staff token must be useless on member routes, and vice versa. */
  it("issues a token the member verifier rejects", async () => {
    await seedAdmin();
    const session = await service.login({ email: "agent@reclaimr.app", password: PASSWORD }, CTX);

    await expect(verifyAccessToken(session.accessToken)).rejects.toMatchObject({
      statusCode: 401,
    });
  });

  it("rejects a garbage token", async () => {
    await expect(verifyAdminToken("not-a-token")).rejects.toMatchObject({ statusCode: 401 });
  });
});

describe("me", () => {
  it("returns the current session and a fresh token", async () => {
    const id = await seedAdmin();
    const session = await service.me(id);
    expect(session.admin.id).toBe(id);
    expect(session.accessToken.length).toBeGreaterThan(20);
  });

  it("refuses a deactivated account", async () => {
    const id = await seedAdmin({ isActive: false });
    await expect(service.me(id)).rejects.toMatchObject({ code: "ADMIN_INACTIVE" });
  });

  it("refuses an unknown account", async () => {
    await expect(service.me("00000000-0000-4000-8000-000000000000")).rejects.toMatchObject({
      code: "ADMIN_INACTIVE",
    });
  });
});

describe("role capabilities", () => {
  it("lets an agent work cases but not curate merchants or read audit logs", () => {
    expect(roleHasCapability("agent", "cases.read")).toBe(true);
    expect(roleHasCapability("agent", "cases.write")).toBe(true);
    expect(roleHasCapability("agent", "members.read")).toBe(true);
    expect(roleHasCapability("agent", "merchants.write")).toBe(false);
    expect(roleHasCapability("agent", "audit.read")).toBe(false);
  });

  it("lets finance ops curate merchants but not read audit logs", () => {
    expect(roleHasCapability("finance_ops", "merchants.write")).toBe(true);
    expect(roleHasCapability("finance_ops", "audit.read")).toBe(false);
  });

  it("gives admins the audit trail", () => {
    expect(roleHasCapability("admin", "audit.read")).toBe(true);
  });

  it("keeps each role a superset of the previous one", () => {
    for (const capability of ROLE_CAPABILITIES.agent) {
      expect(ROLE_CAPABILITIES.finance_ops).toContain(capability);
    }
    for (const capability of ROLE_CAPABILITIES.finance_ops) {
      expect(ROLE_CAPABILITIES.admin).toContain(capability);
    }
  });

  it("grants audit.read to admins alone", () => {
    const holders = (["agent", "finance_ops", "admin"] as const).filter((role) =>
      roleHasCapability(role, "audit.read"),
    );
    expect(holders).toEqual(["admin"]);
  });
});
