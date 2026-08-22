import { describe, expect, it } from "vitest";
import { base32Decode, hotp, totp, verifyTotp } from "../../src/modules/admin/totp";

/**
 * RFC 6238 Appendix B reference vectors. Hand-rolled crypto on the staff login
 * path is only defensible if it is checked against the specification's own
 * numbers, which is what these cases do.
 */
const RFC_SHA1_SECRET = Buffer.from("12345678901234567890", "ascii");
const RFC_SHA256_SECRET = Buffer.from("12345678901234567890123456789012", "ascii");
const RFC_SHA512_SECRET = Buffer.from(
  "1234567890123456789012345678901234567890123456789012345678901234",
  "ascii",
);

const counterFor = (unixSeconds: number): number => Math.floor(unixSeconds / 30);

describe("RFC 6238 reference vectors (SHA-1)", () => {
  const vectors: Array<[number, string]> = [
    [59, "94287082"],
    [1111111109, "07081804"],
    [1111111111, "14050471"],
    [1234567890, "89005924"],
    [2000000000, "69279037"],
    [20000000000, "65353130"],
  ];

  for (const [time, expected] of vectors) {
    it(`T=${time} yields ${expected}`, () => {
      expect(hotp(RFC_SHA1_SECRET, counterFor(time), 8, "sha1")).toBe(expected);
    });
  }
});

describe("RFC 6238 reference vectors (SHA-256)", () => {
  const vectors: Array<[number, string]> = [
    [59, "46119246"],
    [1111111109, "68084774"],
    [1234567890, "91819424"],
    [20000000000, "77737706"],
  ];

  for (const [time, expected] of vectors) {
    it(`T=${time} yields ${expected}`, () => {
      expect(hotp(RFC_SHA256_SECRET, counterFor(time), 8, "sha256")).toBe(expected);
    });
  }
});

describe("RFC 6238 reference vectors (SHA-512)", () => {
  const vectors: Array<[number, string]> = [
    [59, "90693936"],
    [1111111109, "25091201"],
    [1234567890, "93441116"],
    [20000000000, "47863826"],
  ];

  for (const [time, expected] of vectors) {
    it(`T=${time} yields ${expected}`, () => {
      expect(hotp(RFC_SHA512_SECRET, counterFor(time), 8, "sha512")).toBe(expected);
    });
  }
});

describe("RFC 4226 HOTP vectors", () => {
  // Appendix D, 6-digit codes for counters 0-9 with the same ASCII secret.
  const expected = [
    "755224",
    "287082",
    "359152",
    "969429",
    "338314",
    "254676",
    "287922",
    "162583",
    "399871",
    "520489",
  ];

  it("matches all ten counters", () => {
    expected.forEach((code, counter) => {
      expect(hotp(RFC_SHA1_SECRET, counter, 6, "sha1")).toBe(code);
    });
  });
});

describe("base32Decode", () => {
  it("decodes the RFC secret to its ASCII bytes", () => {
    expect(base32Decode("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ")).toEqual(RFC_SHA1_SECRET);
  });

  it("ignores padding, whitespace, and case", () => {
    const canonical = base32Decode("JBSWY3DP");
    expect(base32Decode("jbswy3dp")).toEqual(canonical);
    expect(base32Decode("JBSW Y3DP")).toEqual(canonical);
    expect(base32Decode("JBSWY3DP======")).toEqual(canonical);
  });

  it("rejects characters outside the alphabet", () => {
    expect(() => base32Decode("JBSWY3D1")).toThrow(/Invalid base32/);
  });
});

describe("totp", () => {
  it("produces a 6-digit code by default", () => {
    expect(totp(RFC_SHA1_SECRET, new Date(59_000))).toMatch(/^\d{6}$/);
  });

  it("agrees with the RFC vector's low-order digits", () => {
    // The 6-digit code is the 8-digit one truncated from the left.
    expect(totp(RFC_SHA1_SECRET, new Date(59_000))).toBe("287082");
  });

  it("changes when the 30-second step rolls over", () => {
    const inStep = totp(RFC_SHA1_SECRET, new Date(59_000));
    const nextStep = totp(RFC_SHA1_SECRET, new Date(90_000));
    expect(inStep).not.toBe(nextStep);
  });

  it("is stable within one step", () => {
    expect(totp(RFC_SHA1_SECRET, new Date(60_000))).toBe(totp(RFC_SHA1_SECRET, new Date(89_999)));
  });
});

describe("verifyTotp", () => {
  const SECRET_B32 = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
  const at = new Date(1_700_000_000_000);

  it("accepts the current code", () => {
    const code = totp(RFC_SHA1_SECRET, at);
    expect(verifyTotp(SECRET_B32, code, at)).toBe(true);
  });

  it("tolerates one step of drift in each direction", () => {
    const previous = totp(RFC_SHA1_SECRET, new Date(at.getTime() - 30_000));
    const next = totp(RFC_SHA1_SECRET, new Date(at.getTime() + 30_000));
    expect(verifyTotp(SECRET_B32, previous, at)).toBe(true);
    expect(verifyTotp(SECRET_B32, next, at)).toBe(true);
  });

  it("rejects drift beyond the window", () => {
    const stale = totp(RFC_SHA1_SECRET, new Date(at.getTime() - 120_000));
    expect(verifyTotp(SECRET_B32, stale, at)).toBe(false);
  });

  it("honours a zero-drift window", () => {
    const previous = totp(RFC_SHA1_SECRET, new Date(at.getTime() - 30_000));
    expect(verifyTotp(SECRET_B32, previous, at, 0)).toBe(false);
  });

  it("rejects a wrong code", () => {
    expect(verifyTotp(SECRET_B32, "000000", at)).toBe(false);
  });

  it("rejects malformed codes without throwing", () => {
    for (const code of ["", "12345", "1234567", "abcdef", "12 34 56"]) {
      expect(verifyTotp(SECRET_B32, code, at)).toBe(false);
    }
  });

  it("tolerates surrounding whitespace in the submitted code", () => {
    const code = totp(RFC_SHA1_SECRET, at);
    expect(verifyTotp(SECRET_B32, `  ${code} `, at)).toBe(true);
  });

  it("returns false rather than throwing for an unusable secret", () => {
    const code = totp(RFC_SHA1_SECRET, at);
    expect(verifyTotp("not-base32!", code, at)).toBe(false);
    expect(verifyTotp("", code, at)).toBe(false);
  });
});
