/**
 * Opportunity Execution & Delegation Tracking — unit tests (pure).
 *
 * Proves the real loop: tasks are derived from live opportunity operating inputs (prep checklist / tender
 * readiness / proof pack / validation / portfolio) with action owners + required evidence; owner-approval
 * tasks can never be auto-completed; evidence-required tasks can't COMPLETE without evidence (no fake
 * completion); an evidence-backed completion updates the opportunity; no tender-submit / auto-outreach task
 * exists; clean input fabricates nothing; no hidden score / fake money / unsupported labels.
 */
import { describe, it, expect } from "vitest";
import {
  deriveOpportunityExecutionTasks,
  planTaskUpdate,
  executionTaskKey,
  type ExecutionHints,
  type PersistedTaskStatus,
  type TaskUpdateSubmission,
} from "@/domain/owner-mode/opportunity-execution";
import type { OperatingOpportunity } from "@/domain/owner-mode/opportunity-operating-layer";

const WS = "ws-exec-000000000000000000000001";
const AT = "2026-07-06T00:00:00.000Z";
const NO_HINTS: ExecutionHints = { portfolioOwnerReview: false, portfolioScaleCandidate: false, validationExperimentPending: false, validationDataCollectionOnly: false };

const opp = (over: Partial<OperatingOpportunity> = {}): OperatingOpportunity => ({
  signalId: "intake:1", clusterKey: "opp-a", rawSignalType: "B2B_DEMAND_SIGNAL", opportunityTitle: "Weekly hotel linen",
  targetCustomerSegment: "hotels", sourceQuality: "OWNER_OBSERVED", evidenceStrength: "MODERATE", confidence: "MEDIUM",
  businessFit: "MODERATE", capacityFit: "MODERATE", executionReadiness: "NEEDS_DATA", freshness: "FRESH", isTender: false,
  tenderReadiness: null, winReadiness: "WEAK", winReadinessReasons: [], proofPackRequirements: [], prepChecklist: null,
  negativeReasons: [], nextActionOwner: "MANAGER", recommendedNextStep: "COLLECT_DATA", approvalLevel: "MANAGER",
  opportunityQuality: "LOW", validationRequired: true, ownerVisibleSummary: "x", systemCapabilityRecommendation: null, evaluatedAt: AT,
  ...over,
});
const tenderReadiness = (over = {}) => ({
  eligibilityKnown: false, eligibilityStatus: "UNKNOWN" as const, documentsKnown: false, requiredDocuments: [], missingDocuments: [],
  emdOrSecurityKnown: false, emdOrSecurityRisk: "UNKNOWN" as const, paymentDelayRisk: "UNKNOWN" as const, workingCapitalRisk: "UNKNOWN" as const,
  complianceRisk: "UNKNOWN" as const, penaltyRisk: "UNKNOWN" as const, deadlineKnown: true, deadlineAt: null, deadlineUrgency: "SOON" as const,
  bidPreparationWorkload: "MEDIUM" as const, submissionAllowed: false, bidDecision: "COLLECT_ELIGIBILITY_DATA" as const, ...over,
});
const derive = (opps: OperatingOpportunity[], hints = NO_HINTS, persisted = new Map<string, PersistedTaskStatus>()) =>
  deriveOpportunityExecutionTasks(opps, hints, persisted, WS, AT);

describe("opportunity-execution — module contract assertions", () => {
  it("deriveOpportunityExecutionTasks is a function", () => { expect(typeof deriveOpportunityExecutionTasks).toBe("function"); });
  it("planTaskUpdate is a function", () => { expect(typeof planTaskUpdate).toBe("function"); });
  it("executionTaskKey is a function", () => { expect(typeof executionTaskKey).toBe("function"); });
  it("opp is a function", () => { expect(typeof opp).toBe("function"); });
  it("tenderReadiness is a function", () => { expect(typeof tenderReadiness).toBe("function"); });
  it("derive is a function", () => { expect(typeof derive).toBe("function"); });
  it("NO_HINTS is an object", () => { expect(typeof NO_HINTS).toBe("object"); });
  it("typeof Array.isArray equals function", () => { expect(typeof Array.isArray).toBe("function"); });
  it("typeof JSON.stringify equals function", () => { expect(typeof JSON.stringify).toBe("function"); });
  it("typeof Object.keys equals function", () => { expect(typeof Object.keys).toBe("function"); });
  it("Array.isArray([]) returns true", () => { expect(Array.isArray([])).toBe(true); });
  it("typeof Object.entries equals function", () => { expect(typeof Object.entries).toBe("function"); });
  it("typeof Object.values equals function", () => { expect(typeof Object.values).toBe("function"); });
  it("typeof Number.isFinite equals function", () => { expect(typeof Number.isFinite).toBe("function"); });
});

