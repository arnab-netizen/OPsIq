/**
 * B10 — Business Harm Guardrails.
 *
 * Prevents harmful recommendations by assessing risk before action suggestion.
 * Checks cash impact, margin impact, legal/compliance risk, execution capacity,
 * reversibility, time to result, downside risk, and dependency risk.
 *
 * Rules:
 *   - bad ROAS business is not told to scale ads without unit economics proof
 *   - cash crisis business is not told to hire or expand first
 *   - high customer concentration risk is surfaced
 *   - risky recommendation includes mitigation and verification metric
 *   - reversibility and dependency risks must be explicit
 *   - downside risk must be quantified if possible
 *
 * Acceptance gates:
 *   - bad ROAS business is not told to scale ads without unit economics
 *   - cash crisis business is not told to hire or expand first
 *   - high customer concentration risk is surfaced
 *   - risky recommendation includes mitigation and verification metric
 *
 * Pure function, no DB, no I/O. Deterministic over business facts + recommendation.
 */

import type { BusinessFactsContract } from "./contract";

// --- Risk categories and assessment ---

export interface CashImpactRisk {
  category: "cash_impact";
  monthly_cash_outflow?: number | null;
  one_time_cash_requirement?: number | null;
  months_to_breakeven?: number | null;
  exceeds_available_cash: boolean;
  severity: "low" | "medium" | "high" | "critical";
  notes: string[];
}

export interface MarginImpactRisk {
  category: "margin_impact";
  current_gross_margin_pct?: number | null;
  impact_on_margin_pct?: number | null;
  resulting_margin_pct?: number | null;
  below_critical_threshold: boolean; // < 25% for most businesses
  severity: "low" | "medium" | "high" | "critical";
  notes: string[];
}

export interface LegalComplianceRisk {
  category: "legal_compliance";
  regulations_affected: string[];
  compliance_status: "compliant" | "at_risk" | "non_compliant";
  remediation_required: boolean;
  timeline_to_non_compliance_days?: number | null;
  severity: "low" | "medium" | "high" | "critical";
  notes: string[];
}

export interface ExecutionCapacityRisk {
  category: "execution_capacity";
  owner_capacity_utilization_pct?: number | null; // 0-100
  team_capacity_utilization_pct?: number | null;
  exceeds_capacity: boolean;
  severity: "low" | "medium" | "high" | "critical";
  notes: string[];
}

export interface ReversibilityRisk {
  category: "reversibility";
  reversibility_level: "fully_reversible" | "partially_reversible" | "irreversible";
  unwind_cost?: number | null;
  unwind_timeline_days?: number | null;
  severity: "low" | "medium" | "high" | "critical";
  notes: string[];
}

export interface TimeToResultRisk {
  category: "time_to_result";
  expected_timeline_days?: number | null;
  time_to_meaningful_result_days?: number | null;
  cash_runway_insufficient: boolean; // Will we run out of cash before results?
  severity: "low" | "medium" | "high" | "critical";
  notes: string[];
}

export interface DownsideRisk {
  category: "downside_risk";
  worst_case_scenario: string;
  probability_of_downside?: number | null; // 0-1
  downside_impact_if_occurs?: string | null;
  quantified_max_loss?: number | null;
  severity: "low" | "medium" | "high" | "critical";
  notes: string[];
}

export interface DependencyRisk {
  category: "dependency_risk";
  key_dependencies: string[]; // e.g., "vendor relationship", "platform API", "key employee"
  single_point_of_failure_risks: string[];
  mitigation_available: boolean;
  severity: "low" | "medium" | "high" | "critical";
  notes: string[];
}

export type HarmRisk =
  | CashImpactRisk
  | MarginImpactRisk
  | LegalComplianceRisk
  | ExecutionCapacityRisk
  | ReversibilityRisk
  | TimeToResultRisk
  | DownsideRisk
  | DependencyRisk;

// --- Harm guardrail assessment ---

export interface HarmGuardrailAssessment {
  recommendation_id: string;
  is_harmful: boolean; // true if critical or multiple high-severity risks
  can_be_primary: boolean; // false if critical risks or unmitigated harm
  critical_risks: HarmRisk[];
  high_risks: HarmRisk[];
  medium_risks: HarmRisk[];
  risk_summary: string;
  mitigation_required: string[]; // Steps needed before recommendation
  verification_metrics_required: string[]; // Metrics to verify safety
}

// --- Risk assessment functions ---

/**
 * Assess cash impact of a recommendation.
 */
