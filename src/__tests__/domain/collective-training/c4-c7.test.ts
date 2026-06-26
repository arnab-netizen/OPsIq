import { describe, it, expect } from "vitest";
import type { DomainSignalInput } from "@/domain/collective-training/collective-types";
import { aggregateSignals } from "@/domain/collective-training/signal-aggregator";
import { rankSignals } from "@/domain/collective-training/priority-engine";
import { resolveVetoes } from "@/domain/collective-training/veto-resolver";
import { detectContradictions } from "@/domain/collective-training/contradiction-resolver";
import { generateWhatNotToDo } from "@/domain/collective-training/what-not-to-do-generator";

function sig(domain: string, status: DomainSignalInput["status"], severity: DomainSignalInput["severity"], confidence: DomainSignalInput["confidence"] = "HIGH"): DomainSignalInput {
  return { domain: domain as DomainSignalInput["domain"], status, severity, confidence };
}
const G = (d: string): DomainSignalInput => sig(d, "GREEN", "LOW");
const R = (d: string): DomainSignalInput => sig(d, "RED", "HIGH");

describe("[C4] cross-domain priority engine", () => {
  it("compliance/safety outranks all other red domains", () => {
    const agg = aggregateSignals([R("cash-survival"), R("risk-compliance"), R("marketing")]);
    expect(rankSignals(agg).bindingConstraint?.domain).toBe("risk-compliance");
  });
  it("cash survival outranks marketing/growth", () => {
    const agg = aggregateSignals([R("marketing"), R("cash-survival"), R("growth-readiness")]);
    expect(rankSignals(agg).bindingConstraint?.domain).toBe("cash-survival");
  });
  it("quality red outranks marketing and scale", () => {
    const agg = aggregateSignals([R("marketing"), R("scale-readiness"), R("quality")]);
    expect(rankSignals(agg).bindingConstraint?.domain).toBe("quality");
  });
  it("capacity red outranks demand-side marketing", () => {
    const ranked = rankSignals(aggregateSignals([R("marketing"), R("capacity")])).ranked;
    expect(ranked.findIndex((r) => r.domain === "capacity")).toBeLessThan(ranked.findIndex((r) => r.domain === "marketing"));
  });
  it("profit repair outranks revenue growth", () => {
    const ranked = rankSignals(aggregateSignals([R("growth-readiness"), R("profit-improvement")])).ranked;
    expect(ranked.findIndex((r) => r.domain === "profit-improvement")).toBeLessThan(ranked.findIndex((r) => r.domain === "growth-readiness"));
  });
  it("scale readiness cannot outrank process control when SOP weak", () => {
    const ranked = rankSignals(aggregateSignals([R("scale-readiness"), R("sop-process")])).ranked;
    expect(ranked.findIndex((r) => r.domain === "sop-process")).toBeLessThan(ranked.findIndex((r) => r.domain === "scale-readiness"));
  });
});

describe("[C5] collective veto resolver (wires F6)", () => {
  it("cash red blocks marketing/growth/expansion/hiring/bulk buying", () => {
    const r = resolveVetoes(aggregateSignals([R("cash-survival")]));
    expect(r.blockedActions).toEqual(expect.arrayContaining(["paid_marketing", "growth", "expansion", "hiring", "bulk_inventory_purchase"]));
    expect(r.activeVetoes.some((v) => v.domain === "cash-survival")).toBe(true);
  });
  it("compliance uncertainty blocks/escalates", () => {
    const r = resolveVetoes(aggregateSignals([R("risk-compliance")]));
    expect(r.context.complianceOrSafetyUncertain).toBe(true);
    expect(r.blockedActions).toEqual(expect.arrayContaining(["growth", "scale"]));
  });
  it("quality red blocks marketing/growth/scale", () => {
    const r = resolveVetoes(aggregateSignals([R("quality")]));
    expect(r.blockedActions).toEqual(expect.arrayContaining(["paid_marketing", "growth", "scale"]));
  });
  it("capacity red blocks demand generation", () => {
    const r = resolveVetoes(aggregateSignals([R("capacity")]));
    expect(r.blockedActions).toContain("demand_generation");
  });
  it("negative margin blocks discounting/revenue chasing", () => {
    const r = resolveVetoes(aggregateSignals([R("profit-improvement")]));
    expect(r.blockedActions).toEqual(expect.arrayContaining(["discounting_below_margin", "revenue_chasing"]));
  });
  it("missing proof blocks closure/learning/high confidence", () => {
    const r = resolveVetoes(aggregateSignals([G("cash-survival")]), { missingCriticalProof: true });
    expect(r.blockedActions).toEqual(expect.arrayContaining(["closure_without_proof", "learning_admission", "confident_diagnosis"]));
  });
  it("contradiction blocks confident diagnosis; unverified outcome blocks learning", () => {
    const r = resolveVetoes(aggregateSignals([G("cash-survival")]), { contradictoryData: true, unverifiedOutcome: true });
    expect(r.blockedActions).toContain("confident_diagnosis");
    expect(r.blockedActions).toContain("learning_admission");
  });
  it("owner overload veto cannot be relaxed by preference but is relaxed by survival", () => {
    const overload = resolveVetoes(aggregateSignals([R("owner-workload")]));
    expect(overload.blockedActions).toContain("owner_heavy_action");
    const survival = resolveVetoes(aggregateSignals([R("owner-workload"), R("cash-survival")]));
    expect(survival.blockedActions).not.toContain("owner_heavy_action");
  });
});

