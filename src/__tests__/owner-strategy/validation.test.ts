/**
 * Owner Strategy (Module 8 Slice 5) — write-path validation tests (no DB).
 * Proves the route schemas accept valid payloads (incl. negative revenue/cost
 * deltas) and reject invalid ones, and that the shared status machine rejects
 * invalid action transitions.
 */
import { describe, it, expect } from "vitest";
import {
  strategySnapshotCreateSchema,
  strategyActionUpdateSchema,
  strategyVerifySchema,
  runStrategyDiagnosisSchema,
} from "@/domain/owner-strategy/validation";
import { canTransition } from "@/domain/founder-recovery/action-status";

const validSnapshot = {
  periodStart: "2026-05-01",
  periodEnd: "2026-05-31",
  currency: "INR",
  expectedRevenueChange: 100000,
  costChange: 30000,
  investmentRequired: 200000,
  riskLevel: "low",
};

describe("Owner Strategy — snapshot create schema", () => {
  it("accepts a valid payload", () => {
    expect(strategySnapshotCreateSchema.safeParse(validSnapshot).success).toBe(true);
  });
  it("accepts negative revenue/cost deltas (a dip or a cost cut is valid)", () => {
    expect(strategySnapshotCreateSchema.safeParse({ ...validSnapshot, expectedRevenueChange: -5000, costChange: -20000 }).success).toBe(true);
  });
  it("rejects negative investment (fail closed)", () => {
    expect(strategySnapshotCreateSchema.safeParse({ ...validSnapshot, investmentRequired: -1 }).success).toBe(false);
  });
  it("rejects period end before start", () => {
    expect(
      strategySnapshotCreateSchema.safeParse({ ...validSnapshot, periodStart: "2026-05-31", periodEnd: "2026-05-01" }).success
    ).toBe(false);
  });
  it("rejects a missing currency", () => {
    const { currency, ...noCurrency } = validSnapshot;
    void currency;
    expect(strategySnapshotCreateSchema.safeParse(noCurrency).success).toBe(false);
  });
  it("rejects unknown risk level + business model values", () => {
    expect(strategySnapshotCreateSchema.safeParse({ ...validSnapshot, riskLevel: "extreme" }).success).toBe(false);
    expect(strategySnapshotCreateSchema.safeParse({ ...validSnapshot, businessModel: "spaceship" }).success).toBe(false);
  });
  it("accepts a period+currency-only payload — missing stays missing", () => {
    expect(
      strategySnapshotCreateSchema.safeParse({ periodStart: "2026-05-01", periodEnd: "2026-05-31", currency: "INR" }).success
    ).toBe(true);
  });
});

describe("Owner Strategy — diagnosis/action/verify schemas", () => {
  it("diagnosis requires a uuid snapshotId", () => {
    expect(runStrategyDiagnosisSchema.safeParse({ snapshotId: "not-a-uuid" }).success).toBe(false);
    expect(runStrategyDiagnosisSchema.safeParse({ snapshotId: "11111111-1111-4111-8111-111111111111" }).success).toBe(true);
  });
  it("action update accepts a valid status and rejects an unknown status", () => {
    expect(strategyActionUpdateSchema.safeParse({ status: "assigned" }).success).toBe(true);
    expect(strategyActionUpdateSchema.safeParse({ status: "teleported" }).success).toBe(false);
  });
  it("verify requires targetDirection up/down", () => {
    expect(strategyVerifySchema.safeParse({ beforeValue: 70, afterValue: 95, targetDirection: "up" }).success).toBe(true);
    expect(strategyVerifySchema.safeParse({ beforeValue: 70, afterValue: 95, targetDirection: "sideways" }).success).toBe(false);
  });
});

describe("Owner Strategy — shared status machine rejects invalid transitions", () => {
  it("allows proposed→assigned→in_progress→completed", () => {
    expect(canTransition("proposed", "assigned")).toBe(true);
    expect(canTransition("assigned", "in_progress")).toBe(true);
    expect(canTransition("in_progress", "completed")).toBe(true);
  });
  it("rejects illegal jumps (proposed→completed, completed→in_progress)", () => {
    expect(canTransition("proposed", "completed")).toBe(false);
    expect(canTransition("completed", "in_progress")).toBe(false);
  });
});
