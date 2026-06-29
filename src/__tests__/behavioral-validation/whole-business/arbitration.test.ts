import { describe, it, expect } from "vitest";
import { arbitrate, applyOwnerOverride, activeConstraints, type DomainCandidate } from "@/behavioral-validation/whole-business/arbitration";
import { SEED_CASES } from "@/behavioral-validation/seed-cases";
import type { BehavioralCase } from "@/behavioral-validation/schema";

const base = SEED_CASES[0];
function mk(over: Partial<BehavioralCase>): BehavioralCase {
  return { ...base, ...over, flags: { ...base.flags, hostile: false, missingOrStaleData: false, cashRisk: false, capacityRisk: false, complianceRisk: false, ownerEmotional: false, remoteOwner: false, multiBranch: false, ...(over.flags ?? {}) } };
}
const spend: DomainCandidate = { domain: "marketing", action: "Spend on marketing", type: "spend_marketing" };
const accept: DomainCandidate = { domain: "sales", action: "Accept the contract", type: "accept_contract" };
const expand: DomainCandidate = { domain: "strategy", action: "Open a new branch", type: "expand" };
const hire: DomainCandidate = { domain: "ops", action: "Hire more staff", type: "hire" };
const cut: DomainCandidate = { domain: "finance", action: "Cut staff to save cost", type: "cut_staff" };

describe("cross-domain arbitration", () => {
  it("marketing spend is blocked by a cash-critical state", () => {
    const r = arbitrate(mk({ flags: { cashRisk: true } }), [spend]);
    expect(r.dominantConstraint).toBe("cash_survival");
    expect(r.rejectedAlternatives[0].blockedBy).toBe("cash_survival");
    expect(r.acceptedAlternatives).toEqual([]);
  });

  it("a sales contract is blocked by below-margin terms", () => {
    const c = mk({ decisionCategory: "marketing_opportunity_contract", numbers: { consideredRate: 15, fullyLoadedCost: 20, paymentTermsDays: 45 } });
    const r = arbitrate(c, [accept]);
    expect(r.rejectedAlternatives.some((x) => x.blockedBy === "below_margin")).toBe(true);
  });

  it("expansion is blocked when capacity is red", () => {
    const r = arbitrate(mk({ flags: { capacityRisk: true } }), [expand]);
    expect(r.rejectedAlternatives.some((x) => x.blockedBy === "capacity_feasibility")).toBe(true);
  });

  it("hiring is blocked by a process/capacity bottleneck", () => {
    const r = arbitrate(mk({ flags: { capacityRisk: true } }), [hire]);
    expect(r.rejectedAlternatives.some((x) => x.blockedBy === "capacity_feasibility")).toBe(true);
  });

  it("staff cuts are blocked by service-quality risk", () => {
    const c = mk({ hiddenRootCause: "rising complaints and rework are breaking reputation; service is already thin" });
    const r = arbitrate(c, [cut]);
    expect(r.rejectedAlternatives.some((x) => x.blockedBy === "customer_quality")).toBe(true);
  });

  it("growth is blocked by a complaint/reputation issue", () => {
    const c = mk({ hiddenRootCause: "rising complaints and rework are breaking reputation", flags: { capacityRisk: true } });
    const r = arbitrate(c, [spend, expand]);
    expect(r.rejectedAlternatives.length).toBeGreaterThanOrEqual(1);
    expect(r.whatNotToDo.length).toBeGreaterThan(0);
  });

  it("a profitable opportunity is deferred for working-capital/cash risk", () => {
    const c = mk({ decisionCategory: "marketing_opportunity_contract", flags: { cashRisk: true }, numbers: { consideredRate: 30, fullyLoadedCost: 10, paymentTermsDays: 60 } });
    const r = arbitrate(c, [accept]);
    expect(r.rejectedAlternatives.some((x) => x.blockedBy === "cash_survival")).toBe(true);
  });

  it("compliance and proof blocks dominate everything", () => {
    expect(activeConstraints(mk({ flags: { complianceRisk: true } }))[0]).toBe("compliance_block");
    expect(activeConstraints(mk({ flags: { hostile: true } }))[0]).toBe("proof_fraud_block");
  });

  it("owner override requires a recorded reason and is audited", () => {
    const r = arbitrate(mk({ flags: { cashRisk: true } }), [spend]);
    expect(() => applyOwnerOverride(r, { reason: "", actor: "owner", at: "t" })).toThrow();
    const overridden = applyOwnerOverride(r, { reason: "Owner accepts the cash risk for a strategic client", actor: "owner", at: "2026-06-29T00:00:00Z" });
    expect(overridden.overridden).toBe(true);
    expect(overridden.overrideAudit?.reason.length).toBeGreaterThan(8);
  });

  it("the result exposes rejected alternatives and a reconsideration condition", () => {
    const r = arbitrate(mk({ flags: { cashRisk: true } }), [spend, expand]);
    expect(r.rejectedAlternatives.length).toBeGreaterThan(0);
    expect(r.requiredProofToReconsider.length).toBeGreaterThan(0);
    expect(r.reassessmentDate).toMatch(/reassess/i);
  });
});