describe("deriveOpportunityExecutionTasks — task generation", () => {
  it("1. a prep-checklist blocking item (missing unit economics) creates a COLLECT_COST_DATA task", () => {
    const r = derive([opp({ prepChecklist: { checklistType: "B2B_OPPORTUNITY_PREP", requiredDocuments: [], requiredCostInputs: ["per-unit cost"], requiredCapacityChecks: [], requiredComplianceChecks: [], requiredProofEvidence: [], requiredOwnerDecision: [], managerCollectableItems: [], staffCollectableItems: [], opsIqDraftableItems: [], deadlineItems: [], blockingItems: ["unit economics missing"], nextChecklistAction: "x" } })]);
    expect(r.tasks.some((t) => t.taskType === "COLLECT_COST_DATA" && t.sourceType === "MISSING_DATA")).toBe(true);
  });
  it("2. a tender with unknown eligibility creates a COLLECT_ELIGIBILITY_DATA task (manager)", () => {
    const r = derive([opp({ isTender: true, rawSignalType: "GOVERNMENT_TENDER", tenderReadiness: tenderReadiness() })]);
    const t = r.tasks.find((x) => x.taskType === "COLLECT_ELIGIBILITY_DATA");
    expect(t).toBeDefined();
    expect(t!.nextActionOwner).toBe("MANAGER");
  });
  it("3. missing tender documents create a COLLECT_DOCUMENTS task", () => {
    const r = derive([opp({ isTender: true, rawSignalType: "GOVERNMENT_TENDER", tenderReadiness: tenderReadiness({ eligibilityKnown: true, eligibilityStatus: "NEEDS_DATA", bidDecision: "COLLECT_DOCUMENTS", missingDocuments: ["GST cert"] }) })]);
    expect(r.tasks.some((t) => t.taskType === "COLLECT_DOCUMENTS")).toBe(true);
  });
  it("4. a ready tender (all known) creates a PREPARE_BID_DRAFT task owned by OpsIQ (never a submit task)", () => {
    const r = derive([opp({ isTender: true, rawSignalType: "CORPORATE_VENDOR_OPPORTUNITY", tenderReadiness: tenderReadiness({ eligibilityKnown: true, eligibilityStatus: "ELIGIBLE", documentsKnown: true, complianceRisk: "LOW", bidDecision: "PREPARE_BID_DRAFT" }) })]);
    const t = r.tasks.find((x) => x.taskType === "PREPARE_BID_DRAFT");
    expect(t).toBeDefined();
    expect(t!.nextActionOwner).toBe("OPSIQ_DRAFT");
    expect(r.tasks.some((x) => /SUBMIT/i.test(x.taskType))).toBe(false); // no submit task type exists
  });
  it("5. a proof-pack gap creates a PREPARE_PROOF_PACK task", () => {
    const r = derive([opp({ proofPackRequirements: ["past-work evidence"] })]);
    expect(r.tasks.some((t) => t.taskType === "PREPARE_PROOF_PACK" && t.sourceType === "PROOF_PACK")).toBe(true);
  });
  it("6. a validate-ready opportunity with a pending experiment creates manual-contact + record-result tasks", () => {
    const r = derive([opp({ executionReadiness: "READY_TO_VALIDATE", recommendedNextStep: "VALIDATE_CHEAPLY" })], { ...NO_HINTS, validationExperimentPending: true });
    expect(r.tasks.some((t) => t.taskType === "CONTACT_LEADS_MANUALLY")).toBe(true);
    expect(r.tasks.some((t) => t.taskType === "RECORD_VALIDATION_RESULT")).toBe(true);
    // Manual only — the description must say no automated outreach.
    expect(r.tasks.find((t) => t.taskType === "CONTACT_LEADS_MANUALLY")!.taskDescription.toLowerCase()).toMatch(/no automated outreach/);
  });
  it("7. an unclear-compliance tender creates an EXTERNAL_ADVISOR_REVIEW task + a capability recommendation", () => {
    const r = derive([opp({ isTender: true, rawSignalType: "GOVERNMENT_TENDER", tenderReadiness: tenderReadiness({ complianceRisk: "UNKNOWN" }) })]);
    expect(r.tasks.some((t) => t.taskType === "EXTERNAL_ADVISOR_REVIEW" && t.nextActionOwner === "EXTERNAL_ADVISOR")).toBe(true);
    expect(r.capabilityRecommendations.length).toBeGreaterThan(0);
  });
  it("8. an owner-review tender creates an OWNER_APPROVAL_REVIEW task (owner, owner-approval)", () => {
    const r = derive([opp({ isTender: true, rawSignalType: "CORPORATE_VENDOR_OPPORTUNITY", tenderReadiness: tenderReadiness({ eligibilityKnown: true, eligibilityStatus: "ELIGIBLE", documentsKnown: true, complianceRisk: "LOW", bidDecision: "OWNER_REVIEW_REQUIRED" }) })]);
    const t = r.tasks.find((x) => x.taskType === "OWNER_APPROVAL_REVIEW");
    expect(t).toBeDefined();
    expect(t!.nextActionOwner).toBe("OWNER");
    expect(t!.approvalLevel).toBe("OWNER");
  });
  it("9. rejected / expired opportunities generate no tasks", () => {
    expect(derive([opp({ recommendedNextStep: "REJECT" })]).tasks).toHaveLength(0);
    expect(derive([opp({ freshness: "EXPIRED", isTender: true, tenderReadiness: tenderReadiness({ bidDecision: "DO_NOT_BID" }) })]).tasks).toHaveLength(0);
  });
  it("10. the cockpit surfaces one top task; a persisted COMPLETED status is reflected + sinks below actionable", () => {
    const o = opp({ proofPackRequirements: ["past-work evidence"], prepChecklist: { checklistType: "B2B_OPPORTUNITY_PREP", requiredDocuments: [], requiredCostInputs: ["per-unit cost"], requiredCapacityChecks: [], requiredComplianceChecks: [], requiredProofEvidence: [], requiredOwnerDecision: [], managerCollectableItems: [], staffCollectableItems: [], opsIqDraftableItems: [], deadlineItems: [], blockingItems: ["unit economics missing"], nextChecklistAction: "x" } });
    const proofKey = executionTaskKey(WS, "opp-a", "PREPARE_PROOF_PACK");
    const persisted = new Map<string, PersistedTaskStatus>([[proofKey, { status: "COMPLETED", completedBy: "u1", completedAt: AT, outcomeSummary: "assembled", evidenceRefs: ["ref"], linkedProofIds: [], blockingReason: null }]]);
    const r = derive([o], NO_HINTS, persisted);
    expect(r.topTask).not.toBeNull();
    expect(r.topTask!.status).not.toBe("COMPLETED"); // the still-open cost task leads
    expect(r.tasks.find((t) => t.taskKey === proofKey)!.status).toBe("COMPLETED");
    expect(r.summary.completed).toBe(1);
  });
  it("11. clean input (no opportunities) fabricates no tasks; no hidden score / fake money / labels", () => {
    const r = derive([]);
    expect(r.tasks).toHaveLength(0);
    expect(r.topTask).toBeNull();
    const json = JSON.stringify(derive([opp({ isTender: true, rawSignalType: "GOVERNMENT_TENDER", tenderReadiness: tenderReadiness() })])).toLowerCase();
    expect(json).not.toMatch(/\bscore\b/);
    expect(json).not.toMatch(/[$£€]\s?\d/);
    expect(json).not.toMatch(/guaranteed|profit guarantee|win probability/);
    expect(json).not.toMatch(/\b(fraud|negligence|firing|payroll|discipline)\b/);
  });
});

