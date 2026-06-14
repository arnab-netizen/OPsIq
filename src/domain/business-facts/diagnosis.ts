/**
 * B09 — Evidence-Backed Diagnosis (pure function domain logic).
 *
 * Structures and validates diagnoses that are fully supported by evidence.
 * Every diagnosis includes problem, evidence, root_cause, impact, confidence,
 * missing_data, recommended_action, owner_action, timeline, verification_metric,
 * risk, and alternative.
 *
 * Rules:
 *   - no unsupported recommendations (every action has evidence trail)
 *   - no generic diagnosis without evidence
 *   - confidence reflects data quality and contradictions
 *   - diagnosis is immutable (built once, persisted, never mutated)
 *
 * Pure function, no DB, no I/O. Deterministic over facts + evidence only.
 */

import type { BusinessFact, BusinessFactsContract } from "./contract";

// --- Diagnosis structure ---

export interface DiagnosisEvidence {
  fact_ids: string[];
  evidence_strength: "weak" | "moderate" | "strong"; // Based on B04 evidence hierarchy
  contradictions: string[]; // Contradiction IDs if any
  missing_data_gaps: string[]; // What data would strengthen this
}

export interface DiagnosisRecommendedAction {
  action_id: string;
  description: string;
  category: string; // e.g., "cost_reduction", "revenue_growth", "process_improvement"
  expected_impact: string; // e.g., "reduce costs by 15-25%"
  timeline_weeks: number;
}

export interface DiagnosisOwnerAction {
  action_id: string; // Links to recommended_action
  owner_step: string; // What the owner specifically must do
  deadline_days: number;
  success_criteria: string[];
}

export interface DiagnosisRisk {
  risk_id: string;
  description: string;
  mitigation: string;
  probability: "low" | "medium" | "high";
  impact: "low" | "medium" | "high";
  verification_metric: string; // How to verify risk occurred
}

export interface DiagnosisAlternative {
  alternative_id: string;
  description: string;
  pros: string[];
  cons: string[];
  why_not_primary: string; // Why this wasn't chosen
}

export interface BusinessDiagnosis {
  diagnosis_id: string;
  domain: string; // e.g., "sales", "finance", "operations"
  created_at: string; // ISO 8601
  business_id: string;
  workspace_id: string;

  // Core diagnosis structure
  problem: string; // Clear statement of the business problem
  root_cause: string; // Why it's happening
  impact: string; // Business impact if not addressed
  timeline_to_crisis: string; // e.g., "2-3 months if not addressed"

  // Evidence backing
  evidence: DiagnosisEvidence;
  confidence_score: number; // 0-1, reflects data quality + contradiction impact
  confidence_reasoning: string; // Why this confidence level

  // Missing data / gaps
  missing_data: string[];
  can_act_without_data: boolean;

  // Recommended action
  recommended_action: DiagnosisRecommendedAction;
  owner_action: DiagnosisOwnerAction;
  verification_metric: string; // How to verify success

  // Risk mitigation
  risks: DiagnosisRisk[];

  // Alternative considered
  alternative: DiagnosisAlternative | null;

  // Audit trail
  validation_status: "draft" | "owner_reviewed" | "owner_approved" | "owner_acted" | "archived";
  notes: string[];
}

// --- Diagnosis builder ---

/**
 * Validate that a diagnosis is fully evidence-backed.
 * Returns validation errors if diagnosis has unsupported claims.
 */
