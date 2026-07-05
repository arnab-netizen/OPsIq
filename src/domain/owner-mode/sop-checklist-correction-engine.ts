/**
 * SOP / Checklist Correction Engine (depth pass).
 *
 * Turns routed process CORRECTIONS (Bottleneck → Correction Routing) into governed DRAFT SOP/checklist
 * changes that reduce repeated operational failures. PURE + deterministic. It consumes the already-
 * derived `ProcessIntelligenceAnalysis` (for finding context: profit leak / constraint / SLO / evidence)
 * and the `ProcessCorrectionRouting` (the proposed corrections), and for correction types that imply a
 * checklist/SOP change it emits a draft that answers: what step changes, why, what evidence triggered it,
 * which checklist/SOP area, what proof requirement changes, who approves, what success metric proves it
 * worked, and when to review.
 *
 * Governance stance (matches OpsIQ rules):
 * - Every draft is DRAFT / PROPOSED / NEEDS_DATA — never auto-APPROVED and never auto-applied.
 * - Approval is inherited from the correction (owner/manager) and never weakened.
 * - Training is NOT built here: ASSIGN_TRAINING_REVIEW yields a lightweight handoff placeholder for the
 *   staff-training pass, not a training assignment.
 * - No staff policy change, no HR/discipline action, no long SOP documents, no fabricated evidence.
 * - No fraud/negligence labels, no hidden staff score.
 */

import type {
  ProcessIntelligenceAnalysis,
  ProcessFinding,
  ProcessFindingType,
  ProcessStage,
  ApprovalLevel,
} from "./process-intelligence";
import type { ProcessCorrectionRouting, CorrectionType } from "./bottleneck-correction-routing";

export type SopDraftStatus = "DRAFT" | "PROPOSED" | "APPROVED" | "REJECTED" | "NEEDS_DATA";

/** The SOP/checklist area a draft touches (business-operational, not org policy). */
export type SopArea =
  | "PRESSING_WASH_CHECKLIST"
  | "ACCEPTANCE_QUALITY_CHECKLIST"
  | "PROOF_REQUIREMENT_CHECKLIST"
  | "DELIVERY_HANDOFF_CHECKLIST"
  | "REVIEW_PROCESS_STEP"
  | "DATA_CAPTURE_CHECKLIST"
  | "TRAINING_HANDOFF"
  | "NONE";

/** The 22-field SOP/checklist correction draft shape. */
export interface SopChecklistCorrection {
  workspaceId: string; // 1
  sourceProcessFindingKey: string; // 2a
  sourceCorrectionKey: string; // 2b
  correctionType: CorrectionType; // 3
  affectedStage: ProcessStage; // 4
  sopArea: SopArea; // 5
  proposedChangeTitle: string; // 6
  proposedChangeBody: string; // 7
  reason: string; // 8
  supportingProofIds: string[]; // 9
  supportingOperationalEventIds: string[]; // 10
  supportingEscalationIds: string[]; // 11
  relatedProfitLeak: string | null; // 12
  relatedConstraint: string | null; // 13
  relatedSLO: string | null; // 14
  approvalLevel: ApprovalLevel; // 15
  ownerApprovalRequired: boolean; // 16
  managerApprovalRequired: boolean; // 17
  successMetric: string; // 18
  reviewAfterDays: number; // 19
  status: SopDraftStatus; // 20
  missingData: string[]; // 21
  evaluatedAt: string; // 22
}

export interface SopChecklistCorrectionAnalysis {
  workspaceId: string;
  drafts: SopChecklistCorrection[];
  topDraft: SopChecklistCorrection | null;
  evaluatedAt: string;
}

/** Correction types that imply a checklist/SOP change (or a governed non-SOP outcome). */
interface DraftSpec {
  sopArea: SopArea;
  title: (f: ProcessFinding | null) => string;
  body: (f: ProcessFinding | null) => string;
  successMetric: string;
  reviewAfterDays: number;
  status: SopDraftStatus;
}

const REVIEW_DEFAULT_DAYS = 14;

