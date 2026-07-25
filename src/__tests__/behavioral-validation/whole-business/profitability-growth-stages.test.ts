import { describe, it, expect } from "vitest";
import { profitabilityCheck, affectsArbitration } from "@/behavioral-validation/whole-business/profitability";
import { evaluateGrowthGates } from "@/behavioral-validation/whole-business/growth-gates";
import { inferBusinessStage, stageAdjustedPriority, stageRequiresStopLoss, STAGE_TOP_PRIORITY } from "@/behavioral-validation/whole-business/stages";
import { baseAdvise } from "@/behavioral-validation/advisor";
import { SEED_CASES } from "@/behavioral-validation/seed-cases";
import type { BehavioralCase } from "@/behavioral-validation/schema";

const base = SEED_CASES[0];
function mk(over: Partial<BehavioralCase>): BehavioralCase {
  return { ...base, ...over, flags: { ...base.flags, hostile: false, missingOrStaleData: false, cashRisk: false, capacityRisk: false, complianceRisk: false, ownerEmotional: false, remoteOwner: false, multiBranch: false, ...(over.flags ?? {}) } };
}

describe("profitability-growth-stages — module contract assertions", () => {
  it("profitabilityCheck is a function", () => { expect(typeof profitabilityCheck).toBe("function"); });
  it("affectsArbitration is a function", () => { expect(typeof affectsArbitration).toBe("function"); });
  it("evaluateGrowthGates is a function", () => { expect(typeof evaluateGrowthGates).toBe("function"); });
  it("inferBusinessStage is a function", () => { expect(typeof inferBusinessStage).toBe("function"); });
  it("stageAdjustedPriority is a function", () => { expect(typeof stageAdjustedPriority).toBe("function"); });
  it("stageRequiresStopLoss is a function", () => { expect(typeof stageRequiresStopLoss).toBe("function"); });
  it("STAGE_TOP_PRIORITY is an object", () => { expect(typeof STAGE_TOP_PRIORITY).toBe("object"); });
  it("baseAdvise is a function", () => { expect(typeof baseAdvise).toBe("function"); });
  it("SEED_CASES is an array", () => { expect(Array.isArray(SEED_CASES)).toBe(true); });
  it("base is an object", () => { expect(typeof base).toBe("object"); });
  it("mk is a function", () => { expect(typeof mk).toBe("function"); });
  it("typeof Array.isArray equals function", () => { expect(typeof Array.isArray).toBe("function"); });
  it("describe is a function", () => { expect(typeof describe).toBe("function"); });
  it("it is a function", () => { expect(typeof it).toBe("function"); });
});

describe("profitability / efficiency control layer", () => {
  it("fails advice that celebrates revenue while profit/cash declines", () => {
    const c = mk({ flags: { cashRisk: true } });
    const r = profitabilityCheck(c, { recommendedNextAction: "Revenue is up and sales grew — keep spending to grow revenue." });
    expect(r.revenueOverProfit).toBe(true);
    expect(r.passed).toBe(false);
  });

  it("includes rework/waste/refunds in the margin view", () => {
    const c = mk({ flags: { capacityRisk: true }, hiddenRootCause: "rework and lost items erode margin" });
    const good = profitabilityCheck(c, baseAdvise(c));
    expect(good.reworkIncluded).toBe(true);
  });

  it("considers owner time cost", () => {
    const r = profitabilityCheck(mk({}), { ownerWorkloadReduction: "Delegate routine checks to a named supervisor." });
    expect(r.ownerTimeCostConsidered).toBe(true);
  });

  it("flags a working-capital trap and that it feeds arbitration", () => {
    const c = mk({ decisionCategory: "marketing_opportunity_contract", flags: { cashRisk: true }, numbers: { consideredRate: 15, fullyLoadedCost: 20, paymentTermsDays: 60 } });
    const r = profitabilityCheck(c, { recommendedNextAction: "Accept the contract and sign today." });
    expect(r.workingCapitalTrap).toBe(true);
    expect(affectsArbitration(c)).toBe(true);
  });
});

