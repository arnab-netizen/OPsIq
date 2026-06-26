import { describe, it, expect } from "vitest";
import { selectPrimaryAction } from "@/domain/collective-training/next-action-selector";
import { resolveAssignment } from "@/domain/collective-training/assignment-resolver";
import { composeExecution, validateExecution } from "@/domain/collective-training/execution-composer";
import { composeVerification } from "@/domain/collective-training/verification-composer";
import { composeStopRollbackRedesign } from "@/domain/collective-training/stop-rollback-composer";
import { decideLearning } from "@/domain/collective-training/learning-admission";
import { HarmType, type HarmEntry } from "@/domain/domain-training/harm-ledger";

const baseNext = { stage: "stabilization" as const, complianceUncertain: false, missingCriticalProof: false, lowDataConfidence: false, blockClosure: false, hasContradiction: false };

describe("[C8] primary next-action selector (wires F12 + F13)", () => {
  it("returns exactly one primary action (no dumping) by default", () => {
    const r = selectPrimaryAction({ ...baseNext, bindingConstraint: "cash-survival", stage: "survival" });
    expect(typeof r.primaryAction).toBe("string");
    expect(r.secondaryActions).toEqual([]);
  });
  it("selects cash containment over marketing", () => {
    const r = selectPrimaryAction({ ...baseNext, bindingConstraint: "cash-survival", stage: "survival" });
    expect(r.primaryAction.toLowerCase()).toContain("cash");
  });
  it("selects quality fix over growth", () => {
    const r = selectPrimaryAction({ ...baseNext, bindingConstraint: "quality", stage: "process_control" });
    expect(r.primaryAction.toLowerCase()).toContain("quality root cause");
  });
  it("selects retention repair over acquisition when churn severe", () => {
    const r = selectPrimaryAction({ ...baseNext, bindingConstraint: "retention" });
    expect(r.primaryAction.toLowerCase()).toContain("retention leak");
  });
  it("selects proof collection when data insufficient", () => {
    const r = selectPrimaryAction({ ...baseNext, bindingConstraint: null, missingCriticalProof: true });
    expect(r.primaryAction.toLowerCase()).toContain("evidence");
  });
  it("selects escalation when compliance risk", () => {
    const r = selectPrimaryAction({ ...baseNext, bindingConstraint: "risk-compliance", complianceUncertain: true });
    expect(r.primaryAction.toLowerCase()).toContain("expert");
  });
  it("emergency containment may add exactly one parallel action", () => {
    const r = selectPrimaryAction({ ...baseNext, bindingConstraint: "cash-survival", emergencyContainment: true });
    expect(r.secondaryActions.length).toBe(1);
  });
});

describe("[C9] assignment resolver", () => {
  it("does not assign routine staff work to the owner by default", () => {
    expect(resolveAssignment({ taskKind: "routine", complianceUncertain: false, ownerOverloaded: false, staffOverloaded: false }).who).not.toBe("owner");
  });
  it("does not assign extra non-critical work to overloaded staff", () => {
    expect(resolveAssignment({ taskKind: "routine", complianceUncertain: false, ownerOverloaded: false, staffOverloaded: true, critical: false }).who).toBe("manager");
  });
  it("escalates compliance tasks to an expert", () => {
    const a = resolveAssignment({ taskKind: "compliance", complianceUncertain: true, ownerOverloaded: false, staffOverloaded: false });
    expect(a.who).toBe("legal");
    expect(a.escalation.toLowerCase()).toContain("expert");
  });
  it("assigns operational verification to a manager", () => {
    expect(resolveAssignment({ taskKind: "verification", complianceUncertain: false, ownerOverloaded: false, staffOverloaded: false }).who).toBe("manager");
  });
});

describe("[C10] guided execution composer", () => {
  it("a generic 'improve' plan fails validation", () => {
    const bad = { steps: ["improve quality", "improve marketing"], checklist: [], escalationPoint: "owner", commonMistakes: [] };
    expect(validateExecution({ plan: bad, highRisk: false })).toContain("generic_instruction");
  });
  it("a plan with no evidence capture fails", () => {
    const bad = { steps: ["Call debtors", "Pause spend"], checklist: [], escalationPoint: "owner", commonMistakes: [] };
    expect(validateExecution({ plan: bad, highRisk: false })).toContain("no_evidence_capture");
  });
  it("a high-risk plan with no escalation point fails", () => {
    const bad = { steps: ["Do the step", "Record evidence"], checklist: [], escalationPoint: "", commonMistakes: [] };
    expect(validateExecution({ plan: bad, highRisk: true })).toContain("no_escalation_point");
  });
  it("composed templates are sequenced and pass validation", () => {
    for (const lever of ["cash", "quality", "marketing", "sop"] as const) {
      expect(validateExecution({ plan: composeExecution(lever), highRisk: true })).toEqual([]);
    }
  });
});

