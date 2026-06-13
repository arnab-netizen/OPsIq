/**
 * Owner Operations (Module 4 Slice 3) — deterministic recommendations.
 *
 * Pure: maps Slice 2 operations `OwnerFinding`s → traceable
 * `OperationsRecommendation`s. Every recommendation carries its source
 * metric/value/threshold, severity, expected impact, confidence, the required
 * owner action, and how to verify it. A finding with no template produces no
 * recommendation (reported as a missing action input by the planner) — nothing is
 * invented.
 */
import type { OwnerFinding, OwnerSeverity } from "@/domain/owner-spine/contracts";
import { clampScore, clampConfidence } from "@/domain/owner-spine/contracts";

export interface OperationsRecommendation {
  recommendationCode: string;
  findingCode: string;
  category: string;
  sourceMetric: string;
  sourceValue: number | null;
  threshold: number | null;
  severity: OwnerSeverity;
  expectedOpsImpactScore: number; // 0..100
  urgencyScore: number; // 0..100 (carried from the finding)
  confidence: number; // 0..1
  requiredOwnerAction: string;
  verificationMetric: string;
  verificationMethod: string;
  expectedTimeframeDays: number;
  effortScore: number; // 0..100
  ownerRole: string;
  title: string;
  evidence: string[];
}

interface OperationsRecTemplate {
  recommendationCode: string;
  category: string;
  title: string;
  requiredOwnerAction: string;
  verificationMethod: string;
  expectedTimeframeDays: number;
  effortScore: number;
  ownerRole: string;
}

/**
 * Finding code → recommendation template. Categories cover the operations action
 * set: relieve capacity, improve completion, reduce delays/rework, reduce
 * complaints, fix delivery, enforce SOP, improve productivity, fix inventory, grow
 * throughput, and improve data quality.
 */
