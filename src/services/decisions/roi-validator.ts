import { ROIProjection, FinancialAssumption } from "../../domain/decisions/recommendation-contracts";

/**
 * PHASE G5: ROI CREDIBILITY SYSTEM
 *
 * Hostile validation of ROI projections to detect:
 * - Unsupported claims
 * - Hidden assumptions
 * - Fake precision
 * - Manipulated assumptions
 * - Stale pricing
 * - Unrealistic projections
 * - Missing operational costs
 * - Survivorship bias
 *
 * RULES:
 * - Every ROI assumption must have source and confidence
 * - Confidence < 60% = low credibility for ROI
 * - Gap between best/worst case > 2x = high uncertainty (flag)
 * - Gap > 5x = danger (too speculative)
 * - Negative best case = rejection
 * - Formula must be explicit and traceable
 * - Missing operational costs = penalty
 * - Payback > 36 months = high risk/speculative
 * - Assumptions sourced from vendor = reduce confidence by 20%
 * - Assumptions > 1 year old = stale, reduce confidence by 15%
 */

export interface ROIValidationResult {
  is_valid: boolean;
  roi_credibility_score: number; // 0-100
  validation_issues: string[];
  assumption_issues: string[];
  formula_issues: string[];
  missing_costs: string[];
  confidence_adjustments: {
    vendor_sourced_penalty: number;
    stale_assumption_penalty: number;
    uncertainty_penalty: number;
    missing_cost_penalty: number;
    negative_case_penalty: number;
    other_penalties: number;
  };
  roi_credibility_reason: string;
  is_speculative: boolean;
  warnings: string[];
}

/**
 * Validate a single financial assumption
 */
export function validateAssumption(assumption: FinancialAssumption): {
  is_valid: boolean;
  issues: string[];
  age_days: number;
  confidence_adjusted: number;
  is_vendor_sourced: boolean;
  is_stale: boolean;
} {
  const issues: string[] = [];
  let confidence_adjusted = assumption.confidence;

  // Check confidence
  if (assumption.confidence < 0.3) {
    issues.push("Assumption confidence < 30% - too speculative");
  }

  // Check source
  const is_vendor_sourced = assumption.source.toLowerCase().includes("vendor") ||
                            assumption.source.toLowerCase().includes("partner") ||
                            assumption.source.toLowerCase().includes("provider");

  if (is_vendor_sourced) {
    confidence_adjusted -= 0.2; // 20% penalty
    issues.push("Assumption sourced from vendor - reduce confidence by 20%");
  }

  // Check staleness (assume created_date is in assumption somehow)
  // For now, we'll estimate based on source recency
  const is_stale = assumption.source.toLowerCase().includes("2023") ||
                   assumption.source.toLowerCase().includes("2022");

  if (is_stale) {
    confidence_adjusted -= 0.15; // 15% penalty
    issues.push("Assumption appears stale (2023 or earlier) - reduce confidence by 15%");
  }

  // Check sensitivity
  const sensitivity_spread = assumption.sensitivity_range_high - assumption.sensitivity_range_low;
  const midpoint = assumption.base_value;
  if (sensitivity_spread > midpoint * 2) {
    issues.push(`Sensitivity range very wide: ${sensitivity_spread} (${sensitivity_spread / midpoint}x midpoint)`);
  }

  return {
    is_valid: issues.length === 0,
    issues,
    age_days: is_stale ? 365 : 0,
    confidence_adjusted: Math.max(0, confidence_adjusted),
    is_vendor_sourced,
    is_stale,
  };
}

/**
 * Validate ROI projection formula and structure
 */