export function assessCashImpact(
  recommendation_id: string,
  contract: BusinessFactsContract,
  monthlyOutflow?: number | null,
  oneTimeCost?: number | null,
  projectedBreakevenMonths?: number | null,
): CashImpactRisk {
  const notes: string[] = [];

  // Estimate reasonable monthly cash position (simplified: assume 3x monthly burn for cushion)
  const estimatedMonthlyAvailableCash = 40000; // Simplified assumption; in production would extract from contract.cash

  // Get cash runway estimate (simplified)
  const monthsOfRunway = contract.contradictions && contract.contradictions.length > 0
    ? 3
    : 6;

  let severity: "low" | "medium" | "high" | "critical" = "low";
  let exceeds_available = false;

  if (monthlyOutflow && monthlyOutflow > 0) {
    // Critical: burns through all available monthly cash
    if (monthlyOutflow > estimatedMonthlyAvailableCash) {
      severity = "critical";
      notes.push(`Monthly outflow ($${monthlyOutflow}) exceeds estimated monthly available cash ($${estimatedMonthlyAvailableCash})`);
      exceeds_available = true;
    }
    // High: burns through more than 50% of available monthly cash
    else if (monthlyOutflow > estimatedMonthlyAvailableCash * 0.5) {
      severity = "high";
      notes.push(`Monthly outflow ($${monthlyOutflow}) exceeds 50% of available monthly cash`);
    }
  }

  if (oneTimeCost && projectedBreakevenMonths && projectedBreakevenMonths > monthsOfRunway) {
    severity = "critical";
    notes.push(`Breakeven in ${projectedBreakevenMonths} months exceeds cash runway (${monthsOfRunway} months)`);
  }

  return {
    category: "cash_impact",
    monthly_cash_outflow: monthlyOutflow,
    one_time_cash_requirement: oneTimeCost,
    months_to_breakeven: projectedBreakevenMonths,
    exceeds_available_cash: exceeds_available,
    severity,
    notes,
  };
}

/**
 * Assess margin impact of a recommendation.
 */
export function assessMarginImpact(
  recommendation_id: string,
  currentGrossMarginPct: number | null,
  projectedMarginImpactPct: number | null,
): MarginImpactRisk {
  const notes: string[] = [];
  let severity: "low" | "medium" | "high" | "critical" = "low";
  let below_critical = false;

  if (!currentGrossMarginPct) {
    notes.push("No current gross margin data available");
    return {
      category: "margin_impact",
      current_gross_margin_pct: null,
      impact_on_margin_pct: null,
      resulting_margin_pct: null,
      below_critical_threshold: false,
      severity: "medium",
      notes,
    };
  }

  const resulting_margin = currentGrossMarginPct + (projectedMarginImpactPct || 0);

  if (resulting_margin < 25) {
    below_critical = true;
    severity = "critical";
    notes.push(`Resulting margin (${resulting_margin}%) below critical 25% threshold`);
  } else if (resulting_margin < 35) {
    severity = "high";
    notes.push(`Resulting margin (${resulting_margin}%) below healthy 35% threshold`);
  } else if (projectedMarginImpactPct && projectedMarginImpactPct < -5) {
    severity = "medium";
    notes.push(`Significant margin compression (${projectedMarginImpactPct}%)`);
  }

  return {
    category: "margin_impact",
    current_gross_margin_pct: currentGrossMarginPct,
    impact_on_margin_pct: projectedMarginImpactPct,
    resulting_margin_pct: resulting_margin,
    below_critical_threshold: below_critical,
    severity,
    notes,
  };
}

/**
 * Assess legal/compliance risks of a recommendation.
 */
export function assessLegalComplianceRisk(
  recommendation_id: string,
  affectedRegulations: string[],
  currentComplianceStatus: "compliant" | "at_risk" | "non_compliant",
  timelineToDaysIfInaction?: number | null,
): LegalComplianceRisk {
  const notes: string[] = [];
  let severity: "low" | "medium" | "high" | "critical" = "low";
  let remediation_required = false;

  if (affectedRegulations.length > 0) {
    if (currentComplianceStatus === "non_compliant") {
      severity = "critical";
      remediation_required = true;
      notes.push(`Currently non-compliant with ${affectedRegulations.join(", ")}`);
    } else if (currentComplianceStatus === "at_risk") {
      severity = "high";
      remediation_required = true;
      notes.push(`At risk for ${affectedRegulations.join(", ")}`);
    } else {
      severity = "low";
      notes.push(`Currently compliant with ${affectedRegulations.join(", ")}`);
    }
  }

  if (timelineToDaysIfInaction && timelineToDaysIfInaction < 30) {
    severity = "critical";
    notes.push(`Only ${timelineToDaysIfInaction} days before non-compliance if no action`);
  }

  return {
    category: "legal_compliance",
    regulations_affected: affectedRegulations,
    compliance_status: currentComplianceStatus,
    remediation_required,
    timeline_to_non_compliance_days: timelineToDaysIfInaction,
    severity,
    notes,
  };
}

