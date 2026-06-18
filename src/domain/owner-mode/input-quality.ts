/**
 * Owner Mode Input Quality Gate — Phase 5
 *
 * Deterministic scoring rules for input completeness and reliability.
 * No AI, no DB dependency. Pure typed business logic.
 *
 * Execution.md Phase 5: Input Quality Gate + Data Provenance.
 */

import { assertWorkspaceScopedQuery } from "./security-rules";

// ─── Input quality status ────────────────────────────────────────────────────

export type InputQualityStatus =
  | "complete"
  | "partial"
  | "data_limited"
  | "critical_missing"
  | "conflicting"
  | "stale"
  | "owner_estimate_only"
  | "unsafe_for_strong_recommendation";

// ─── Business input field registry ──────────────────────────────────────────

export type BusinessInputField =
  | "revenue"
  | "gross_margin"
  | "net_profit"
  | "cash_balance"
  | "cash_runway"
  | "debt_emi"
  | "receivables"
  | "payables"
  | "leads"
  | "conversion_rate"
  | "repeat_customers"
  | "churn_rate"
  | "complaints"
  | "capacity"
  | "staffing"
  | "marketing_spend"
  | "inventory"
  | "pricing"
  | "owner_constraints";

/** Fields that, when missing, block strong diagnosis. */
export const CRITICAL_FIELDS: ReadonlySet<BusinessInputField> = new Set([
  "revenue",
  "gross_margin",
  "net_profit",
  "cash_balance",
  "cash_runway",
]);

/** Fields that, when missing, block high-risk action recommendations. */
export const HIGH_RISK_ACTION_BLOCKING_FIELDS: ReadonlySet<BusinessInputField> =
  new Set(["cash_balance", "cash_runway", "debt_emi"]);

// ─── Input payload ───────────────────────────────────────────────────────────

export type FieldFreshness = "current" | "30d" | "90d" | "stale";

export interface InputFieldValue {
  field: BusinessInputField;
  value: number | string | null;
  isEstimate: boolean;
  freshness: FieldFreshness;
  /** If conflicting: second value provided by a different source */
  conflictingValue?: number | string;
}

export interface InputQualityAssessmentInput {
  workspaceId: string;
  fields: InputFieldValue[];
}

// ─── Assessment result ────────────────────────────────────────────────────────

export interface MissingFieldSummary {
  field: BusinessInputField;
  severity: "critical" | "high" | "medium" | "low";
  blocksStrongRecommendation: boolean;
  blocksHighRiskAction: boolean;
  description: string;
}

export interface InputQualityAssessmentResult {
  workspaceId: string;
  qualityStatus: InputQualityStatus;
  overallScore: number; // 0–100
  missingFields: MissingFieldSummary[];
  conflictFields: BusinessInputField[];
  staleFields: BusinessInputField[];
  allowsStrongRecommendation: boolean;
  allowsHighRiskAction: boolean;
  assessedBy: "InputQualityService";
}

// ─── Deterministic scoring rules ─────────────────────────────────────────────

function fieldSeverity(
  field: BusinessInputField
): "critical" | "high" | "medium" | "low" {
  if (CRITICAL_FIELDS.has(field)) return "critical";
  if (HIGH_RISK_ACTION_BLOCKING_FIELDS.has(field)) return "high";
  if (
    field === "leads" ||
    field === "conversion_rate" ||
    field === "churn_rate"
  )
    return "high";
  if (field === "owner_constraints") return "medium";
  return "low";
}

/**
 * Deterministically assess input quality.
 * All rules are tested. No AI involvement.
 */
