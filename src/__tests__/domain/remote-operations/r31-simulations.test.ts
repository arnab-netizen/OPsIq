/**
 * R31 — Adversarial simulations (§103) + required behaviors (§102), end-to-end across the
 * real remote-operations modules. Each asserts the GOVERNED (safe) outcome and that the
 * hard-fail conditions are caught.
 */
import { describe, it, expect } from "vitest";
import { runCollective, type CollectiveInput } from "@/domain/collective-training/collective-engine";
import { checkGovernedByOwnerMode, checkTerminalCannotForgeSuccess } from "@/domain/remote-operations/owner-mode-contract";
import { checkTransition, serializeConcurrentTransitions, type LockedTask } from "@/domain/remote-operations/task-state-machine";
import { evaluateDispatch, isApprovalFresh, type FeasibilityContext } from "@/domain/remote-operations/dispatch-feasibility";
import { checkAiPlanApproval } from "@/domain/remote-operations/plan-approval";
import type { DistributionPlan, PlanItem } from "@/domain/remote-operations/distribution-plan";
import { assessProof, validateChecklistProofBinding, type ProofAuthenticitySignals } from "@/domain/remote-operations/proof";
import { assessOfflineProof } from "@/domain/remote-operations/offline-integrity";
import { reviewProofDeterministic, aiFlagToAction, aiResultClosesHighRisk } from "@/domain/remote-operations/ai-review";
import { evaluatePairApproval } from "@/domain/remote-operations/pair-risk";
import { canBlockDispatchByScore, reliabilityLabel } from "@/domain/remote-operations/reliability";
import { assessLocationRisk, type LocationRiskSignals } from "@/domain/remote-operations/location-readiness";
import { classifyRemoteLearning, type RemoteLearningInput } from "@/domain/remote-operations/outcome-learning";
import { evaluateComplianceGate } from "@/domain/remote-operations/compliance-gate";
import { resolveOwnerTimeout } from "@/domain/remote-operations/owner-decisions";
import { buildVendorProjection, detectVendorLeak, accessCodeViewHarm, type FullIssueRecord } from "@/domain/remote-operations/vendor-access";
import { assessEconomics } from "@/domain/remote-operations/economics";
import { evaluateReplan, dependencyClears } from "@/domain/remote-operations/replanning";
import { selectRandomAudit, canExpandBeyondPilot, type PilotResult } from "@/domain/remote-operations/operations-extra";

