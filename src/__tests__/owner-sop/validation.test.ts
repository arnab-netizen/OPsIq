/**
 * Owner SOP (Module 7 Slice 5) — write-path validation tests (no DB).
 * Proves the route schemas accept valid payloads and reject invalid ones, and
 * that the shared status machine rejects invalid action transitions.
 */
import { describe, it, expect } from "vitest";
import {
  sopSnapshotCreateSchema,
  sopActionUpdateSchema,
  sopVerifySchema,
  runSopDiagnosisSchema,
} from "@/domain/owner-sop/validation";
import { canTransition } from "@/domain/founder-recovery/action-status";

const validSnapshot = {
  periodStart: "2026-05-01",
  periodEnd: "2026-05-31",
  currency: "INR",
  actionsAssigned: 100,
  actionsCompleted: 95,
  actionsVerified: 90,
};

describe("Owner SOP — snapshot create schema", () => {
  it("accepts a valid payload", () => {
    expect(sopSnapshotCreateSchema.safeParse(validSnapshot).success).toBe(true);
  });
  it("rejects negative values (fail closed)", () => {
    expect(sopSnapshotCreateSchema.safeParse({ ...validSnapshot, actionsAssigned: -1 }).success).toBe(false);
  });
  it("rejects period end before start", () => {
    expect(
      sopSnapshotCreateSchema.safeParse({ ...validSnapshot, periodStart: "2026-05-31", periodEnd: "2026-05-01" }).success
    ).toBe(false);
  });
  it("rejects a missing currency", () => {
    const { currency, ...noCurrency } = validSnapshot;
    void currency;
    expect(sopSnapshotCreateSchema.safeParse(noCurrency).success).toBe(false);
  });
  it("rejects unknown business model values", () => {
    expect(sopSnapshotCreateSchema.safeParse({ ...validSnapshot, businessModel: "spaceship" }).success).toBe(false);
  });
  it("accepts a period+currency-only payload — missing stays missing", () => {
    expect(
      sopSnapshotCreateSchema.safeParse({ periodStart: "2026-05-01", periodEnd: "2026-05-31", currency: "INR" }).success
    ).toBe(true);
  });
});

describe("Owner SOP — diagnosis/action/verify schemas", () => {
  it("diagnosis requires a uuid snapshotId", () => {
    expect(runSopDiagnosisSchema.safeParse({ snapshotId: "not-a-uuid" }).success).toBe(false);
    expect(runSopDiagnosisSchema.safeParse({ snapshotId: "11111111-1111-4111-8111-111111111111" }).success).toBe(true);
  });
  it("action update accepts a valid status and rejects an unknown status", () => {
    expect(sopActionUpdateSchema.safeParse({ status: "assigned" }).success).toBe(true);
    expect(sopActionUpdateSchema.safeParse({ status: "teleported" }).success).toBe(false);
  });
  it("verify requires targetDirection up/down", () => {
    expect(sopVerifySchema.safeParse({ beforeValue: 70, afterValue: 95, targetDirection: "up" }).success).toBe(true);
    expect(sopVerifySchema.safeParse({ beforeValue: 70, afterValue: 95, targetDirection: "sideways" }).success).toBe(false);
  });
});

describe("Owner SOP — shared status machine rejects invalid transitions", () => {
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
