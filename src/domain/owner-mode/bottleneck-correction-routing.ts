/**
 * Bottleneck → Correction Routing (depth pass).
 *
 * Turns Process Intelligence findings ("WHERE is the process breaking?") into concrete, trackable
 * CORRECTION ACTIONS ("what to do about it, who must approve it"). PURE + deterministic: it consumes the
 * already-derived `ProcessIntelligenceAnalysis` (which is itself adjudication-suppressed — a cleared
 * proof-risk finding cannot drive a correction) and emits a proposed correction per routing rule, each
 * carrying its evidence, its target (only real actor/manager ids from the finding — never fabricated),
 * its required approval level, and whether owner approval is mandatory.
 *
 * Governance stance (matches OpsIQ rules):
 * - Every correction is PROPOSED, never auto-approved. Only the no-op NO_ACTION_DATA_INSUFFICIENT is
 *   `autoExecutable` (there is nothing to execute); every real correction requires a human.
 * - Approval level is the STRONGER of the finding's required approval and the correction type's floor —
 *   it can only ever escalate, never weaken, the owner/manager gate.
 * - No fabricated assignments: targetActorId / targetManagerId are copied from the finding or left null.
 * - No fraud/negligence labels, no hidden staff score — corrections are process fixes and coaching.
 */

import type {
  ProcessIntelligenceAnalysis,
  ProcessFinding,
  ProcessFindingType,
  ProcessStage,
  ProcessSeverity,
  ProcessConfidence,
  ExpectedImpactType,
  ApprovalLevel,
} from "./process-intelligence";

/** The nine governed correction types this router can emit. */
export type CorrectionType =
  | "REQUIRE_FRESH_PROOF"
  | "UPDATE_CHECKLIST"
  | "REVIEW_PROCESS_STEP"
  | "ASSIGN_TRAINING_REVIEW"
  | "ESCALATE_TO_MANAGER"
  | "ESCALATE_TO_OWNER"
  | "RESOLVE_OPERATIONAL_EVENT"
  | "COLLECT_MISSING_DATA"
  | "NO_ACTION_DATA_INSUFFICIENT";

/** A correction is always proposed by the router; a human moves it forward. */
export type CorrectionStatus = "PROPOSED";

/** The 22-field correction shape. Flat + serialisable so the UI and tests read it directly. */
export interface ProcessCorrection {
  workspaceId: string; // 1 — isolation
  correctionId: string; // 2 — deterministic, stable across evaluations (trackable)
  sourceFindingType: ProcessFindingType; // 3 — which breakdown produced it
  correctionType: CorrectionType; // 4 — one of the nine
  title: string; // 5 — short owner-facing label
  instruction: string; // 6 — the concrete action to take
  rationale: string; // 7 — why (from the finding's owner explanation)
  affectedStage: ProcessStage; // 8 — the stage being corrected
  targetActorId: string | null; // 9 — real operator id or null (never fabricated)
  targetManagerId: string | null; // 10 — real manager id or null (never fabricated)
  severity: ProcessSeverity; // 11 — inherited from the finding
  confidence: ProcessConfidence; // 12 — inherited from the finding
  priorityRank: number; // 13 — 1 = act on this first
  requiredApprovalLevel: ApprovalLevel; // 14 — stronger of finding + correction floor
  requiresOwnerApproval: boolean; // 15 — true iff approval is OWNER
  autoExecutable: boolean; // 16 — only the no-op is auto; real corrections need a human
  expectedImpactType: ExpectedImpactType; // 17 — inherited from the finding
  supportingProofIds: string[]; // 18 — evidence
  supportingOperationalEventIds: string[]; // 19 — evidence
  supportingEscalationIds: string[]; // 20 — evidence
  supportingAdjudicationIds: string[]; // 21 — governed adjudication trace
  missingData: string[]; // 22 — what is still needed (drives COLLECT_MISSING_DATA)
  status: CorrectionStatus; // (lifecycle) always PROPOSED — never auto-approved
}

export interface ProcessCorrectionRouting {
  workspaceId: string;
  corrections: ProcessCorrection[];
  topCorrection: ProcessCorrection | null;
  evaluatedAt: string;
}

const SEVERITY_RANK: Record<ProcessSeverity, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
const APPROVAL_STRENGTH: Record<ApprovalLevel, number> = { OWNER: 2, MANAGER: 1, STAFF: 0 };
const APPROVAL_BY_STRENGTH: ApprovalLevel[] = ["STAFF", "MANAGER", "OWNER"];

