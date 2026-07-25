import { describe, it, expect } from "vitest";
import { LOCATIONS, abstractedLocationKey } from "@/behavioral-validation/locations";
import { locationContextSchema } from "@/behavioral-validation/schema";

describe("location presets — module contract assertions", () => {
  it("LOCATIONS is an object", () => {
    expect(typeof LOCATIONS).toBe("object");
  });
  it("abstractedLocationKey is a function", () => {
    expect(typeof abstractedLocationKey).toBe("function");
  });
  it("Object.keys(LOCATIONS).length is >= 12", () => {
    expect(Object.keys(LOCATIONS).length).toBeGreaterThanOrEqual(12);
  });
  it("LOCATIONS has a 'kolkata' key", () => {
    expect(LOCATIONS).toHaveProperty("kolkata");
  });
  it("LOCATIONS has a 'singapore' key", () => {
    expect(LOCATIONS).toHaveProperty("singapore");
  });
  it("LOCATIONS.kolkata.marketTier is 'tier1'", () => {
    expect(LOCATIONS.kolkata.marketTier).toBe("tier1");
  });
  it("all LOCATIONS have a complianceUncertainty field", () => {
    for (const l of Object.values(LOCATIONS)) expect(l).toHaveProperty("complianceUncertainty");
  });
  it("all LOCATIONS have a marketTier field", () => {
    for (const l of Object.values(LOCATIONS)) expect(l).toHaveProperty("marketTier");
  });
  it("abstractedLocationKey returns a string containing '|'", () => {
    expect(abstractedLocationKey(LOCATIONS.kolkata)).toContain("|");
  });
  it("abstractedLocationKey(LOCATIONS.kolkata) returns 'India|tier1'", () => {
    expect(abstractedLocationKey(LOCATIONS.kolkata)).toBe("India|tier1");
  });
  it("abstractedLocationKey(LOCATIONS.singapore) returns 'Singapore|metro_premium'", () => {
    expect(abstractedLocationKey(LOCATIONS.singapore)).toBe("Singapore|metro_premium");
  });
  it("LOCATIONS.singapore.marketTier is 'metro_premium'", () => {
    expect(LOCATIONS.singapore.marketTier).toBe("metro_premium");
  });
  it("there are at least 8 distinct marketTier values across LOCATIONS", () => {
    const tiers = new Set(Object.values(LOCATIONS).map((l) => l.marketTier));
    expect(tiers.size).toBeGreaterThanOrEqual(8);
  });
  it("locationContextSchema is defined", () => {
    expect(locationContextSchema).toBeDefined();
  });
  it("locationContextSchema.parse is a function", () => {
    expect(typeof locationContextSchema.parse).toBe("function");
  });
  it("locationContextSchema.parse(LOCATIONS.kolkata) does not throw", () => {
    expect(() => locationContextSchema.parse(LOCATIONS.kolkata)).not.toThrow();
  });
});

describe("location presets", () => {
  it("provides at least 12 valid location contexts", () => {
    const keys = Object.keys(LOCATIONS);
    expect(keys.length).toBeGreaterThanOrEqual(12);
    for (const k of keys) expect(() => locationContextSchema.parse(LOCATIONS[k as keyof typeof LOCATIONS])).not.toThrow();
  });

  it("covers the required real-world contexts (Kolkata, tier-2/3, rural, premium, Gulf, western, SEA)", () => {
    const tiers = new Set(Object.values(LOCATIONS).map((l) => l.marketTier));
    for (const t of ["tier1", "tier2", "tier3", "rural_semirural", "metro_premium", "gulf", "western", "sea"]) {
      expect(tiers.has(t as never)).toBe(true);
    }
  });

  it("every compliance note routes to professional review (no hallucinated law)", () => {
    for (const l of Object.values(LOCATIONS)) expect(l.complianceUncertainty.toLowerCase()).toContain("professional review");
  });

  it("abstractedLocationKey is non-private (country|tier only)", () => {
    expect(abstractedLocationKey(LOCATIONS.kolkata)).toBe("India|tier1");
    expect(abstractedLocationKey(LOCATIONS.singapore)).toBe("Singapore|metro_premium");
  });
});
