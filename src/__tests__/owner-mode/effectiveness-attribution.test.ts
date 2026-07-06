/**
 * Effectiveness / SOP-adherence / training attribution classifier (PASS 26) — pure tests.
 *
 * Proves false attribution is impossible in the classifier: a fix is only "VERIFIED_IMPROVED_AFTER_EXECUTION"
 * (monitor-only) with proven execution AND a post-execution improvement; an improvement without execution
 * evidence is never attributed; execution without a measured outcome routes to a reassessment; SOP adopted is
 * distinct from SOP followed; training assigned/completed/effective are distinct; unknown data stays UNKNOWN.
 */
import { describe, it, expect } from "vitest";
import {
  classifyEffectivenessAttribution, classifySopAdherence, classifyTrainingEffectiveness,
  correctionExecutionStateFromTask, ROUTE_FOR_ATTRIBUTION, isMonitorOnlyVerified,
  type CorrectionExecutionState, type EffectivenessAttributionState,
} from "@/domain/owner-mode/effectiveness-attribution";

const NO_FABRICATION = (s: string) => {
  expect(s).not.toMatch(/[$£€]\s?\d/);
  expect(s).not.toMatch(/\b\d+\s?%/);
  expect(s).not.toMatch(/\b(fraud|negligent|lazy|dishonest|payroll|fired?)\b/i);
};

describe("classifyEffectivenessAttribution (PASS 26)", () => {
  it("1. proposed correction with no execution + no outcome → INSUFFICIENT_EXECUTION_EVIDENCE (not 'improved')", () => {
    const r = classifyEffectivenessAttribution({ executionState: "PROPOSED", outcomeDirection: "INSUFFICIENT_DATA", hasPostExecutionOutcome: false });
    expect(r.attribution).toBe("INSUFFICIENT_EXECUTION_EVIDENCE");
    expect(r.monitorOnly).toBe(false);
    NO_FABRICATION(r.ownerVisibleSummary);
  });
  it("2. assigned correction, no outcome measured → INSUFFICIENT_EXECUTION_EVIDENCE", () => {
    const r = classifyEffectivenessAttribution({ executionState: "ASSIGNED", outcomeDirection: "INSUFFICIENT_DATA", hasPostExecutionOutcome: false });
    expect(r.attribution).toBe("INSUFFICIENT_EXECUTION_EVIDENCE");
  });
  it("3. executed with evidence but no post-execution outcome → EXECUTED_BUT_OUTCOME_NOT_PROVEN → reassessment", () => {
    const r = classifyEffectivenessAttribution({ executionState: "EXECUTED_WITH_EVIDENCE", outcomeDirection: "INSUFFICIENT_DATA", hasPostExecutionOutcome: false });
    expect(r.attribution).toBe("EXECUTED_BUT_OUTCOME_NOT_PROVEN");
    expect(r.route).toBe("CREATE_REASSESSMENT_TASK");
  });
  it("4. improved outcome but execution NOT proven → IMPROVED_BUT_EXECUTION_NOT_PROVEN (not attributed)", () => {
    const r = classifyEffectivenessAttribution({ executionState: "NOT_EXECUTED", outcomeDirection: "IMPROVED", hasPostExecutionOutcome: true });
    expect(r.attribution).toBe("IMPROVED_BUT_EXECUTION_NOT_PROVEN");
    expect(r.ownerVisibleSummary).toMatch(/cannot attribute/i);
    expect(r.route).toBe("CREATE_EVIDENCE_REQUEST");
    expect(r.monitorOnly).toBe(false);
  });
  it("5. executed with evidence + improved outcome → verified monitor-only improvement", () => {
    const r = classifyEffectivenessAttribution({ executionState: "EXECUTED_WITH_EVIDENCE", outcomeDirection: "IMPROVED", hasPostExecutionOutcome: true });
    expect(r.attribution).toBe("MONITOR_ONLY_VERIFIED_IMPROVEMENT");
    expect(r.monitorOnly).toBe(true);
    expect(r.route).toBe("MONITOR_ONLY");
    expect(r.ownerVisibleSummary).toMatch(/improvement after execution/i);
  });
  it("6. executed with evidence + unchanged outcome → VERIFIED_UNCHANGED_AFTER_EXECUTION → reassessment", () => {
    const r = classifyEffectivenessAttribution({ executionState: "EXECUTED_WITH_EVIDENCE", outcomeDirection: "UNCHANGED", hasPostExecutionOutcome: true });
    expect(r.attribution).toBe("VERIFIED_UNCHANGED_AFTER_EXECUTION");
    expect(r.route).toBe("CREATE_REASSESSMENT_TASK");
  });
  it("7. executed with evidence + worsened outcome → VERIFIED_WORSENED_AFTER_EXECUTION → owner escalation", () => {
    const r = classifyEffectivenessAttribution({ executionState: "EXECUTED_WITH_EVIDENCE", outcomeDirection: "WORSENED", hasPostExecutionOutcome: true });
    expect(r.attribution).toBe("VERIFIED_WORSENED_AFTER_EXECUTION");
    expect(r.route).toBe("CREATE_OWNER_APPROVAL_TASK");
    expect(r.ownerVisibleSummary).toMatch(/worsened after execution/i);
  });
  it("8. weak execution evidence + changed outcome → OUTCOME_CHANGED_BUT_ATTRIBUTION_WEAK (never verified)", () => {
    const r = classifyEffectivenessAttribution({ executionState: "EXECUTED_WITH_WEAK_EVIDENCE", outcomeDirection: "IMPROVED", hasPostExecutionOutcome: true });
    expect(r.attribution).toBe("OUTCOME_CHANGED_BUT_ATTRIBUTION_WEAK");
    expect(r.route).toBe("CREATE_EVIDENCE_REQUEST");
  });
  it("9. weak execution evidence + no outcome → INSUFFICIENT_EXECUTION_EVIDENCE", () => {
    const r = classifyEffectivenessAttribution({ executionState: "EXECUTED_WITH_WEAK_EVIDENCE", outcomeDirection: "INSUFFICIENT_DATA", hasPostExecutionOutcome: false });
    expect(r.attribution).toBe("INSUFFICIENT_EXECUTION_EVIDENCE");
  });
  it("10. worsened/unchanged outcome without execution → INSUFFICIENT_EXECUTION_EVIDENCE (effectiveness moot)", () => {
    const worse = classifyEffectivenessAttribution({ executionState: "IN_PROGRESS", outcomeDirection: "WORSENED", hasPostExecutionOutcome: true });
    expect(worse.attribution).toBe("INSUFFICIENT_EXECUTION_EVIDENCE");
  });
  it("11. every attribution has a route, and only verified improvement is monitor-only", () => {
    const all = Object.keys(ROUTE_FOR_ATTRIBUTION) as EffectivenessAttributionState[];
    for (const a of all) expect(ROUTE_FOR_ATTRIBUTION[a]).toBeTruthy();
    expect(isMonitorOnlyVerified("MONITOR_ONLY_VERIFIED_IMPROVEMENT")).toBe(true);
    expect(isMonitorOnlyVerified("VERIFIED_IMPROVED_AFTER_EXECUTION")).toBe(true);
    expect(isMonitorOnlyVerified("VERIFIED_WORSENED_AFTER_EXECUTION")).toBe(false);
    expect(isMonitorOnlyVerified("IMPROVED_BUT_EXECUTION_NOT_PROVEN")).toBe(false);
  });
});