/** The approval floor each correction type may not drop below. It can only escalate the finding's gate. */
const CORRECTION_APPROVAL_FLOOR: Record<CorrectionType, ApprovalLevel> = {
  REQUIRE_FRESH_PROOF: "MANAGER",
  UPDATE_CHECKLIST: "MANAGER",
  REVIEW_PROCESS_STEP: "MANAGER",
  ASSIGN_TRAINING_REVIEW: "MANAGER",
  ESCALATE_TO_MANAGER: "MANAGER",
  ESCALATE_TO_OWNER: "OWNER",
  RESOLVE_OPERATIONAL_EVENT: "MANAGER",
  COLLECT_MISSING_DATA: "STAFF",
  NO_ACTION_DATA_INSUFFICIENT: "STAFF",
};

/** A routing spec: one correction the finding should produce, plus a guard for optional secondaries. */
interface CorrectionSpec {
  correctionType: CorrectionType;
  title: string;
  instruction: string;
  when?: (f: ProcessFinding) => boolean;
}

const hasEvents = (f: ProcessFinding): boolean => f.supportingOperationalEventIds.length > 0;
const hasActor = (f: ProcessFinding): boolean => f.affectedActorId !== null;
const hasManager = (f: ProcessFinding): boolean => f.affectedManagerId !== null;

/**
 * Routing rules — each finding type maps to an ordered list of correction specs (primary first). Optional
 * secondaries carry a `when` guard so we never emit an event-resolution with no events, or a person-
 * targeted coaching action with no person.
 */
function routeFor(findingType: ProcessFindingType, f: ProcessFinding): CorrectionSpec[] {
  switch (findingType) {
    case "REWORK_LOOP":
      return [
        { correctionType: "REVIEW_PROCESS_STEP", title: "Review the failing work step",
          instruction: "Review the wash/press step that keeps failing and fix the root cause before re-accepting work." },
        { correctionType: "REQUIRE_FRESH_PROOF", title: "Require a fresh proof before re-accepting",
          instruction: "Require a fresh, checked proof for this job before it is re-accepted." },
        { correctionType: "RESOLVE_OPERATIONAL_EVENT", title: "Clear the open rework events",
          instruction: "Close the open rework events once the step is corrected.", when: hasEvents },
      ];
    case "QUALITY_FAILURE_LOOP":
      return [
        { correctionType: "UPDATE_CHECKLIST", title: "Tighten the acceptance checklist",
          instruction: "Tighten the acceptance checklist for this job type so the quality gate stops passing sub-standard work." },
        { correctionType: "ESCALATE_TO_OWNER", title: "Owner review of recent approvals",
          instruction: "Owner reviews the reviewer's recent approvals before the next batch." },
        { correctionType: "RESOLVE_OPERATIONAL_EVENT", title: "Close the linked complaint events",
          instruction: "Close the linked complaint events after the work is remediated.", when: hasEvents },
      ];
    case "DELIVERY_HANDOFF_DELAY":
      return [
        { correctionType: "RESOLVE_OPERATIONAL_EVENT", title: "Clear the overdue delivery events",
          instruction: "Clear the overdue delivery/collection events today.", when: hasEvents },
        { correctionType: "REVIEW_PROCESS_STEP", title: "Set a same-day hand-off cutoff",
          instruction: "Set a same-day hand-off cutoff between the counter and the delivery run." },
      ];
    case "REVIEW_BOTTLENECK":
      return [
        { correctionType: "REVIEW_PROCESS_STEP", title: "Clear the proof-review queue",
          instruction: "Clear the overdue proof-review queue and add a second reviewer or a same-day review cutoff for peak hours." },
      ];
    case "OWNER_APPROVAL_BOTTLENECK":
      return [
        { correctionType: "ESCALATE_TO_OWNER", title: "Delegate low-risk reviews",
          instruction: "Decide which low-risk proof reviews to delegate to a trusted manager so the owner stops being the bottleneck." },
        { correctionType: "REVIEW_PROCESS_STEP", title: "Fix the top review-load operator",
          instruction: "Fix the one operator generating the most review load.", when: hasActor },
      ];
    case "PROOF_QUALITY_BREAKDOWN":
      return [
        { correctionType: "REQUIRE_FRESH_PROOF", title: "Require fresh per-task proof",
          instruction: "Require a fresh, job-specific proof per task from this operator before assigning new work." },
        { correctionType: "ASSIGN_TRAINING_REVIEW", title: "Coach on the proof standard",
          instruction: "Coach the operator on the acceptable proof standard.", when: hasActor },
      ];
    case "ESCALATION_RESPONSE_BREAKDOWN":
      return [
        { correctionType: "ESCALATE_TO_OWNER", title: "Reassign the overdue escalations",
          instruction: "Reassign the overdue escalations now and set a hard acknowledgement deadline." },
        { correctionType: "ESCALATE_TO_MANAGER", title: "Review escalation handling with the manager",
          instruction: "Review escalation handling with the manager and confirm the new acknowledgement deadline.", when: hasManager },
      ];
    case "STAFF_TRAINING_GAP":
      return [
        { correctionType: "ASSIGN_TRAINING_REVIEW", title: "Pair the operator with a lead",
          instruction: "Show the operator exactly what an acceptable proof looks like and pair them with a lead until proof passes first time." },
      ];
    case "MANAGER_REVIEW_GAP":
      return [
        { correctionType: "REVIEW_PROCESS_STEP", title: "Spot-audit the reviewer's approvals",
          instruction: "Spot-audit this reviewer's recent approvals and require a written reason per acceptance." },
        { correctionType: "ESCALATE_TO_OWNER", title: "Owner sign-off on a second review",
          instruction: "Owner signs off on adding a second review for high-risk jobs." },
      ];
    case "DATA_INSUFFICIENT":
      return f.missingData.length > 0
        ? [{ correctionType: "COLLECT_MISSING_DATA", title: "Record the missing inputs",
            instruction: `Record the missing inputs: ${f.missingData.join("; ")}. Process Intelligence sharpens as the chain fills in.` }]
        : [{ correctionType: "NO_ACTION_DATA_INSUFFICIENT", title: "No corrective action yet",
            instruction: "No corrective action — there is not enough linked evidence to act on yet." }];
    default:
      return [];
  }
}

