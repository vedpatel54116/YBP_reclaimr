import { describe, expect, it } from "vitest";
import { findCatalogHints } from "../src/detection/merchant-catalog";
import { normalizeMerchant } from "../src/detection/normalize-merchant";

describe("normalizeMerchant", () => {
  it("strips store numbers", () => {
    expect(normalizeMerchant("PLANET FITNESS #0242")).toBe("planet fitness");
  });

  it("strips standalone reference numbers and card noise", () => {
    expect(normalizeMerchant("NETFLIX.COM 405882 RE")).toBe("netflix");
  });

  it("replaces asterisks with spaces", () => {
    expect(normalizeMerchant("SQ *BLUE BOTTLE")).toBe("sq blue bottle");
  });

  it("keeps at most three tokens", () => {
    expect(normalizeMerchant("BIG LOTS STORES 4728 SUNSET")).toBe("big lots stores");
  });

  it("drops noise tokens anywhere", () => {
    expect(normalizeMerchant("T-MOBILE PAYMENT AUTHORIZED")).toBe("t mobile");
  });

  it("keeps ampersands (AT&T, PG&E)", () => {
    expect(normalizeMerchant("AT&T U-VERSE PMT")).toBe("at&t u verse");
    expect(normalizeMerchant("PG&E WEBPAY")).toBe("pg&e webpay");
  });

  it("falls back to 'unknown' for pure noise", () => {
    expect(normalizeMerchant("1234 5678 #99")).toBe("unknown");
  });
});

describe("findCatalogHints", () => {
  it("matches exactly", () => {
    const hints = findCatalogHints("netflix");
    expect(hints?.displayName).toBe("Netflix");
    expect(hints?.isSubscriptionProvider).toBe(true);
  });

  it("matches by token prefix (geico auto → geico)", () => {
    const hints = findCatalogHints("geico auto");
    expect(hints?.displayName).toBe("GEICO");
    expect(hints?.negotiable).toBe(true);
  });

  it("normalizes hyphenated catalog keys (t-mobile)", () => {
    const hints = findCatalogHints("t-mobile");
    expect(hints?.displayName).toBe("T-Mobile");
  });

  it("returns null for unknown merchants", () => {
    expect(findCatalogHints("corner bodega")).toBeNull();
  });
});
