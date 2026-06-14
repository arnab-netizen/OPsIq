/**
 * B12 — Business Condition Profile Evaluation (pure function domain logic).
 *
 * Evaluates business condition based on diagnosis, harm guardrails, owner constraints,
 * and KPI profiles. Produces immutable BusinessConditionProfile assessment ready
 * for persistence and recommendation hardening.
 *
 * Rules:
 *   - no DB, no I/O, deterministic over facts + diagnosis only
 *   - condition_score computed as weighted average of 4 health dimensions
 *   - risk_factors and strengths identified from diagnosis + guardrails
 *   - transition detection: identifies when condition changed (triggers adaptive re-eval)
 *   - immutable after creation (built once, persisted as-is)
 *
 * Pure function, no DB, no I/O. Deterministic over diagnosis + guardrails only.
 */

import type { BusinessDiagnosis } from "./diagnosis";
import type { HarmRiskAssessment } from "./harm-guardrails";
import type { OwnerConstraintViolation } from "./owner-constraints";
import type { KPIProfile } from "./kpi-profiles";

// --- Business Condition Profile Assessment ---

export interface HealthScores {
  owner_health_score: number; // 0-100
  team_health_score: number; // 0-100
  customer_health_score: number; // 0-100
  financial_health_score: number; // 0-100
}

export interface BusinessConditionProfileAssessment {
  condition_score: number; // 0-100 overall
  health_scores: HealthScores;
  condition_status: "critical" | "stressed" | "stable" | "healthy" | "thriving";
  risk_factors: string[];
  strengths: string[];
  urgency_level: "low" | "medium" | "high" | "critical";
  hardening_pressure: "minimal" | "low" | "normal" | "high" | "maximum";
}

export interface ConditionTransition {
  changed: boolean;
  previous_status: string | null;
  new_status: string;
  severity_increased: boolean;
  requires_adaptive_reevaluation: boolean;
  transition_reason: string;
}

// --- Evaluation Logic ---

/**
 * Score owner health (0-100) based on diagnosis owner constraints.
 * Considers: availability, commitment, burnout risk, bottleneck status.
 */
export function scoreOwnerHealth(
  diagnosis: BusinessDiagnosis,
  constraints: OwnerConstraintViolation[],
): number {
  let score = 50;

  // Constraint violations reduce score
  const critical_constraints = constraints.filter((c) => c.severity === "critical");
  const high_constraints = constraints.filter((c) => c.severity === "high");

  score -= critical_constraints.length * 20;
  score -= high_constraints.length * 10;

  // Confidence in diagnosis reflects owner's ability to execute
  if (diagnosis.confidence_score >= 0.8) {
    score += 10;
  } else if (diagnosis.confidence_score < 0.4) {
    score -= 15;
  }

  // Owner action feasibility
  if (
    diagnosis.owner_action.deadline_days > 30 ||
    diagnosis.owner_action.deadline_days < 3
  ) {
    score -= 5; // Unrealistic timeline indicates risk
  }

  return Math.max(0, Math.min(100, Math.round(score)));
}

/**
 * Score team health (0-100) based on KPI profile execution capacity.
 * Considers: process maturity, management maturity, execution capacity.
 */
export function scoreTeamHealth(kpiProfile: KPIProfile): number {
  let score = 50;

  // Process maturity level contributes +10 to +30
  const processScore =
    kpiProfile.action_patterns && Array.isArray(kpiProfile.action_patterns)
      ? Math.min(30, kpiProfile.action_patterns.length * 5)
      : 15;
  score += processScore;

  // Adjust based on failure modes (high count = low resilience)
  const failureModeCount =
    kpiProfile.failure_modes && Array.isArray(kpiProfile.failure_modes)
      ? kpiProfile.failure_modes.length
      : 0;
  score -= Math.min(20, failureModeCount * 3);

  return Math.max(0, Math.min(100, Math.round(score)));
}

/**
 * Score customer health (0-100) based on KPI profile benchmarks and critical ratios.
 * Considers: NPS if available, churn trends, market position.
 */
