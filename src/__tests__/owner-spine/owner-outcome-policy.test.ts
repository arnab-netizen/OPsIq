/**
 * Owner outcome verification contract — pure tests (no DB).
 * Completion ≠ outcome ≠ metric movement ≠ target ≠ resolution ≠ causation ≠ proven effectiveness.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import {
  assessOwnerOutcome,
  assertOutcomeVerifierIsNotAI,
  describeVerifiedActionLine,
  ownerOutcomeLoopState,
  type OwnerOutcomeInput,
} from "@/domain/owner-spine/owner-outcome-policy";
import { domainActionToOutcomeInput, processOutcomeToOutcomeInput, learningLoopForDomain } from "@/domain/owner-spine/owner-outcome-adapters";
import { classifyOutcomeVerification, type OutcomeRowForClassification } from "@/services/owner-mode/owner-outcome-verification.service";
import { MIN_SAMPLE, MAX_MODIFIER } from "@/domain/owner-finance/outcome-signals";

const NOW = new Date("2026-09-01T00:00:00Z");
const DONE = new Date("2026-08-01T00:00:00Z");
const LATER = new Date("2026-08-20T00:00:00Z");

function input(over: Partial<OwnerOutcomeInput> = {}): OwnerOutcomeInput {
  return {
    domain: "finance",
    actionId: "a1",
    executionStatus: "COMPLETED",
    completedAt: DONE,
    verificationMetric: "grossMarginPct",
    baselineValue: 20,
    baselineProvenance: "MEASURED",
    afterValue: 28,
    afterProvenance: "OWNER_ENTERED",
    afterMeasuredAt: LATER,
    direction: "up",
    targetValue: 30,
    windowDays: null,
    disputed: false,
    externalEvent: false,
    verifierKind: "UNKNOWN",
    verificationAttempted: true,
    verifiedAt: LATER,
    causalAssessment: null,
    newerDiagnosis: null,
    learningLoop: "FINANCE_BRIDGE",
    now: NOW,
    ...over,
  };
}

describe("completion is not verification", () => {
  it("1. completed with no after-data is not verified and says what is missing", () => {
    const a = assessOwnerOutcome(input({ afterValue: null, afterProvenance: "NONE", afterMeasuredAt: null, verificationAttempted: false, verifiedAt: null }));
    expect(a.executionStatus).toBe("COMPLETED");
    expect(a.observationStatus).toBe("READY_TO_MEASURE");
    expect(a.verificationStatus).toBe("inconclusive");
    expect(a.measurementResult).toBe("NOT_MEASURABLE");
    expect(ownerOutcomeLoopState(a).code).toBe("NEEDS_AFTER_DATA");
  });
  it("2. missing or unattributed baseline is inconclusive, never fabricated", () => {
    for (const over of [{ baselineValue: null }, { baselineProvenance: "UNKNOWN" as const }]) {
      const a = assessOwnerOutcome(input(over));
      expect(a.verificationStatus).toBe("inconclusive");
      expect(a.measurementResult).toBe("NOT_MEASURABLE");
      expect(a.learningEligibility).toBe("NOT_ELIGIBLE");
    }
  });
  it("an action that is not completed is not in the outcome loop", () => {
    const a = assessOwnerOutcome(input({ executionStatus: "IN_PROGRESS", completedAt: null }));
    expect(a.observationStatus).toBe("NOT_STARTED");
    expect(a.verificationStatus).toBe("unverified");
    expect(ownerOutcomeLoopState(a).code).toBe("IN_PROGRESS");
  });
});

describe("movement vs target vs resolution", () => {
  it("3/4. improvement is not target attainment", () => {
    const a = assessOwnerOutcome(input()); // 20 -> 28, target 30
    expect(a.measurementResult).toBe("IMPROVED");
    expect(a.targetAttainment).toBe("NOT_REACHED");
    expect(a.verificationStatus).toBe("verified_not_improved");
    expect(ownerOutcomeLoopState(a).code).toBe("IMPROVED_TARGET_MISSED");
  });
  it("improvement with no target is NO_TARGET, not REACHED", () => {
    const a = assessOwnerOutcome(input({ targetValue: null }));
    expect(a.targetAttainment).toBe("NO_TARGET");
    expect(a.measurementResult).toBe("IMPROVED");
  });
  it("5. target reached with no newer diagnosis: resolution is not proven", () => {
    const a = assessOwnerOutcome(input({ afterValue: 31 }));
    expect(a.targetAttainment).toBe("REACHED");
    expect(a.issueResolution).toBe("NOT_YET_REASSESSED");
    const s = ownerOutcomeLoopState(a);
    expect(s.code).toBe("TARGET_REACHED");
    expect(s.reading).toContain("confirm with new business evidence");
    expect(s.terminal).toBe(false);
  });
  it("6. a newer diagnosis without the issue on current evidence resolves it", () => {
    const a = assessOwnerOutcome(input({ afterValue: 31, newerDiagnosis: { evidenceAsOf: new Date("2026-08-25T00:00:00Z"), evidenceCurrent: true, stillRaised: false } }));
    expect(a.issueResolution).toBe("RESOLVED");
    expect(ownerOutcomeLoopState(a).code).toBe("NEW_DIAGNOSIS_CONFIRMS_RESOLVED");
    expect(a.causalAttribution).toBe("NOT_ASSESSED"); // resolution is still not causation
  });
  it("7. a newer diagnosis that still raises the issue keeps it open even if the target was reached", () => {
    const a = assessOwnerOutcome(input({ afterValue: 31, newerDiagnosis: { evidenceAsOf: new Date("2026-08-25T00:00:00Z"), evidenceCurrent: true, stillRaised: true } }));
    expect(a.issueResolution).toBe("STILL_OPEN");
    expect(ownerOutcomeLoopState(a).code).toBe("STILL_OPEN");
  });
  it("8. stale, missing, or older-than-the-action diagnoses never imply resolution", () => {
    const stale = assessOwnerOutcome(input({ afterValue: 31, newerDiagnosis: { evidenceAsOf: new Date("2026-08-25T00:00:00Z"), evidenceCurrent: false, stillRaised: false } }));
    expect(stale.issueResolution).toBe("INCONCLUSIVE");
    const none = assessOwnerOutcome(input({ afterValue: 31, newerDiagnosis: { evidenceAsOf: null, evidenceCurrent: true, stillRaised: false } }));
    expect(none.issueResolution).toBe("NOT_YET_REASSESSED");
    const older = assessOwnerOutcome(input({ afterValue: 31, newerDiagnosis: { evidenceAsOf: new Date("2026-07-01T00:00:00Z"), evidenceCurrent: true, stillRaised: false } }));
    expect(older.issueResolution).toBe("NOT_YET_REASSESSED");
  });
  it("9. a worsening metric is a visible harmful result, not hidden or resolved", () => {
    const a = assessOwnerOutcome(input({ afterValue: 15 }));
    expect(a.measurementResult).toBe("WORSENED");
    expect(a.issueResolution).toBe("WORSENED");
    expect(ownerOutcomeLoopState(a).code).toBe("MADE_WORSE");
  });
  it("lower-is-better direction is honoured", () => {
    const a = assessOwnerOutcome(input({ direction: "down", baselineValue: 50, afterValue: 40, targetValue: 45 }));
    expect(a.measurementResult).toBe("IMPROVED");
    expect(a.targetAttainment).toBe("REACHED");
  });
  it("10. no change is no measurable improvement and the issue is not treated as fixed", () => {
    const a = assessOwnerOutcome(input({ afterValue: 20 }));
    expect(a.measurementResult).toBe("UNCHANGED");
    expect(a.issueResolution).toBe("NOT_YET_REASSESSED");
    expect(ownerOutcomeLoopState(a).code).toBe("NO_MEASURABLE_IMPROVEMENT");
  });
});

describe("observation windows, provenance, disputes, external events", () => {
  it("11. an open observation window is too early to judge, not a failure", () => {
    const a = assessOwnerOutcome(input({ windowDays: 60, afterValue: 31 }));
    expect(a.observationStatus).toBe("WINDOW_OPEN");
    expect(a.verificationStatus).toBe("unverified");
    expect(a.targetAttainment).toBe("UNKNOWN");
    const s = ownerOutcomeLoopState(a);
    expect(s.code).toBe("WAITING_TO_MEASURE");
    expect(s.reading).toContain("not a failure");
  });
  it("12. an owner-entered after-value keeps its provenance and never claims independent verification", () => {
    const a = assessOwnerOutcome(input({ afterValue: 31 }));
    expect(a.afterProvenance).toBe("OWNER_ENTERED");
    expect(a.evidenceQuality).toBe("weak");
    expect(a.independentlyVerified).toBe(false);
    expect(a.selfVerified).toBe(false);
  });
  it("13. a disputed outcome is not counted as proof and cannot feed learning", () => {
    const a = assessOwnerOutcome(input({ disputed: true, afterValue: 31 }));
    expect(a.verificationStatus).toBe("disputed");
    expect(a.measurementResult).toBe("DISPUTED");
    expect(a.causalAttribution).toBe("DISPUTED");
    expect(a.learningEligibility).toBe("NOT_ELIGIBLE");
    expect(ownerOutcomeLoopState(a).code).toBe("DISPUTED");
  });
  it("14. an external event is never attributed to the recommendation or used for learning", () => {
    const a = assessOwnerOutcome(input({ externalEvent: true, afterValue: 31 }));
    expect(a.measurementResult).toBe("EXTERNALLY_CONFOUNDED");
    expect(a.verificationStatus).toBe("inconclusive");
    expect(a.causalAttribution).toBe("CONFOUNDED");
    expect(a.learningEligibility).toBe("NOT_ELIGIBLE");
    expect(ownerOutcomeLoopState(a).code).toBe("EXTERNAL_EVENT_INTERFERED");
  });
  it("15. independent verification is labelled; 16. solo-operator self-verification is explicit", () => {
    const ind = assessOwnerOutcome(input({ verifierKind: "INDEPENDENT", afterProvenance: "EXTERNAL_RECORD", afterValue: 31 }));
    expect(ind.independentlyVerified).toBe(true);
    expect(ind.selfVerified).toBe(false);
    expect(ind.evidenceQuality).toBe("strong");
    const self = assessOwnerOutcome(input({ verifierKind: "SELF", afterValue: 31 }));
    expect(self.selfVerified).toBe(true);
    expect(self.independentlyVerified).toBe(false);
  });
  it("17. AI cannot be a verifier", () => {
    expect(() => assertOutcomeVerifierIsNotAI("AI")).toThrow(/AI_IS_NOT_A_VERIFIER/);
    expect(() => assessOwnerOutcome(input({ verifierKind: "AI" }))).toThrow();
  });
  it("narrative-only after evidence is not a measurement", () => {
    const a = assessOwnerOutcome(input({ afterValue: 31, afterProvenance: "NARRATIVE_ONLY" }));
    expect(a.measurementResult).toBe("NOT_MEASURABLE");
    expect(a.evidenceQuality).toBe("anecdotal");
  });
});

describe("unknown direction fails closed", () => {
  const unknown = (over: Partial<OwnerOutcomeInput> = {}) => input({ direction: "unknown", baselineValue: 20, afterValue: 10, targetValue: 12, ...over });
  it("1/4. unknown direction is never judged up: no IMPROVED/WORSENED, no target attainment, inconclusive", () => {
    const a = assessOwnerOutcome(unknown());
    expect(a.direction).toBe("unknown");
    expect(a.measurementResult).toBe("CHANGED_DIRECTION_UNKNOWN");
    expect(a.targetAttainment).toBe("UNKNOWN");
    expect(a.verificationStatus).toBe("inconclusive");
    expect(a.issueResolution).toBe("NOT_YET_REASSESSED");
    const s = ownerOutcomeLoopState(a);
    expect(s.code).toBe("NEEDS_DIRECTION");
    expect(s.reading).toBe("OpsIQ has the before and after values, but the intended direction for this metric was not recorded, so target attainment cannot be verified.");
  });
  it("up and down are judged correctly", () => {
    const up = assessOwnerOutcome(input({ direction: "up", baselineValue: 10, afterValue: 20, targetValue: 18 }));
    expect([up.measurementResult, up.targetAttainment]).toEqual(["IMPROVED", "REACHED"]);
    const down = assessOwnerOutcome(input({ direction: "down", baselineValue: 20, afterValue: 10, targetValue: 12 }));
    expect([down.measurementResult, down.targetAttainment]).toEqual(["IMPROVED", "REACHED"]);
  });
  it("5. unknown direction is never learning-eligible, even if a gate result is supplied", () => {
    const a = assessOwnerOutcome(unknown({ learningGate: { status: "ELIGIBLE_VERIFIED_SUCCESS", eligible: true } }));
    expect(a.learningEligibility).toBe("NOT_ELIGIBLE");
    expect(a.learningBlockers.join(" ")).toContain("direction");
  });
  it("equality with the target is direction-independent", () => {
    expect(assessOwnerOutcome(unknown({ afterValue: 12 })).targetAttainment).toBe("REACHED");
  });
  it("adapters never default to up", () => {
    const base = { domain: "operations" as const, actionId: "t1", taskStatus: "OUTCOME_RECORDED", completedAt: DONE, now: NOW, outcome: { outcomeStatus: "worked", beforeValue: 20, afterValue: 10 } };
    expect(processOutcomeToOutcomeInput(base).direction).toBe("unknown");
    expect(processOutcomeToOutcomeInput({ ...base, direction: "down" }).direction).toBe("down");
    const row = { domain: "sales" as const, action: { id: "s1", status: "completed", completedAt: DONE }, verification: { status: "verified_improved", beforeValue: 1, afterValue: 2 }, now: NOW };
    expect(domainActionToOutcomeInput(row).direction).toBe("unknown");
    expect(domainActionToOutcomeInput({ ...row, verification: { ...row.verification, targetDirection: "down" } }).direction).toBe("down");
  });
});

describe("causation and learning stay separate", () => {
  it("18/19. verified improvement is not causal effectiveness; adjudication is never reported stronger than plausible", () => {
    expect(assessOwnerOutcome(input({ afterValue: 31 })).causalAttribution).toBe("NOT_ASSESSED");
    expect(assessOwnerOutcome(input({ afterValue: 31, causalAssessment: "likely_caused" })).causalAttribution).toBe("PLAUSIBLE");
    expect(assessOwnerOutcome(input({ afterValue: 31, causalAssessment: "correlation_only" })).causalAttribution).toBe("INSUFFICIENT_EVIDENCE");
    expect(assessOwnerOutcome(input({ afterValue: 31, causalAssessment: "external_event_dominant" })).causalAttribution).toBe("CONFOUNDED");
  });
  it("20. learning eligibility is a separate field; without an actual gate result it is only PENDING_GOVERNANCE", () => {
    const pending = assessOwnerOutcome(input({ afterValue: 31 }));
    expect(pending.learningEligibility).toBe("PENDING_GOVERNANCE");
    expect(pending.learningBlockers.join(" ")).toContain("learning gate has not been run");
    const confirmed = assessOwnerOutcome(input({ afterValue: 31, learningGate: { status: "ELIGIBLE_VERIFIED_SUCCESS", eligible: true } }));
    expect(confirmed.learningEligibility).toBe("ELIGIBLE_CONFIRMED_BY_GATE");
    const blocked = assessOwnerOutcome(input({ afterValue: 31, learningGate: { status: "BLOCKED_NO_PROOF", eligible: false } }));
    expect(blocked.learningEligibility).toBe("NOT_ELIGIBLE");
    // A gate "yes" never overrides a hard blocker the contract already sees.
    expect(assessOwnerOutcome(input({ afterValue: 31, disputed: true, learningGate: { status: "ELIGIBLE_VERIFIED_SUCCESS", eligible: true } })).learningEligibility).toBe("NOT_ELIGIBLE");
    expect(assessOwnerOutcome(input({ afterValue: 31, domain: "sales", learningLoop: "NONE" })).learningEligibility).toBe("NO_LEARNING_LOOP");
    expect(learningLoopForDomain("finance")).toBe("FINANCE_BRIDGE");
    for (const d of ["recovery", "cashflow", "sales", "operations", "marketing", "sop", "strategy", "customer"] as const) {
      expect(learningLoopForDomain(d)).toBe("NONE");
    }
  });
  it("21. Finance learning thresholds are unchanged", () => {
    expect(MIN_SAMPLE).toBe(3);
    expect(MAX_MODIFIER).toBe(0.1);
  });
});

describe("adapters", () => {
  it("System A: the owner-typed after-value is OWNER_ENTERED and the verifier is never independent", () => {
    const i = domainActionToOutcomeInput({
      domain: "sales",
      action: { id: "s1", status: "completed", completedAt: DONE, verificationMetric: "winRate", verificationWindowDays: null },
      verification: { status: "verified_improved", beforeValue: 10, afterValue: 20, baselineSource: "OWNER_REPORTED", targetDirection: "up", targetValue: 15, createdAt: LATER },
      now: NOW,
    });
    expect(i.afterProvenance).toBe("OWNER_ENTERED");
    expect(i.baselineProvenance).toBe("OWNER_REPORTED");
    expect(i.verifierKind).toBe("UNKNOWN");
    const a = assessOwnerOutcome(i);
    expect(a.independentlyVerified).toBe(false);
    expect(a.learningEligibility).toBe("NO_LEARNING_LOOP");
  });
  it("System B: a recorded 'worked' with no numbers is narrative, and a task-dispute is a dispute", () => {
    const base = { domain: "operations" as const, actionId: "t1", taskStatus: "OUTCOME_RECORDED", completedAt: DONE, now: NOW };
    const narrative = processOutcomeToOutcomeInput({ ...base, outcome: { outcomeStatus: "worked", evidenceQuality: "none" } });
    expect(narrative.afterProvenance).toBe("NARRATIVE_ONLY");
    expect(assessOwnerOutcome(narrative).measurementResult).toBe("NOT_MEASURABLE");
    const disputed = processOutcomeToOutcomeInput({ ...base, taskStatus: "OUTCOME_DISPUTED", outcome: { outcomeStatus: "worked", beforeValue: 1, afterValue: 2 } });
    expect(assessOwnerOutcome(disputed).disputed).toBe(true);
    const self = processOutcomeToOutcomeInput({ ...base, outcome: { outcomeStatus: "worked", beforeValue: 1, afterValue: 2, verificationClassification: "SUCCESS", verifiedByActorId: "u1", verifiedAt: LATER, selfVerified: true } });
    expect(assessOwnerOutcome(self).selfVerified).toBe(true);
  });
  it("System B classifier: a flagged external event is its own class, never SUCCESS or no-measurable-impact", () => {
    const row = {
      id: "o1", workspaceId: "w", businessId: "b", outcomeStatus: "worked", ownerReportedResult: "better", actualMetricName: null,
      beforeValue: null, afterValue: null, measurementPeriodEnd: null, evidenceQuality: "moderate", externalEventFlag: true,
      observationWindowDays: null, verificationClassification: null, taskKey: null, createdAt: DONE,
    } satisfies OutcomeRowForClassification;
    expect(classifyOutcomeVerification(row, null, NOW)).toBe("EXTERNAL_EVENT_INTERFERENCE");
    expect(classifyOutcomeVerification({ ...row, externalEventFlag: false }, null, NOW)).toBe("SUCCESS");
  });
});

describe("owner wording", () => {
  it("every loop state has a concrete next step and only a confirmed resolution is terminal", () => {
    const states = [
      input({ executionStatus: "IN_PROGRESS", completedAt: null }),
      input({ verificationMetric: null }),
      input({ windowDays: 60 }),
      input({ afterValue: null, afterProvenance: "NONE", afterMeasuredAt: null }),
      input(),
      input({ afterValue: 31 }),
      input({ afterValue: 20 }),
      input({ afterValue: 10 }),
      input({ disputed: true }),
      input({ externalEvent: true }),
      input({ afterValue: 31, newerDiagnosis: { evidenceAsOf: new Date("2026-08-25T00:00:00Z"), evidenceCurrent: true, stillRaised: false } }),
      input({ afterValue: 31, newerDiagnosis: { evidenceAsOf: new Date("2026-08-25T00:00:00Z"), evidenceCurrent: true, stillRaised: true } }),
    ].map((i) => ownerOutcomeLoopState(assessOwnerOutcome(i)));
    expect(new Set(states.map((s) => s.code)).size).toBe(states.length);
    for (const s of states) {
      expect(s.nextStep.length).toBeGreaterThan(10);
      expect(s.terminal).toBe(s.code === "NEW_DIAGNOSIS_CONFIRMS_RESOLVED");
    }
  });
  it("the verified line states a target was reached and asks for new evidence, not that the issue is fixed", () => {
    const line = describeVerifiedActionLine("Chase invoices");
    expect(line).toContain("verification target");
    expect(line).toContain("confirm with new business evidence");
    expect(line).not.toMatch(/resolved|fixed|worked/i);
  });
});

describe("firewall: this change touches no score, ranking or learning code", () => {
  const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
  it("the policy is pure: no persistence, scoring or learning imports", () => {
    for (const f of ["src/domain/owner-spine/owner-outcome-policy.ts", "src/domain/owner-spine/owner-outcome-adapters.ts"]) {
      const src = read(f);
      expect(src).not.toMatch(/from "@\/lib\/db"|@prisma|emitAuditEvent|effectivenessModifier|calculateOwnerPriorityScore|rankOwnerActions/);
    }
  });
  it("shared verifyOutcome is reused, not forked", () => {
    expect(read("src/domain/owner-spine/owner-outcome-policy.ts")).toContain('from "../founder-recovery/verification"');
  });
});
