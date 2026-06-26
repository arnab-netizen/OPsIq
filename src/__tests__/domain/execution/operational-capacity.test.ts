import { describe, it, expect } from "vitest";
import {
  CapacityStatus as Cap,
  BurdenLevel as B,
  ProofBurden as PB,
  computeCapacityStatus,
  computeBurdenLevel,
  evaluateExpressRequest,
  proofBurdenForRisk,
  proofBurdenForTask,
  LAUNDRY_CAPACITY_FACTORS,
  HOUSEKEEPING_CAPACITY_FACTORS,
} from "@/domain/execution/operational-capacity";
import { ProofRiskLevel } from "@/domain/execution/proof";

describe("computeCapacityStatus", () => {
  it("GREEN when all factors are comfortably below threshold", () => {
    expect(computeCapacityStatus({ utilizations: [0.2, 0.5, 0.7] })).toBe(Cap.GREEN);
  });
  it("YELLOW near capacity, RED at/over capacity", () => {
    expect(computeCapacityStatus({ utilizations: [0.85] })).toBe(Cap.YELLOW);
    expect(computeCapacityStatus({ utilizations: [0.4, 1.0] })).toBe(Cap.RED);
  });
  it("UNKNOWN when any factor is unknown or no data", () => {
    expect(computeCapacityStatus({ utilizations: [0.3], anyUnknown: true })).toBe(Cap.UNKNOWN);
    expect(computeCapacityStatus({ utilizations: [] })).toBe(Cap.UNKNOWN);
  });
  it("documents the laundry + housekeeping factor sets", () => {
    expect(LAUNDRY_CAPACITY_FACTORS.length).toBeGreaterThanOrEqual(8);
    expect(HOUSEKEEPING_CAPACITY_FACTORS.length).toBeGreaterThanOrEqual(8);
  });
});

describe("computeBurdenLevel", () => {
  it("scales LOW → CRITICAL with utilization", () => {
    expect(computeBurdenLevel({ utilizations: [0.2] })).toBe(B.LOW);
    expect(computeBurdenLevel({ utilizations: [0.6] })).toBe(B.MEDIUM);
    expect(computeBurdenLevel({ utilizations: [0.85] })).toBe(B.HIGH);
    expect(computeBurdenLevel({ utilizations: [1.1] })).toBe(B.CRITICAL);
  });
});

describe("evaluateExpressRequest", () => {
  it("RED capacity blocks express work and requires approval", () => {
    const d = evaluateExpressRequest(Cap.RED);
    expect(d.allowed).toBe(false);
    expect(d.needsOwnerApproval).toBe(true);
  });
  it("UNKNOWN capacity requires owner approval", () => {
    const d = evaluateExpressRequest(Cap.UNKNOWN);
    expect(d.allowed).toBe(false);
    expect(d.needsOwnerApproval).toBe(true);
    expect(d.reason).toMatch(/UNKNOWN/);
  });
  it("GREEN capacity allows express; an owner exception allows it under RED", () => {
    expect(evaluateExpressRequest(Cap.GREEN).allowed).toBe(true);
    expect(evaluateExpressRequest(Cap.RED, true).allowed).toBe(true);
  });
});

describe("proof burden", () => {
  it("routine low-risk work uses minimal proof", () => {
    expect(proofBurdenForRisk(ProofRiskLevel.LOW)).toBe(PB.MINIMAL);
    expect(proofBurdenForTask("send_reminder", ProofRiskLevel.LOW)).toBe(PB.MINIMAL);
  });
  it("high-risk complaint/lost/payment tasks require stronger proof", () => {
    expect(proofBurdenForRisk(ProofRiskLevel.HIGH)).toBe(PB.STRONG);
    expect(proofBurdenForTask("customer_complaint", ProofRiskLevel.LOW)).toBe(PB.STRONG);
    expect(proofBurdenForTask("lost_or_damaged_item", ProofRiskLevel.LOW)).toBe(PB.STRONG);
    expect(proofBurdenForTask("payment_issue", ProofRiskLevel.LOW)).toBe(PB.STRONG);
  });
});
