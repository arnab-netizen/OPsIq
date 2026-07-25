import { describe, it, expect } from "vitest";
import {
  businessCreateSchema,
  metricSnapshotSchema,
  missingCriticalMetrics,
  isStaleSnapshot,
} from "@/domain/founder-recovery/validation";

describe("founder-recovery validation — module contract assertions", () => {
  it("businessCreateSchema is defined", () => { expect(businessCreateSchema).toBeDefined(); });
  it("metricSnapshotSchema is defined", () => { expect(metricSnapshotSchema).toBeDefined(); });
  it("missingCriticalMetrics is a function", () => { expect(typeof missingCriticalMetrics).toBe("function"); });
  it("isStaleSnapshot is a function", () => { expect(typeof isStaleSnapshot).toBe("function"); });
  it("businessCreateSchema has a safeParse method", () => { expect(typeof businessCreateSchema.safeParse).toBe("function"); });
  it("metricSnapshotSchema has a safeParse method", () => { expect(typeof metricSnapshotSchema.safeParse).toBe("function"); });
  it("businessCreateSchema rejects an empty object", () => { expect(businessCreateSchema.safeParse({}).success).toBe(false); });
  it("metricSnapshotSchema rejects an empty object", () => { expect(metricSnapshotSchema.safeParse({}).success).toBe(false); });
  it("missingCriticalMetrics({}) returns an array", () => { expect(Array.isArray(missingCriticalMetrics({}))).toBe(true); });
  it("missingCriticalMetrics with revenue+totalCosts+orderCount returns empty array", () => { expect(missingCriticalMetrics({ revenue: 1, totalCosts: 1, orderCount: 1 })).toEqual([]); });
  it("isStaleSnapshot returns a boolean", () => { expect(typeof isStaleSnapshot("2026-01-01", new Date("2026-06-10"))).toBe("boolean"); });
  it("isStaleSnapshot with old date returns true", () => { expect(isStaleSnapshot("2026-01-01", new Date("2026-06-10"))).toBe(true); });
  it("isStaleSnapshot with recent date returns false", () => { expect(isStaleSnapshot("2026-05-31", new Date("2026-06-10"))).toBe(false); });
  it("missingCriticalMetrics({}) returns non-empty array", () => { expect(missingCriticalMetrics({}).length).toBeGreaterThan(0); });
});

describe("founder-recovery validation", () => {
  it("accepts a valid business with a supported type", () => {
    const r = businessCreateSchema.safeParse({
      name: "Tumbledry MG Road",
      businessType: "laundry_local_service",
      currency: "INR",
      location: "Bengaluru",
    });
    expect(r.success).toBe(true);
  });

  it("rejects an unsupported business type", () => {
    const r = businessCreateSchema.safeParse({
      name: "X",
      businessType: "spaceship_factory",
      currency: "INR",
    });
    expect(r.success).toBe(false);
  });

  it("requires reporting period and currency on a snapshot", () => {
    const r = metricSnapshotSchema.safeParse({ revenue: 1000 });
    expect(r.success).toBe(false);
  });

  it("rejects negative revenue but allows negative profit", () => {
    expect(
      metricSnapshotSchema.safeParse({
        periodStart: "2026-05-01",
        periodEnd: "2026-05-31",
        currency: "INR",
        revenue: -1,
      }).success
    ).toBe(false);

    expect(
      metricSnapshotSchema.safeParse({
        periodStart: "2026-05-01",
        periodEnd: "2026-05-31",
        currency: "INR",
        revenue: 1000,
        netProfit: -500,
      }).success
    ).toBe(true);
  });

  it("rejects impossible values (B2B+B2C > revenue, repeat > orders, end < start)", () => {
    expect(
      metricSnapshotSchema.safeParse({
        periodStart: "2026-05-01",
        periodEnd: "2026-05-31",
        currency: "INR",
        revenue: 100,
        b2bRevenue: 80,
        b2cRevenue: 80,
      }).success
    ).toBe(false);

    expect(
      metricSnapshotSchema.safeParse({
        periodStart: "2026-05-01",
        periodEnd: "2026-05-31",
        currency: "INR",
        orderCount: 10,
        repeatCustomers: 20,
      }).success
    ).toBe(false);

    expect(
      metricSnapshotSchema.safeParse({
        periodStart: "2026-05-31",
        periodEnd: "2026-05-01",
        currency: "INR",
      }).success
    ).toBe(false);
  });

  it("flags missing critical metrics without rejecting", () => {
    expect(missingCriticalMetrics({ revenue: 1000 })).toEqual(
      expect.arrayContaining(["totalCosts", "orderCount"])
    );
    expect(missingCriticalMetrics({ revenue: 1, totalCosts: 1, orderCount: 1 })).toEqual([]);
  });

  it("detects stale snapshots", () => {
    const now = new Date("2026-06-10");
    expect(isStaleSnapshot("2026-01-31", now)).toBe(true);
    expect(isStaleSnapshot("2026-05-31", now)).toBe(false);
  });
});