describe("correctionExecutionStateFromTask (PASS 26)", () => {
  it("12. COMPLETED with evidence → EXECUTED_WITH_EVIDENCE; completed w/o evidence → weak; open → lifecycle", () => {
    expect(correctionExecutionStateFromTask({ status: "COMPLETED", evidenceCount: 2 })).toBe("EXECUTED_WITH_EVIDENCE");
    expect(correctionExecutionStateFromTask({ status: "COMPLETED", evidenceCount: 0 })).toBe("EXECUTED_WITH_WEAK_EVIDENCE");
    expect(correctionExecutionStateFromTask({ status: "IN_PROGRESS", evidenceCount: 0 })).toBe("IN_PROGRESS");
    expect(correctionExecutionStateFromTask({ status: "PROPOSED", evidenceCount: 0 })).toBe("PROPOSED");
    expect(correctionExecutionStateFromTask({ status: "REJECTED", evidenceCount: 0 })).toBe("CANCELLED");
    expect(correctionExecutionStateFromTask(null)).toBe("UNKNOWN");
  });
});

describe("classifySopAdherence — adopted is NOT followed (PASS 26)", () => {
  it("13. SOP drafted but not adopted → not verified adherence", () => {
    const r = classifySopAdherence({ executionState: "IN_PROGRESS", adherenceOutcome: "INSUFFICIENT_DATA", hasPostAdoptionCheck: false });
    expect(r.state).toBe("SOP_DRAFTED");
    expect(r.route).not.toBe("MONITOR_ONLY");
  });
  it("14. SOP adopted with evidence but no adherence re-check → NEEDS_RECHECK (not verified)", () => {
    const r = classifySopAdherence({ executionState: "EXECUTED_WITH_EVIDENCE", adherenceOutcome: "INSUFFICIENT_DATA", hasPostAdoptionCheck: false });
    expect(r.state).toBe("NEEDS_RECHECK");
    expect(r.ownerVisibleSummary).toMatch(/not.*re-checked|not yet verified/i);
  });
  it("15. SOP adopted with evidence + re-check confirms it is followed → SOP_ADHERENCE_VERIFIED (monitor)", () => {
    const r = classifySopAdherence({ executionState: "EXECUTED_WITH_EVIDENCE", adherenceOutcome: "IMPROVED", hasPostAdoptionCheck: true });
    expect(r.state).toBe("SOP_ADHERENCE_VERIFIED");
    expect(r.route).toBe("MONITOR_ONLY");
  });
  it("16. SOP adopted but re-check shows not followed → SOP_NOT_FOLLOWED → re-check task", () => {
    const r = classifySopAdherence({ executionState: "EXECUTED_WITH_EVIDENCE", adherenceOutcome: "WORSENED", hasPostAdoptionCheck: true });
    expect(r.state).toBe("SOP_NOT_FOLLOWED");
    expect(r.route).toBe("CREATE_REASSESSMENT_TASK");
  });
  it("17. SOP not adopted → SOP_NOT_FOLLOWED (a manager re-check)", () => {
    const r = classifySopAdherence({ executionState: "NOT_EXECUTED", adherenceOutcome: "INSUFFICIENT_DATA", hasPostAdoptionCheck: false });
    expect(r.state).toBe("SOP_NOT_FOLLOWED");
  });
});

