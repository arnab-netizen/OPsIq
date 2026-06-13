/**
 * Owner Sales (Module 3 Slice 5) — write-path validation tests (no DB).
 * Proves the route schemas accept valid payloads and reject invalid ones, and
 * that the shared status machine rejects invalid action transitions.
 */
import { describe, it, expect } from "vitest";
import {
  salesSnapshotCreateSchema,
  salesActionUpdateSchema,
  salesVerifySchema,
  runSalesDiagnosisSchema,
} from "@/domain/owner-sales/validation";
import { canTransition } from "@/domain/founder-recovery/action-status";

const validSnapshot = {
  periodStart: "2026-05-01",
  periodEnd: "2026-05-31",
  currency: "INR",
  leads: 1000,
  orders: 350,
  revenue: 700000,
  newCustomers: 150,
  repeatCustomers: 200,
};

describe("Owner Sales — snapshot create schema", () => {
  it("accepts a valid payload", () => {
    expect(salesSnapshotCreateSchema.safeParse(validSnapshot).success).toBe(true);
  });
  it("rejects negative values (fail closed)", () => {
    expect(salesSnapshotCreateSchema.safeParse({ ...validSnapshot, orders: -1 }).success).toBe(false);
  });
  it("rejects period end before start", () => {
    expect(
      salesSnapshotCreateSchema.safeParse({ ...validSnapshot, periodStart: "2026-05-31", periodEnd: "2026-05-01" }).success
    ).toBe(false);
  });
  it("rejects a missing currency", () => {
    const { currency, ...noCurrency } = validSnapshot;
    void currency;
    expect(salesSnapshotCreateSchema.safeParse(noCurrency).success).toBe(false);
  });
  it("rejects unknown business model values", () => {
    expect(salesSnapshotCreateSchema.safeParse({ ...validSnapshot, businessModel: "spaceship" }).success).toBe(false);
  });
  it("accepts a period+currency-only payload — missing stays missing", () => {
    expect(
      salesSnapshotCreateSchema.safeParse({ periodStart: "2026-05-01", periodEnd: "2026-05-31", currency: "INR" }).success
    ).toBe(true);
  });
});

describe("Owner Sales — diagnosis/action/verify schemas", () => {
  it("diagnosis requires a uuid snapshotId", () => {
    expect(runSalesDiagnosisSchema.safeParse({ snapshotId: "not-a-uuid" }).success).toBe(false);
    expect(runSalesDiagnosisSchema.safeParse({ snapshotId: "11111111-1111-4111-8111-111111111111" }).success).toBe(true);
  });
  it("action update accepts a valid status and rejects an unknown status", () => {
    expect(salesActionUpdateSchema.safeParse({ status: "assigned" }).success).toBe(true);
    expect(salesActionUpdateSchema.safeParse({ status: "teleported" }).success).toBe(false);
  });
  it("verify requires targetDirection up/down", () => {
    expect(salesVerifySchema.safeParse({ beforeValue: 15, afterValue: 30, targetDirection: "up" }).success).toBe(true);
    expect(salesVerifySchema.safeParse({ beforeValue: 15, afterValue: 30, targetDirection: "sideways" }).success).toBe(false);
  });
});

describe("Owner Sales — shared status machine rejects invalid transitions", () => {
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
