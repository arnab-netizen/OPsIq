import { describe, it, expect } from "vitest";
import {
  findBottleneck,
  assessCapacity,
  canAbsorbRevenueGrowth,
  type CapacityInput,
} from "@/domain/execution/capacity-ceiling";

const input = (over: Partial<CapacityInput> = {}): CapacityInput => ({
  resources: [
    { type: "staff", utilization: 0.6 },
    { type: "machine", utilization: 0.7 },
  ],
  currentRevenue: 700000,
  safeUtilization: 0.85,
  expansionThreshold: 0.85,
  ...over,
});

describe("[module10] capacity & bottleneck outputs", () => {
  it("finds the binding bottleneck (highest utilization)", () => {
    expect(findBottleneck(input().resources)?.type).toBe("machine");
    expect(findBottleneck([])).toBeNull();
  });

  it("computes revenue ceiling and safe revenue ceiling from the bottleneck", () => {
    const a = assessCapacity(input()); // bottleneck 0.7, revenue 700k
    expect(a.bottleneckResource).toBe("machine");
    expect(a.revenueCeiling).toBeCloseTo(1000000, 0); // 700k / 0.7
    expect(a.safeRevenueCeiling).toBeCloseTo(850000, 0); // 700k * 0.85/0.7
    expect(a.growthCapacityRevenue).toBeCloseTo(150000, 0);
    expect(a.growthSafe).toBe(true);
  });

  it("flags no safe growth and triggers expansion at/above the cap", () => {
    const a = assessCapacity(input({ resources: [{ type: "machine", utilization: 0.9 }] }));
    expect(a.growthSafe).toBe(false);
    expect(a.expansionTriggered).toBe(true);
    expect(a.availableBuffer).toBe(0);
    expect(a.growthCapacityRevenue).toBe(0);
  });

  it("handles unknown utilization (0) without dividing by zero", () => {
    const a = assessCapacity(input({ resources: [{ type: "staff", utilization: 0 }] }));
    expect(a.revenueCeiling).toBeNull();
    expect(a.safeRevenueCeiling).toBeNull();
    expect(a.growthSafe).toBe(true);
  });

  it("canAbsorbRevenueGrowth respects the safe headroom", () => {
    expect(canAbsorbRevenueGrowth(input(), 100000)).toBe(true);  // within 150k headroom
    expect(canAbsorbRevenueGrowth(input(), 200000)).toBe(false); // exceeds headroom
    expect(canAbsorbRevenueGrowth(input(), 0)).toBe(true);
  });

  it("canAbsorbRevenueGrowth fails closed when utilization is unknown", () => {
    expect(canAbsorbRevenueGrowth(input({ resources: [{ type: "staff", utilization: 0 }] }), 50000)).toBe(false);
  });

  it("canAbsorbRevenueGrowth is false when already over the safe cap", () => {
    expect(canAbsorbRevenueGrowth(input({ resources: [{ type: "machine", utilization: 0.95 }] }), 10000)).toBe(false);
  });
});
