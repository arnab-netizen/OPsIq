/**
 * Scenario Comparison Engine - Phase 4 Control 5
 *
 * Deterministic comparison of decision scenarios with explicit assumptions.
 * Allows stakeholders to understand impact ranges and trade-offs.
 */

export interface ScenarioInput {
  baselineRevenue: number;
  baselineCost: number;
  revenueChange: number;
  costChange: number;
  confidence: number;
}

export interface Scenario {
  impact: number;
  assumptions: string[];
}

export interface Alternative {
  name: string;
  impact: number;
  assumptions: string[];
}

export interface ScenarioComparison {
  baseline: Scenario;
  recommended: Scenario;
  alternatives: Alternative[];
}

/**
 * Compare decision scenarios deterministically.
 *
 * Scenarios:
 * 1. Baseline: No action taken (impact = 0)
 * 2. Recommended: Proposed decision (impact = revenueChange - costChange)
 * 3. Conservative: 75% of recommended (lower risk, lower benefit)
 * 4. Aggressive: 125% of recommended (higher risk, higher benefit)
 *
 * All assumptions are explicit and labeled.
 */
export function compareScenarios(input: ScenarioInput): ScenarioComparison {
  // Validate input
  if (!input || typeof input !== "object") {
    throw new Error("Invalid input: must be an object");
  }

  const requiredFields: (keyof ScenarioInput)[] = [
    "baselineRevenue",
    "baselineCost",
    "revenueChange",
    "costChange",
    "confidence",
  ];

  for (const field of requiredFields) {
    if (typeof input[field] !== "number") {
      throw new Error(`Invalid input: ${field} must be a number, got ${typeof input[field]}`);
    }
  }

  // Calculate impacts
  const baselineImpact = 0; // No action taken

  const recommendedImpact = input.revenueChange - input.costChange;

  const conservativeImpact = Math.round((recommendedImpact * 0.75) * 100) / 100;

  const aggressiveImpact = Math.round((recommendedImpact * 1.25) * 100) / 100;

  // Build assumption lists (explicit and labeled)
  const baselineAssumptions: string[] = [
    "No action is taken",
    "Current revenue and cost structure remains unchanged",
    "No operational changes are implemented",
    "Market conditions remain stable",
  ];

  const recommendedAssumptions: string[] = [
    "Proposed decision is fully implemented",
    "Revenue change of $" + input.revenueChange.toLocaleString() + " is realized",
    "Cost change of $" + input.costChange.toLocaleString() + " is realized",
    "Implementation succeeds with planned timing and scope",
    "Market conditions are favorable to implementation",
    `Decision confidence level: ${(input.confidence * 100).toFixed(0)}%`,
    "No unforeseen complications arise during execution",
  ];

  const conservativeAssumptions: string[] = [
    "Proposed decision is implemented with reduced scope",
    "Only 75% of expected benefits are realized",
    "Implementation takes longer than planned",
    "Market conditions are less favorable than expected",
    "Conservative estimate accounts for execution risks",
  ];

  const aggressiveAssumptions: string[] = [
    "Proposed decision is fully implemented with optimization",
    "125% of expected benefits are realized through scale",
    "Implementation is accelerated and optimized",
    "Market conditions are favorable and support scaling",
    "Aggressive estimate assumes best-case execution",
    "Assumes no capacity or resource constraints",
  ];

  const alternatives: Alternative[] = [
    {
      name: "Conservative",
      impact: conservativeImpact,
      assumptions: conservativeAssumptions,
    },
    {
      name: "Aggressive",
      impact: aggressiveImpact,
      assumptions: aggressiveAssumptions,
    },
  ];

  return {
    baseline: {
      impact: baselineImpact,
      assumptions: baselineAssumptions,
    },
    recommended: {
      impact: recommendedImpact,
      assumptions: recommendedAssumptions,
    },
    alternatives,
  };
}

/**
 * Get scenario impact range (min to max).
 */
