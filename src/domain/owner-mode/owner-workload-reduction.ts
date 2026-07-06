/**
 * Owner Workload Reduction v2 (depth pass).
 *
 * Identifies avoidable owner burden and recommends how to reduce it — delegate, convert to policy, collapse
 * duplicates, require better proof upfront, update a checklist, collect missing data, or assign training —
 * WITHOUT ever weakening owner control of a material (money / staff / legal / reputation) decision. PURE +
 * deterministic. It consumes the already-derived process findings + corrections + training, plus a few
 * scalar burden signals the caller counted (never guessed), and surfaces the top avoidable owner burden.
 *
 * Governance stance (matches OpsIQ rules):
 * - High-risk decisions stay owner-controlled: a workload item touching a high-risk correction recommends
 *   KEEP_OWNER_APPROVAL, never automation.
 * - Owner touches / burden counts are only reported when directly counted — never a guessed time saving.
 * - Every finding carries a risk guardrail explaining what remains owner-controlled and why.
 * - No fraud/negligence/firing/payroll/discipline language; no hidden staff score.
 */

import type { ApprovalLevel } from "./process-intelligence";

export type WorkloadType =
  | "REPEATED_OWNER_ADJUDICATION"
  | "OWNER_REVIEW_BURDEN"
  | "OWNER_APPROVAL_BOTTLENECK"
  | "LOW_RISK_OWNER_INTERRUPT"
  | "RECURRING_COMPLAINT_ESCALATION"
  | "MANAGER_ESCALATION_OVERUSE"
  | "MISSING_DATA_BURDEN"
  | "CORRECTION_APPROVAL_BACKLOG"
  | "TRAINING_DELEGATION_OPPORTUNITY";

export type ReductionAction =
  | "DELEGATE_TO_MANAGER"
  | "CONVERT_TO_POLICY"
  | "AUTO_COLLAPSE_DUPLICATES"
  | "REQUIRE_BETTER_PROOF_UPFRONT"
  | "ASSIGN_TRAINING"
  | "UPDATE_CHECKLIST"
  | "COLLECT_MISSING_DATA"
  | "KEEP_OWNER_APPROVAL";

export type WorkloadSeverity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
export type WorkloadConfidence = "HIGH" | "MEDIUM" | "LOW" | "NEEDS_DATA";

/** A finding's evidence, keyed by finding type (from Process Intelligence). */
export interface WorkloadFindingEvidence {
  findingType: string;
  supportingProofIds: string[];
  supportingOperationalEventIds: string[];
  supportingEscalationIds: string[];
  relatedSLO: string | null;
}

/** An owner-approval correction, with whether it is a high-risk (money/staff/legal/reputation) decision. */
export interface WorkloadOwnerCorrection {
  key: string;
  highRisk: boolean;
  supportingProofIds: string[];
}

/** The scalar burden signals + derived evidence the caller provides (all directly counted, never guessed). */
export interface WorkloadSignals {
  adjudicationTotal: number;
  adjudicationIds: string[];
  weakProofCount: number;
  overdueReviewCount: number;
  ownerBottleneckItems: number;
  findings: WorkloadFindingEvidence[];
  ownerApprovalCorrections: WorkloadOwnerCorrection[];
  managerTrainingKeys: string[];
  missingData: string[];
}

/** The workload finding shape. */
export interface OwnerWorkloadFinding {
  workspaceId: string;
  workloadType: WorkloadType;
  severity: WorkloadSeverity;
  confidence: WorkloadConfidence;
  burdenCount: number;
  /** Only set when it maps to a directly-counted owner touch — never a guess. */
  estimatedOwnerTouches: number | null;
  supportingProofIds: string[];
  supportingAdjudicationIds: string[];
  supportingOperationalEventIds: string[];
  supportingEscalationIds: string[];
  supportingCorrectionKeys: string[];
  supportingTrainingKeys: string[];
  relatedProcessFinding: string | null;
  relatedSLO: string | null;
  ownerVisibleExplanation: string;
  recommendedReductionAction: ReductionAction;
  approvalLevel: ApprovalLevel;
  riskGuardrail: string;
  missingData: string[];
  evaluatedAt: string;
}

export interface OwnerWorkloadReductionAnalysis {
  workspaceId: string;
  findings: OwnerWorkloadFinding[];
  topFinding: OwnerWorkloadFinding | null;
  evaluatedAt: string;
}

