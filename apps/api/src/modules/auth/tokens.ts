import { createHash, randomBytes } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { env } from "../../env";
import { unauthorized } from "../../lib/errors";

const ISSUER = "reclaimr";
const AUDIENCE = "reclaimr-api";

/** Identity carried by a verified access token. */
export interface AccessTokenSubject {
  /** User id. */
  sub: string;
  email: string;
}

function accessSecret(): Uint8Array {
  return new TextEncoder().encode(env().JWT_ACCESS_SECRET);
}

/** Short-lived HS256 access token for API calls. */
export async function signAccessToken(user: {
  id: string;
  email: string;
}): Promise<{ token: string; expiresIn: number }> {
  const expiresIn = env().JWT_ACCESS_TTL_SECONDS;
  const token = await new SignJWT({ email: user.email })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(user.id)
    .setIssuedAt()
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setExpirationTime(`${expiresIn}s`)
    .sign(accessSecret());
  return { token, expiresIn };
}

/** Verifies signature + claims; throws an unauthorized AppError on failure. */
export async function verifyAccessToken(token: string): Promise<AccessTokenSubject> {
  try {
    const { payload } = await jwtVerify(token, accessSecret(), {
      issuer: ISSUER,
      audience: AUDIENCE,
    });
    if (typeof payload.sub !== "string" || typeof payload.email !== "string") {
      throw new Error("missing claims");
    }
    return { sub: payload.sub, email: payload.email };
  } catch {
    throw unauthorized("Invalid or expired access token", "INVALID_TOKEN");
  }
}

/**
 * Opaque refresh token: 256 bits of entropy, returned raw to the client.
 * Only the SHA-256 hash is stored, so a database leak cannot mint sessions.
 */
export function generateRefreshToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: sha256(token) };
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function refreshExpiry(): Date {
  return new Date(Date.now() + env().REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
}
