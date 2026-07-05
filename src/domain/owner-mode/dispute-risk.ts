/**
 * Dispute → Business Risk mapping (depth pass) — PURE domain rules.
 *
 * Answers: "When accepted proof is later disputed, what business risk does that create?" It maps a
 * governed proof-dispute category to the Profit-Leak and Constraint signals it should feed, so a
 * live dispute affects business-risk intelligence — not only proof integrity.
 *
 * PURE and deterministic — no DB, no clock. It reads the governed dispute record (category +
 * reason + the proof.disputed audit event id) that already exists; it invents NO complaint/rework
 * rows and fabricates NO revenue/churn/margin figure — financial impact is always qualitative
 * (NEEDS_DATA) because no per-event complaint/rework model exists yet. Where a category does not map
 * to a supported risk (OTHER), it is left low-confidence NEEDS_REVIEW rather than overclassified.
 */

import type { ProfitLeakType } from "@/domain/owner-mode/profit-leak-radar";
import type { ConstraintType } from "@/domain/owner-mode/constraint-engine";
import { ProofDisputeCategory } from "@/domain/execution/proof-dispute";

export type DisputeRiskSeverity = "HIGH" | "MEDIUM" | "LOW";
export type DisputeRiskConfidence = "MEDIUM" | "LOW" | "NEEDS_DATA";

/** A dispute record as read from the persisted proof.disputed audit event. */
export interface DisputeRecordInput {
  proofId: string;
  disputeCategory: string;
  reason: string;
  auditEventId: string;
  occurredAt: Date;
}

/** A dispute-derived business-risk signal — the full required shape. */
export interface DisputeRiskSignal {
  workspaceId: string;
  proofId: string;
  disputeCategory: ProofDisputeCategory;
  disputeReason: string;
  sourceAuditEventId: string;
  profitLeakType: ProfitLeakType | null;
  constraintType: ConstraintType | null;
  severity: DisputeRiskSeverity;
  confidence: DisputeRiskConfidence;
  missingData: string[];
  ownerExplanation: string;
  recommendedAction: string;
  ownerApprovalRequired: boolean;
  successMetric: string;
  reassessmentTrigger: string;
  evaluatedAt: string;
}

/** Aggregate dispute counts by risk class — fed into the Profit-Leak Radar + Constraint Engine. */
export interface DisputeRiskAggregates {
  total: number;
  /** Profit-leak drivers. */
  disputeReworkCount: number;      // → REWORK_REDO_COST
  disputeComplaintCount: number;   // → COMPLAINT_REVENUE_RISK
  disputeWeakProofCount: number;   // → WEAK_PROOF_REWORK_RISK
  /** Constraint drivers. */
  disputeQualityCount: number;     // → QUALITY
  disputeStaffCount: number;       // → STAFF
  disputeManagerCount: number;     // → MANAGER
}

export interface DisputeRiskAnalysis {
  workspaceId: string;
  risks: DisputeRiskSignal[];
  topRisk: DisputeRiskSignal | null;
  aggregates: DisputeRiskAggregates;
  evaluatedAt: string;
}

interface CategoryMap {
  profitLeakType: ProfitLeakType | null;
  constraintType: ConstraintType | null;
  /** Which aggregate buckets this category increments. */
  buckets: Array<keyof Omit<DisputeRiskAggregates, "total">>;
  /** Base owner guidance. */
  explanation: string;
  action: string;
  /** Customer-facing → complaint-revenue framing; discloses the missing complaint model. */
  customerFacing: boolean;
  ownerApprovalRequired: boolean;
}

