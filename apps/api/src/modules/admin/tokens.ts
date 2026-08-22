import { SignJWT, jwtVerify } from "jose";
import type { AdminRole } from "@reclaimr/shared";
import { adminTokenSecret, env } from "../../env";
import { unauthorized } from "../../lib/errors";

/**
 * Staff tokens live in their own realm.
 *
 * Different secret, different audience, different lifetime from member tokens.
 * The audience check is what makes the separation real: a member access token
 * presented to an admin route fails verification outright, so no amount of
 * confusion in the route layer can let one realm's credential act in the other.
 */
const ISSUER = "reclaimr";
const ADMIN_AUDIENCE = "reclaimr-admin";

export interface AdminTokenSubject {
  /** AdminUser id. */
  sub: string;
  email: string;
  role: AdminRole;
}

function secret(): Uint8Array {
  return new TextEncoder().encode(adminTokenSecret(env()));
}

export async function signAdminToken(admin: {
  id: string;
  email: string;
  role: AdminRole;
}): Promise<{ token: string; expiresIn: number }> {
  const expiresIn = env().JWT_ADMIN_TTL_SECONDS;
  const token = await new SignJWT({ email: admin.email, role: admin.role })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(admin.id)
    .setIssuedAt()
    .setIssuer(ISSUER)
    .setAudience(ADMIN_AUDIENCE)
    .setExpirationTime(`${expiresIn}s`)
    .sign(secret());
  return { token, expiresIn };
}

const ROLES: readonly AdminRole[] = ["agent", "finance_ops", "admin"];

function isAdminRole(value: unknown): value is AdminRole {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

export async function verifyAdminToken(token: string): Promise<AdminTokenSubject> {
  try {
    const { payload } = await jwtVerify(token, secret(), {
      issuer: ISSUER,
      audience: ADMIN_AUDIENCE,
    });
    if (
      typeof payload.sub !== "string" ||
      typeof payload.email !== "string" ||
      !isAdminRole(payload.role)
    ) {
      throw new Error("missing claims");
    }
    return { sub: payload.sub, email: payload.email, role: payload.role };
  } catch {
    throw unauthorized("Invalid or expired admin token", "INVALID_TOKEN");
  }
}
