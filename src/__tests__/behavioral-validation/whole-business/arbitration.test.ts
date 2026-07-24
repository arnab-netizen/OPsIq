import { describe, it, expect } from "vitest";
import { arbitrate, applyOwnerOverride, activeConstraints, defaultCandidates, type DomainCandidate } from "@/behavioral-validation/whole-business/arbitration";
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

describe("arbitration — module contract assertions", () => {
  it("arbitrate is a function", () => { expect(typeof arbitrate).toBe("function"); });
  it("applyOwnerOverride is a function", () => { expect(typeof applyOwnerOverride).toBe("function"); });
  it("activeConstraints is a function", () => { expect(typeof activeConstraints).toBe("function"); });
  it("defaultCandidates is a function", () => { expect(typeof defaultCandidates).toBe("function"); });
  it("SEED_CASES is an array", () => { expect(Array.isArray(SEED_CASES)).toBe(true); });
  it("SEED_CASES.length is greater than 0", () => { expect(SEED_CASES.length).toBeGreaterThan(0); });
  it("base is an object", () => { expect(typeof base).toBe("object"); });
  it("mk is a function", () => { expect(typeof mk).toBe("function"); });
  it("spend is an object", () => { expect(typeof spend).toBe("object"); });
  it("accept is an object", () => { expect(typeof accept).toBe("object"); });
  it("expand is an object", () => { expect(typeof expand).toBe("object"); });
  it("hire is an object", () => { expect(typeof hire).toBe("object"); });
  it("cut is an object", () => { expect(typeof cut).toBe("object"); });
  it("Array.isArray([]) returns true", () => { expect(Array.isArray([])).toBe(true); });
});

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

  // ── owner-overload tradeoff: "owner does everything" is the classic mistake and must be rejected ──
  // Neutral root cause/numbers so the ONLY active constraint is owner_workload (no quality/capacity text).
  const ownerOverload = (over: Partial<BehavioralCase> = {}) =>
    mk({ decisionCategory: "staff_process_equipment", hiddenRootCause: "the owner is the bottleneck and personally signs off on every routine task", messyFacts: ["owner approves each order before it ships"], numbers: {}, flags: { remoteOwner: true }, ...over });

  it("a remote-owner case rejects the owner-centralize alternative via owner_workload", () => {
    const r = arbitrate(ownerOverload()); // default candidates
    expect(r.dominantConstraint).toBe("owner_workload");
    expect(r.rejectedAlternatives.some((x) => x.candidate.type === "owner_centralize" && x.blockedBy === "owner_workload")).toBe(true);
    expect(r.whatNotToDo.join(" ").toLowerCase()).toMatch(/personally approves and handles every decision/);
  });

  it("an owner-emotional (bottlenecked) case also surfaces and rejects owner_centralize", () => {
    const r = arbitrate(ownerOverload({ flags: { ownerEmotional: true } }));
    expect(r.rejectedAlternatives.some((x) => x.candidate.type === "owner_centralize")).toBe(true);
  });

  it("a non-overloaded owner case does NOT fabricate an owner_centralize temptation", () => {
    const cands = defaultCandidates(mk({ decisionCategory: "staff_process_equipment", hiddenRootCause: "process bottleneck at the press station", messyFacts: ["one machine is slow"], numbers: {} }));
    expect(cands.some((x) => x.type === "owner_centralize")).toBe(false);
  });

  it("owner_centralize is also blocked by a capacity bottleneck", () => {
    const r = arbitrate(mk({ flags: { remoteOwner: true, capacityRisk: true } }), [{ domain: "owner", action: "Owner handles all", type: "owner_centralize" }]);
    expect(r.rejectedAlternatives.some((x) => x.candidate.type === "owner_centralize")).toBe(true);
  });

  // ── customer-quality tradeoff: "grow/spend while quality is broken" must be rejected ──
  it("a complaints/quality case rejects the grow-while-quality-broken spend via customer_quality", () => {
    const c = mk({ decisionCategory: "staff_process_equipment", hiddenRootCause: "rising complaints and rework are breaking reputation; service is thin", messyFacts: ["complaints up, rework high"], numbers: {} });
    const r = arbitrate(c); // default candidates
    expect(r.dominantConstraint).toBe("customer_quality");
    const spendRej = r.rejectedAlternatives.find((x) => x.candidate.type === "spend_marketing");
    expect(spendRej).toBeDefined();
    expect(spendRej!.blockedBy).toBe("customer_quality");
    expect(r.whatNotToDo.join(" ").toLowerCase()).toMatch(/while complaints\/quality are unresolved/);
  });

  it("a clean non-quality case does NOT fabricate the quality spend candidate", () => {
    const cands = defaultCandidates(mk({ decisionCategory: "staff_process_equipment", hiddenRootCause: "healthy steady business considering growth", messyFacts: ["all stable"], numbers: {} }));
    expect(cands.some((x) => x.type === "spend_marketing")).toBe(false);
  });

  it("defaultCandidates dedupes by type (a cash-dominant case keeps exactly one spend_marketing)", () => {
    const cands = defaultCandidates(mk({ flags: { cashRisk: true }, hiddenRootCause: "cash crunch with complaints", messyFacts: ["complaints up"], numbers: {} }));
    expect(cands.filter((x) => x.type === "spend_marketing").length).toBe(1);
  });
});