export function assessInputQuality(
  input: InputQualityAssessmentInput
): InputQualityAssessmentResult {
  assertWorkspaceScopedQuery({ workspaceId: input.workspaceId });

  const providedFields = new Set(
    input.fields
      .filter((f) => f.value !== null && f.value !== undefined)
      .map((f) => f.field)
  );

  const missingFields: MissingFieldSummary[] = [];
  const conflictFields: BusinessInputField[] = [];
  const staleFields: BusinessInputField[] = [];
  let estimateOnlyCount = 0;

  for (const fv of input.fields) {
    // Track stale fields
    if (fv.freshness === "stale") {
      staleFields.push(fv.field);
    }

    // Track conflict fields
    if (
      fv.conflictingValue !== undefined &&
      fv.conflictingValue !== null &&
      fv.value !== fv.conflictingValue
    ) {
      conflictFields.push(fv.field);
    }

    // Track estimates
    if (fv.isEstimate) {
      estimateOnlyCount++;
    }
  }

  // Identify missing required fields
  const allRequiredFields: BusinessInputField[] = [
    "revenue",
    "gross_margin",
    "net_profit",
    "cash_balance",
    "cash_runway",
    "leads",
    "conversion_rate",
  ];

  for (const field of allRequiredFields) {
    if (!providedFields.has(field)) {
      missingFields.push({
        field,
        severity: fieldSeverity(field),
        blocksStrongRecommendation: CRITICAL_FIELDS.has(field),
        blocksHighRiskAction: HIGH_RISK_ACTION_BLOCKING_FIELDS.has(field),
        description: `${field} not provided — required for reliable diagnosis`,
      });
    }
  }

  // Determine quality status (priority order: most severe first)
  const hasCriticalMissing = missingFields.some(
    (f) => f.severity === "critical"
  );
  const hasConflicts = conflictFields.length > 0;
  const hasStale = staleFields.length > 0;
  const allEstimatesOnly =
    estimateOnlyCount > 0 &&
    input.fields.every((f) => f.isEstimate || f.value === null);
  const totalExpectedFields = allRequiredFields.length;
  const providedCount = allRequiredFields.filter((f) =>
    providedFields.has(f)
  ).length;
  const completionRatio = providedCount / totalExpectedFields;

  let qualityStatus: InputQualityStatus;

  if (hasConflicts) {
    qualityStatus = "conflicting";
  } else if (hasCriticalMissing) {
    qualityStatus = "critical_missing";
  } else if (hasStale && staleFields.some((f) => CRITICAL_FIELDS.has(f))) {
    qualityStatus = "stale";
  } else if (allEstimatesOnly) {
    qualityStatus = "owner_estimate_only";
  } else if (missingFields.length > 0 && completionRatio < 0.7) {
    qualityStatus = "data_limited";
  } else if (missingFields.length > 0) {
    qualityStatus = "partial";
  } else if (hasStale) {
    qualityStatus = "stale";
  } else {
    qualityStatus = "complete";
  }

  // If status is unsafe, override
  const isUnsafe =
    qualityStatus === "conflicting" ||
    qualityStatus === "critical_missing" ||
    (qualityStatus === "data_limited" && hasCriticalMissing);
  if (isUnsafe && qualityStatus !== "conflicting" && qualityStatus !== "critical_missing") {
    qualityStatus = "unsafe_for_strong_recommendation";
  }

  // Compute overall score
  let score = Math.round(completionRatio * 60); // completeness: up to 60 points
  if (!hasConflicts) score += 20; // no conflicts: +20
  if (!hasStale) score += 10; // no stale: +10
  if (estimateOnlyCount === 0) score += 10; // no estimates: +10
  score = Math.max(0, Math.min(100, score));

  // Guardrails
  const blockStrongRec =
    hasCriticalMissing ||
    hasConflicts ||
    qualityStatus === "unsafe_for_strong_recommendation";

  const blockHighRiskAction =
    blockStrongRec ||
    missingFields.some((f) => f.blocksHighRiskAction) ||
    staleFields.some((f) => HIGH_RISK_ACTION_BLOCKING_FIELDS.has(f));

  return {
    workspaceId: input.workspaceId,
    qualityStatus,
    overallScore: score,
    missingFields,
    conflictFields,
    staleFields,
    allowsStrongRecommendation: !blockStrongRec,
    allowsHighRiskAction: !blockHighRiskAction,
    assessedBy: "InputQualityService",
  };
}

// ─── Guardrail enforcement ────────────────────────────────────────────────────

/**
 * Throws if the assessment does not permit a strong recommendation.
 * Called before DiagnosisService to enforce the input quality gate.
 */
export function assertAllowsStrongRecommendation(
  assessment: InputQualityAssessmentResult
): void {
  if (!assessment.allowsStrongRecommendation) {
    throw new Error(
      `Input quality gate BLOCKED strong recommendation: status=${assessment.qualityStatus}, ` +
        `score=${assessment.overallScore}, ` +
        `missing=${assessment.missingFields.map((f) => f.field).join(",")}`
    );
  }
}

/**
 * Throws if the assessment does not permit a high-risk action.
 * Called before ActionService to enforce the cash/runway gate.
 */
export function assertAllowsHighRiskAction(
  assessment: InputQualityAssessmentResult
): void {
  if (!assessment.allowsHighRiskAction) {
    throw new Error(
      `Input quality gate BLOCKED high-risk action: status=${assessment.qualityStatus}, ` +
        `blocking fields=${assessment.missingFields
          .filter((f) => f.blocksHighRiskAction)
          .map((f) => f.field)
          .join(",")}`
    );
  }
}