export const OPERATIONS_REC_TEMPLATES: Record<string, OperationsRecTemplate> = {
  OPS_CAPACITY_BOTTLENECK: {
    recommendationCode: "OPSREC_RELIEVE_CAPACITY",
    category: "relieve_capacity",
    title: "Relieve the capacity bottleneck",
    requiredOwnerAction:
      "Add a shift/equipment slot or shed/redirect low-value load at the constrained stage so demand fits capacity.",
    verificationMethod: "Re-measure capacityUtilizationPct next period; target below the ceiling.",
    expectedTimeframeDays: 21,
    effortScore: 60,
    ownerRole: "owner",
  },
  OPS_LOW_COMPLETION: {
    recommendationCode: "OPSREC_IMPROVE_COMPLETION",
    category: "improve_completion",
    title: "Raise order completion",
    requiredOwnerAction:
      "Find the stage where orders stall and clear it (staffing, sequencing, or WIP limit) so more received orders finish.",
    verificationMethod: "Re-measure completionRatePct next period; target above the low bar.",
    expectedTimeframeDays: 21,
    effortScore: 50,
    ownerRole: "owner",
  },
  OPS_HIGH_DELAY: {
    recommendationCode: "OPSREC_REDUCE_DELAYS",
    category: "reduce_delays",
    title: "Reduce delays at the slow stage",
    requiredOwnerAction:
      "Identify the slowest stage and add capacity or re-sequence work to restore turnaround.",
    verificationMethod: "Re-measure delayRatePct next period; target below threshold.",
    expectedTimeframeDays: 21,
    effortScore: 45,
    ownerRole: "owner",
  },
  OPS_HIGH_REWORK: {
    recommendationCode: "OPSREC_REDUCE_REWORK",
    category: "reduce_rework",
    title: "Cut the top rework cause",
    requiredOwnerAction:
      "Find the most common defect driving rework and fix its root cause (training, checklist, or equipment).",
    verificationMethod: "Re-measure reworkRatePct next period; target below threshold.",
    expectedTimeframeDays: 30,
    effortScore: 50,
    ownerRole: "owner",
  },
  OPS_HIGH_COMPLAINT_RATE: {
    recommendationCode: "OPSREC_REDUCE_COMPLAINTS",
    category: "reduce_complaints",
    title: "Fix the top complaint driver",
    requiredOwnerAction:
      "Identify the single most common complaint and fix its root cause to protect quality and repeat purchase.",
    verificationMethod: "Re-measure complaintRatePct next period; target below threshold.",
    expectedTimeframeDays: 30,
    effortScore: 45,
    ownerRole: "owner",
  },
  OPS_DELIVERY_FAILURE: {
    recommendationCode: "OPSREC_FIX_DELIVERY",
    category: "fix_delivery",
    title: "Fix the delivery handoff",
    requiredOwnerAction:
      "Address the main delivery failure cause (routing, coverage, address quality, or carrier) at the last mile.",
    verificationMethod: "Re-measure deliverySuccessRatePct next period; target above threshold.",
    expectedTimeframeDays: 21,
    effortScore: 45,
    ownerRole: "owner",
  },
  OPS_SOP_NONCOMPLIANCE: {
    recommendationCode: "OPSREC_ENFORCE_SOP",
    category: "enforce_sop",
    title: "Reinforce the weakest SOP step",
    requiredOwnerAction:
      "Pick the most-missed SOP step, re-train, and add a quick check so adherence rises.",
    verificationMethod: "Re-measure sopCompliancePct next period; target above threshold.",
    expectedTimeframeDays: 21,
    effortScore: 35,
    ownerRole: "owner",
  },
  OPS_HIGH_IDLE: {
    recommendationCode: "OPSREC_IMPROVE_PRODUCTIVITY",
    category: "improve_productivity",
    title: "Rebalance staffing to demand",
    requiredOwnerAction:
      "Align shift schedules to demand peaks so paid hours convert to output, reducing idle time.",
    verificationMethod: "Re-measure idleRatePct / ordersPerStaffHour next period; target improved.",
    expectedTimeframeDays: 21,
    effortScore: 35,
    ownerRole: "owner",
  },
  OPS_INVENTORY_SHORTAGE: {
    recommendationCode: "OPSREC_FIX_INVENTORY",
    category: "fix_inventory",
    title: "Set reorder points on stockout items",
    requiredOwnerAction:
      "For the items that ran out, set a reorder point + safety stock so fulfilment is not interrupted.",
    verificationMethod: "Re-measure inventoryShortageCount next period; target zero.",
    expectedTimeframeDays: 14,
    effortScore: 30,
    ownerRole: "owner",
  },
  OPS_INVALID_CURRENCY: {
    recommendationCode: "OPSREC_FIX_CURRENCY",
    category: "improve_data_quality",
    title: "Set a valid reporting currency",
    requiredOwnerAction: "Set a valid 3–8 letter currency code on the snapshot.",
    verificationMethod: "Confirm currencyValid is true on the next snapshot.",
    expectedTimeframeDays: 3,
    effortScore: 10,
    ownerRole: "owner",
  },
  OPS_MISSING_CRITICAL_DATA: {
    recommendationCode: "OPSREC_IMPROVE_DATA_QUALITY",
    category: "improve_data_quality",
    title: "Provide missing operations inputs",
    requiredOwnerAction: "Enter the listed missing inputs to raise diagnosis confidence.",
    verificationMethod: "Re-measure dataConfidenceScore next snapshot; target higher.",
    expectedTimeframeDays: 7,
    effortScore: 20,
    ownerRole: "owner",
  },
  OPS_OPP_RECOVER_DELAYS: {
    recommendationCode: "OPSREC_REDUCE_DELAYS",
    category: "reduce_delays",
    title: "Pull delayed orders through",
    requiredOwnerAction: "Clear the slow stage to complete the backlog of delayed orders.",
    verificationMethod: "Re-measure delayRatePct next period; target lower.",
    expectedTimeframeDays: 14,
    effortScore: 40,
    ownerRole: "owner",
  },
  OPS_OPP_CUT_REWORK: {
    recommendationCode: "OPSREC_REDUCE_REWORK",
    category: "reduce_rework",
    title: "Cut rework to free capacity",
    requiredOwnerAction: "Fix the top defect so first-pass output rises and capacity is freed.",
    verificationMethod: "Re-measure reworkRatePct next period; target lower.",
    expectedTimeframeDays: 30,
    effortScore: 50,
    ownerRole: "owner",
  },
  OPS_OPP_RECLAIM_IDLE: {
    recommendationCode: "OPSREC_IMPROVE_PRODUCTIVITY",
    category: "improve_productivity",
    title: "Reclaim idle capacity",
    requiredOwnerAction: "Align schedules to demand so idle paid hours convert to output.",
    verificationMethod: "Re-measure idleRatePct next period; target lower.",
    expectedTimeframeDays: 21,
    effortScore: 35,
    ownerRole: "owner",
  },
  OPS_OPP_CLOSE_SOP_GAP: {
    recommendationCode: "OPSREC_ENFORCE_SOP",
    category: "enforce_sop",
    title: "Close the SOP compliance gap",
    requiredOwnerAction: "Reinforce the most-missed SOP step to stabilise quality and turnaround.",
    verificationMethod: "Re-measure sopCompliancePct next period; target higher.",
    expectedTimeframeDays: 21,
    effortScore: 35,
    ownerRole: "owner",
  },
  OPS_OPP_USE_CAPACITY_HEADROOM: {
    recommendationCode: "OPSREC_GROW_THROUGHPUT",
    category: "grow_throughput",
    title: "Use spare capacity to take more orders",
    requiredOwnerAction:
      "There is capacity headroom — pair with a sales/marketing push to fill it without new equipment.",
    verificationMethod: "Re-measure capacityUtilizationPct + completed orders next period.",
    expectedTimeframeDays: 30,
    effortScore: 40,
    ownerRole: "owner",
  },
  OPS_OPP_DATA_QUALITY: {
    recommendationCode: "OPSREC_IMPROVE_DATA_QUALITY",
    category: "improve_data_quality",
    title: "Improve data completeness",
    requiredOwnerAction: "Supply the missing/stale inputs to sharpen the operations diagnosis.",
    verificationMethod: "Re-measure dataConfidenceScore next snapshot; target higher.",
    expectedTimeframeDays: 7,
    effortScore: 20,
    ownerRole: "owner",
  },
};

