/**
 * Owner SOP & Execution Accountability (Module 7 Slice 3) — deterministic
 * recommendations.
 *
 * Pure: maps Slice 2 execution `OwnerFinding`s → traceable `SopRecommendation`s.
 * Every recommendation carries its source metric/value/threshold, severity,
 * expected impact, confidence, the required owner action, and how to verify it. A
 * finding with no template produces no recommendation (reported as a missing action
 * input by the planner) — nothing is invented.
 */
import type { OwnerFinding, OwnerSeverity } from "@/domain/owner-spine/contracts";
import { clampScore, clampConfidence } from "@/domain/owner-spine/contracts";

export interface SopRecommendation {
  recommendationCode: string;
  findingCode: string;
  category: string;
  sourceMetric: string;
  sourceValue: number | null;
  threshold: number | null;
  severity: OwnerSeverity;
  expectedExecImpactScore: number; // 0..100
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

interface SopRecTemplate {
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
 * Finding code → recommendation template. Categories cover the execution action
 * set: restore follow-through, enforce verification, clear overdue, eliminate
 * repeated failures, clarify acceptance, fix ownership, enforce proof, document
 * SOPs, and improve data quality.
 */
export const SOP_REC_TEMPLATES: Record<string, SopRecTemplate> = {
  SOP_LOW_COMPLETION: {
    recommendationCode: "SOPREC_RESTORE_FOLLOWTHROUGH",
    category: "restore_followthrough",
    title: "Restore follow-through on assigned work",
    requiredOwnerAction:
      "Re-anchor each open action to one named owner + a due date, and run a short daily check on the few that matter so assigned work actually closes.",
    verificationMethod: "Re-measure completionRatePct next period; target above the low bar.",
    expectedTimeframeDays: 21,
    effortScore: 45,
    ownerRole: "owner",
  },
  SOP_LOW_VERIFICATION: {
    recommendationCode: "SOPREC_ENFORCE_VERIFICATION",
    category: "enforce_verification",
    title: "Verify that completed work actually worked",
    requiredOwnerAction:
      "Require a before/after metric (or proof) on every high-impact completed action before it is closed, so 'done' means 'verified'.",
    verificationMethod: "Re-measure verificationRatePct next period; target above the low bar.",
    expectedTimeframeDays: 21,
    effortScore: 35,
    ownerRole: "owner",
  },
  SOP_HIGH_OVERDUE: {
    recommendationCode: "SOPREC_CLEAR_OVERDUE",
    category: "clear_overdue",
    title: "Clear and prevent overdue actions",
    requiredOwnerAction:
      "Triage the overdue list now: unblock, reassign, or kill each item; then cap WIP so new work cannot pile past its due date.",
    verificationMethod: "Re-measure overdueRatePct next period; target below threshold.",
    expectedTimeframeDays: 14,
    effortScore: 40,
    ownerRole: "owner",
  },
  SOP_REPEATED_FAILURES: {
    recommendationCode: "SOPREC_ELIMINATE_REPEAT_FAILURE",
    category: "eliminate_repeat_failure",
    title: "Turn the recurring failure into an SOP",
    requiredOwnerAction:
      "Take the most-repeated failure, write the correct steps + quality standard as an SOP, assign a responsible role, and train on it once.",
    verificationMethod: "Re-measure repeatedFailureRatePct next period; target below threshold.",
    expectedTimeframeDays: 30,
    effortScore: 50,
    ownerRole: "owner",
  },
  SOP_HIGH_DISPUTE: {
    recommendationCode: "SOPREC_CLARIFY_ACCEPTANCE",
    category: "clarify_acceptance",
    title: "Make the definition of done unambiguous",
    requiredOwnerAction:
      "Write a one-line acceptance criterion + quality standard for the most-disputed action type so completion is not contestable.",
    verificationMethod: "Re-measure disputeRatePct next period; target below threshold.",
    expectedTimeframeDays: 14,
    effortScore: 30,
    ownerRole: "owner",
  },
  SOP_HIGH_REASSIGNMENT: {
    recommendationCode: "SOPREC_FIX_OWNERSHIP",
    category: "fix_ownership",
    title: "Fix unclear ownership",
    requiredOwnerAction:
      "For the work that keeps bouncing, name a single accountable role in the SOP so it stops being reassigned mid-flight.",
    verificationMethod: "Re-measure reassignmentRatePct next period; target below threshold.",
    expectedTimeframeDays: 14,
    effortScore: 30,
    ownerRole: "owner",
  },
  SOP_LOW_PROOF_COMPLIANCE: {
    recommendationCode: "SOPREC_ENFORCE_PROOF",
    category: "enforce_proof",
    title: "Enforce required proof of completion",
    requiredOwnerAction:
      "Make proof mandatory to close any proof-required action (photo, number, or sign-off); do not accept completion without it.",
    verificationMethod: "Re-measure proofCompliancePct next period; target above threshold.",
    expectedTimeframeDays: 14,
    effortScore: 25,
    ownerRole: "owner",
  },
  SOP_LOW_COVERAGE: {
    recommendationCode: "SOPREC_DOCUMENT_SOP",
    category: "document_sop",
    title: "Document the highest-frequency recurring process",
    requiredOwnerAction:
      "Pick the most-run undocumented process and write its SOP (purpose, steps, role, frequency, quality standard, verification method).",
    verificationMethod: "Re-measure sopCoveragePct next period; target above threshold.",
    expectedTimeframeDays: 21,
    effortScore: 40,
    ownerRole: "owner",
  },
  SOP_INVALID_CURRENCY: {
    recommendationCode: "SOPREC_FIX_CURRENCY",
    category: "improve_data_quality",
    title: "Set a valid reporting currency",
    requiredOwnerAction: "Set a valid 3–8 letter currency code on the snapshot.",
    verificationMethod: "Confirm currencyValid is true on the next snapshot.",
    expectedTimeframeDays: 3,
    effortScore: 10,
    ownerRole: "owner",
  },
  SOP_MISSING_CRITICAL_DATA: {
    recommendationCode: "SOPREC_IMPROVE_DATA_QUALITY",
    category: "improve_data_quality",
    title: "Provide missing execution inputs",
    requiredOwnerAction: "Enter the listed missing inputs to raise diagnosis confidence.",
    verificationMethod: "Re-measure dataConfidenceScore next snapshot; target higher.",
    expectedTimeframeDays: 7,
    effortScore: 20,
    ownerRole: "owner",
  },
  SOP_OPP_CLEAR_OVERDUE: {
    recommendationCode: "SOPREC_CLEAR_OVERDUE",
    category: "clear_overdue",
    title: "Clear the overdue backlog",
    requiredOwnerAction: "Work the overdue list down: unblock, reassign, or kill each item this week.",
    verificationMethod: "Re-measure overdueRatePct next period; target lower.",
    expectedTimeframeDays: 14,
    effortScore: 40,
    ownerRole: "owner",
  },
  SOP_OPP_CONVERT_TO_SOP: {
    recommendationCode: "SOPREC_ELIMINATE_REPEAT_FAILURE",
    category: "eliminate_repeat_failure",
    title: "Convert a repeated failure into an SOP",
    requiredOwnerAction: "Document the top recurring failure as an SOP with a quality standard so it stops recurring.",
    verificationMethod: "Re-measure repeatedFailureRatePct next period; target lower.",
    expectedTimeframeDays: 30,
    effortScore: 50,
    ownerRole: "owner",
  },
  SOP_OPP_CLOSE_COVERAGE_GAP: {
    recommendationCode: "SOPREC_DOCUMENT_SOP",
    category: "document_sop",
    title: "Document the next recurring process",
    requiredOwnerAction: "Write the SOP for the highest-frequency undocumented recurring process.",
    verificationMethod: "Re-measure sopCoveragePct next period; target higher.",
    expectedTimeframeDays: 21,
    effortScore: 40,
    ownerRole: "owner",
  },
  SOP_OPP_RAISE_VERIFICATION: {
    recommendationCode: "SOPREC_ENFORCE_VERIFICATION",
    category: "enforce_verification",
    title: "Verify more completed work",
    requiredOwnerAction: "Add a before/after check to more completed actions so activity becomes proven outcome.",
    verificationMethod: "Re-measure verificationRatePct next period; target higher.",
    expectedTimeframeDays: 21,
    effortScore: 35,
    ownerRole: "owner",
  },
  SOP_OPP_DATA_QUALITY: {
    recommendationCode: "SOPREC_IMPROVE_DATA_QUALITY",
    category: "improve_data_quality",
    title: "Improve data completeness",
    requiredOwnerAction: "Supply the missing/stale inputs to sharpen the execution diagnosis.",
    verificationMethod: "Re-measure dataConfidenceScore next snapshot; target higher.",
    expectedTimeframeDays: 7,
    effortScore: 20,
    ownerRole: "owner",
  },
};

/** Build a traceable recommendation from a finding, or null if no template. */
export function buildSopRecommendation(finding: OwnerFinding): SopRecommendation | null {
  const tpl = SOP_REC_TEMPLATES[finding.code];
  if (!tpl) return null;
  return {
    recommendationCode: tpl.recommendationCode,
    findingCode: finding.code,
    category: tpl.category,
    sourceMetric: finding.sourceMetric,
    sourceValue: finding.sourceValue ?? null, // never invented
    threshold: finding.threshold ?? null,
    severity: finding.severity,
    expectedExecImpactScore: clampScore(finding.impactScore),
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
export function buildSopRecommendations(findings: OwnerFinding[]): SopRecommendation[] {
  const recs: SopRecommendation[] = [];
  for (const f of findings) {
    const r = buildSopRecommendation(f);
    if (r) recs.push(r);
  }
  return recs;
}