describe("[C6] contradiction resolver", () => {
  it("owner claim contradicted by data downgrades confidence", () => {
    const r = detectContradictions({ ownerClaim: { text: "sales are fine", contradictedByEvidence: true } });
    expect(r.downgradeConfidence).toBe(true);
  });
  it("staff completion without proof blocks closure", () => {
    const r = detectContradictions({ staffCompletionClaim: { text: "done", proofPresent: false } });
    expect(r.blockClosure).toBe(true);
  });
  it("revenue up but cash/profit down prevents success classification", () => {
    expect(detectContradictions({ revenueUp: true, profitDown: true }).preventSuccess).toBe(true);
    expect(detectContradictions({ revenueUp: true, cashDown: true }).preventSuccess).toBe(true);
  });
  it("campaign success contradicted by complaints/harm prevents success", () => {
    expect(detectContradictions({ marketingClaimedSuccess: true, complaintsUp: true }).preventSuccess).toBe(true);
  });
});

describe("[C7] what-not-to-do generator", () => {
  it("cash critical produces anti-actions", () => {
    const v = resolveVetoes(aggregateSignals([R("cash-survival")]));
    const w = generateWhatNotToDo({ blockedActions: v.blockedActions, context: v.context, lowDataConfidence: false, hasContradiction: false, redDomains: ["cash-survival"] });
    expect(w.prohibited.length).toBeGreaterThan(0);
  });
  it("quality red produces anti-actions", () => {
    const v = resolveVetoes(aggregateSignals([R("quality")]));
    const w = generateWhatNotToDo({ blockedActions: v.blockedActions, context: v.context, lowDataConfidence: false, hasContradiction: false, redDomains: ["quality"] });
    expect(w.prohibited.length).toBeGreaterThan(0);
  });
  it("capacity red produces anti-actions", () => {
    const v = resolveVetoes(aggregateSignals([R("capacity")]));
    const w = generateWhatNotToDo({ blockedActions: v.blockedActions, context: v.context, lowDataConfidence: false, hasContradiction: false, redDomains: ["capacity"] });
    expect(w.prohibited.length).toBeGreaterThan(0);
  });
  it("low data confidence produces proof anti-actions", () => {
    const v = resolveVetoes(aggregateSignals([G("cash-survival")]));
    const w = generateWhatNotToDo({ blockedActions: v.blockedActions, context: v.context, lowDataConfidence: true, hasContradiction: false, redDomains: [] });
    expect(w.requiresProof.length).toBeGreaterThan(0);
  });
  it("compliance uncertainty produces escalation anti-actions", () => {
    const v = resolveVetoes(aggregateSignals([R("risk-compliance")]));
    const w = generateWhatNotToDo({ blockedActions: v.blockedActions, context: v.context, lowDataConfidence: false, hasContradiction: false, redDomains: ["risk-compliance"] });
    expect(w.requiresExpertEscalation.length).toBeGreaterThan(0);
  });
});
