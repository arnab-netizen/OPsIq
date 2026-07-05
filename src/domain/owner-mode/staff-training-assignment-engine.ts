/**
 * Staff Training Assignment Engine (depth pass).
 *
 * Converts process/correction findings into governed, evidence-backed staff/manager TRAINING REVIEW
 * assignments — coaching and review, never punishment. PURE + deterministic. It consumes the already-
 * derived `ProcessIntelligenceAnalysis` (findings), the `ProcessCorrectionRouting` (for the correction
 * target + key), and the `SopChecklistCorrectionAnalysis` (to brief the team on a checklist change), and
 * proposes the training/review each breakdown warrants.
 *
 * Governance stance (matches OpsIQ rules):
 * - Training is PROPOSED — never auto-assigned, never auto-completed. Owner/manager approval is explicit.
 * - Evidence-backed: every assignment carries the proof/event/escalation ids that triggered it.
 * - No HR punishment, no firing, no payroll/discipline action, no hidden staff score, no fraud/negligence.
 * - A cleared/dismissed false-positive is suppressed upstream (no finding), so it cannot create training;
 *   a confirmed / require-fresh finding may.
 */

import type {
  ProcessIntelligenceAnalysis,
  ProcessFindingType,
  ApprovalLevel,
} from "./process-intelligence";
import type { ProcessCorrectionRouting } from "./bottleneck-correction-routing";
import type { SopChecklistCorrectionAnalysis } from "./sop-checklist-correction-engine";

export type TrainingType =
  | "PROOF_QUALITY_REVIEW"
  | "PROCESS_STEP_RETRAINING"
  | "MANAGER_REVIEW_QUALITY"
  | "ESCALATION_RESPONSE_REVIEW"
  | "DELIVERY_HANDOFF_REVIEW"
  | "CHECKLIST_CHANGE_BRIEFING"
  | "DATA_COLLECTION_BRIEFING";

export type TrainingStatus = "PROPOSED" | "APPROVED" | "ASSIGNED" | "COMPLETED" | "DISMISSED" | "NEEDS_DATA";
export type AssignedByRole = "system-proposed" | "manager" | "owner";

/** The 18-field training assignment shape. */
export interface TrainingAssignment {
  workspaceId: string; // 1
  sourceProcessFindingKey: string; // 2
  sourceCorrectionKey: string | null; // 3
  trainingType: TrainingType; // 4
  assignedToUserId: string | null; // 5a
  assignedRole: string | null; // 5b
  assignedByRole: AssignedByRole; // 6
  approvalLevel: ApprovalLevel; // 7
  reason: string; // 8
  supportingProofIds: string[]; // 9
  supportingOperationalEventIds: string[]; // 10
  supportingEscalationIds: string[]; // 11
  relatedSopChecklistCorrectionKey: string | null; // 12
  successMetric: string; // 13
  reviewAfterDays: number; // 14
  status: TrainingStatus; // 15
  missingData: string[]; // 16
  ownerVisibleExplanation: string; // 17
  evaluatedAt: string; // 18
}

export interface TrainingAssignmentAnalysis {
  workspaceId: string;
  assignments: TrainingAssignment[];
  topAssignment: TrainingAssignment | null;
  evaluatedAt: string;
}

const SEVERITY_RANK = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 } as const;
const REVIEW_DEFAULT_DAYS = 14;

/** A training spec derived from a finding: which training, who, why, how success is measured. */
interface TrainingSpec {
  trainingType: TrainingType;
  assignTo: "actor" | "manager" | "role";
  role: string | null;
  approvalLevel: ApprovalLevel;
  successMetric: string;
  ownerVisibleExplanation: string;
  status: TrainingStatus;
}