const CATEGORY_MAP: Record<ProofDisputeCategory, CategoryMap | null> = {
  [ProofDisputeCategory.REWORK_REQUIRED]: {
    profitLeakType: "REWORK_REDO_COST", constraintType: "QUALITY",
    buckets: ["disputeReworkCount", "disputeQualityCount"], customerFacing: false, ownerApprovalRequired: false,
    explanation: "Accepted work had to be redone — rework cost and a quality-process gap.",
    action: "Fix the SOP step that caused the redo and tighten the proof requirement before re-assigning.",
  },
  [ProofDisputeCategory.QUALITY_FAILURE]: {
    profitLeakType: "REWORK_REDO_COST", constraintType: "QUALITY",
    buckets: ["disputeReworkCount", "disputeQualityCount"], customerFacing: false, ownerApprovalRequired: false,
    explanation: "Accepted work failed quality — cost of poor quality and a binding quality issue.",
    action: "Run a quality-control intervention on this task type; re-verify recent similar jobs.",
  },
  [ProofDisputeCategory.BAD_OUTCOME]: {
    profitLeakType: "REWORK_REDO_COST", constraintType: "QUALITY",
    buckets: ["disputeReworkCount", "disputeQualityCount"], customerFacing: false, ownerApprovalRequired: true,
    explanation: "An accepted job produced a bad actual outcome — reassessment and process correction needed.",
    action: "Open the reassessment, correct the process, and re-check dependent work.",
  },
  [ProofDisputeCategory.CUSTOMER_COMPLAINT]: {
    profitLeakType: "COMPLAINT_REVENUE_RISK", constraintType: "QUALITY",
    buckets: ["disputeComplaintCount", "disputeQualityCount"], customerFacing: true, ownerApprovalRequired: true,
    explanation: "A customer complained about accepted work — revenue/relationship risk (magnitude not yet measured).",
    action: "Run customer recovery for the affected job; fix the underlying quality cause.",
  },
  [ProofDisputeCategory.WRONG_OR_INSUFFICIENT_PROOF]: {
    profitLeakType: "WEAK_PROOF_REWORK_RISK", constraintType: "STAFF",
    buckets: ["disputeWeakProofCount", "disputeStaffCount"], customerFacing: false, ownerApprovalRequired: false,
    explanation: "Accepted proof turned out wrong/insufficient — the proof requirement is too weak.",
    action: "Tighten the proof requirement and coach the operator before accepting more of this type.",
  },
  [ProofDisputeCategory.SUSPECTED_FAKE_OR_REUSED_PROOF]: {
    profitLeakType: "WEAK_PROOF_REWORK_RISK", constraintType: "STAFF",
    buckets: ["disputeWeakProofCount", "disputeStaffCount"], customerFacing: false, ownerApprovalRequired: true,
    explanation: "Accepted proof is suspected fake/reused — highest-risk credibility failure by staff.",
    action: "Run an anti-gaming review of this operator's recent proof; require fresh verified artifacts.",
  },
  [ProofDisputeCategory.MANAGER_REVIEW_ERROR]: {
    profitLeakType: "WEAK_PROOF_REWORK_RISK", constraintType: "MANAGER",
    buckets: ["disputeWeakProofCount", "disputeManagerCount"], customerFacing: false, ownerApprovalRequired: false,
    explanation: "A manager accepted proof that should not have passed — a review-quality/approval-policy gap.",
    action: "Coach the reviewer and tighten the approval policy for this task type.",
  },
  [ProofDisputeCategory.OTHER]: null, // do not overclassify
};

/** Categories that repeat into a HIGH severity once seen ≥ this many times. */
const HIGH_AT = 3;
/** Type priority for ranking the single top dispute risk (fake/manager > quality > complaint > rework > weak). */
const CATEGORY_PRIORITY: Record<ProofDisputeCategory, number> = {
  [ProofDisputeCategory.SUSPECTED_FAKE_OR_REUSED_PROOF]: 8,
  [ProofDisputeCategory.BAD_OUTCOME]: 7,
  [ProofDisputeCategory.CUSTOMER_COMPLAINT]: 6,
  [ProofDisputeCategory.QUALITY_FAILURE]: 5,
  [ProofDisputeCategory.MANAGER_REVIEW_ERROR]: 4,
  [ProofDisputeCategory.REWORK_REQUIRED]: 3,
  [ProofDisputeCategory.WRONG_OR_INSUFFICIENT_PROOF]: 2,
  [ProofDisputeCategory.OTHER]: 0,
};
const SEV_WEIGHT: Record<DisputeRiskSeverity, number> = { HIGH: 100, MEDIUM: 10, LOW: 1 };