export function validateROIProjection(roi: ROIProjection): ROIValidationResult {
  const issues: string[] = [];
  const assumption_issues: string[] = [];
  const formula_issues: string[] = [];
  const missing_costs: string[] = [];
  let roi_credibility_score = 100;

  const penalties = {
    vendor_sourced_penalty: 0,
    stale_assumption_penalty: 0,
    uncertainty_penalty: 0,
    missing_cost_penalty: 0,
    negative_case_penalty: 0,
    other_penalties: 0,
  };

  // 1. Check best/worst case spread
  const best = roi.best_case_roi_percent;
  const worst = roi.worst_case_roi_percent;
  const base = roi.base_case_roi_percent;

  if (base < 0) {
    issues.push("Base case ROI is NEGATIVE - action destroys value");
    penalties.negative_case_penalty = 30;
  }

  if (best < 0) {
    issues.push("Even BEST case ROI is negative");
    penalties.negative_case_penalty = 40;
  }

  const spread = Math.abs(best - worst);
  const midpoint = Math.abs(base) || 1; // Avoid division by zero
  const spread_ratio = spread / midpoint;

  if (spread_ratio > 5) {
    issues.push(
      `Uncertainty too high: best ${best}%, worst ${worst}% (${spread_ratio.toFixed(1)}x spread) - DANGER_SPECULATIVE`
    );
    penalties.uncertainty_penalty = 25;
  } else if (spread_ratio > 2) {
    issues.push(
      `High uncertainty: best ${best}%, worst ${worst}% (${spread_ratio.toFixed(1)}x spread) - FLAG AS RISKY`
    );
    penalties.uncertainty_penalty = 15;
  }

  // 2. Check payback period
  if (roi.payback_period_months > 36) {
    issues.push(`Payback period ${roi.payback_period_months} months (> 3 years) - high risk`);
    penalties.other_penalties += 10;
  } else if (roi.payback_period_months > 24) {
    issues.push(`Payback period ${roi.payback_period_months} months (2-3 years) - elevated risk`);
    penalties.other_penalties += 5;
  }

  // 3. Validate assumptions
  if (roi.assumptions.length === 0) {
    formula_issues.push("No assumptions listed - formula not transparent");
    penalties.other_penalties += 10;
  }

  for (const assumption of roi.assumptions) {
    const validation = validateAssumption(assumption);
    if (!validation.is_valid) {
      assumption_issues.push(...validation.issues);
    }
    if (validation.is_vendor_sourced) {
      penalties.vendor_sourced_penalty += 5;
    }
    if (validation.is_stale) {
      penalties.stale_assumption_penalty += 5;
    }
  }

  // 4. Check formula
  if (roi.formula.length < 20) {
    formula_issues.push("Formula too vague - not detailed enough");
    penalties.other_penalties += 10;
  }

  // Check if formula contains specific variable names
  const formula_lower = roi.formula.toLowerCase();
  const has_revenue = formula_lower.includes("revenue") || formula_lower.includes("sales");

  // Check for cost mentions (excluding "no cost" or "zero cost")
  const has_cost_mention = formula_lower.includes("cost") ||
                           formula_lower.includes("expense") ||
                           formula_lower.includes("fee") ||
                           formula_lower.includes("staffing") ||
                           formula_lower.includes("resource") ||
                           formula_lower.includes("labor") ||
                           formula_lower.includes("salary");

  const has_no_cost = formula_lower.includes("no cost") ||
                      formula_lower.includes("zero cost") ||
                      formula_lower.includes("free") ||
                      formula_lower.includes("no expense") ||
                      formula_lower.includes("takes zero");

  const has_cost = has_cost_mention && !has_no_cost;
  const has_time = formula_lower.includes("month") ||
                   formula_lower.includes("year") ||
                   formula_lower.includes("time") ||
                   formula_lower.includes("implementation");

  if (!has_cost) {
    missing_costs.push("Formula does not model operational costs or expenses - missing cost basis");
    penalties.missing_cost_penalty += 15;
  }
  if (!has_time && !has_revenue) {
    missing_costs.push("Formula lacks timeline or basis for calculation - cannot validate payback period");
    penalties.missing_cost_penalty += 10;
  }

  // 5. Check confidence
  if (roi.confidence_percent < 50) {
    issues.push(`ROI confidence low: ${roi.confidence_percent}% - insufficient confidence for decision`);
    penalties.other_penalties += 10;
  } else if (roi.confidence_percent < 70) {
    issues.push(`ROI confidence medium: ${roi.confidence_percent}% - risky for high-impact decisions`);
    penalties.other_penalties += 5;
  }

  // 6. Check uncertainty explanation
  if (roi.uncertainty_explanation.length < 10) {
    formula_issues.push("Uncertainty explanation too brief");
    penalties.other_penalties += 5;
  }

  // 7. Check for suspicious patterns
  const suspicion = detectROISuspicion(roi);
  const has_red_flags = suspicion.is_suspicious;
  const has_many_indicators = suspicion.suspicion_indicators.length > 2;

  if (suspicion.is_suspicious) {
    issues.push(...suspicion.red_flags);
    penalties.other_penalties += 15;
  }
  if (has_many_indicators) {
    issues.push(...suspicion.suspicion_indicators);
    penalties.other_penalties += 5;
  }

  // Calculate final credibility score
  roi_credibility_score -= penalties.vendor_sourced_penalty;
  roi_credibility_score -= penalties.stale_assumption_penalty;
  roi_credibility_score -= penalties.uncertainty_penalty;
  roi_credibility_score -= penalties.missing_cost_penalty;
  roi_credibility_score -= penalties.negative_case_penalty;
  roi_credibility_score -= penalties.other_penalties;
  roi_credibility_score = Math.max(0, Math.min(100, roi_credibility_score));

  // Determine if speculative
  const is_speculative = spread_ratio > 2 ||
                         roi.confidence_percent < 50 ||
                         base < 0 ||
                         has_red_flags ||
                         has_many_indicators;

  const all_issues = [...issues, ...assumption_issues, ...formula_issues];
  const is_valid = all_issues.length === 0 && !is_speculative;

  const reason_parts: string[] = [];
  reason_parts.push(`Credibility: ${roi_credibility_score.toFixed(0)}/100`);
  if (penalties.vendor_sourced_penalty > 0) {
    reason_parts.push(`-${penalties.vendor_sourced_penalty} vendor sourced`);
  }
  if (penalties.uncertainty_penalty > 0) {
    reason_parts.push(`-${penalties.uncertainty_penalty} high uncertainty`);
  }
  if (penalties.missing_cost_penalty > 0) {
    reason_parts.push(`-${penalties.missing_cost_penalty} missing costs`);
  }

  return {
    is_valid,
    roi_credibility_score,
    validation_issues: issues,
    assumption_issues,
    formula_issues,
    missing_costs,
    confidence_adjustments: penalties,
    roi_credibility_reason: reason_parts.join(" | "),
    is_speculative,
    warnings: spread_ratio > 2 ? [`High uncertainty spread: ${spread_ratio.toFixed(1)}x`] : [],
  };
}

