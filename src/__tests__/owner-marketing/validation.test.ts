/**
 * Owner Marketing (Module 6 Slice 5) — write-path validation tests (no DB).
 * Proves the route schemas accept valid payloads and reject invalid ones, and
 * that the shared status machine rejects invalid action transitions.
 */
import { describe, it, expect } from "vitest";
import {
  marketingSnapshotCreateSchema,
  marketingActionUpdateSchema,
  marketingVerifySchema,
  runMarketingDiagnosisSchema,
} from "@/domain/owner-marketing/validation";
import { canTransition } from "@/domain/founder-recovery/action-status";

const validSnapshot = {
  periodStart: "2026-05-01",
  periodEnd: "2026-05-31",
  currency: "INR",
  marketingSpend: 50000,
  leads: 500,
  orders: 100,
};

describe("Owner Marketing — snapshot create schema", () => {
  it("accepts a valid payload", () => {
    expect(marketingSnapshotCreateSchema.safeParse(validSnapshot).success).toBe(true);
  });
  it("rejects negative values (fail closed)", () => {
    expect(marketingSnapshotCreateSchema.safeParse({ ...validSnapshot, marketingSpend: -1 }).success).toBe(false);
  });
  it("rejects period end before start", () => {
    expect(
      marketingSnapshotCreateSchema.safeParse({ ...validSnapshot, periodStart: "2026-05-31", periodEnd: "2026-05-01" }).success
    ).toBe(false);
  });
  it("rejects a missing currency", () => {
    const { currency, ...noCurrency } = validSnapshot;
    void currency;
    expect(marketingSnapshotCreateSchema.safeParse(noCurrency).success).toBe(false);
  });
  it("rejects unknown business model values", () => {
    expect(marketingSnapshotCreateSchema.safeParse({ ...validSnapshot, businessModel: "spaceship" }).success).toBe(false);
  });
  it("accepts a period+currency-only payload — missing stays missing", () => {
    expect(
      marketingSnapshotCreateSchema.safeParse({ periodStart: "2026-05-01", periodEnd: "2026-05-31", currency: "INR" }).success
    ).toBe(true);
  });
});

describe("Owner Marketing — diagnosis/action/verify schemas", () => {
  it("diagnosis requires a uuid snapshotId", () => {
    expect(runMarketingDiagnosisSchema.safeParse({ snapshotId: "not-a-uuid" }).success).toBe(false);
    expect(runMarketingDiagnosisSchema.safeParse({ snapshotId: "11111111-1111-4111-8111-111111111111" }).success).toBe(true);
  });
  it("action update accepts a valid status and rejects an unknown status", () => {
    expect(marketingActionUpdateSchema.safeParse({ status: "assigned" }).success).toBe(true);
    expect(marketingActionUpdateSchema.safeParse({ status: "teleported" }).success).toBe(false);
  });
  it("verify requires targetDirection up/down", () => {
    expect(marketingVerifySchema.safeParse({ beforeValue: 70, afterValue: 95, targetDirection: "up" }).success).toBe(true);
    expect(marketingVerifySchema.safeParse({ beforeValue: 70, afterValue: 95, targetDirection: "sideways" }).success).toBe(false);
  });
});

describe("Owner Marketing — shared status machine rejects invalid transitions", () => {
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
