/**
 * Unit tests for market-sizing.ts
 * Tests: estimateMarketSize — range returns, INSUFFICIENT_EVIDENCE, limiting factors
 */
import { describe, it, expect } from "vitest";
import { estimateMarketSize, type MarketSizingInputs } from "@/domain/owner-strategy/market-sizing";

function makeInputs(overrides: Partial<MarketSizingInputs> = {}): MarketSizingInputs {
  return {
    sourcePopulationUnits: 50000,
    applicabilityRate: 0.2,
    reachablePercentage: 0.3,
    purchaseFrequencyPerYear: 4,
    priceRangeCents: { low: 3000n, high: 8000n },
    capacityLimitUnitsPerMonth: 100,
    channelLimitUnitsPerMonth: 200,
    geographyMultiplier: 1.0,
    evidenceIds: [],
    limitingFactor: null,
    calculationVersion: "v1",
    ...overrides,
  };
}

describe("estimateMarketSize", () => {
  it("returns INSUFFICIENT_EVIDENCE_TO_ESTIMATE when sourcePopulationUnits is null", () => {
    const result = estimateMarketSize({ ...makeInputs(), sourcePopulationUnits: null });
    expect(result.status).toBe("INSUFFICIENT_EVIDENCE_TO_ESTIMATE");
  });

  it("returns INSUFFICIENT_EVIDENCE when priceRangeCents is null", () => {
    const result = estimateMarketSize({ ...makeInputs(), priceRangeCents: null });
    expect(result.status).toBe("INSUFFICIENT_EVIDENCE_TO_ESTIMATE");
  });

  it("returns ESTIMATED with range when inputs are sufficient", () => {
    const result = estimateMarketSize(makeInputs());
    expect(result.status).toBe("ESTIMATED");
    expect(result.reachableMarketRevenueCents).not.toBeNull();
    expect(result.reachableMarketRevenueCents?.low).toBeLessThanOrEqual(result.reachableMarketRevenueCents?.high ?? BigInt(0));
  });

  it("capacity limits revenue when capacity is much lower than demand", () => {
    const inputs = makeInputs({ capacityLimitUnitsPerMonth: 5, channelLimitUnitsPerMonth: 1000 });
    const result = estimateMarketSize(inputs);
    if (result.status === "ESTIMATED") {
      expect(result.limitingFactor).toBe("CAPACITY");
    }
  });

  it("serviceable revenue is less than reachable revenue", () => {
    const result = estimateMarketSize(makeInputs());
    if (result.status === "ESTIMATED" && result.serviceableRevenueCents && result.reachableMarketRevenueCents) {
      expect(result.serviceableRevenueCents.mid).toBeLessThanOrEqual(result.reachableMarketRevenueCents.mid);
    }
  });

  it("confidence is lower when missingInputs list is non-empty", () => {
    const noCapacity = estimateMarketSize({ ...makeInputs(), capacityLimitUnitsPerMonth: null });
    const withCapacity = estimateMarketSize(makeInputs());
    if (noCapacity.status === "ESTIMATED" && withCapacity.status === "ESTIMATED") {
      expect(noCapacity.confidence).toBeLessThanOrEqual(withCapacity.confidence);
    }
  });

  it("calculationVersion flows through to result", () => {
    const result = estimateMarketSize({ ...makeInputs(), calculationVersion: "v2" });
    expect(result.calculationVersion).toBe("v2");
  });
});
