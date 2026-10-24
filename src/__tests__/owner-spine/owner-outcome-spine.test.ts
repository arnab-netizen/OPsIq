/**
 * Canonical outcome spine (pure): chain identity, commitment-derived direction, snapshot fingerprints, and the
 * policy-level matrix the persisted snapshots inherit (attribution ≤ PLAUSIBLE, learning only by gate, resolution only by a newer diagnosis).
 */
import { describe, it, expect } from "vitest";
import { assessOwnerOutcome, type OwnerOutcomeInput } from "@/domain/owner-spine/owner-outcome-policy";
import {
  assessmentFingerprint, chainKeyForCandidate, chainKeyForLegacyProcessTask, commitmentFidelityFor, directionFromCommitment, serializeOutcomeInput,
  type OutcomeLinks,
} from "@/domain/owner-spine/owner-outcome-spine";

const NOW = new Date("2026-07-20T12:00:00Z");
const d = (n: number) => new Date(NOW.getTime() - n * 86_400_000);
const input = (over: Partial<OwnerOutcomeInput> = {}): OwnerOutcomeInput => ({
  domain: "finance", actionId: "a1", executionStatus: "COMPLETED", completedAt: d(30), verificationMetric: "m", baselineValue: 10, baselineProvenance: "OWNER_REPORTED",
  afterValue: 14, afterProvenance: "OWNER_ENTERED", afterMeasuredAt: d(10), direction: "up", targetValue: 12, windowDays: 7, disputed: false, externalEvent: false,
  verifierKind: "UNKNOWN", verificationAttempted: true, verifiedAt: d(10), causalAssessment: null, newerDiagnosis: null, learningLoop: "FINANCE_BRIDGE", learningGate: null, now: NOW, ...over,
});
const links: OutcomeLinks = {
  ownerDecisionId: null, sourceSystem: "SYSTEM_A", systemAActionId: "a1", systemAVerificationId: "v1", processTaskId: null, processTaskKey: null, ownerActionOutcomeId: null,
  reassessmentEventId: null, learningCandidateRef: null, newerDiagnosisDomain: null, newerDiagnosisCycleId: null, newerDiagnosisEvidenceAsOf: null,
};

describe("chain identity", () => {
  it("a decision chain IS its canonical candidate; an undecided process task is its own distinct chain", () => {
    expect(chainKeyForCandidate("domain_action:finance:x")).toBe("domain_action:finance:x");
    expect(chainKeyForLegacyProcessTask("t1")).toBe("process_task:t1");
    expect(chainKeyForLegacyProcessTask("t1")).not.toBe(chainKeyForCandidate("domain_action:finance:t1"));
  });
  it("MODIFIED is never read as following the recommendation", () => {
    expect(commitmentFidelityFor("ACCEPTED")).toBe("AS_RECOMMENDED");
    expect(commitmentFidelityFor("MODIFIED")).toBe("MODIFIED_BY_OWNER");
    expect(commitmentFidelityFor("REJECTED")).toBe("NOT_COMMITTED"); // nothing observed follows a recommendation the owner did not commit to
    expect(commitmentFidelityFor("DEFERRED")).toBe("NOT_COMMITTED");
    expect(commitmentFidelityFor(null)).toBe("NO_DECISION");
  });
});

describe("direction from a linked commitment (System B)", () => {
  it("applies only a recorded up/down; unknown / absent commitments leave direction unknown", () => {
    expect(directionFromCommitment({ targetDirection: "down", verificationMetric: "m" }, "m").direction).toBe("down");
    expect(directionFromCommitment({ targetDirection: "up", verificationMetric: null }, "m").direction).toBe("up");
    expect(directionFromCommitment({ targetDirection: "unknown", verificationMetric: "m" }, "m").direction).toBeNull();
    expect(directionFromCommitment({ targetDirection: null, verificationMetric: "m" }, "m").direction).toBeNull();
    expect(directionFromCommitment(null, "m").direction).toBeNull();
  });
  it("does not lend a direction to a different metric", () => {
    const r = directionFromCommitment({ targetDirection: "down", verificationMetric: "cost" }, "revenue");
    expect(r.direction).toBeNull();
    expect(r.note).toMatch(/differs/);
  });
});

describe("snapshot fingerprint", () => {
  it("ignores the caller's clock but changes with any fact, link or conclusion", () => {
    const a = assessOwnerOutcome(input());
    const f = (i: OwnerOutcomeInput, l = links) => assessmentFingerprint({ chainKey: "k", links: l, input: i, assessment: assessOwnerOutcome(i) });
    const base = f(input());
    expect(f(input({ now: new Date(NOW.getTime() + 1000) }))).toBe(base);
    expect(serializeOutcomeInput(input())).not.toHaveProperty("now");
    expect(f(input({ afterValue: 15 }))).not.toBe(base);
    expect(f(input({ afterValue: 0 }))).not.toBe(f(input({ afterValue: null, afterProvenance: "NONE" })));
    expect(f(input(), { ...links, systemAVerificationId: "v2" })).not.toBe(base);
    expect(a.measurementResult).toBe("IMPROVED");
  });
});