function isCategory(v: string): v is ProofDisputeCategory {
  return (Object.values(ProofDisputeCategory) as string[]).includes(v);
}

/** Build the workspace dispute-risk analysis from persisted dispute records. Pure. */
export function buildDisputeRiskAnalysis(
  workspaceId: string,
  records: DisputeRecordInput[],
  evaluatedAt: string
): DisputeRiskAnalysis {
  const agg: DisputeRiskAggregates = {
    total: 0, disputeReworkCount: 0, disputeComplaintCount: 0, disputeWeakProofCount: 0,
    disputeQualityCount: 0, disputeStaffCount: 0, disputeManagerCount: 0,
  };
  const countByCategory = new Map<ProofDisputeCategory, number>();
  for (const r of records) {
    if (!isCategory(r.disputeCategory)) continue;
    countByCategory.set(r.disputeCategory, (countByCategory.get(r.disputeCategory) ?? 0) + 1);
  }

  const risks: DisputeRiskSignal[] = [];
  for (const r of records) {
    if (!isCategory(r.disputeCategory)) continue;
    agg.total++;
    const category = r.disputeCategory;
    const map = CATEGORY_MAP[category];
    const repeated = (countByCategory.get(category) ?? 0) >= HIGH_AT;

    if (!map) {
      // OTHER — do not overclassify; low-confidence, no profit/constraint mapping.
      risks.push({
        workspaceId, proofId: r.proofId, disputeCategory: category, disputeReason: r.reason,
        sourceAuditEventId: r.auditEventId, profitLeakType: null, constraintType: null,
        severity: "LOW", confidence: "LOW",
        missingData: ["reason text does not map to a supported risk — needs owner review"],
        ownerExplanation: "A proof was disputed under 'OTHER' — review the reason before classifying business risk.",
        recommendedAction: "Read the dispute reason and re-file under a specific category if it maps to a real risk.",
        ownerApprovalRequired: false, successMetric: "the dispute is re-categorised or closed as no-risk",
        reassessmentTrigger: "re-evaluate if similar 'OTHER' disputes recur", evaluatedAt,
      });
      continue;
    }

    for (const b of map.buckets) agg[b]++;
    const severity: DisputeRiskSeverity = repeated ? "HIGH" : "MEDIUM";
    risks.push({
      workspaceId, proofId: r.proofId, disputeCategory: category, disputeReason: r.reason,
      sourceAuditEventId: r.auditEventId,
      profitLeakType: map.profitLeakType, constraintType: map.constraintType,
      severity, confidence: "MEDIUM",
      // No per-event complaint/rework model → financial impact is qualitative, never a fake number.
      missingData: map.customerFacing
        ? ["no per-event complaint model — revenue/churn impact is not measured (qualitative only)"]
        : ["no per-event rework model — redo cost is not measured (qualitative only)"],
      ownerExplanation: map.explanation,
      recommendedAction: map.action,
      ownerApprovalRequired: map.ownerApprovalRequired,
      successMetric: "the disputed cause is corrected and does not recur on the next similar jobs",
      reassessmentTrigger: "re-evaluate if this category recurs or the correction fails",
      evaluatedAt,
    });
  }

  const ranked = [...risks].sort(
    (a, b) => (SEV_WEIGHT[b.severity] + CATEGORY_PRIORITY[b.disputeCategory]) - (SEV_WEIGHT[a.severity] + CATEGORY_PRIORITY[a.disputeCategory])
  );
  return { workspaceId, risks, topRisk: ranked[0] ?? null, aggregates: agg, evaluatedAt };
}