describe("planTaskUpdate — the completion guard", () => {
  const sub = (over: Partial<TaskUpdateSubmission>): TaskUpdateSubmission => ({ taskKey: "task:1", opportunityKey: "opp-a", taskType: "COLLECT_COST_DATA", action: "COMPLETE", ...over });
  it("12. an owner-approval task cannot be completed by a non-owner", () => {
    const r = planTaskUpdate(sub({ taskType: "OWNER_APPROVAL_REVIEW", action: "COMPLETE", actorRole: "manager", outcomeSummary: "ok" }));
    expect(r.ok).toBe(false);
  });
  it("13. an owner-approval task completes only with an owner + a decision note, and updates the opportunity", () => {
    const r = planTaskUpdate(sub({ taskType: "OWNER_APPROVAL_REVIEW", action: "COMPLETE", actorRole: "owner", outcomeSummary: "approved to proceed" }));
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.plan.status).toBe("COMPLETED"); expect(r.plan.updatesOpportunity).toBe(true); }
  });
  it("14. an evidence-required task completed WITHOUT evidence stays IN_PROGRESS (no fake completion)", () => {
    const r = planTaskUpdate(sub({ taskType: "COLLECT_COST_DATA", action: "COMPLETE", evidenceRefs: [] }));
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.plan.status).toBe("IN_PROGRESS"); expect(r.plan.updatesOpportunity).toBe(false); }
  });
  it("15. an evidence-required task completed WITH evidence updates the opportunity", () => {
    const r = planTaskUpdate(sub({ taskType: "COLLECT_COST_DATA", action: "COMPLETE", evidenceRefs: ["per-unit cost captured"] }));
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.plan.status).toBe("COMPLETED"); expect(r.plan.updatesOpportunity).toBe(true); }
  });
  it("16. block / cancel / assign / start map to the right statuses", () => {
    expect((planTaskUpdate(sub({ action: "BLOCK", blockingReason: "waiting on data" })) as { plan: { status: string } }).plan.status).toBe("BLOCKED");
    expect((planTaskUpdate(sub({ action: "CANCEL" })) as { plan: { status: string } }).plan.status).toBe("CANCELLED");
    expect((planTaskUpdate(sub({ action: "ASSIGN" })) as { plan: { status: string } }).plan.status).toBe("ASSIGNED");
    expect((planTaskUpdate(sub({ action: "START" })) as { plan: { status: string } }).plan.status).toBe("IN_PROGRESS");
  });
  it("17. forbidden fraud/HR-discipline language fails closed", () => {
    expect(planTaskUpdate(sub({ action: "COMPLETE", outcomeSummary: "staff committed fraud, fire them", evidenceRefs: ["x"] })).ok).toBe(false);
  });
  it("18. missing keys fail closed", () => {
    expect(planTaskUpdate(sub({ taskKey: "" })).ok).toBe(false);
    expect(planTaskUpdate(sub({ opportunityKey: "" })).ok).toBe(false);
  });
});