const cleanProof = (over: Partial<ProofAuthenticitySignals> = {}): ProofAuthenticitySignals => ({
  requiredProofPresent: true, hasRequiredView: true, beforeAfterPaired: true, authorizedSubmitter: true, withinWindow: true,
  imageQualityOk: true, relatedToChecklistItem: true, metadataPresent: true, duplicateSuspected: false, samePhotoBeforeAndAfter: false,
  noVisibleChangeWhereExpected: false, timestampSuspicious: false, locationMismatch: false, contradictedByComplaint: false,
  resolutionBelowMinimum: false, multiSource: false, ...over,
});
const feasible = (over: Partial<FeasibilityContext> = {}): FeasibilityContext => ({
  staffAvailable: true, roleSkillMatch: true, workloadCapacityOk: true, locationValid: true, accessReady: true, suppliesReady: true,
  checklistAttached: true, proofRequirementAttached: true, verifierAssigned: true, pairRiskBlockActive: false, falseCompletionBlockActive: false,
  deadlineFeasible: true, dependencyChainSatisfied: true, backupForCritical: true, locationPaused: false, locationReadyBlocked: false,
  approvalThresholdsSatisfied: true, complianceGatePassed: true, safetyGatePassed: true, customerTimingKnown: true, costApprovalSatisfied: true,
  ownerApprovalSatisfied: true, vendorPrequalified: true, workloadDataComplete: true, approvalFresh: true, ...over,
});
const riskSig = (over: Partial<LocationRiskSignals> = {}): LocationRiskSignals => ({
  hasData: true, dataStale: false, criticalOrEmergencyComplaint: false, safetyIssueOpen: false, verifiedFalseCompletionLast24h: false,
  dispatchBypassedVeto: false, accessKeyCriticalFailureWithOccupancy: false, highComplaintOpen: false, proofRejectionRateOver20: false,
  criticalTaskOverdue2h: false, handoverUnacknowledgedAfterShift: false, mediumComplaintOpen: false, proofMissingRateOver10: false,
  disputeOpen: false, paused: false, blocked: false, greenBlockers: false, ...over,
});
const learn = (over: Partial<RemoteLearningInput> = {}): RemoteLearningInput => ({
  proofWeak: false, taskDisputed: false, ownerOverride: false, aiFlagUnresolved: false, customerComplaintPending: false,
  outcomeWindowOpen: false, complianceSafetyUnresolved: false, unresolvedRemoteHarm: false, offlineTimestampConflictUnresolved: false,
  outcomeVerified: true, harmChecked: true, harmful: false, simulationTested: true, ...over,
});
const aiItem = (risk: PlanItem["riskLevel"], over: Partial<PlanItem> = {}): PlanItem => ({ taskTemplateType: "RECURRING_SERVICE", locationId: "locA", scheduledAtMs: 1, assignee: "s1", riskLevel: risk, ...over });
const aiPlan = (items: PlanItem[], source: DistributionPlan["sourceType"] = "AI_GENERATED_HUMAN_REVIEWED"): DistributionPlan =>
  ({ distributionPlanId: "dp", workspaceId: "ws", businessId: "b", locationId: "locA", version: 1, createdAtMs: 1, createdBy: "ai", sourceType: source, status: "APPROVAL_REQUIRED", items, idempotencyKey: "k", dispatched: false, changeLog: [] });

const cashRed: CollectiveInput = { archetype: "universal", ownerGoal: "ads", signals: [{ domain: "cash-survival", status: "RED", severity: "CRITICAL", confidence: "HIGH" }] };

