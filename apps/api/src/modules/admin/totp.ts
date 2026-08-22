import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * TOTP verification (RFC 6238) for staff second factors.
 *
 * Implemented directly rather than pulled in as a dependency: the algorithm is
 * ~30 lines of HMAC, it is fully specified, and it ships with official test
 * vectors (see test/services/totp.test.ts) — so the correctness argument is a
 * test run rather than trust in an unaudited package on the login path.
 */

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/** Seconds per code. 30 is the universal default that authenticator apps assume. */
export const TOTP_PERIOD_SECONDS = 30;
export const TOTP_DIGITS = 6;

/**
 * Steps of clock drift tolerated on each side. One step (±30s) absorbs ordinary
 * device skew; a wider window would materially enlarge the guessing surface.
 */
export const TOTP_DRIFT_STEPS = 1;

/** Decode an RFC 4648 base32 secret, ignoring padding, spaces, and case. */
export function base32Decode(input: string): Buffer {
  const normalized = input.replace(/=+$/, "").replace(/\s+/g, "").toUpperCase();

  let bits = 0;
  let value = 0;
  const bytes: number[] = [];

  for (const char of normalized) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) throw new Error(`Invalid base32 character: ${char}`);
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((value >>> bits) & 0xff);
    }
  }
  return Buffer.from(bytes);
}

/**
 * HOTP (RFC 4226) — the truncation step TOTP builds on.
 * `algorithm` is a parameter only so the RFC 6238 test vectors (which cover
 * SHA-256 and SHA-512) can be exercised; authenticator apps use SHA-1.
 */
export function hotp(
  secret: Buffer,
  counter: number | bigint,
  digits: number = TOTP_DIGITS,
  algorithm: "sha1" | "sha256" | "sha512" = "sha1",
): string {
  const counterBytes = Buffer.alloc(8);
  counterBytes.writeBigUInt64BE(BigInt(counter));

  const digest = createHmac(algorithm, secret).update(counterBytes).digest();

  // Dynamic truncation: the low nibble of the last byte selects the offset.
  const offset = digest[digest.length - 1]! & 0x0f;
  const binary =
    ((digest[offset]! & 0x7f) << 24) |
    (digest[offset + 1]! << 16) |
    (digest[offset + 2]! << 8) |
    digest[offset + 3]!;

  return String(binary % 10 ** digits).padStart(digits, "0");
}

/** The code for a given instant. */
export function totp(
  secret: Buffer,
  at: Date = new Date(),
  digits: number = TOTP_DIGITS,
  algorithm: "sha1" | "sha256" | "sha512" = "sha1",
): string {
  const counter = Math.floor(at.getTime() / 1000 / TOTP_PERIOD_SECONDS);
  return hotp(secret, counter, digits, algorithm);
}

/** Constant-time string compare, safe for differing lengths. */
function equalsConstantTime(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  // timingSafeEqual throws on length mismatch, so compare lengths separately —
  // a length difference is not a secret.
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/**
 * Verify a submitted code against a base32 secret, allowing for clock drift.
 * Returns false (never throws) for a malformed secret or code, so a bad enrolment
 * denies login rather than 500-ing the endpoint.
 */
export function verifyTotp(
  secretBase32: string,
  code: string,
  at: Date = new Date(),
  driftSteps: number = TOTP_DRIFT_STEPS,
): boolean {
  const submitted = code.trim();
  if (!/^\d{6}$/.test(submitted)) return false;

  let secret: Buffer;
  try {
    secret = base32Decode(secretBase32);
  } catch {
    return false;
  }
  if (secret.length === 0) return false;

  const counter = Math.floor(at.getTime() / 1000 / TOTP_PERIOD_SECONDS);
  for (let step = -driftSteps; step <= driftSteps; step += 1) {
    if (equalsConstantTime(hotp(secret, counter + step), submitted)) return true;
  }
  return false;
}