describe("[C11] proof + verification composer (wires F8)", () => {
  const base = { lever: "marketing", sideEffectMetrics: ["CAC", "complaints"], harms: [] as HarmEntry[], primaryImproved: true, baselinePresent: true, outcomeVerifiable: true, proofOwner: "owner", reviewWindow: "2 weeks" };
  it("proof of action is not proof of success (unverifiable blocks success)", () => {
    expect(composeVerification({ ...base, outcomeVerifiable: false }).successAllowed).toBe(false);
  });
  it("a material side effect prevents success even if primary improved", () => {
    const harm: HarmEntry = { workspaceId: "w1", harmType: HarmType.COMPLAINTS_INCREASED, severity: "HIGH", note: "complaints up" };
    expect(composeVerification({ ...base, harms: [harm] }).successAllowed).toBe(false);
  });
  it("missing baseline creates a baseline-collection action", () => {
    expect(composeVerification({ ...base, baselinePresent: false }).verificationPlan.baseline.toLowerCase()).toContain("collect the baseline");
  });
  it("a clean, verified, no-harm outcome allows success", () => {
    expect(composeVerification(base).successAllowed).toBe(true);
  });
});

describe("[C12] stop/rollback/redesign composer", () => {
  it("marketing stop rule includes CAC, capacity, complaint, margin side effects", () => {
    const s = composeStopRollbackRedesign("marketing");
    const all = `${s.stopCondition} ${s.rollbackCondition}`.toLowerCase();
    expect(all).toContain("cac"); expect(all).toContain("capacity"); expect(all).toContain("complaint"); expect(all).toContain("margin");
  });
  it("pricing rollback includes repeat/conversion/margin/complaint", () => {
    const s = composeStopRollbackRedesign("pricing");
    const all = `${s.stopCondition} ${s.rollbackCondition}`.toLowerCase();
    expect(all).toContain("repeat"); expect(all).toContain("conversion"); expect(all).toContain("margin"); expect(all).toContain("complaint");
  });
  it("supplier rollback includes quality defects and stockout/cash", () => {
    const s = composeStopRollbackRedesign("supplier");
    const all = `${s.stopCondition} ${s.rollbackCondition}`.toLowerCase();
    expect(all).toContain("quality"); expect(all).toContain("stockout"); expect(all).toContain("cash");
  });
  it("SOP redesign triggers on repeated failure", () => {
    expect(composeStopRollbackRedesign("sop").redesignCondition.toLowerCase()).toContain("repeated failure");
  });
  it("growth rollback triggers on quality/capacity/cash deterioration", () => {
    expect(composeStopRollbackRedesign("growth").stopCondition.toLowerCase()).toMatch(/quality.*capacity.*cash|cash/);
  });
});

describe("[C13] learning admission controller (wires F10)", () => {
  const clean = { learningRequested: true, outcomeVerified: true, harmChecked: true, harmful: false, crossDomainHarm: false, disputed: false, inconclusive: false, simulationTested: true };
  it("blocks a claimed success without verified outcome", () => {
    expect(decideLearning({ ...clean, outcomeVerified: false, simulationTested: false }).status).not.toBe("PROMOTED");
    expect(decideLearning({ ...clean, outcomeVerified: false, simulationTested: false }).canPromote).toBe(false);
  });
  it("positive revenue but harmful complaints → quarantined, never promoted", () => {
    expect(decideLearning({ ...clean, harmful: true }).status).toBe("QUARANTINED");
  });
  it("disputed staff completion → disputed, blocked", () => {
    expect(decideLearning({ ...clean, disputed: true }).status).toBe("DISPUTED");
  });
  it("cross-domain harm blocks positive promotion", () => {
    expect(decideLearning({ ...clean, crossDomainHarm: true }).canPromote).toBe(false);
  });
  it("verified, no-harm, simulation-tested outcome can be promoted", () => {
    expect(decideLearning(clean).status).toBe("PROMOTED");
  });
  it("learning not requested → NOT_ELIGIBLE", () => {
    expect(decideLearning({ ...clean, learningRequested: false }).status).toBe("NOT_ELIGIBLE");
  });
});
