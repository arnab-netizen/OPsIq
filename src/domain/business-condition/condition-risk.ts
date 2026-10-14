/**
 * Business-condition risk reading (pure).
 *
 * The 11 derived condition dimensions do NOT share one scale. Six are pressure/risk levels where HIGH is bad
 * (cash, margin, client concentration, owner dependency, key-person dependency, morale fragility). Four are
 * capability levels where HIGH is GOOD (process maturity, management maturity, resilience, execution headroom),
 * and growth readiness is a gate where HIGH means ready and BLOCKED means held. Ranking all of them on one
 * scale made a healthy "Process maturity: High" read as "highest risk: High". This module is the one place that
 * turns a dimension's own level into a RISK level, and the one place that reads the highest risk.
 *
 * A dimension with no evidence ("unknown") contributes nothing — it is never read as LOW/safe.
 */

export type ConditionRiskLevel = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "unknown";

type Polarity = "RISK_HIGH_IS_BAD" | "CAPABILITY_HIGH_IS_GOOD" | "EXECUTION_HEADROOM" | "GROWTH_GATE";

const POLARITY: Readonly<Record<string, Polarity>> = {
  cashPressureLevel: "RISK_HIGH_IS_BAD",
  marginPressureLevel: "RISK_HIGH_IS_BAD",
  clientConcentrationRisk: "RISK_HIGH_IS_BAD",
  ownerDependencyRisk: "RISK_HIGH_IS_BAD",
  keyPersonDependencyRisk: "RISK_HIGH_IS_BAD",
  moralFragilityLevel: "RISK_HIGH_IS_BAD",
  processMaturityLevel: "CAPABILITY_HIGH_IS_GOOD",
  managementMaturityLevel: "CAPABILITY_HIGH_IS_GOOD",
  resilienceLevel: "CAPABILITY_HIGH_IS_GOOD",
  executionCapacityLevel: "EXECUTION_HEADROOM",
  growthReadinessLevel: "GROWTH_GATE",
};

const RANK: Readonly<Record<ConditionRiskLevel, number>> = { unknown: 0, LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 };

/** The RISK level a single condition dimension represents. Unknown fields and unknown levels are "unknown". */
export function conditionRiskLevel(field: string, level: string | null | undefined): ConditionRiskLevel {
  const polarity = POLARITY[field];
  if (!polarity || !level || level === "unknown") return "unknown";
  switch (polarity) {
    case "RISK_HIGH_IS_BAD":
      return level === "CRITICAL" || level === "HIGH" || level === "MEDIUM" || level === "LOW" ? level : "unknown";
    case "CAPABILITY_HIGH_IS_GOOD":
      return level === "LOW" ? "HIGH" : level === "MEDIUM" ? "MEDIUM" : level === "HIGH" ? "LOW" : "unknown";
    case "EXECUTION_HEADROOM":
      return level === "CRITICAL" ? "CRITICAL" : level === "LOW" ? "HIGH" : level === "MEDIUM" ? "MEDIUM" : level === "HIGH" ? "LOW" : "unknown";
    case "GROWTH_GATE":
      return level === "BLOCKED" ? "HIGH" : level === "LOW" || level === "HIGH" ? "LOW" : "unknown";
  }
}

/** The highest risk across the dimensions that have evidence; "unknown" when none has. */
export function highestConditionRisk(condition: Readonly<Record<string, string | null | undefined>>): ConditionRiskLevel {
  let worst: ConditionRiskLevel = "unknown";
  for (const [field, level] of Object.entries(condition)) {
    const risk = conditionRiskLevel(field, level);
    if (RANK[risk] > RANK[worst]) worst = risk;
  }
  return worst;
}