export function getImpactRange(
  comparison: ScenarioComparison
): { min: number; max: number; spread: number } {
  const impacts = [
    comparison.baseline.impact,
    comparison.recommended.impact,
    ...comparison.alternatives.map((a) => a.impact),
  ];

  const min = Math.min(...impacts);
  const max = Math.max(...impacts);
  const spread = max - min;

  return { min, max, spread };
}

/**
 * Compare two scenarios and explain the difference.
 */
export function compareScenarioPairs(
  comparison: ScenarioComparison,
  scenario1Name: string,
  scenario2Name: string
): { scenario1: Scenario | Alternative; scenario2: Scenario | Alternative; delta: number; explanation: string } | null {
  const scenarios: Record<string, Scenario | Alternative> = {
    baseline: comparison.baseline,
    recommended: comparison.recommended,
  };

  for (const alt of comparison.alternatives) {
    scenarios[alt.name.toLowerCase()] = alt;
  }

  const s1 = scenarios[scenario1Name.toLowerCase()];
  const s2 = scenarios[scenario2Name.toLowerCase()];

  if (!s1 || !s2) {
    return null;
  }

  const delta = s2.impact - s1.impact;
  const deltaPercent = s1.impact !== 0 ? ((delta / s1.impact) * 100).toFixed(1) : "N/A";
  const direction = delta > 0 ? "increase" : delta < 0 ? "decrease" : "no change";

  const explanation =
    delta === 0
      ? `No difference: Both scenarios result in $${s2.impact.toLocaleString()} impact.`
      : `${scenario2Name} has ${direction} of $${Math.abs(delta).toLocaleString()} (${deltaPercent}%) compared to ${scenario1Name}.`;

  return {
    scenario1: s1,
    scenario2: s2,
    delta,
    explanation,
  };
}

/**
 * Format scenario comparison as human-readable text.
 */
export function formatScenarioComparison(comparison: ScenarioComparison): string {
  const lines: string[] = [
    "=== SCENARIO COMPARISON ANALYSIS ===",
    "",
    "BASELINE SCENARIO (No Action)",
    `Impact: $${comparison.baseline.impact.toLocaleString()}`,
    "Assumptions:",
    ...comparison.baseline.assumptions.map((a) => `  • ${a}`),
    "",
    "RECOMMENDED SCENARIO",
    `Impact: $${comparison.recommended.impact.toLocaleString()}`,
    "Assumptions:",
    ...comparison.recommended.assumptions.map((a) => `  • ${a}`),
    "",
  ];

  for (const alt of comparison.alternatives) {
    lines.push(`${alt.name.toUpperCase()} SCENARIO`);
    lines.push(`Impact: $${alt.impact.toLocaleString()}`);
    lines.push("Assumptions:");
    lines.push(...alt.assumptions.map((a) => `  • ${a}`));
    lines.push("");
  }

  const range = getImpactRange(comparison);
  lines.push("IMPACT RANGE");
  lines.push(`Minimum Impact: $${range.min.toLocaleString()}`);
  lines.push(`Maximum Impact: $${range.max.toLocaleString()}`);
  lines.push(`Impact Spread: $${range.spread.toLocaleString()}`);

  return lines.join("\n");
}

/**
 * Validate scenario comparison result.
 */
export function validateComparison(comparison: ScenarioComparison): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!comparison) {
    errors.push("Comparison object is required");
    return { valid: false, errors };
  }

  if (!comparison.baseline || typeof comparison.baseline.impact !== "number") {
    errors.push("Invalid baseline scenario");
  }

  if (!comparison.recommended || typeof comparison.recommended.impact !== "number") {
    errors.push("Invalid recommended scenario");
  }

  if (!Array.isArray(comparison.alternatives)) {
    errors.push("Alternatives must be an array");
  } else if (comparison.alternatives.length > 2) {
    errors.push("No more than 2 alternatives allowed");
  } else {
    for (let i = 0; i < comparison.alternatives.length; i++) {
      const alt = comparison.alternatives[i];
      if (!alt.name || typeof alt.impact !== "number" || !Array.isArray(alt.assumptions)) {
        errors.push(`Invalid alternative at index ${i}`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