export function scoreCustomerHealth(kpiProfile: KPIProfile): number {
  let score = 50;

  // Benchmarks indicate performance vs industry
  if (
    kpiProfile.benchmarks &&
    typeof kpiProfile.benchmarks === "object" &&
    !Array.isArray(kpiProfile.benchmarks)
  ) {
    // Higher benchmark scores indicate strong market position
    const benchmarkCount = Object.keys(kpiProfile.benchmarks).length;
    if (benchmarkCount > 3) {
      score += 15;
    }
  }

  // Critical ratios reflect business stability
  if (
    kpiProfile.critical_ratios &&
    typeof kpiProfile.critical_ratios === "object" &&
    !Array.isArray(kpiProfile.critical_ratios)
  ) {
    const ratioCount = Object.keys(kpiProfile.critical_ratios).length;
    if (ratioCount > 2) {
      score += 10;
    }
  }

  return Math.max(0, Math.min(100, Math.round(score)));
}

/**
 * Score financial health (0-100) based on diagnosis evidence and impact assessment.
 * Considers: missing data gaps (uncertainty), impact severity, confidence.
 */
export function scoreFinancialHealth(diagnosis: BusinessDiagnosis): number {
  let score = 50;

  // Missing data reduces confidence in financial assessment
  score -= Math.min(20, diagnosis.missing_data.length * 3);

  // Diagnosis problem severity affects financial health
  if (diagnosis.impact.toLowerCase().includes("critical")) {
    score -= 25;
  } else if (diagnosis.impact.toLowerCase().includes("significant")) {
    score -= 15;
  }

  // Confidence in diagnosis directly reflects financial visibility
  score += Math.round((diagnosis.confidence_score - 0.5) * 20); // -10 to +10

  return Math.max(0, Math.min(100, Math.round(score)));
}

/**
 * Compute overall condition score (0-100) as weighted average of health dimensions.
 * Weights: owner 25%, team 20%, customer 20%, financial 35% (survival most critical).
 */
export function computeConditionScore(scores: HealthScores): number {
  const weighted =
    scores.owner_health_score * 0.25 +
    scores.team_health_score * 0.2 +
    scores.customer_health_score * 0.2 +
    scores.financial_health_score * 0.35;

  return Math.round(weighted);
}

/**
 * Map condition score to categorical status.
 */
export function scoreToConditionStatus(
  score: number,
): "critical" | "stressed" | "stable" | "healthy" | "thriving" {
  if (score < 20) return "critical";
  if (score < 40) return "stressed";
  if (score < 60) return "stable";
  if (score < 80) return "healthy";
  return "thriving";
}

/**
 * Determine urgency level from condition status.
 */
export function statusToUrgency(
  status: "critical" | "stressed" | "stable" | "healthy" | "thriving",
): "low" | "medium" | "high" | "critical" {
  switch (status) {
    case "critical":
      return "critical";
    case "stressed":
      return "high";
    case "stable":
      return "medium";
    case "healthy":
    case "thriving":
      return "low";
  }
}

/**
 * Determine hardening pressure (risk adjustment) from condition status.
 */
export function statusToHardeningPressure(
  status: "critical" | "stressed" | "stable" | "healthy" | "thriving",
): "minimal" | "low" | "normal" | "high" | "maximum" {
  switch (status) {
    case "critical":
      return "maximum";
    case "stressed":
      return "high";
    case "stable":
      return "normal";
    case "healthy":
      return "low";
    case "thriving":
      return "minimal";
  }
}

/**
 * Identify risk factors from diagnosis and harm guardrails.
 */
export function identifyRiskFactors(
  diagnosis: BusinessDiagnosis,
  harmRisks: HarmRiskAssessment,
): string[] {
  const risks: string[] = [];

  // Diagnosis-based risks
  if (diagnosis.evidence.contradictions && diagnosis.evidence.contradictions.length > 0) {
    risks.push(
      `Unresolved contradictions in evidence (${diagnosis.evidence.contradictions.length})`,
    );
  }

  if (diagnosis.missing_data.length > 3) {
    risks.push(`Critical data gaps (${diagnosis.missing_data.length} items)`);
  }

  if (diagnosis.confidence_score < 0.5) {
    risks.push("Low confidence in diagnosis (<50%)");
  }

  // Harm guardrail risks
  if (harmRisks.cash_impact && harmRisks.cash_impact.severity === "critical") {
    risks.push("Critical cash impact risk");
  }

  if (harmRisks.margin_impact && harmRisks.margin_impact.severity === "critical") {
    risks.push("Critical margin impact risk");
  }

  if (harmRisks.team_capacity && harmRisks.team_capacity.severity === "critical") {
    risks.push("Critical team capacity risk");
  }

  if (harmRisks.owner_burnout && harmRisks.owner_burnout.severity === "critical") {
    risks.push("Critical owner burnout risk");
  }

  // Timeline risks
  if (
    diagnosis.recommended_action.timeline_weeks > 12 &&
    diagnosis.timeline_to_crisis.toLowerCase().includes("month")
  ) {
    risks.push("Timeline mismatch: action takes longer than crisis window");
  }

  return risks;
}

