import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

const VERSION = "v1";
const IV_BYTES = 12; // GCM standard nonce size
const KEY_BYTES = 32; // AES-256
const SALT = "reclaimr:bank-token:v1";

/**
 * Envelope cipher for secrets at rest (AES-256-GCM with a scrypt-derived key).
 * Ciphertext format:
 *
 *   v1.<iv base64url>.<auth tag base64url>.<ciphertext base64url>
 *
 * The tag is verified on decrypt, so tampered rows fail closed instead of
 * decrypting to garbage that would be sent to Plaid.
 */
export class TokenCipher {
  private readonly key: Buffer;

  /**
   * @param secret Key material.
   * @param domain Key-derivation salt. Distinct domains derive distinct keys
   *   from the same secret, so a ciphertext from one use (bank tokens) can never
   *   be decrypted by another (admin MFA seeds) even when both are configured
   *   from one environment variable.
   */
  constructor(secret: string, domain: string = SALT) {
    this.key = scryptSync(secret, domain, KEY_BYTES);
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [
      VERSION,
      iv.toString("base64url"),
      tag.toString("base64url"),
      ciphertext.toString("base64url"),
    ].join(".");
  }

  decrypt(envelope: string): string {
    const parts = envelope.split(".");
    if (parts.length !== 4 || parts[0] !== VERSION) {
      throw new Error("Malformed token envelope");
    }
    const [, ivPart, tagPart, dataPart] = parts as [string, string, string, string];
    try {
      const decipher = createDecipheriv("aes-256-gcm", this.key, Buffer.from(ivPart, "base64url"));
      decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
      return Buffer.concat([
        decipher.update(Buffer.from(dataPart, "base64url")),
        decipher.final(),
      ]).toString("utf8");
    } catch {
      throw new Error("Token decrypt failed (wrong key or tampered data)");
    }
  }
}
