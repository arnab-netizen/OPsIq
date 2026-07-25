/**
 * Owner override + budget authority pure-logic unit tests (Sections 23, 26).
 * Deterministic, DB-free. Asserts exact outcome classes, lawful-action guardrails,
 * and lifecycle transitions.
 */
import { describe, it, expect } from "vitest";
import {
  classifyOverrideOutcome,
  assertOverrideAllowed,
  checkAuthorityTransition,
  recommendAuthorityChange,
  isLawfulAuthorityAction,
  FORBIDDEN_GOVERNANCE_ACTIONS,
} from "@/domain/owner-budget";

describe("Owner budget governance — module contract assertions", () => {
  it("classifyOverrideOutcome is a function", () => { expect(typeof classifyOverrideOutcome).toBe("function"); });
  it("assertOverrideAllowed is a function", () => { expect(typeof assertOverrideAllowed).toBe("function"); });
  it("checkAuthorityTransition is a function", () => { expect(typeof checkAuthorityTransition).toBe("function"); });
  it("recommendAuthorityChange is a function", () => { expect(typeof recommendAuthorityChange).toBe("function"); });
  it("isLawfulAuthorityAction is a function", () => { expect(typeof isLawfulAuthorityAction).toBe("function"); });
  it("FORBIDDEN_GOVERNANCE_ACTIONS is a non-empty array", () => { expect(Array.isArray(FORBIDDEN_GOVERNANCE_ACTIONS)).toBe(true); expect(FORBIDDEN_GOVERNANCE_ACTIONS.length).toBeGreaterThan(0); });
  it("assertOverrideAllowed({}) returns object with allowed field", () => { expect(assertOverrideAllowed({})).toHaveProperty("allowed"); });
  it("assertOverrideAllowed({}).allowed is true when no blocks set", () => { expect(assertOverrideAllowed({}).allowed).toBe(true); });
  it("classifyOverrideOutcome returns a string", () => {
    expect(typeof classifyOverrideOutcome({ ownerDecision: "followed", outcomeVerified: false, outcomeSuccess: null })).toBe("string");
  });
  it("checkAuthorityTransition returns object with ok field", () => { expect(checkAuthorityTransition("NORMAL", "WATCH")).toHaveProperty("ok"); });
  it("checkAuthorityTransition('NORMAL', 'WATCH').ok is true", () => { expect(checkAuthorityTransition("NORMAL", "WATCH").ok).toBe(true); });
  it("isLawfulAuthorityAction returns a boolean", () => { expect(typeof isLawfulAuthorityAction("suspend_category")).toBe("boolean"); });
  it("recommendAuthorityChange returns object with recommendedStatus", () => { expect(recommendAuthorityChange("NORMAL", {})).toHaveProperty("recommendedStatus"); });
  it("recommendAuthorityChange returns object with lawfulActions array", () => { expect(Array.isArray(recommendAuthorityChange("NORMAL", {}).lawfulActions)).toBe(true); });
});

describe("Owner override outcome classification", () => {
  it("does NOT credit advice on override failure unless predicted risk verifiably materialized", () => {
    // Override failed but we cannot verify the predicted risk caused it → unverified.
    expect(classifyOverrideOutcome({ ownerDecision: "overrode", outcomeVerified: true, outcomeSuccess: false, predictedRiskMaterialized: null })).toBe("RESULT_UNVERIFIED");
    // Predicted risk materialized + verified failure → advice was correct.
    expect(classifyOverrideOutcome({ ownerDecision: "overrode", outcomeVerified: true, outcomeSuccess: false, predictedRiskMaterialized: true })).toBe("ADVICE_CORRECT_OWNER_OVERRIDDEN_FAILED");
    // Override succeeded → advice was not better.
    expect(classifyOverrideOutcome({ ownerDecision: "overrode", outcomeVerified: true, outcomeSuccess: true })).toBe("ADVICE_INCORRECT");
  });

  it("classifies the remaining outcome classes", () => {
    expect(classifyOverrideOutcome({ ownerDecision: "followed", outcomeVerified: true, outcomeSuccess: true })).toBe("ADVICE_CORRECT_EXECUTED_SUCCESS");
    expect(classifyOverrideOutcome({ ownerDecision: "followed", outcomeVerified: true, outcomeSuccess: false })).toBe("ADVICE_INCORRECT");
    expect(classifyOverrideOutcome({ ownerDecision: "no_action", outcomeVerified: true, outcomeSuccess: null })).toBe("ADVICE_CORRECT_NOT_EXECUTED");
    expect(classifyOverrideOutcome({ ownerDecision: "followed", outcomeVerified: true, outcomeSuccess: false, executionFailed: true })).toBe("EXECUTION_FAILED");
    expect(classifyOverrideOutcome({ ownerDecision: "followed", outcomeVerified: false, outcomeSuccess: null })).toBe("RESULT_UNVERIFIED");
    expect(classifyOverrideOutcome({ ownerDecision: "followed", outcomeVerified: true, outcomeSuccess: false, dataWasInsufficient: true })).toBe("ADVICE_INCOMPLETE_DUE_TO_DATA");
    expect(classifyOverrideOutcome({ ownerDecision: "overrode", outcomeVerified: true, outcomeSuccess: true, externalEventChangedPlan: true })).toBe("EXTERNAL_EVENT_CHANGED_PLAN");
  });
});

describe("Owner override safety", () => {
  it("refuses to override hard safety/legal blocks", () => {
    expect(assertOverrideAllowed({ vendorBankUnverified: true }).allowed).toBe(false);
    expect(assertOverrideAllowed({ statutoryReserveViolation: true }).allowed).toBe(false);
    expect(assertOverrideAllowed({ unlawfulEmployeeAction: true }).allowed).toBe(false);
    expect(assertOverrideAllowed({}).allowed).toBe(true);
  });
});

describe("Budget authority lifecycle", () => {
  it("allows governed transitions and rejects illegal ones", () => {
    expect(checkAuthorityTransition("NORMAL", "WATCH").ok).toBe(true);
    expect(checkAuthorityTransition("SUSPENDED_FOR_CATEGORY", "NORMAL").ok).toBe(false); // must go through restore path
    expect(checkAuthorityTransition("SUSPENDED_FOR_CATEGORY", "RESTORED").ok).toBe(true);
  });

  it("recommends suspension on critical control signals, watch on weak proof", () => {
    const critical = recommendAuthorityChange("NORMAL", { selfApprovalDetected: true });
    expect(critical.recommendedStatus).toBe("SUSPENDED_FOR_CATEGORY");
    const serious = recommendAuthorityChange("NORMAL", { approvalViolations: 3 });
    expect(serious.recommendedStatus).toBe("OWNER_APPROVAL_REQUIRED");
    const minor = recommendAuthorityChange("NORMAL", { proofComplianceWeak: true });
    expect(minor.recommendedStatus).toBe("WATCH");
  });

  it("never recommends an unlawful/unfair action", () => {
    const rec = recommendAuthorityChange("NORMAL", { selfApprovalDetected: true, splitSpendDetected: true });
    for (const a of rec.lawfulActions) expect(isLawfulAuthorityAction(a)).toBe(true);
    for (const forbidden of FORBIDDEN_GOVERNANCE_ACTIONS) {
      expect(isLawfulAuthorityAction(`apply ${forbidden} to staff`)).toBe(false);
    }
  });
});