/**
 * Identify strengths from diagnosis confidence and constraint viability.
 */
export function identifyStrengths(
  diagnosis: BusinessDiagnosis,
  constraints: OwnerConstraintViolation[],
): string[] {
  const strengths: string[] = [];

  if (diagnosis.confidence_score >= 0.8) {
    strengths.push("Strong evidence backing for diagnosis");
  }

  if (diagnosis.can_act_without_data) {
    strengths.push("Can proceed without additional data");
  }

  const critical_constraints = constraints.filter((c) => c.severity === "critical");
  if (critical_constraints.length === 0) {
    strengths.push("No critical owner constraint violations");
  }

  if (diagnosis.alternative && diagnosis.alternative.why_not_primary) {
    strengths.push("Multiple options considered and documented");
  }

  if (diagnosis.risks.length > 0) {
    strengths.push("Risks identified and mitigation planned");
  }

  return strengths;
}

/**
 * Evaluate business condition profile from diagnosis + guardrails + constraints + KPI profile.
 * Returns immutable assessment ready for persistence.
 */
export function evaluateBusinessConditionProfile(
  diagnosis: BusinessDiagnosis,
  harmRisks: HarmRiskAssessment,
  constraints: OwnerConstraintViolation[],
  kpiProfile: KPIProfile,
): BusinessConditionProfileAssessment {
  // Compute health scores
  const owner_health_score = scoreOwnerHealth(diagnosis, constraints);
  const team_health_score = scoreTeamHealth(kpiProfile);
  const customer_health_score = scoreCustomerHealth(kpiProfile);
  const financial_health_score = scoreFinancialHealth(diagnosis);

  const health_scores: HealthScores = {
    owner_health_score,
    team_health_score,
    customer_health_score,
    financial_health_score,
  };

  // Compute overall condition score
  const condition_score = computeConditionScore(health_scores);

  // Map to status
  const condition_status = scoreToConditionStatus(condition_score);

  // Determine urgency and hardening
  const urgency_level = statusToUrgency(condition_status);
  const hardening_pressure = statusToHardeningPressure(condition_status);

  // Identify risks and strengths
  const risk_factors = identifyRiskFactors(diagnosis, harmRisks);
  const strengths = identifyStrengths(diagnosis, constraints);

  return {
    condition_score,
    health_scores,
    condition_status,
    risk_factors,
    strengths,
    urgency_level,
    hardening_pressure,
  };
}

/**
 * Detect condition transition (status change) between assessments.
 * Returns transition details for adaptive re-evaluation trigger.
 */
export function evaluateConditionTransition(
  previousStatus: string | null,
  newStatus: string,
  previousScore: number | null,
  newScore: number,
): ConditionTransition {
  const changed = previousStatus !== newStatus;

  // Severity increased if moving toward critical or within critical tier
  const severity_increased =
    !previousStatus || // First time assessment
    (previousStatus === "thriving" &&
      ["healthy", "stable", "stressed", "critical"].includes(newStatus)) ||
    (previousStatus === "healthy" && ["stable", "stressed", "critical"].includes(newStatus)) ||
    (previousStatus === "stable" && ["stressed", "critical"].includes(newStatus)) ||
    (previousStatus === "stressed" && newStatus === "critical") ||
    (previousStatus === newStatus &&
      (previousScore === null || newScore < previousScore - 5)); // Score declined significantly

  const requires_adaptive_reevaluation =
    changed || // Status changed
    severity_increased || // Became more severe
    (previousScore !== null && newScore < 40); // Below stress threshold

  let transition_reason = "Condition reassessment";
  if (!previousStatus) {
    transition_reason = "Initial business condition profile";
  } else if (previousStatus !== newStatus) {
    transition_reason = `Status transition: ${previousStatus} → ${newStatus}`;
  } else if (newScore < 40) {
    transition_reason = "Condition in stressed/critical state";
  } else if (severity_increased) {
    transition_reason = `Severity increase: score ${previousScore} → ${newScore}`;
  }

  return {
    changed,
    previous_status: previousStatus || null,
    new_status: newStatus,
    severity_increased,
    requires_adaptive_reevaluation,
    transition_reason,
  };
}
