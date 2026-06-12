/**
 * Owner Cashflow (Module 5 Slice 5) — write-path validation tests (no DB).
 * Proves the route schemas accept valid payloads and reject invalid ones, and
 * that the shared status machine rejects invalid action transitions.
 */
import { describe, it, expect } from "vitest";
import {
  cashflowSnapshotCreateSchema,
  cashflowActionUpdateSchema,
  cashflowVerifySchema,
  runCashflowDiagnosisSchema,
} from "@/domain/owner-cashflow/validation";
import { canTransition } from "@/domain/founder-recovery/action-status";

const validSnapshot = {
  periodStart: "2026-05-01",
  periodEnd: "2026-05-31",
  currency: "INR",
  cashInHand: 50000,
  bankBalance: 150000,
  dailyCollections: 8000,
  salaryDue: 40000,
};

describe("Owner Cashflow — snapshot create schema", () => {
  it("accepts a valid payload", () => {
    expect(cashflowSnapshotCreateSchema.safeParse(validSnapshot).success).toBe(true);
  });
  it("rejects negative monetary values (fail closed)", () => {
    expect(cashflowSnapshotCreateSchema.safeParse({ ...validSnapshot, cashInHand: -1 }).success).toBe(
      false
    );
  });
  it("rejects period end before start", () => {
    expect(
      cashflowSnapshotCreateSchema.safeParse({
        ...validSnapshot,
        periodStart: "2026-05-31",
        periodEnd: "2026-05-01",
      }).success
    ).toBe(false);
  });
  it("rejects a missing currency", () => {
    const { currency, ...noCurrency } = validSnapshot;
    void currency;
    expect(cashflowSnapshotCreateSchema.safeParse(noCurrency).success).toBe(false);
  });
  it("rejects unknown business model values", () => {
    expect(
      cashflowSnapshotCreateSchema.safeParse({ ...validSnapshot, businessModel: "spaceship" }).success
    ).toBe(false);
  });
  it("accepts an all-missing-metrics payload (period+currency only) — missing stays missing", () => {
    expect(
      cashflowSnapshotCreateSchema.safeParse({
        periodStart: "2026-05-01",
        periodEnd: "2026-05-31",
        currency: "INR",
      }).success
    ).toBe(true);
  });
});

describe("Owner Cashflow — diagnosis/action/verify schemas", () => {
  it("diagnosis requires a uuid snapshotId", () => {
    expect(runCashflowDiagnosisSchema.safeParse({ snapshotId: "not-a-uuid" }).success).toBe(false);
    expect(
      runCashflowDiagnosisSchema.safeParse({ snapshotId: "11111111-1111-4111-8111-111111111111" })
        .success
    ).toBe(true);
  });
  it("action update accepts a valid status and rejects an unknown status", () => {
    expect(cashflowActionUpdateSchema.safeParse({ status: "assigned" }).success).toBe(true);
    expect(cashflowActionUpdateSchema.safeParse({ status: "teleported" }).success).toBe(false);
  });
  it("verify requires targetDirection up/down", () => {
    expect(
      cashflowVerifySchema.safeParse({ beforeValue: 50, afterValue: 30, targetDirection: "down" })
        .success
    ).toBe(true);
    expect(
      cashflowVerifySchema.safeParse({ beforeValue: 50, afterValue: 30, targetDirection: "sideways" })
        .success
    ).toBe(false);
  });
});

describe("Owner Cashflow — shared status machine rejects invalid transitions", () => {
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
