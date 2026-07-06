/**
 * SOP / Training Effectiveness Loop (depth pass).
 *
 * Answers "did the correction or training actually work?" by comparing the targeted problem's metric in a
 * BASELINE window against an EVALUATION window. PURE + deterministic. It consumes already-derived inputs
 * (the process findings, the routed corrections, the SOP drafts, the training assignments) plus the
 * before/after metric values the caller computed from persisted owner-guidance snapshots — it never
 * fabricates an improvement, never invents a financial amount, and honestly returns INSUFFICIENT_DATA when
 * there is no baseline, the window has not elapsed, or the minimum data threshold is not met.
 *
 * Governance stance (matches OpsIQ rules):
 * - No improvement is claimed without before/after data and a met minimum-data threshold.
 * - A proposal-only (not approved/active) correction is NOT scored as implemented — it returns
 *   INSUFFICIENT_DATA with an honest "not yet active" summary, never IMPROVED.
 * - Cleared/dismissed false-positive evidence is suppressed upstream and cannot drive a failure here.
 * - No fake financial impact, no fraud/negligence labels, no hidden staff score.
 */

import type { ApprovalLevel } from "./process-intelligence";
import {
  classifyEffectivenessAttribution, type CorrectionExecutionState, type EffectivenessAttributionState,
} from "./effectiveness-attribution";

export type EvaluationType =
  | "SOP_CHECKLIST_EFFECTIVENESS"
  | "TRAINING_EFFECTIVENESS"
  | "CORRECTION_EFFECTIVENESS"
  | "DATA_INSUFFICIENT";

export type EffectivenessDirection = "IMPROVED" | "WORSENED" | "UNCHANGED" | "INSUFFICIENT_DATA";
export type EffectivenessConfidence = "HIGH" | "MEDIUM" | "LOW" | "NEEDS_DATA";
export type NextAction = "KEEP" | "MODIFY" | "ESCALATE" | "RETRAIN" | "COLLECT_MORE_DATA" | "DISMISS_AS_INEFFECTIVE";

/** What the caller provides per candidate evaluation (before/after metric computed from real snapshots). */
export interface EffectivenessInputItem {
  kind: "SOP" | "TRAINING" | "CORRECTION";
  sourceCorrectionKey: string;
  sourceTrainingKey: string | null;
  sourceProcessFindingKey: string;
  targetedProblemType: string;
  /** Was the correction/training actually approved/active? Proposal-only items are not scored as implemented. */
  active: boolean;
  /** Has the evaluation window elapsed since the baseline? */
  windowElapsed: boolean;
  /** Is the minimum data threshold met (enough events to trust the comparison)? */
  minDataMet: boolean;
  /** The persisted execution state of the correction/SOP/training (PASS 26). Absent → derived from `active`
   *  (ASSIGNED when active, PROPOSED otherwise) so a caller that has not wired the task state still gets an
   *  honest, non-attributing verdict — an improvement is NEVER attributed without proven execution. */
  executionState?: CorrectionExecutionState;
  baselineMetricValue: number | null;
  currentMetricValue: number | null;
  baselineWindow: string;
  evaluationWindow: string;
  supportingBeforeEventIds: string[];
  supportingAfterEventIds: string[];
  supportingProofIds: string[];
  relatedOperationalEventIds: string[];
  relatedEscalationIds: string[];
  relatedProfitLeak: string | null;
  relatedConstraint: string | null;
  relatedSLO: string | null;
  approvalLevel: ApprovalLevel;
  missingData: string[];
}

