import { describe, it, expect } from "vitest";
import { LOCATIONS, abstractedLocationKey } from "@/behavioral-validation/locations";
import { locationContextSchema } from "@/behavioral-validation/schema";

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