describe("[R31] remote operations — adversarial simulations & hard-fail conditions", () => {
  it("S5 'done' without proof cannot verify", () => {
    expect(assessProof(cleanProof({ requiredProofPresent: false }), "STANDARD").blocksVerification).toBe(true);
  });
  it("S6/S7 weak & reused proof are caught (weak never strong)", () => {
    expect(assessProof(cleanProof({ imageQualityOk: false }), "HIGH").strength).toBe("WEAK_PROOF");
    expect(assessProof(cleanProof({ duplicateSuspected: true }), "HIGH").status).toBe("DUPLICATE_SUSPECTED");
  });
  it("S8 proof conflicting with checklist binding is flagged", () => {
    expect(validateChecklistProofBinding([{ label: "Bathroom cleaned", critical: true, done: true, attachedProof: [] }]).length).toBe(1);
  });
  it("S13/S14 offline backdated proof triggers TIMESTAMP_SUSPICIOUS and cannot verify; unfounded location flagged", () => {
    const a = assessOfflineProof({ offlineCaptured: true, deviceCaptureAtMs: 0, serverUploadAtMs: 24 * 3600_000, submitterId: "s", syncStatus: "SYNCED", realTimeLocationCaptured: false, claimsLocationMetadata: true });
    expect(a.timestampSuspicious).toBe(true);
    expect(a.canVerify).toBe(false);
    expect(a.flags).toContain("offline_location_metadata_unfounded");
  });
  it("S17/S18 supervisor=direct-manager pair on HIGH is blocked; pair-risk forces counter-approval", () => {
    expect(evaluatePairApproval({ riskLevel: "HIGH", supervisorIsDirectManagerOfStaff: true, pairRiskScore: 0, counterApprovalPresent: false, otherVerifierAvailable: true, ownerOrManagerNotified: false }).allowed).toBe(false);
    expect(evaluatePairApproval({ riskLevel: "HIGH", supervisorIsDirectManagerOfStaff: false, pairRiskScore: 9, counterApprovalPresent: false, otherVerifierAvailable: true, ownerOrManagerNotified: false }).allowed).toBe(false);
  });
  it("S25/S26 customer dispute after verification blocks success & learning", () => {
    expect(classifyRemoteLearning(learn({ taskDisputed: true })).eligible).toBe(false);
    expect(assessLocationRisk(riskSig({ disputeOpen: true }))).toBe("DISPUTED");
  });
  it("S30/S31/S32 vendor sees scoped projection, no thresholds; unqualified vendor blocked", () => {
    const issue = { issueDescription: "tap", locationTaskDetails: "u4", requiredProof: "photos", scheduledTimeMs: 1, communicationChannel: "app", quoteSubmissionFields: ["amt"], ownerApprovalThreshold: 5000, otherVendorQuotes: [1], priorRepairCostHistory: [1], workspaceFinancials: {}, locationUnitEconomics: {}, ownerMargin: 0.3, internalStaffReliability: {} } as FullIssueRecord;
    expect(detectVendorLeak(buildVendorProjection(issue) as never)).toEqual([]);
    expect(evaluateDispatch(feasible({ isVendorTask: true, vendorPrequalified: false }), "STANDARD").blocked).toContain("VENDOR_NOT_PREQUALIFIED");
  });
  it("S33/S36 high-cost owner approval & stockout block dispatch", () => {
    expect(evaluateDispatch(feasible({ ownerApprovalSatisfied: false }), "STANDARD").blocked).toContain("OWNER_APPROVAL_REQUIRED");
    expect(evaluateDispatch(feasible({ suppliesReady: false }), "STANDARD").blocked).toContain("SUPPLIES_MISSING");
  });
  it("S35 access code without audit raises a harm event", () => {
    expect(accessCodeViewHarm({ taskState: "ACTIVE", auditLogged: false })).toBe("ACCESS_CODE_EXPOSED_WITHOUT_AUDIT");
  });
  it("S37/S38 busy-but-unprofitable & receivables raise risk; activity does not hide it", () => {
    const a = assessEconomics({ collectedCash: 1000, directLabour: 900, consumables: 300, agedReceivables30: 200 });
    expect(a.canClaimHealthy).toBe(false);
    expect(a.cashRiskAlert).toBe(true);
  });
  it("S40/S41 no false green; GREY_NO_DATA is unknown not low", () => {
    expect(assessLocationRisk(riskSig({ verifiedFalseCompletionLast24h: true }))).toBe("RED_CRITICAL");
    expect(assessLocationRisk(riskSig({ dataStale: true }))).toBe("GREEN_LOW_CONFIDENCE");
    expect(assessLocationRisk(riskSig({ hasData: false }))).toBe("GREY_NO_DATA");
  });
  it("S43 owner override blocks learning", () => {
    expect(classifyRemoteLearning(learn({ ownerOverride: true })).eligible).toBe(false);
  });
  it("S44/S45 insufficient sample shows INSUFFICIENT_DATA and does not block dispatch by score", () => {
    expect(reliabilityLabel("rework_rate", 3, "HIGH").label).toBe("INSUFFICIENT_DATA_rework_rate");
    expect(canBlockDispatchByScore("rework_rate", 3, false)).toBe(false);
  });
  it("S48 AI flag is just a flag; AI cannot verify high-risk alone, but maps to an action", () => {
    expect(aiResultClosesHighRisk()).toBe(false);
    expect(aiFlagToAction(reviewProofDeterministic(cleanProof({ duplicateSuspected: true })).status)).toBe("BLOCK_HIGH_CONFIDENCE_VERIFICATION");
  });
  it("S52/S53 dispatch to paused location blocked; stale approval re-checked", () => {
    expect(evaluateDispatch(feasible({ locationPaused: true }), "STANDARD").blocked).toContain("LOCATION_PAUSED");
    expect(isApprovalFresh(0, 10 * 3600_000, "HIGH")).toBe(false);
    expect(evaluateDispatch(feasible({ approvalFresh: false }), "HIGH").blocked).toContain("DISTRIBUTION_APPROVAL_STALE");
  });
  it("S55 pilot failure blocks expansion", () => {
    const p: PilotResult = { proofSubmissionAcceptable: true, falseCompletionControlled: false, supervisorVerificationReliable: true, ownerBriefingUseful: true, noFalseGreen: true, arbitrationNoBlockingConflicts: true };
    expect(canExpandBeyondPilot(p)).toBe(false);
  });
  it("S56 emergency owner-timeout escalates fast to backup", () => {
    expect(resolveOwnerTimeout("EMERGENCY", 16 * 60_000, false)).toBe("NOTIFY_BACKUP");
  });
  it("S58/S59 remote task cannot bypass Owner Mode veto; terminal cannot forge success", () => {
    const arbitration = runCollective(cashRed);
    expect(checkGovernedByOwnerMode({ arbitration, proposedAction: "ads", performsActions: ["paid_marketing"] }).length).toBeGreaterThan(0);
    expect(evaluateDispatch(feasible({ arbitration, performsActions: ["paid_marketing"] }), "STANDARD").blocked).toContain("OWNER_MODE_VETO_ACTIVE");
    expect(checkTerminalCannotForgeSuccess({ terminal: "SUPERVISOR", riskLevel: "HIGH", ownerModeVerified: false }).length).toBeGreaterThan(0);
  });
  it("S63 concurrent completion attempts serialize — exactly one succeeds", () => {
    const t: LockedTask = { status: "CUSTOMER_CONFIRMED", riskLevel: "CRITICAL", lockVersion: 1 };
    expect(serializeConcurrentTransitions(t, "COMPLETED_VERIFIED", 6).successes).toBe(1);
  });
  it("S64/S65 AI plan with duplicates blocked; HIGH/CRITICAL AI plan cannot be bulk approved", () => {
    expect(checkAiPlanApproval(aiPlan([aiItem("LOW"), aiItem("LOW")]), { mode: "bulk" })).toContain("duplicate_tasks_present");
    expect(checkAiPlanApproval(aiPlan([aiItem("CRITICAL")]), { mode: "bulk" }).some((r) => r.startsWith("bulk_approval_blocked_high_risk"))).toBe(true);
  });
  it("S66 downstream inspection blocked until cleaning dependency verified", () => {
    expect(dependencyClears("SUPERVISOR_VERIFIED")).toBe(false);
    expect(evaluateDispatch(feasible({ dependencyChainSatisfied: false }), "STANDARD").blocked).toContain("DEPENDENCY_NOT_VERIFIED");
  });
  it("S67 random audit selection is deterministic without supervisor input", () => {
    const ids = Array.from({ length: 30 }, (_, i) => `t${i}`);
    expect(selectRandomAudit(ids, 7, 10)).toEqual(selectRandomAudit(ids, 7, 10));
  });
  it("S70 dispatch-bypassed-veto attempt + OWNER_MODE veto recall after dispatch", () => {
    expect(evaluateReplan("OWNER_MODE_VETO_AFTER_DISPATCH", ["STAFF"]).action).toBe("DISPATCH_RECALLED");
  });
  it("hard-fail: ASSIGNED→COMPLETED_VERIFIED skip and compliance fail-closed", () => {
    expect(checkTransition("ASSIGNED", "COMPLETED_VERIFIED", "HIGH").ok).toBe(false);
    expect(evaluateComplianceGate("DISPATCH", { complianceSensitive: true, statusClear: false, requiresCertificationOrLicence: false, certificationPresentAndValid: true, verifiedExpertSource: true, safetyHazardOpen: false }).verdict).toBe("BLOCKED_FAIL_CLOSED");
  });
});