/** Stronger of the finding's required approval and the correction type's floor. Never weakens the gate. */
function resolveApproval(findingApproval: ApprovalLevel, correctionType: CorrectionType): ApprovalLevel {
  const strength = Math.max(APPROVAL_STRENGTH[findingApproval], APPROVAL_STRENGTH[CORRECTION_APPROVAL_FLOOR[correctionType]]);
  return APPROVAL_BY_STRENGTH[strength];
}

/**
 * Build the proposed corrections for a Process Intelligence analysis. Pure + deterministic. Every
 * correction is PROPOSED (never auto-approved); only the DATA_INSUFFICIENT no-op is auto-executable.
 */
export function buildProcessCorrections(
  analysis: ProcessIntelligenceAnalysis,
  workspaceId: string,
): ProcessCorrectionRouting {
  const at = analysis.evaluatedAt;
  const corrections: ProcessCorrection[] = [];

  for (const finding of analysis.findings) {
    const specs = routeFor(finding.findingType, finding);
    for (const spec of specs) {
      if (spec.when && !spec.when(finding)) continue;
      const requiredApprovalLevel = resolveApproval(finding.requiredApprovalLevel, spec.correctionType);
      const target = finding.affectedActorId ?? finding.affectedManagerId ?? finding.affectedStage;
      corrections.push({
        workspaceId,
        correctionId: `${workspaceId}:${finding.findingType}:${spec.correctionType}:${target}`,
        sourceFindingType: finding.findingType,
        correctionType: spec.correctionType,
        title: spec.title,
        instruction: spec.instruction,
        rationale: finding.ownerExplanation,
        affectedStage: finding.affectedStage,
        targetActorId: finding.affectedActorId,
        targetManagerId: finding.affectedManagerId,
        severity: finding.severity,
        confidence: finding.confidence,
        priorityRank: 0, // assigned after the full set is ordered
        requiredApprovalLevel,
        requiresOwnerApproval: requiredApprovalLevel === "OWNER",
        autoExecutable: spec.correctionType === "NO_ACTION_DATA_INSUFFICIENT",
        expectedImpactType: finding.expectedImpactType,
        supportingProofIds: finding.supportingProofIds,
        supportingOperationalEventIds: finding.supportingOperationalEventIds,
        supportingEscalationIds: finding.supportingEscalationIds,
        supportingAdjudicationIds: finding.supportingAdjudicationIds,
        missingData: finding.missingData,
        status: "PROPOSED",
      });
    }
  }

  // Order: most severe first; within a severity, owner-gated corrections rank above manager/staff so the
  // owner sees what needs their sign-off first. DATA_INSUFFICIENT (LOW) always sorts last. Stable for ties.
  corrections.sort((a, b) => {
    if (a.sourceFindingType === "DATA_INSUFFICIENT" && b.sourceFindingType !== "DATA_INSUFFICIENT") return 1;
    if (b.sourceFindingType === "DATA_INSUFFICIENT" && a.sourceFindingType !== "DATA_INSUFFICIENT") return -1;
    const sev = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    if (sev !== 0) return sev;
    return APPROVAL_STRENGTH[b.requiredApprovalLevel] - APPROVAL_STRENGTH[a.requiredApprovalLevel];
  });
  corrections.forEach((c, i) => { c.priorityRank = i + 1; });

  return { workspaceId, corrections, topCorrection: corrections[0] ?? null, evaluatedAt: at };
}