/**
 * Detect suspicious ROI patterns
 */
export function detectROISuspicion(roi: ROIProjection): {
  is_suspicious: boolean;
  suspicion_indicators: string[];
  red_flags: string[];
} {
  const indicators: string[] = [];
  const red_flags: string[] = [];

  // Red flag: all positive cases
  if (roi.best_case_roi_percent > 0 && roi.base_case_roi_percent > 0 && roi.worst_case_roi_percent > 0) {
    // Check if they're very close together (all good scenarios)
    const spread = roi.best_case_roi_percent - roi.worst_case_roi_percent;
    if (spread < 50) {
      red_flags.push("All scenarios show positive ROI with small spread - survivorship bias likely");
    } else {
      indicators.push("All scenarios show positive ROI - unlikely but possible");
    }
  }

  // Red flag: linear progression (perfectly spaced)
  const worst_to_base = roi.base_case_roi_percent - roi.worst_case_roi_percent;
  const base_to_best = roi.best_case_roi_percent - roi.base_case_roi_percent;
  if (Math.abs(worst_to_base - base_to_best) < 1) {
    red_flags.push("Best/Base/Worst cases show perfect linear progression - possibly fabricated");
  }

  // Red flag: false precision (decimal percentages)
  if (!Number.isInteger(roi.base_case_roi_percent) || !Number.isInteger(roi.best_case_roi_percent)) {
    indicators.push("ROI projections use false precision (decimals) - suspect accuracy");
  }

  // Red flag: round numbers
  if (roi.base_case_roi_percent % 50 === 0 || roi.best_case_roi_percent % 50 === 0) {
    indicators.push("ROI projections are round numbers (50%, 100%, etc.) - may be estimate");
  }

  // Red flag: no worst case or inverted
  if (roi.worst_case_roi_percent === 0 || roi.worst_case_roi_percent > roi.base_case_roi_percent) {
    red_flags.push("Worst case ROI >= base case - logic error or manipulation");
  }

  // Red flag: very short payback with high ROI
  if (roi.payback_period_months < 6 && roi.base_case_roi_percent > 200) {
    red_flags.push("Payback < 6 months with > 200% ROI - unrealistic");
  }

  return {
    is_suspicious: red_flags.length > 0,
    suspicion_indicators: indicators,
    red_flags,
  };
}