/** Build a traceable recommendation from a finding, or null if no template. */
export function buildOperationsRecommendation(finding: OwnerFinding): OperationsRecommendation | null {
  const tpl = OPERATIONS_REC_TEMPLATES[finding.code];
  if (!tpl) return null;
  return {
    recommendationCode: tpl.recommendationCode,
    findingCode: finding.code,
    category: tpl.category,
    sourceMetric: finding.sourceMetric,
    sourceValue: finding.sourceValue ?? null, // never invented
    threshold: finding.threshold ?? null,
    severity: finding.severity,
    expectedOpsImpactScore: clampScore(finding.impactScore),
    urgencyScore: clampScore(finding.urgencyScore),
    confidence: clampConfidence(finding.confidence),
    requiredOwnerAction: tpl.requiredOwnerAction,
    verificationMetric: finding.verificationMetric ?? finding.sourceMetric,
    verificationMethod: tpl.verificationMethod,
    expectedTimeframeDays: tpl.expectedTimeframeDays,
    effortScore: clampScore(tpl.effortScore),
    ownerRole: tpl.ownerRole,
    title: tpl.title,
    evidence: finding.evidence,
  };
}

/** Build recommendations for every finding that has a template (in input order). */
export function buildOperationsRecommendations(findings: OwnerFinding[]): OperationsRecommendation[] {
  const recs: OperationsRecommendation[] = [];
  for (const f of findings) {
    const r = buildOperationsRecommendation(f);
    if (r) recs.push(r);
  }
  return recs;
}
