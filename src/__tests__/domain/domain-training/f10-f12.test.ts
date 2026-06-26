import { describe, it, expect } from "vitest";
import {
  LearningStage,
  canPromote,
  terminalStage,
  isIllegalJump,
  type LearningCandidate,
} from "@/domain/domain-training/learning-quarantine";
import {
  validateRecommendationQuality,
  isRecommendationQualityOk,
  type RecommendationQualityInput,
} from "@/domain/domain-training/recommendation-quality";
import { checkFeasibility, type FeasibilityInput } from "@/domain/domain-training/feasibility-checker";

const cand = (over: Partial<LearningCandidate> = {}): LearningCandidate => ({
  stage: LearningStage.SIMULATION_TESTED, outcomeVerified: true, harmChecked: true,
  harmful: false, disputed: false, inconclusive: false, simulationTested: true, ...over,
});

describe("[F10] learning quarantine", () => {
  it("unverified outcome blocked", () => {
    expect(canPromote(cand({ outcomeVerified: false }))).toBe(false);
    expect(terminalStage(cand({ outcomeVerified: false }))).toBe(LearningStage.CAPTURED);
  });
  it("disputed outcome blocked", () => {
    expect(canPromote(cand({ disputed: true }))).toBe(false);
    expect(terminalStage(cand({ disputed: true }))).toBe(LearningStage.DISPUTED);
  });
  it("harmful outcome not promoted as positive pattern", () => {
    expect(canPromote(cand({ harmful: true }))).toBe(false);
    expect(terminalStage(cand({ harmful: true }))).toBe(LearningStage.QUARANTINED_PATTERN);
  });
  it("promoted pattern requires simulation-tested status", () => {
    expect(canPromote(cand({ simulationTested: false, stage: LearningStage.DOMAIN_REVIEWED }))).toBe(false);
    expect(canPromote(cand())).toBe(true);
    expect(isIllegalJump(LearningStage.CAPTURED, LearningStage.PROMOTED)).toBe(true);
    expect(isIllegalJump(LearningStage.SIMULATION_TESTED, LearningStage.PROMOTED)).toBe(false);
  });
});

const rec = (over: Partial<RecommendationQualityInput> = {}): RecommendationQualityInput => ({
  text: "Call overdue clients with the approved script today", actions: ["call INV-102", "log promised date"],
  assignedRole: "Billing", deadlineOrReviewWindow: "today", evidenceRefs: ["bank"], verificationMethod: "recheck cash 48h",
  reversibleOrRiskControlled: true, matchedToCash: true, matchedToCapacity: true, matchedToStaffWorkload: true,
  matchedToOwnerWorkload: true, whatNotToDo: ["no discount"], proofRequirement: "call log", stopRollbackRedesign: "stop on dispute",
  confidence: "HIGH", severity: "CRITICAL", ...over,
});

describe("[F11] recommendation quality validator", () => {
  it("a complete recommendation passes", () => {
    expect(isRecommendationQualityOk(rec())).toBe(true);
  });
  it("generic recommendation fails", () => {
    expect(validateRecommendationQuality(rec({ text: "improve marketing", actions: [] }))).toContain("no_actions");
  });
  it("recommendation without owner/proof/verification/stop fails", () => {
    expect(validateRecommendationQuality(rec({ assignedRole: "" }))).toContain("no_owner");
    expect(validateRecommendationQuality(rec({ proofRequirement: "" }))).toContain("no_proof_requirement");
    expect(validateRecommendationQuality(rec({ verificationMethod: "" }))).toContain("not_verifiable");
    expect(validateRecommendationQuality(rec({ stopRollbackRedesign: "" }))).toContain("no_stop_rollback_redesign");
  });
  it("too many unprioritized actions fails", () => {
    expect(validateRecommendationQuality(rec({ actions: ["a", "b", "c", "d", "e", "f"] }))).toContain("too_many_unprioritized_actions");
  });
});

const feas = (over: Partial<FeasibilityInput> = {}): FeasibilityInput => ({
  affordable: true, staffAvailable: true, assigneeHasAuthority: true, legalOrEscalated: true,
  proofCollectable: true, outcomeMeasurable: true, reversibilityScored: true, reversible: true,
  ownerWorkloadAcceptable: true, staffWorkloadAcceptable: true, noConflictWithPriorities: true,
  lowerRiskAlternativeConsidered: true, confidenceLow: false, ...over,
});

describe("[F12] feasibility checker", () => {
  it("feasible when all checks pass", () => {
    expect(checkFeasibility(feas()).verdict).toBe("FEASIBLE");
  });
  it("unaffordable action blocked", () => {
    expect(checkFeasibility(feas({ affordable: false })).blockers).toContain("unaffordable");
  });
  it("no-authority assignee blocked", () => {
    expect(checkFeasibility(feas({ assigneeHasAuthority: false })).blockers).toContain("assignee_no_authority");
  });
  it("unmeasurable outcome downgraded", () => {
    const r = checkFeasibility(feas({ outcomeMeasurable: false }));
    expect(r.verdict).toBe("DOWNGRADE");
    expect(r.downgrades).toContain("outcome_not_measurable");
  });
  it("irreversible high-risk action blocked under low confidence", () => {
    expect(checkFeasibility(feas({ reversible: false, confidenceLow: true })).blockers).toContain("irreversible_high_risk_low_confidence");
  });
});