const SEVERITY_RANK: Record<WorkloadSeverity, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
const HIGH_RISK_GUARDRAIL =
  "High-risk decisions (money, staff, legal, reputation) stay with the owner; only routine, low-risk repeats are delegated or policy-routed.";
const SAFE_GUARDRAIL =
  "This is a low-risk, repeating interruption — safe to delegate or route to policy; anything material still returns to the owner.";

const ADJUDICATION_THRESHOLD = 3;
const WEAK_PROOF_THRESHOLD = 3;
const OWNER_BOTTLENECK_THRESHOLD = 3;
const BACKLOG_THRESHOLD = 2;
const LOW_RISK_INTERRUPT_THRESHOLD = 2;

/**
 * Build the owner-workload-reduction findings. Pure + deterministic. High-risk correction backlogs keep
 * owner approval; low-risk repeats are delegated/policy-routed. Most severe first.
 */
export function buildOwnerWorkloadReduction(
  signals: WorkloadSignals,
  workspaceId: string,
  evaluatedAt: string,
): OwnerWorkloadReductionAnalysis {
  const out: OwnerWorkloadFinding[] = [];
  const has = (t: string): WorkloadFindingEvidence | undefined => signals.findings.find((f) => f.findingType === t);
  const push = (f: Omit<OwnerWorkloadFinding, "workspaceId" | "evaluatedAt">): void => {
    out.push({ ...f, workspaceId, evaluatedAt });
  };
  const ev = (t: string) => {
    const f = has(t);
    return {
      supportingProofIds: f?.supportingProofIds ?? [],
      supportingOperationalEventIds: f?.supportingOperationalEventIds ?? [],
      supportingEscalationIds: f?.supportingEscalationIds ?? [],
      relatedSLO: f?.relatedSLO ?? null,
    };
  };
  const empty = { supportingProofIds: [] as string[], supportingAdjudicationIds: [] as string[], supportingOperationalEventIds: [] as string[], supportingEscalationIds: [] as string[], supportingCorrectionKeys: [] as string[], supportingTrainingKeys: [] as string[] };

  // Empty-workspace guard. When Process Intelligence found no real breakdown it emits a single
  // DATA_INSUFFICIENT sentinel; downstream that sentinel still produces a DATA_COLLECTION_BRIEFING
  // (manager training) and a data-collection correction carrying missingData. Those are NOT avoidable
  // owner burden — they are the "nothing to analyse yet" state. If the only process context is that
  // sentinel and nothing was directly counted (no adjudications, weak proof, bottleneck, or owner-approval
  // correction), there is no workload to reduce: fabricate nothing rather than invent burden.
  const sentinelOnly =
    signals.findings.length > 0 && signals.findings.every((f) => f.findingType === "DATA_INSUFFICIENT");
  const hasCountedBurden =
    signals.adjudicationTotal > 0 ||
    signals.weakProofCount > 0 ||
    signals.ownerBottleneckItems > 0 ||
    signals.ownerApprovalCorrections.length > 0;
  if (sentinelOnly && !hasCountedBurden) {
    return { workspaceId, findings: [], topFinding: null, evaluatedAt };
  }

  // 1. REPEATED_OWNER_ADJUDICATION — the owner has adjudicated the same proof risk many times.
  if (signals.adjudicationTotal >= ADJUDICATION_THRESHOLD) {
    push({
      ...empty, workloadType: "REPEATED_OWNER_ADJUDICATION", severity: signals.adjudicationTotal >= 6 ? "HIGH" : "MEDIUM", confidence: "HIGH",
      burdenCount: signals.adjudicationTotal, estimatedOwnerTouches: signals.adjudicationTotal,
      supportingAdjudicationIds: signals.adjudicationIds, relatedProcessFinding: "PROOF_QUALITY_BREAKDOWN", relatedSLO: "ANTI_GAMING_RISK",
      ownerVisibleExplanation: "You keep adjudicating the same kind of weak-proof risk. Fixing the proof requirement upstream stops it reaching you.",
      recommendedReductionAction: "REQUIRE_BETTER_PROOF_UPFRONT", approvalLevel: "MANAGER", riskGuardrail: SAFE_GUARDRAIL, missingData: [],
    });
  }

  // 2. OWNER_REVIEW_BURDEN — weak proof keeps landing on the owner's review queue.
  const pqb = ev("PROOF_QUALITY_BREAKDOWN");
  if (signals.weakProofCount >= WEAK_PROOF_THRESHOLD || has("PROOF_QUALITY_BREAKDOWN")) {
    push({
      ...empty, workloadType: "OWNER_REVIEW_BURDEN", severity: signals.weakProofCount >= 6 ? "HIGH" : "MEDIUM", confidence: "HIGH",
      burdenCount: signals.weakProofCount, estimatedOwnerTouches: signals.weakProofCount || null,
      supportingProofIds: pqb.supportingProofIds, relatedProcessFinding: "PROOF_QUALITY_BREAKDOWN", relatedSLO: pqb.relatedSLO ?? "PROOF_OUTCOME_INTEGRITY",
      ownerVisibleExplanation: "Weak proof keeps reaching your review queue. Requiring a fresh, job-specific proof upfront removes the repeat review.",
      recommendedReductionAction: "REQUIRE_BETTER_PROOF_UPFRONT", approvalLevel: "MANAGER", riskGuardrail: SAFE_GUARDRAIL, missingData: [],
    });
  }

  // 3. OWNER_APPROVAL_BOTTLENECK — too much waits on the owner to approve.
  if (has("OWNER_APPROVAL_BOTTLENECK") || signals.ownerBottleneckItems >= OWNER_BOTTLENECK_THRESHOLD) {
    const b = ev("OWNER_APPROVAL_BOTTLENECK");
    push({
      ...empty, workloadType: "OWNER_APPROVAL_BOTTLENECK", severity: signals.ownerBottleneckItems >= 8 ? "HIGH" : "MEDIUM", confidence: "MEDIUM",
      burdenCount: signals.ownerBottleneckItems, estimatedOwnerTouches: signals.ownerBottleneckItems || null,
      supportingProofIds: b.supportingProofIds, relatedProcessFinding: "OWNER_APPROVAL_BOTTLENECK", relatedSLO: "OWNER_WORKLOAD_BURDEN",
      ownerVisibleExplanation: "You have become the bottleneck. Delegating low-risk review to a trusted manager clears the queue while you keep the material calls.",
      recommendedReductionAction: "DELEGATE_TO_MANAGER", approvalLevel: "OWNER", riskGuardrail: HIGH_RISK_GUARDRAIL, missingData: [],
    });
  }

  // 4. CORRECTION_APPROVAL_BACKLOG — many corrections wait on owner approval; high-risk stays with the owner.
  const ownerCorrections = signals.ownerApprovalCorrections;
  if (ownerCorrections.length >= BACKLOG_THRESHOLD) {
    const anyHighRisk = ownerCorrections.some((c) => c.highRisk);
    push({
      ...empty, workloadType: "CORRECTION_APPROVAL_BACKLOG", severity: anyHighRisk ? "HIGH" : "MEDIUM", confidence: "HIGH",
      burdenCount: ownerCorrections.length, estimatedOwnerTouches: ownerCorrections.length,
      supportingCorrectionKeys: ownerCorrections.map((c) => c.key), supportingProofIds: ownerCorrections.flatMap((c) => c.supportingProofIds),
      relatedProcessFinding: null, relatedSLO: "OWNER_WORKLOAD_BURDEN",
      ownerVisibleExplanation: anyHighRisk
        ? "Several corrections await your approval. The high-risk ones stay with you; the routine ones can be delegated."
        : "Several routine corrections await your approval and can be delegated to a manager.",
      recommendedReductionAction: anyHighRisk ? "KEEP_OWNER_APPROVAL" : "DELEGATE_TO_MANAGER",
      approvalLevel: "OWNER", riskGuardrail: HIGH_RISK_GUARDRAIL, missingData: [],
    });
  }

  // 5. LOW_RISK_OWNER_INTERRUPT — repeated low-risk owner-approval items that are safe to delegate.
  const lowRisk = ownerCorrections.filter((c) => !c.highRisk);
  if (lowRisk.length >= LOW_RISK_INTERRUPT_THRESHOLD) {
    push({
      ...empty, workloadType: "LOW_RISK_OWNER_INTERRUPT", severity: "LOW", confidence: "MEDIUM",
      burdenCount: lowRisk.length, estimatedOwnerTouches: lowRisk.length,
      supportingCorrectionKeys: lowRisk.map((c) => c.key), relatedProcessFinding: null, relatedSLO: "OWNER_WORKLOAD_BURDEN",
      ownerVisibleExplanation: "Low-risk decisions keep interrupting you. These can be delegated to a manager or converted to a standing policy.",
      recommendedReductionAction: "DELEGATE_TO_MANAGER", approvalLevel: "MANAGER", riskGuardrail: SAFE_GUARDRAIL, missingData: [],
    });
  }

  // 6. RECURRING_COMPLAINT_ESCALATION — quality complaints keep reaching the owner.
  if (has("QUALITY_FAILURE_LOOP")) {
    const q = ev("QUALITY_FAILURE_LOOP");
    push({
      ...empty, workloadType: "RECURRING_COMPLAINT_ESCALATION", severity: "MEDIUM", confidence: "HIGH",
      burdenCount: q.supportingOperationalEventIds.length, estimatedOwnerTouches: null,
      supportingOperationalEventIds: q.supportingOperationalEventIds, relatedProcessFinding: "QUALITY_FAILURE_LOOP", relatedSLO: q.relatedSLO ?? "OPERATIONAL_EVENT_RESOLUTION",
      ownerVisibleExplanation: "Quality complaints keep escalating to you. Tightening the acceptance checklist stops the repeat at the source.",
      recommendedReductionAction: "UPDATE_CHECKLIST", approvalLevel: "MANAGER", riskGuardrail: SAFE_GUARDRAIL, missingData: [],
    });
  }

  // 7. MANAGER_ESCALATION_OVERUSE — a manager escalates to the owner instead of handling it.
  if (has("ESCALATION_RESPONSE_BREAKDOWN")) {
    const e = ev("ESCALATION_RESPONSE_BREAKDOWN");
    push({
      ...empty, workloadType: "MANAGER_ESCALATION_OVERUSE", severity: "MEDIUM", confidence: "MEDIUM",
      burdenCount: e.supportingEscalationIds.length, estimatedOwnerTouches: null,
      supportingEscalationIds: e.supportingEscalationIds, relatedProcessFinding: "ESCALATION_RESPONSE_BREAKDOWN", relatedSLO: e.relatedSLO ?? "ANTI_GAMING_RISK",
      ownerVisibleExplanation: "Escalations keep coming to you instead of being handled at the manager level. A manager review or a clear policy reduces the over-escalation.",
      recommendedReductionAction: "ASSIGN_TRAINING", approvalLevel: "MANAGER", riskGuardrail: SAFE_GUARDRAIL, missingData: [],
    });
  }

  // 8. TRAINING_DELEGATION_OPPORTUNITY — manager-owned training the owner does not need to run.
  if (signals.managerTrainingKeys.length >= 1) {
    push({
      ...empty, workloadType: "TRAINING_DELEGATION_OPPORTUNITY", severity: "LOW", confidence: "MEDIUM",
      burdenCount: signals.managerTrainingKeys.length, estimatedOwnerTouches: null,
      supportingTrainingKeys: signals.managerTrainingKeys, relatedProcessFinding: null, relatedSLO: null,
      ownerVisibleExplanation: "Manager-level training/coaching is proposed. Delegate it to the manager rather than running it yourself.",
      recommendedReductionAction: "DELEGATE_TO_MANAGER", approvalLevel: "MANAGER", riskGuardrail: SAFE_GUARDRAIL, missingData: [],
    });
  }

  // 9. MISSING_DATA_BURDEN — missing-data loops the owner keeps resolving by hand.
  if (has("DATA_INSUFFICIENT") || signals.missingData.length > 0) {
    push({
      ...empty, workloadType: "MISSING_DATA_BURDEN", severity: "LOW", confidence: "NEEDS_DATA",
      burdenCount: signals.missingData.length, estimatedOwnerTouches: null,
      relatedProcessFinding: has("DATA_INSUFFICIENT") ? "DATA_INSUFFICIENT" : null, relatedSLO: null,
      ownerVisibleExplanation: "Missing operational data keeps forcing manual owner follow-up. Add it to routine capture so it stops recurring.",
      recommendedReductionAction: "COLLECT_MISSING_DATA", approvalLevel: "MANAGER", riskGuardrail: SAFE_GUARDRAIL,
      missingData: signals.missingData.length ? signals.missingData : ["insufficient linked process evidence"],
    });
  }

  out.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
  return { workspaceId, findings: out, topFinding: out[0] ?? null, evaluatedAt };
}