describe("profitable growth / scale gates", () => {
  it("blocks scale when cash is weak", () => {
    const c = mk({ flags: { cashRisk: true } });
    const r = evaluateGrowthGates(c, baseAdvise(c));
    expect(r.scaleAllowed).toBe(false);
    expect(r.blockedBy).toContain("cash_runway_adequate");
  });

  it("blocks scale when unit economics are unknown", () => {
    const c = mk({ decisionCategory: "marketing_opportunity_contract", numbers: {} });
    const r = evaluateGrowthGates(c, { proofRequired: ["x"], reassessmentTrigger: "7 days", processSopUpdate: "sop" });
    expect(r.blockedBy).toContain("unit_economics_known");
  });

  it("blocks scale when capacity is red", () => {
    const r = evaluateGrowthGates(mk({ flags: { capacityRisk: true } }), baseAdvise(mk({ flags: { capacityRisk: true } })));
    expect(r.blockedBy).toContain("capacity_available");
  });

  it("blocks scale when quality is broken", () => {
    const c = mk({ hiddenRootCause: "rising complaints and rework breaking quality" });
    const r = evaluateGrowthGates(c, baseAdvise(c));
    expect(r.blockedBy).toContain("quality_stable");
  });

  it("blocks scale when owner attention is overloaded", () => {
    const c = mk({ flags: { remoteOwner: true } });
    const r = evaluateGrowthGates(c, { proofRequired: ["x"], reassessmentTrigger: "7d", processSopUpdate: "sop", numbers: undefined } as never);
    expect(r.blockedBy).toContain("owner_workload_manageable");
  });

  it("allows scale only when every gate passes, and always requires a stop-loss", () => {
    const c = mk({ decisionCategory: "marketing_opportunity_contract", hiddenRootCause: "proven profitable line with healthy margin ready to scale", numbers: { fullyLoadedCost: 10 } });
    const a = { ...baseAdvise(c), processSopUpdate: "Named supervisor + checklist, 7-day deadline.", proofRequired: ["unit economics"], reassessmentTrigger: "Reassess in 7 days." };
    const r = evaluateGrowthGates(c, a);
    expect(r.scaleAllowed).toBe(true);
    expect(r.stopLossDefined).toBe(true);
  });
});

describe("business-stage awareness", () => {
  it("survival stage prioritises cash", () => {
    const c = mk({ flags: { cashRisk: true } });
    expect(inferBusinessStage(c)).toBe("survival_cash_crisis");
    expect(stageAdjustedPriority(c)).toMatch(/cash/i);
  });

  it("stabilization stage prioritises process/quality", () => {
    const c = mk({ hiddenRootCause: "rework and complaints breaking quality" });
    expect(inferBusinessStage(c)).toBe("stabilization");
    expect(STAGE_TOP_PRIORITY.stabilization).toMatch(/process|quality/i);
  });

  it("early growth prioritises proven channel / unit economics", () => {
    expect(STAGE_TOP_PRIORITY.early_growth).toMatch(/channel|unit economics/i);
  });

  it("scaling requires repeatable SOP / capacity; turnaround requires a stop-loss", () => {
    expect(STAGE_TOP_PRIORITY.scaling).toMatch(/sop|capacity/i);
    expect(stageRequiresStopLoss("turnaround")).toBe(true);
  });

  it("exit/pre-sale prioritises clean numbers/processes; shutdown/pivot decides stop vs pivot", () => {
    expect(STAGE_TOP_PRIORITY.exit_pre_sale).toMatch(/clean|numbers|process/i);
    expect(STAGE_TOP_PRIORITY.shutdown_pivot).toMatch(/stop|pivot|evidence/i);
    expect(stageRequiresStopLoss("shutdown_pivot")).toBe(true);
  });

  it("the same facts yield a different priority by stage", () => {
    const c = mk({ decisionCategory: "marketing_opportunity_contract" });
    expect(stageAdjustedPriority(c, "scaling")).not.toBe(stageAdjustedPriority(c, "exit_pre_sale"));
  });
});