/** The 25-field effectiveness evaluation. */
export interface EffectivenessEvaluation {
  workspaceId: string; // 1
  sourceCorrectionKey: string; // 2
  sourceTrainingKey: string | null; // 3
  sourceProcessFindingKey: string; // 4
  evaluationType: EvaluationType; // 5
  targetedProblemType: string; // 6
  baselineWindow: string; // 7
  evaluationWindow: string; // 8
  baselineMetricValue: number | null; // 9
  currentMetricValue: number | null; // 10
  direction: EffectivenessDirection; // 11
  confidence: EffectivenessConfidence; // 12
  supportingBeforeEventIds: string[]; // 13
  supportingAfterEventIds: string[]; // 14
  supportingProofIds: string[]; // 15
  relatedOperationalEventIds: string[]; // 16
  relatedEscalationIds: string[]; // 17
  relatedProfitLeak: string | null; // 18
  relatedConstraint: string | null; // 19
  relatedSLO: string | null; // 20
  ownerVisibleSummary: string; // 21
  recommendedNextAction: NextAction; // 22
  approvalLevel: ApprovalLevel; // 23
  missingData: string[]; // 24
  evaluatedAt: string; // 25
  /** First-class attribution verdict (PASS 26): the only field that decides whether a fix may be called
   *  effective. A VERIFIED/monitor state is reachable only with proven execution AND a post-execution outcome. */
  attributionState: EffectivenessAttributionState; // 26
}

export interface EffectivenessAnalysis {
  workspaceId: string;
  evaluations: EffectivenessEvaluation[];
  topEvaluation: EffectivenessEvaluation | null;
  evaluatedAt: string;
}

const KIND_TYPE: Record<EffectivenessInputItem["kind"], EvaluationType> = {
  SOP: "SOP_CHECKLIST_EFFECTIVENESS",
  TRAINING: "TRAINING_EFFECTIVENESS",
  CORRECTION: "CORRECTION_EFFECTIVENESS",
};

/** Order: real signals first (IMPROVED/WORSENED/UNCHANGED), INSUFFICIENT_DATA last; WORSENED outranks the rest. */
const DIRECTION_RANK: Record<EffectivenessDirection, number> = { WORSENED: 0, UNCHANGED: 1, IMPROVED: 2, INSUFFICIENT_DATA: 3 };

function nextActionFor(direction: EffectivenessDirection, kind: EffectivenessInputItem["kind"]): NextAction {
  switch (direction) {
    case "IMPROVED": return "KEEP";
    case "WORSENED": return kind === "TRAINING" ? "RETRAIN" : "ESCALATE";
    case "UNCHANGED": return "MODIFY";
    case "INSUFFICIENT_DATA": return "COLLECT_MORE_DATA";
  }
}