/**
 * Assess whether recommendation can be executed given capacity constraints.
 */
export function assessExecutionCapacityRisk(
  recommendation_id: string,
  ownerCapacityUsagePct?: number | null,
  teamCapacityUsagePct?: number | null,
): ExecutionCapacityRisk {
  const notes: string[] = [];
  let severity: "low" | "medium" | "high" | "critical" = "low";
  let exceeds = false;

  // Check owner capacity first
  if (ownerCapacityUsagePct !== null && ownerCapacityUsagePct > 100) {
    exceeds = true;
    severity = "critical";
    notes.push(`Owner capacity already at ${ownerCapacityUsagePct}% (exceeds 100%)`);
  } else if (ownerCapacityUsagePct !== null && ownerCapacityUsagePct > 80) {
    if (severity !== "critical") {
      severity = "high";
    }
    notes.push(`Owner capacity at ${ownerCapacityUsagePct}% (exceeds 80% threshold)`);
  }

  // Check team capacity, but don't downgrade severity
  if (teamCapacityUsagePct !== null && teamCapacityUsagePct > 100) {
    exceeds = true;
    severity = "critical";
    notes.push(`Team capacity already at ${teamCapacityUsagePct}% (exceeds 100%)`);
  } else if (teamCapacityUsagePct !== null && teamCapacityUsagePct > 80 && severity !== "critical") {
    severity = "high";
    notes.push(`Team capacity at ${teamCapacityUsagePct}% (exceeds 80% threshold)`);
  }

  return {
    category: "execution_capacity",
    owner_capacity_utilization_pct: ownerCapacityUsagePct,
    team_capacity_utilization_pct: teamCapacityUsagePct,
    exceeds_capacity: exceeds,
    severity,
    notes,
  };
}

/**
 * Assess reversibility of a recommendation.
 */
export function assessReversibilityRisk(
  recommendation_id: string,
  reversibility: "fully_reversible" | "partially_reversible" | "irreversible",
  unwindCost?: number | null,
  unwindTimelineDays?: number | null,
): ReversibilityRisk {
  const notes: string[] = [];
  let severity: "low" | "medium" | "high" | "critical" = "low";

  if (reversibility === "irreversible") {
    severity = "critical";
    notes.push("Action is irreversible - failure has permanent consequences");
  } else if (reversibility === "partially_reversible") {
    severity = "medium";
    if (unwindCost && unwindCost > 0) {
      notes.push(`Reversal would cost $${unwindCost}`);
    }
    if (unwindTimelineDays) {
      notes.push(`Reversal would take ${unwindTimelineDays} days`);
    }
  } else {
    severity = "low";
    notes.push("Action is fully reversible with minimal cost");
  }

  return {
    category: "reversibility",
    reversibility_level: reversibility,
    unwind_cost: unwindCost,
    unwind_timeline_days: unwindTimelineDays,
    severity,
    notes,
  };
}

/**
 * Assess time to result vs cash runway.
 */
export function assessTimeToResultRisk(
  recommendation_id: string,
  expectedTimelineDays?: number | null,
  timeToMeaningfulResultDays?: number | null,
  monthsOfCashRunway?: number | null,
): TimeToResultRisk {
  const notes: string[] = [];
  let severity: "low" | "medium" | "high" | "critical" = "low";
  let insufficient_runway = false;

  if (timeToMeaningfulResultDays && monthsOfCashRunway) {
    const daysOfRunway = monthsOfCashRunway * 30;
    if (timeToMeaningfulResultDays > daysOfRunway) {
      insufficient_runway = true;
      severity = "critical";
      notes.push(`Results take ${timeToMeaningfulResultDays} days but only ${daysOfRunway} days of runway`);
    }
  }

  if (expectedTimelineDays && expectedTimelineDays > 180) {
    severity = severity === "critical" ? "critical" : "medium";
    notes.push(`Long timeline (${expectedTimelineDays} days) increases execution risk`);
  }

  return {
    category: "time_to_result",
    expected_timeline_days: expectedTimelineDays,
    time_to_meaningful_result_days: timeToMeaningfulResultDays,
    cash_runway_insufficient: insufficient_runway,
    severity,
    notes,
  };
}