/** Map a finding type to its primary training/review (coaching, not discipline). Null = no training. */
function trainingFor(findingType: ProcessFindingType): TrainingSpec | null {
  switch (findingType) {
    case "PROOF_QUALITY_BREAKDOWN":
      return { trainingType: "PROOF_QUALITY_REVIEW", assignTo: "actor", role: null, approvalLevel: "MANAGER",
        successMetric: "Weak/reused proof events for this operator fall over the review window",
        ownerVisibleExplanation: "Review the acceptable proof standard with this operator; the proof coming in cannot be trusted yet. This is coaching, not an accusation.", status: "PROPOSED" };
    case "STAFF_TRAINING_GAP":
      return { trainingType: "PROCESS_STEP_RETRAINING", assignTo: "actor", role: null, approvalLevel: "MANAGER",
        successMetric: "First-time proof pass rate for this operator improves over the review window",
        ownerVisibleExplanation: "Coach this operator on the step and pair them with a lead until proof passes first time.", status: "PROPOSED" };
    case "REWORK_LOOP":
    case "QUALITY_FAILURE_LOOP":
      return { trainingType: "PROCESS_STEP_RETRAINING", assignTo: "actor", role: null, approvalLevel: "MANAGER",
        successMetric: "Rework/quality-complaint events for this job type fall over the review window",
        ownerVisibleExplanation: "Retrain on the step that keeps failing so the same work stops being redone or complained about.", status: "PROPOSED" };
    case "MANAGER_REVIEW_GAP":
      return { trainingType: "MANAGER_REVIEW_QUALITY", assignTo: "manager", role: null, approvalLevel: "OWNER",
        successMetric: "Weak/suspicious proof accepted by this reviewer falls over the review window",
        ownerVisibleExplanation: "Review the acceptance standard with this reviewer; the review gate is passing work it should not.", status: "PROPOSED" };
    case "ESCALATION_RESPONSE_BREAKDOWN":
      return { trainingType: "ESCALATION_RESPONSE_REVIEW", assignTo: "manager", role: null, approvalLevel: "OWNER",
        successMetric: "Escalation acknowledgement time for this manager improves over the review window",
        ownerVisibleExplanation: "Review escalation handling with this manager; escalations are arriving but not being acknowledged in time.", status: "PROPOSED" };
    case "DELIVERY_HANDOFF_DELAY":
      return { trainingType: "DELIVERY_HANDOFF_REVIEW", assignTo: "role", role: "delivery", approvalLevel: "MANAGER",
        successMetric: "Overdue delivery/hand-off events fall over the review window",
        ownerVisibleExplanation: "Brief the counter/delivery team on the same-day hand-off cutoff so orders stop getting stuck.", status: "PROPOSED" };
    case "DATA_INSUFFICIENT":
      return { trainingType: "DATA_COLLECTION_BRIEFING", assignTo: "role", role: "staff", approvalLevel: "MANAGER",
        successMetric: "The missing operational data is captured on subsequent days",
        ownerVisibleExplanation: "Brief the team on capturing the missing operational data so Process Intelligence can establish where the process is breaking.", status: "NEEDS_DATA" };
    // REVIEW_BOTTLENECK / OWNER_APPROVAL_BOTTLENECK are capacity/process issues, not training.
    default:
      return null;
  }
}

/**
 * Build the proposed training assignments. Pure + deterministic. One assignment per training-relevant
 * finding (assigned to the real actor/manager id, or a role — never fabricated), plus a
 * CHECKLIST_CHANGE_BRIEFING per real checklist SOP draft. Every assignment is PROPOSED (or NEEDS_DATA).
 */
