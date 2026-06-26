import { describe, it, expect } from "vitest";
import {
  validateDecisionRecord,
  isDecisionRecordValid,
  assertRecordable,
  InvalidDecisionRecordError,
  type DecisionRecord,
} from "@/domain/domain-training/decision-journal";
import {
  HarmType,
  validateHarmEntry,
  harmfulSideEffectPreventsSuccess,
  cautionSeverity,
  type HarmEntry,
} from "@/domain/domain-training/harm-ledger";
import {
  domainHasSideEffectMetrics,
  verifyWithSideEffects,
} from "@/domain/domain-training/side-effect-registry";

const rec = (over: Partial<DecisionRecord> = {}): DecisionRecord => ({
  occurredAtMs: 1, workspaceId: "ws1", domain: "D1", archetype: "laundry", diagnosis: "low runway",
  evidenceUsed: ["bank"], missingData: [], confidence: "HIGH", severity: "CRITICAL",
  recommendation: "collect overdue", whatNotToDo: ["no ads"], responsibleRole: "Billing",
  howToExecute: "call script", proofRequired: "call log + promised date", expectedOutcome: "cash recovered",
  verificationPlan: "recheck cash in 48h", stopRollbackRedesign: "stop on dispute", ...over,
});

describe("[F7] decision journal", () => {
  it("accepts a complete record", () => {
    expect(isDecisionRecordValid(rec())).toBe(true);
  });
  it("cannot record without workspace id / domain / proof / verification", () => {
    expect(validateDecisionRecord(rec({ workspaceId: "" }))).toContain("missing_workspace_id");
    expect(validateDecisionRecord(rec({ domain: "" }))).toContain("missing_domain");
    expect(validateDecisionRecord(rec({ proofRequired: "" }))).toContain("missing_proof_requirement");
    expect(validateDecisionRecord(rec({ verificationPlan: "" }))).toContain("missing_verification_plan");
  });
  it("assertRecordable throws with violations", () => {
    try { assertRecordable(rec({ workspaceId: "", verificationPlan: "" })); expect.unreachable(); }
    catch (e) {
      expect(e).toBeInstanceOf(InvalidDecisionRecordError);
      expect((e as InvalidDecisionRecordError).violations).toContain("missing_workspace_id");
    }
  });
});

const harm = (over: Partial<HarmEntry> = {}): HarmEntry => ({ workspaceId: "ws1", harmType: HarmType.QUALITY_WORSENED, severity: "HIGH", note: "x", ...over });

describe("[F8] harm ledger", () => {
  it("harm can be recorded (validates)", () => {
    expect(validateHarmEntry(harm())).toHaveLength(0);
    expect(validateHarmEntry(harm({ workspaceId: "" }))).toContain("missing_workspace_id");
  });
  it("harmful side effect prevents success even if primary improved", () => {
    expect(harmfulSideEffectPreventsSuccess(true, [harm({ severity: "HIGH" })])).toBe(true);
    expect(harmfulSideEffectPreventsSuccess(true, [harm({ severity: "LOW" })])).toBe(false);
    expect(harmfulSideEffectPreventsSuccess(false, [])).toBe(true);
  });
  it("caution severity reflects the worst harm (affects future severity)", () => {
    expect(cautionSeverity([harm({ severity: "LOW" }), harm({ severity: "CRITICAL" })])).toBe("CRITICAL");
    expect(cautionSeverity([])).toBe("INFO");
  });
});

describe("[F9] side-effect registry", () => {
  it("domain without side-effect metrics is invalid", () => {
    expect(domainHasSideEffectMetrics([])).toBe(false);
    expect(domainHasSideEffectMetrics(["retention"])).toBe(true);
  });
  it("positive primary + severe negative side effect is NOT success", () => {
    const v = verifyWithSideEffects(true, [{ key: "complaints", worsened: true, severe: true }]);
    expect(v.success).toBe(false);
    expect(v.severeRegressions).toContain("complaints");
  });
  it("primary improved + only minor side effects = success", () => {
    expect(verifyWithSideEffects(true, [{ key: "complaints", worsened: true, severe: false }]).success).toBe(true);
  });
  it("primary not improved = not success", () => {
    expect(verifyWithSideEffects(false, []).success).toBe(false);
  });
});