describe("the policy matrix the persisted snapshots inherit", () => {
  it("51-55. attribution is never inferred and never stronger than PLAUSIBLE", () => {
    expect(assessOwnerOutcome(input()).causalAttribution).toBe("NOT_ASSESSED"); // improvement ≠ causation
    expect(assessOwnerOutcome(input({ causalAssessment: "likely_caused" })).causalAttribution).toBe("PLAUSIBLE");
    expect(assessOwnerOutcome(input({ causalAssessment: "plausible_contributor" })).causalAttribution).toBe("PLAUSIBLE");
    expect(assessOwnerOutcome(input({ causalAssessment: "confounded" })).causalAttribution).toBe("CONFOUNDED");
    expect(assessOwnerOutcome(input({ causalAssessment: "insufficient_evidence" })).causalAttribution).toBe("INSUFFICIENT_EVIDENCE");
    expect(assessOwnerOutcome(input({ causalAssessment: "likely_caused", disputed: true })).causalAttribution).toBe("DISPUTED");
    expect(assessOwnerOutcome(input({ causalAssessment: "likely_caused", externalEvent: true })).causalAttribution).toBe("CONFOUNDED");
  });
  it("56-61. learning: no loop / pending governance / blockers always win / gate-confirmed only from a real gate result", () => {
    expect(assessOwnerOutcome(input({ learningLoop: "NONE" })).learningEligibility).toBe("NO_LEARNING_LOOP");
    expect(assessOwnerOutcome(input()).learningEligibility).toBe("PENDING_GOVERNANCE");
    expect(assessOwnerOutcome(input({ disputed: true })).learningEligibility).toBe("NOT_ELIGIBLE");
    expect(assessOwnerOutcome(input({ externalEvent: true })).learningEligibility).toBe("NOT_ELIGIBLE");
    expect(assessOwnerOutcome(input({ direction: "unknown" })).learningEligibility).toBe("NOT_ELIGIBLE");
    expect(assessOwnerOutcome(input({ learningGate: { status: "ELIGIBLE", eligible: true } })).learningEligibility).toBe("ELIGIBLE_CONFIRMED_BY_GATE");
    for (const bad of [{ disputed: true }, { externalEvent: true }, { direction: "unknown" as const }]) {
      expect(assessOwnerOutcome(input({ ...bad, learningGate: { status: "ELIGIBLE", eligible: true } })).learningEligibility).toBe("NOT_ELIGIBLE");
    }
  });
  it("46-50. RESOLVED only from a strictly newer, current, complete diagnosis that no longer raises the issue", () => {
    const nd = (over: object) => ({ evidenceAsOf: d(2), evidenceCurrent: true, stillRaised: false, ...over });
    expect(assessOwnerOutcome(input()).issueResolution).toBe("NOT_YET_REASSESSED");
    expect(assessOwnerOutcome(input({ newerDiagnosis: nd({ stillRaised: true }) })).issueResolution).toBe("STILL_OPEN");
    expect(assessOwnerOutcome(input({ newerDiagnosis: nd({ stillRaised: true, worsened: true }) })).issueResolution).toBe("WORSENED");
    expect(assessOwnerOutcome(input({ newerDiagnosis: nd({ evidenceCurrent: false }) })).issueResolution).toBe("INCONCLUSIVE");
    expect(assessOwnerOutcome(input({ newerDiagnosis: nd({}) })).issueResolution).toBe("RESOLVED");
    expect(assessOwnerOutcome(input({ newerDiagnosis: nd({ evidenceAsOf: d(10) }) })).issueResolution).toBe("NOT_YET_REASSESSED"); // not strictly newer than the measurement
    expect(assessOwnerOutcome(input({ newerDiagnosis: nd({ evidenceAsOf: d(40) }) })).issueResolution).toBe("NOT_YET_REASSESSED");
    // completed, improved, target reached and "worked" are not resolution
    const reached = assessOwnerOutcome(input({ afterValue: 12, targetValue: 12 }));
    expect(reached.targetAttainment).toBe("REACHED");
    expect(reached.issueResolution).toBe("NOT_YET_REASSESSED");
  });
  it("45. external interference never reads as improvement or learning", () => {
    const a = assessOwnerOutcome(input({ externalEvent: true }));
    expect([a.measurementResult, a.learningEligibility]).toEqual(["EXTERNALLY_CONFOUNDED", "NOT_ELIGIBLE"]);
  });
  it("AI can never be a verifier", () => {
    expect(() => assessOwnerOutcome(input({ verifierKind: "AI" }))).toThrow(/AI cannot verify/);
  });
});