export function buildTrainingAssignments(
  analysis: ProcessIntelligenceAnalysis,
  routing: ProcessCorrectionRouting,
  sop: SopChecklistCorrectionAnalysis,
  workspaceId: string,
): TrainingAssignmentAnalysis {
  const at = analysis.evaluatedAt;
  const assignments: TrainingAssignment[] = [];

  // Correction target + key by finding type (first correction wins — it is the primary one).
  const correctionByFinding = new Map<ProcessFindingType, { key: string; actorId: string | null; managerId: string | null }>();
  for (const c of routing.corrections) {
    if (!correctionByFinding.has(c.sourceFindingType)) {
      correctionByFinding.set(c.sourceFindingType, { key: c.correctionId, actorId: c.targetActorId, managerId: c.targetManagerId });
    }
  }

  for (const f of analysis.findings) {
    const spec = trainingFor(f.findingType);
    if (!spec) continue;
    const corr = correctionByFinding.get(f.findingType) ?? null;
    const assignedToUserId = spec.assignTo === "actor" ? (f.affectedActorId ?? corr?.actorId ?? null)
      : spec.assignTo === "manager" ? (f.affectedManagerId ?? corr?.managerId ?? null)
      : null;
    const assignedRole = spec.assignTo === "role" ? spec.role : null;
    assignments.push({
      workspaceId,
      sourceProcessFindingKey: `${workspaceId}:${f.findingType}`,
      sourceCorrectionKey: corr?.key ?? null,
      trainingType: spec.trainingType,
      assignedToUserId,
      assignedRole,
      assignedByRole: "system-proposed",
      approvalLevel: spec.approvalLevel,
      reason: f.ownerExplanation,
      supportingProofIds: f.supportingProofIds,
      supportingOperationalEventIds: f.supportingOperationalEventIds,
      supportingEscalationIds: f.supportingEscalationIds,
      relatedSopChecklistCorrectionKey: null,
      successMetric: spec.successMetric,
      reviewAfterDays: spec.status === "NEEDS_DATA" ? 7 : REVIEW_DEFAULT_DAYS,
      status: spec.status,
      missingData: f.missingData,
      ownerVisibleExplanation: spec.ownerVisibleExplanation,
      evaluatedAt: at,
    });
  }

  // A CHECKLIST_CHANGE_BRIEFING per real checklist SOP draft — brief the team on the change so it sticks.
  const CHECKLIST_AREAS = new Set(["ACCEPTANCE_QUALITY_CHECKLIST", "PROOF_REQUIREMENT_CHECKLIST", "DELIVERY_HANDOFF_CHECKLIST", "REVIEW_PROCESS_STEP"]);
  for (const d of sop.drafts) {
    if (d.status === "NEEDS_DATA" || !CHECKLIST_AREAS.has(d.sopArea)) continue;
    assignments.push({
      workspaceId,
      sourceProcessFindingKey: d.sourceProcessFindingKey,
      sourceCorrectionKey: d.sourceCorrectionKey,
      trainingType: "CHECKLIST_CHANGE_BRIEFING",
      assignedToUserId: null,
      assignedRole: "staff",
      assignedByRole: "system-proposed",
      approvalLevel: d.approvalLevel,
      reason: d.reason,
      supportingProofIds: d.supportingProofIds,
      supportingOperationalEventIds: d.supportingOperationalEventIds,
      supportingEscalationIds: d.supportingEscalationIds,
      relatedSopChecklistCorrectionKey: d.sourceCorrectionKey,
      successMetric: "The team applies the updated checklist; the linked failure events fall over the review window",
      reviewAfterDays: REVIEW_DEFAULT_DAYS,
      status: "PROPOSED",
      missingData: [],
      ownerVisibleExplanation: `Brief the team on the checklist change: ${d.proposedChangeTitle}.`,
      evaluatedAt: at,
    });
  }

  // Order: most severe finding-driven training first (by the finding's severity), then checklist briefings.
  const sevByFinding = new Map<ProcessFindingType, number>();
  for (const f of analysis.findings) sevByFinding.set(f.findingType, SEVERITY_RANK[f.severity]);
  const findingTypeOf = (a: TrainingAssignment): ProcessFindingType =>
    a.sourceProcessFindingKey.slice(workspaceId.length + 1) as ProcessFindingType;
  assignments.sort((a, b) => {
    const aNeeds = a.status === "NEEDS_DATA" ? 1 : 0;
    const bNeeds = b.status === "NEEDS_DATA" ? 1 : 0;
    if (aNeeds !== bNeeds) return aNeeds - bNeeds;
    const aBrief = a.trainingType === "CHECKLIST_CHANGE_BRIEFING" ? 1 : 0;
    const bBrief = b.trainingType === "CHECKLIST_CHANGE_BRIEFING" ? 1 : 0;
    if (aBrief !== bBrief) return aBrief - bBrief;
    return (sevByFinding.get(findingTypeOf(a)) ?? 9) - (sevByFinding.get(findingTypeOf(b)) ?? 9);
  });

  return { workspaceId, assignments, topAssignment: assignments[0] ?? null, evaluatedAt: at };
}