function evaluateItem(item: EffectivenessInputItem, workspaceId: string, at: string): EffectivenessEvaluation {
  const base = item.baselineMetricValue;
  const cur = item.currentMetricValue;

  // Honest INSUFFICIENT_DATA gates: not active (proposal-only), no baseline, window not elapsed, or too little data.
  const insufficient = !item.active || base === null || cur === null || !item.windowElapsed || !item.minDataMet;

  let direction: EffectivenessDirection;
  let confidence: EffectivenessConfidence;
  let summary: string;
  if (insufficient) {
    direction = "INSUFFICIENT_DATA";
    confidence = "NEEDS_DATA";
    summary = !item.active
      ? "Not yet evaluated — the correction/training is proposed but not approved/active, so its effect cannot be measured."
      : base === null
      ? "No baseline yet — there is no earlier measurement to compare against."
      : !item.windowElapsed
      ? "Too early — the evaluation window has not elapsed since the correction."
      : "Not enough linked events to trust a before/after comparison yet.";
  } else {
    if (cur! < base!) { direction = "IMPROVED"; }
    else if (cur! > base!) { direction = "WORSENED"; }
    else { direction = "UNCHANGED"; }
    confidence = item.minDataMet ? "MEDIUM" : "LOW";
    const problem = item.targetedProblemType.toLowerCase().replace(/_/g, " ");
    // WORSENED/UNCHANGED never claim the fix worked, so their honest before/after wording stays. IMPROVED is the
    // ONLY false-attribution risk: it may only be called "working" with proven execution, so its wording comes
    // from the attribution classifier (verified-after-execution vs improved-but-execution-not-proven). (PASS 26)
    summary = direction === "WORSENED"
      ? `The ${problem} rose from ${base} to ${cur} after the correction — it is not working and needs a rethink.`
      : direction === "UNCHANGED"
      ? `The ${problem} is unchanged (${base} → ${cur}) after the correction — it has not moved the outcome.`
      : `The ${problem} fell from ${base} to ${cur}.`; // improved metric stated as fact; attribution handled below
  }

  // Attribution (PASS 26): separate execution evidence from outcome. A real post-execution OUTCOME exists only
  // when there is a baseline, an elapsed window, and enough data — independent of whether the correction was
  // executed. The RAW metric direction (not the `active`-gated `direction`) feeds the classifier, so an
  // improvement that occurred WITHOUT proven execution is caught as IMPROVED_BUT_EXECUTION_NOT_PROVEN rather
  // than being silently swallowed. Execution state comes from the persisted task (or is conservatively derived
  // from `active`), so nothing is ever attributed as "working" without proven execution.
  const hasPostExecutionOutcome = base !== null && cur !== null && item.windowElapsed && item.minDataMet;
  const metricDirection: EffectivenessDirection = !hasPostExecutionOutcome
    ? "INSUFFICIENT_DATA"
    : cur! < base! ? "IMPROVED" : cur! > base! ? "WORSENED" : "UNCHANGED";
  const executionState: CorrectionExecutionState = item.executionState ?? (item.active ? "ASSIGNED" : "PROPOSED");
  const attribution = classifyEffectivenessAttribution({ executionState, outcomeDirection: metricDirection, hasPostExecutionOutcome });
  // For a measured IMPROVED result, the owner-visible line must be attribution-honest (verified vs unattributed),
  // never "it appears to be working". Insufficient/worsened/unchanged keep their already-honest wording.
  if (!insufficient && direction === "IMPROVED") summary = attribution.ownerVisibleSummary;

  const evaluationType: EvaluationType = insufficient && (base === null || !item.windowElapsed || !item.minDataMet)
    ? "DATA_INSUFFICIENT"
    : KIND_TYPE[item.kind];

  return {
    workspaceId,
    sourceCorrectionKey: item.sourceCorrectionKey,
    sourceTrainingKey: item.sourceTrainingKey,
    sourceProcessFindingKey: item.sourceProcessFindingKey,
    evaluationType,
    targetedProblemType: item.targetedProblemType,
    baselineWindow: item.baselineWindow,
    evaluationWindow: item.evaluationWindow,
    baselineMetricValue: base,
    currentMetricValue: cur,
    direction,
    confidence,
    supportingBeforeEventIds: item.supportingBeforeEventIds,
    supportingAfterEventIds: item.supportingAfterEventIds,
    supportingProofIds: item.supportingProofIds,
    relatedOperationalEventIds: item.relatedOperationalEventIds,
    relatedEscalationIds: item.relatedEscalationIds,
    relatedProfitLeak: item.relatedProfitLeak,
    relatedConstraint: item.relatedConstraint,
    relatedSLO: item.relatedSLO,
    ownerVisibleSummary: summary,
    recommendedNextAction: nextActionFor(direction, item.kind),
    approvalLevel: item.approvalLevel,
    missingData: item.missingData,
    evaluatedAt: at,
    attributionState: attribution.attribution,
  };
}

/**
 * Build effectiveness evaluations. Pure + deterministic. WORSENED/UNCHANGED surface above IMPROVED, and
 * INSUFFICIENT_DATA sorts last, so the owner sees the corrections that did NOT work first.
 */
export function buildEffectivenessEvaluations(
  items: EffectivenessInputItem[],
  workspaceId: string,
  evaluatedAt: string,
): EffectivenessAnalysis {
  const evaluations = items.map((it) => evaluateItem(it, workspaceId, evaluatedAt));
  evaluations.sort((a, b) => DIRECTION_RANK[a.direction] - DIRECTION_RANK[b.direction]);
  return { workspaceId, evaluations, topEvaluation: evaluations[0] ?? null, evaluatedAt };
}