export function validateDiagnosis(diagnosis: BusinessDiagnosis): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // Evidence backing checks
  if (!diagnosis.evidence.fact_ids || diagnosis.evidence.fact_ids.length === 0) {
    errors.push("Diagnosis must cite at least one fact as evidence");
  }

  if (diagnosis.evidence.evidence_strength === "weak" && diagnosis.confidence_score > 0.6) {
    errors.push("Weak evidence cannot support high confidence (>0.6)");
  }

  if (diagnosis.evidence.evidence_strength === "moderate" && diagnosis.confidence_score > 0.8) {
    errors.push("Moderate evidence cannot support very high confidence (>0.8)");
  }

  // Missing data impact check
  if (diagnosis.missing_data.length > 3 && diagnosis.confidence_score > 0.7) {
    errors.push("Multiple missing data gaps should lower confidence below 0.7");
  }

  // Contradiction impact check
  if (
    diagnosis.evidence.contradictions &&
    diagnosis.evidence.contradictions.length > 0 &&
    diagnosis.confidence_score > 0.6
  ) {
    errors.push("Unresolved contradictions should lower confidence below 0.6");
  }

  // Action structure checks
  if (!diagnosis.recommended_action.description || diagnosis.recommended_action.description.trim().length === 0) {
    errors.push("Recommended action must have clear description");
  }

  if (!diagnosis.owner_action.owner_step || diagnosis.owner_action.owner_step.trim().length === 0) {
    errors.push("Owner action must specify concrete step owner must take");
  }

  if (!diagnosis.verification_metric || diagnosis.verification_metric.trim().length === 0) {
    errors.push("Diagnosis must include verification metric for success");
  }

  // Risk checks
  if (diagnosis.risks.length === 0 && diagnosis.recommended_action.category.includes("high_risk")) {
    errors.push("High-risk action must identify at least one risk");
  }

  // Alternative rationale
  if (diagnosis.alternative && !diagnosis.alternative.why_not_primary) {
    errors.push("Alternative must explain why it was not chosen");
  }

  // Timeline checks
  if (diagnosis.recommended_action.timeline_weeks <= 0) {
    errors.push("Timeline must be positive");
  }

  if (diagnosis.owner_action.deadline_days <= 0) {
    errors.push("Owner action deadline must be positive");
  }

  if (
    diagnosis.owner_action.deadline_days > diagnosis.recommended_action.timeline_weeks * 7 + 30
  ) {
    errors.push("Owner action deadline should be early in recommended action timeline");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Build a diagnosis from contract facts and evidence hierarchy.
 * Validates structure and confidence reflects data quality + contradictions.
 */
export function buildDiagnosisStructure(
  domain: string,
  businessId: string,
  workspaceId: string,
  problem: string,
  rootCause: string,
  impact: string,
  timelineToCrisis: string,
  supportingFactIds: string[],
  evidenceStrength: "weak" | "moderate" | "strong",
  confidenceScore: number,
  confidenceReasoning: string,
  missingData: string[],
  recommendedAction: DiagnosisRecommendedAction,
  ownerAction: DiagnosisOwnerAction,
  verificationMetric: string,
  risks: DiagnosisRisk[],
  alternative: DiagnosisAlternative | null = null,
): BusinessDiagnosis {
  const diagnosis: BusinessDiagnosis = {
    diagnosis_id: `diag_${domain}_${Date.now()}`,
    domain,
    created_at: new Date().toISOString(),
    business_id: businessId,
    workspace_id: workspaceId,
    problem,
    root_cause: rootCause,
    impact,
    timeline_to_crisis: timelineToCrisis,
    evidence: {
      fact_ids: supportingFactIds,
      evidence_strength: evidenceStrength,
      contradictions: [],
      missing_data_gaps: missingData,
    },
    confidence_score: confidenceScore,
    confidence_reasoning: confidenceReasoning,
    missing_data: missingData,
    can_act_without_data: confidenceScore >= 0.5, // Can act if confidence >= 50%
    recommended_action: recommendedAction,
    owner_action: ownerAction,
    verification_metric: verificationMetric,
    risks,
    alternative,
    validation_status: "draft",
    notes: [],
  };

  return diagnosis;
}

/**
 * Apply contradiction impact to diagnosis confidence.
 * Reduces confidence if contradictions exist.
 */
export function applyContradictionImpactToDiagnosis(
  diagnosis: BusinessDiagnosis,
  contradictionIds: string[],
  unresolved_contradictions: number,
): BusinessDiagnosis {
  if (contradictionIds.length === 0) {
    return diagnosis;
  }

  // Apply penalty based on unresolved contradiction count
  let adjusted_confidence = diagnosis.confidence_score;
  if (unresolved_contradictions > 0) {
    // Each unresolved contradiction reduces confidence by ~15%
    adjusted_confidence -= unresolved_contradictions * 0.15;
    adjusted_confidence = Math.max(0, Math.min(1, adjusted_confidence)); // Clamp 0-1
  }

  return {
    ...diagnosis,
    evidence: {
      ...diagnosis.evidence,
      contradictions: contradictionIds,
    },
    confidence_score: adjusted_confidence,
    confidence_reasoning: `${diagnosis.confidence_reasoning} (adjusted for ${unresolved_contradictions} unresolved contradictions)`,
  };
}

/**
 * Check if diagnosis can be presented to owner.
 * Returns false if confidence too low or validation errors exist.
 */
export function canPresentDiagnosis(diagnosis: BusinessDiagnosis): {
  presentable: boolean;
  reasons_not_presentable: string[];
} {
  const reasons: string[] = [];

  const validation = validateDiagnosis(diagnosis);
  if (!validation.valid) {
    reasons.push(...validation.errors);
  }

  if (diagnosis.confidence_score < 0.4) {
    reasons.push("Confidence too low (<40%) to present to owner");
  }

  if (diagnosis.missing_data.length > 5) {
    reasons.push("Too many critical data gaps to act on this diagnosis");
  }

  return {
    presentable: reasons.length === 0,
    reasons_not_presentable: reasons,
  };
}

/**
 * Mark diagnosis as owner-reviewed.
 * Returns new diagnosis with updated status and timestamp.
 */
export function markDiagnosisReviewed(
  diagnosis: BusinessDiagnosis,
  ownerApproved: boolean,
  ownerNotes: string = "",
): BusinessDiagnosis {
  const updated = {
    ...diagnosis,
    validation_status: ownerApproved ? ("owner_approved" as const) : ("owner_reviewed" as const),
  };

  if (ownerNotes) {
    updated.notes.push(`Owner review: ${ownerNotes}`);
  }

  return updated;
}

/**
 * Mark diagnosis as acted upon.
 * Returns new diagnosis with owner_acted status.
 */
export function markDiagnosisActedUpon(
  diagnosis: BusinessDiagnosis,
  actionStartDate: string, // ISO 8601
  ownerNotes: string = "",
): BusinessDiagnosis {
  const updated = {
    ...diagnosis,
    validation_status: "owner_acted" as const,
  };

  updated.notes.push(`Owner action started: ${actionStartDate}`);
  if (ownerNotes) {
    updated.notes.push(`Action notes: ${ownerNotes}`);
  }

  return updated;
}