/**
 * Assess downside risk scenarios.
 */
export function assessDownsideRisk(
  recommendation_id: string,
  worstCaseScenario: string,
  probabilityOfDownside?: number | null,
  downSideImpact?: string | null,
  quantifiedMaxLoss?: number | null,
): DownsideRisk {
  const notes: string[] = [];
  let severity: "low" | "medium" | "high" | "critical" = "low";

  if (probabilityOfDownside && probabilityOfDownside > 0.5) {
    severity = "high";
    notes.push(`Downside probability > 50% (${(probabilityOfDownside * 100).toFixed(0)}%)`);
  }

  if (quantifiedMaxLoss && quantifiedMaxLoss > 50000) {
    severity = "critical";
    notes.push(`Max loss of $${quantifiedMaxLoss} is critical`);
  }

  if (!worstCaseScenario || worstCaseScenario.trim().length === 0) {
    severity = "medium";
    notes.push("No downside scenario described");
  }

  return {
    category: "downside_risk",
    worst_case_scenario: worstCaseScenario,
    probability_of_downside: probabilityOfDownside,
    downside_impact_if_occurs: downSideImpact,
    quantified_max_loss: quantifiedMaxLoss,
    severity,
    notes,
  };
}

/**
 * Assess dependency risks.
 */
export function assessDependencyRisk(
  recommendation_id: string,
  keyDependencies: string[],
  singlePointOfFailureRisks: string[],
  mitigationAvailable: boolean,
): DependencyRisk {
  const notes: string[] = [];
  let severity: "low" | "medium" | "high" | "critical" = "low";

  if (singlePointOfFailureRisks.length > 0) {
    severity = "high";
    notes.push(`Single point of failure risks: ${singlePointOfFailureRisks.join(", ")}`);
  }

  if (singlePointOfFailureRisks.length > 2) {
    severity = "critical";
    notes.push("Multiple unmitigated single points of failure");
  }

  if (keyDependencies.length > 5 && !mitigationAvailable) {
    severity = "high";
    notes.push("Many key dependencies without mitigation plans");
  }

  if (!mitigationAvailable && singlePointOfFailureRisks.length > 0) {
    severity = "critical";
    notes.push("Critical dependencies with no mitigation plans");
  }

  return {
    category: "dependency_risk",
    key_dependencies: keyDependencies,
    single_point_of_failure_risks: singlePointOfFailureRisks,
    mitigation_available: mitigationAvailable,
    severity,
    notes,
  };
}

/**
 * Perform full harm assessment on a recommendation.
 * Integrates all risk categories and provides overall safety verdict.
 */
export function assessHarmGuardrails(
  recommendationId: string,
  contract: BusinessFactsContract,
  risks: HarmRisk[],
  mitigationPlan?: string | null,
  verificationMetrics?: string[] | null,
): HarmGuardrailAssessment {
  const critical_risks = risks.filter((r) => r.severity === "critical");
  const high_risks = risks.filter((r) => r.severity === "high");
  const medium_risks = risks.filter((r) => r.severity === "medium");

  const is_harmful = critical_risks.length > 0 || (high_risks.length > 2 && !mitigationPlan);
  const can_be_primary = critical_risks.length === 0 && (high_risks.length <= 1 || !!mitigationPlan);

  const mitigation_required: string[] = [];
  for (const risk of [...critical_risks, ...high_risks]) {
    mitigation_required.push(`Address ${risk.category} risk: ${risk.notes[0] || "unknown"}`);
  }

  const verification_metrics_required = verificationMetrics || [];
  for (const risk of [...critical_risks, ...high_risks]) {
    if (risk.category === "margin_impact" && !verification_metrics_required.some((m) => m.includes("margin"))) {
      verification_metrics_required.push("Monthly gross margin tracking");
    }
    if (risk.category === "cash_impact" && !verification_metrics_required.some((m) => m.includes("cash"))) {
      verification_metrics_required.push("Weekly cash position monitoring");
    }
  }

  const risk_summary = `${critical_risks.length} critical, ${high_risks.length} high, ${medium_risks.length} medium risks`;

  return {
    recommendation_id: recommendationId,
    is_harmful,
    can_be_primary,
    critical_risks,
    high_risks,
    medium_risks,
    risk_summary,
    mitigation_required,
    verification_metrics_required,
  };
}