describe("classifyTrainingEffectiveness — assigned ≠ completed ≠ effective (PASS 26)", () => {
  it("18. training assigned but not completed → TRAINING_ASSIGNED (no effectiveness claim)", () => {
    const r = classifyTrainingEffectiveness({ executionState: "ASSIGNED", postTrainingOutcome: "INSUFFICIENT_DATA", hasPostTrainingCheck: false });
    expect(r.state).toBe("TRAINING_ASSIGNED");
    expect(r.route).toBe("CREATE_TRAINING_TASK");
  });
  it("19. training completed with evidence but no reassessment → NEEDS_RECHECK", () => {
    const r = classifyTrainingEffectiveness({ executionState: "EXECUTED_WITH_EVIDENCE", postTrainingOutcome: "INSUFFICIENT_DATA", hasPostTrainingCheck: false });
    expect(r.state).toBe("NEEDS_RECHECK");
    expect(r.ownerVisibleSummary).toMatch(/not been reassessed/i);
  });
  it("20. training completed with evidence + improved after → POST_TRAINING_IMPROVED (monitor)", () => {
    const r = classifyTrainingEffectiveness({ executionState: "EXECUTED_WITH_EVIDENCE", postTrainingOutcome: "IMPROVED", hasPostTrainingCheck: true });
    expect(r.state).toBe("POST_TRAINING_IMPROVED");
    expect(r.route).toBe("MONITOR_ONLY");
  });
  it("21. training completed + worsened after → POST_TRAINING_WORSENED → follow-up", () => {
    const r = classifyTrainingEffectiveness({ executionState: "EXECUTED_WITH_EVIDENCE", postTrainingOutcome: "WORSENED", hasPostTrainingCheck: true });
    expect(r.state).toBe("POST_TRAINING_WORSENED");
    expect(r.route).toBe("CREATE_TRAINING_TASK");
  });
  it("22. weak training completion evidence → cannot be verified effective", () => {
    const r = classifyTrainingEffectiveness({ executionState: "EXECUTED_WITH_WEAK_EVIDENCE", postTrainingOutcome: "IMPROVED", hasPostTrainingCheck: true });
    expect(r.state).toBe("TRAINING_COMPLETED_WEAK_EVIDENCE");
    expect(r.route).toBe("CREATE_EVIDENCE_REQUEST");
  });
  it("23. unknown training/SOP data → UNKNOWN honestly, routed to a data task", () => {
    expect(classifyTrainingEffectiveness({ executionState: "UNKNOWN", postTrainingOutcome: "INSUFFICIENT_DATA", hasPostTrainingCheck: false }).state).toBe("UNKNOWN");
    expect(classifySopAdherence({ executionState: "UNKNOWN", adherenceOutcome: "INSUFFICIENT_DATA", hasPostAdoptionCheck: false }).state).toBe("UNKNOWN");
  });
  it("24. no classifier output fabricates a percentage, currency figure, or disciplinary label", () => {
    const states: CorrectionExecutionState[] = ["EXECUTED_WITH_EVIDENCE", "EXECUTED_WITH_WEAK_EVIDENCE", "NOT_EXECUTED", "PROPOSED", "UNKNOWN"];
    for (const es of states) {
      for (const dir of ["IMPROVED", "WORSENED", "UNCHANGED", "INSUFFICIENT_DATA"] as const) {
        NO_FABRICATION(classifyEffectivenessAttribution({ executionState: es, outcomeDirection: dir, hasPostExecutionOutcome: dir !== "INSUFFICIENT_DATA" }).ownerVisibleSummary);
      }
    }
  });
});
