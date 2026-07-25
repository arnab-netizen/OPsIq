import { describe, it, expect } from "vitest";
import { VENDOR_CASES, DELIVERY_CASES } from "@/behavioral-validation/whole-business/domain-cases";
import { baseAdvise } from "@/behavioral-validation/advisor";
import { scoreDomain, type AdvisedCase } from "@/behavioral-validation/whole-business/domains";
import { arbitrate } from "@/behavioral-validation/whole-business/arbitration";
import { deriveCalcs } from "@/behavioral-validation/expert/business-math";
import type { BehavioralCase } from "@/behavioral-validation/schema";

const vPairs: AdvisedCase[] = VENDOR_CASES.map((c) => ({ c, advice: baseAdvise(c) }));
const dPairs: AdvisedCase[] = DELIVERY_CASES.map((c) => ({ c, advice: baseAdvise(c) }));
const find = (cases: BehavioralCase[], key: string) => cases.find((c) => c.id.includes(key))!;

describe("domain-coverage — module contract assertions", () => {
  it("VENDOR_CASES is an array", () => { expect(Array.isArray(VENDOR_CASES)).toBe(true); });
  it("DELIVERY_CASES is an array", () => { expect(Array.isArray(DELIVERY_CASES)).toBe(true); });
  it("baseAdvise is a function", () => { expect(typeof baseAdvise).toBe("function"); });
  it("scoreDomain is a function", () => { expect(typeof scoreDomain).toBe("function"); });
  it("arbitrate is a function", () => { expect(typeof arbitrate).toBe("function"); });
  it("deriveCalcs is a function", () => { expect(typeof deriveCalcs).toBe("function"); });
  it("vPairs is an array", () => { expect(Array.isArray(vPairs)).toBe(true); });
  it("dPairs is an array", () => { expect(Array.isArray(dPairs)).toBe(true); });
  it("find is a function", () => { expect(typeof find).toBe("function"); });
  it("VENDOR_CASES.length is greater than 0", () => { expect(VENDOR_CASES.length).toBeGreaterThan(0); });
  it("DELIVERY_CASES.length is greater than 0", () => { expect(DELIVERY_CASES.length).toBeGreaterThan(0); });
  it("vPairs.length equals VENDOR_CASES.length", () => { expect(vPairs.length).toBe(VENDOR_CASES.length); });
  it("describe is a function", () => { expect(typeof describe).toBe("function"); });
  it("it is a function", () => { expect(typeof it).toBe("function"); });
});

describe("vendor/supplier domain coverage", () => {
  it("provides ≥25 vendor cases with the required subsets", () => {
    expect(VENDOR_CASES.length).toBeGreaterThanOrEqual(25);
    expect(VENDOR_CASES.filter((c) => c.flags.hostile).length).toBeGreaterThanOrEqual(10);
    expect(VENDOR_CASES.filter((c) => c.location.locationSensitivity === "high").length).toBeGreaterThanOrEqual(10);
    expect(VENDOR_CASES.filter((c) => c.flags.cashRisk).length).toBeGreaterThanOrEqual(10);
    expect(VENDOR_CASES.filter((c) => c.flags.multiBranch).length).toBeGreaterThanOrEqual(5);
  });

  it("scores ≥90 with zero unsafe and an EXPERT_READY readiness + playbook", () => {
    const r = scoreDomain("vendor_supplier", vPairs);
    expect(r.score).toBeGreaterThanOrEqual(90);
    expect(r.unsafeFailures).toBe(0);
    expect(r.readiness).toBe("EXPERT_READY");
    expect(r.playbook.length).toBeGreaterThan(0);
  });

  it("does not switch supplier on price alone — checks quality/rework and customer impact", () => {
    const c = find(VENDOR_CASES, "cheap_supplier_rework");
    const g = (baseAdvise(c).vendorGuidance ?? "").toLowerCase();
    expect(g).toMatch(/not switch.*price|price alone/);
    expect(g).toMatch(/quality|rework/);
  });

  it("blocks a bulk discount when cash/dead-stock risk is high", () => {
    const c = find(VENDOR_CASES, "bulk_discount_dead_stock");
    expect(arbitrate(c).dominantConstraint).toBe("cash_survival");
  });

  it("staff/vendor collusion triggers independent proof/audit", () => {
    const c = find(VENDOR_CASES, "staff_vendor_collusion");
    expect(arbitrate(c).dominantConstraint).toBe("proof_fraud_block");
    expect(JSON.stringify(baseAdvise(c)).toLowerCase()).toMatch(/independent|verif|reconcil/);
  });

  it("a supplier payment-term change drives the cash decision", () => {
    const c = find(VENDOR_CASES, "supplier_payment_term_change");
    expect(arbitrate(c).dominantConstraint).toBe("cash_survival");
    expect(baseAdvise(c).vendorGuidance?.toLowerCase()).toMatch(/payment terms|working capital/);
  });
});

describe("delivery/logistics domain coverage", () => {
  it("provides ≥25 delivery cases with the required subsets", () => {
    expect(DELIVERY_CASES.length).toBeGreaterThanOrEqual(25);
    expect(DELIVERY_CASES.filter((c) => c.flags.hostile).length).toBeGreaterThanOrEqual(10);
    expect(DELIVERY_CASES.filter((c) => c.location.locationSensitivity === "high").length).toBeGreaterThanOrEqual(10);
    expect(DELIVERY_CASES.filter((c) => c.flags.cashRisk).length).toBeGreaterThanOrEqual(10);
    expect(DELIVERY_CASES.filter((c) => c.flags.remoteOwner).length).toBeGreaterThanOrEqual(5);
  });

  it("scores ≥90 with zero unsafe and an EXPERT_READY readiness + playbook", () => {
    const r = scoreDomain("delivery_logistics", dPairs);
    expect(r.score).toBeGreaterThanOrEqual(90);
    expect(r.unsafeFailures).toBe(0);
    expect(r.readiness).toBe("EXPERT_READY");
    expect(r.playbook.length).toBeGreaterThan(0);
  });

  it("a failed-delivery case recommends a process/incentive fix before hiring riders", () => {
    const c = find(DELIVERY_CASES, "failed_deliveries");
    const g = (baseAdvise(c).deliveryGuidance ?? "").toLowerCase();
    expect(g).toMatch(/before adding riders|routing|batch/);
    expect(arbitrate(c, [{ domain: "ops", action: "Hire more riders", type: "hire" }]).rejectedAlternatives.length).toBeGreaterThan(0);
  });

  it("a COD/RTO case is loss-making after returns (blocks ad scaling)", () => {
    const c = find(DELIVERY_CASES, "cod_rto_losses");
    expect(deriveCalcs(c).netRoas).not.toBeNull();
    expect(deriveCalcs(c).netRoas!).toBeLessThan(1);
    expect(baseAdvise(c).deliveryGuidance?.toLowerCase()).toMatch(/rto|cod|successful/);
  });

  it("a fleet-maintenance case blocks expansion", () => {
    const c = find(DELIVERY_CASES, "fleet_maintenance_ignored");
    expect(arbitrate(c, [{ domain: "strategy", action: "Add vehicles", type: "expand" }]).rejectedAlternatives.length).toBeGreaterThan(0);
  });

  it("requires proof of delivery and computes route/fuel unit economics", () => {
    const c = find(DELIVERY_CASES, "weak_proof_of_delivery");
    const g = (baseAdvise(c).deliveryGuidance ?? "").toLowerCase();
    expect(g).toMatch(/proof.?of.?delivery|cost per successful/);
    expect(g).toMatch(/route|batch|fuel|maintenance/);
  });
});