/** Map a correction type to how it becomes an SOP/checklist draft (or a governed non-draft outcome). */
function specFor(correctionType: CorrectionType, stage: ProcessStage): DraftSpec | null {
  switch (correctionType) {
    case "UPDATE_CHECKLIST":
      return {
        sopArea: stage === "DELIVERY" ? "DELIVERY_HANDOFF_CHECKLIST" : "ACCEPTANCE_QUALITY_CHECKLIST",
        title: () => "Tighten the acceptance/quality checklist for this job type",
        body: () => "Add the specific check that keeps being missed to the acceptance checklist so the quality gate stops passing sub-standard work. Keep it to one or two concrete, checkable line items.",
        successMetric: "Quality complaint / rework events for this job type fall over the review window",
        reviewAfterDays: REVIEW_DEFAULT_DAYS,
        status: "DRAFT",
      };
    case "REVIEW_PROCESS_STEP":
      return {
        sopArea: stage === "DELIVERY" ? "DELIVERY_HANDOFF_CHECKLIST" : "REVIEW_PROCESS_STEP",
        title: () => "Review and adjust the failing process step",
        body: () => "Walk the step that keeps failing, identify the root cause, and document the corrected step (cutoff time, second check, or added sign-off) as a checklist line before re-accepting work.",
        successMetric: "Repeat failures at this stage fall over the review window",
        reviewAfterDays: REVIEW_DEFAULT_DAYS,
        status: "DRAFT",
      };
    case "REQUIRE_FRESH_PROOF":
      return {
        sopArea: "PROOF_REQUIREMENT_CHECKLIST",
        title: () => "Add a fresh, job-specific proof requirement",
        body: () => "Require a fresh photo/proof captured for this task (not reused) before the job is accepted. Add it as a mandatory checklist item at proof submission.",
        successMetric: "Weak/reused proof and re-accept-after-rework events fall over the review window",
        reviewAfterDays: REVIEW_DEFAULT_DAYS,
        status: "DRAFT",
      };
    case "COLLECT_MISSING_DATA":
      return {
        sopArea: "DATA_CAPTURE_CHECKLIST",
        title: () => "Add the missing operational data to routine capture",
        body: () => "Add the missing inputs to the daily capture checklist so Process Intelligence can establish where the process is breaking.",
        successMetric: "The missing data points are captured on subsequent days",
        reviewAfterDays: 7,
        status: "NEEDS_DATA",
      };
    case "ASSIGN_TRAINING_REVIEW":
      // Handoff placeholder only — the training assignment engine is a separate pass.
      return {
        sopArea: "TRAINING_HANDOFF",
        title: () => "Training/coaching handoff (routed to the training pass)",
        body: () => "This correction needs staff coaching, not a checklist change. It is handed off to the training review pass; no SOP document is generated here.",
        successMetric: "Handled by the staff training assignment pass",
        reviewAfterDays: REVIEW_DEFAULT_DAYS,
        status: "PROPOSED",
      };
    case "NO_ACTION_DATA_INSUFFICIENT":
      return {
        sopArea: "NONE",
        title: () => "No SOP change — insufficient data",
        body: () => "There is not enough linked evidence to justify a checklist/SOP change yet. Keep recording proofs, reviews, escalations, and complaint/rework events.",
        successMetric: "Enough linked evidence accrues to establish a process breakdown",
        reviewAfterDays: 7,
        status: "NEEDS_DATA",
      };
    // ESCALATE_TO_MANAGER / ESCALATE_TO_OWNER / RESOLVE_OPERATIONAL_EVENT are not SOP/checklist changes.
    default:
      return null;
  }
}

/**
 * Build the draft SOP/checklist corrections for an analysis + its routed corrections. Pure +
 * deterministic. One draft per applicable correction; approval + evidence inherited from the correction
 * and its source finding. Never APPROVED, never auto-applied.
 */
export function buildSopChecklistCorrections(
  analysis: ProcessIntelligenceAnalysis,
  routing: ProcessCorrectionRouting,
  workspaceId: string,
): SopChecklistCorrectionAnalysis {
  const at = analysis.evaluatedAt;
  const findingByType = new Map<ProcessFindingType, ProcessFinding>();
  for (const f of analysis.findings) if (!findingByType.has(f.findingType)) findingByType.set(f.findingType, f);

  const drafts: SopChecklistCorrection[] = [];
  for (const c of routing.corrections) {
    const spec = specFor(c.correctionType, c.affectedStage);
    if (!spec) continue;
    const f = findingByType.get(c.sourceFindingType) ?? null;
    drafts.push({
      workspaceId,
      sourceProcessFindingKey: `${workspaceId}:${c.sourceFindingType}`,
      sourceCorrectionKey: c.correctionId,
      correctionType: c.correctionType,
      affectedStage: c.affectedStage,
      sopArea: spec.sopArea,
      proposedChangeTitle: spec.title(f),
      proposedChangeBody: spec.body(f),
      reason: c.rationale,
      supportingProofIds: c.supportingProofIds,
      supportingOperationalEventIds: c.supportingOperationalEventIds,
      supportingEscalationIds: c.supportingEscalationIds,
      relatedProfitLeak: f?.relatedProfitLeak ?? null,
      relatedConstraint: f?.relatedConstraint ?? null,
      relatedSLO: f?.relatedSLO ?? null,
      approvalLevel: c.requiredApprovalLevel,
      ownerApprovalRequired: c.requiredApprovalLevel === "OWNER",
      managerApprovalRequired: c.requiredApprovalLevel === "OWNER" || c.requiredApprovalLevel === "MANAGER",
      successMetric: spec.successMetric,
      reviewAfterDays: spec.reviewAfterDays,
      status: spec.status,
      missingData: c.missingData,
      evaluatedAt: at,
    });
  }

  // Preserve the correction ordering (priorityRank) but keep NEEDS_DATA drafts last so real SOP changes
  // surface first. Stable within each group.
  const rank = new Map(routing.corrections.map((c, i) => [c.correctionId, i]));
  drafts.sort((a, b) => {
    const an = a.status === "NEEDS_DATA" ? 1 : 0;
    const bn = b.status === "NEEDS_DATA" ? 1 : 0;
    if (an !== bn) return an - bn;
    return (rank.get(a.sourceCorrectionKey) ?? 0) - (rank.get(b.sourceCorrectionKey) ?? 0);
  });

  return { workspaceId, drafts, topDraft: drafts[0] ?? null, evaluatedAt: at };
}
