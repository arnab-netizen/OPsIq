/**
 * Risk Factors Model
 *
 * Environmental and contextual factors that affect decision outcome probability.
 * These are derived from human factors and organizational context.
 */

export const RISK_CATEGORIES = [
  "execution_risk",
  "stakeholder_risk",
  "timeline_risk",
  "resource_risk",
  "knowledge_risk",
  "accountability_risk",
] as const;

export type RiskCategory = (typeof RISK_CATEGORIES)[number];

export const RISK_DESCRIPTIONS: Record<RiskCategory, string> = {
  execution_risk: "Risk that planned actions will not be executed as designed",
  stakeholder_risk: "Risk of stakeholder resistance or misalignment",
  timeline_risk: "Risk that timeline targets will not be met",
  resource_risk: "Risk that required resources will be unavailable or insufficient",
  knowledge_risk: "Risk that critical knowledge is concentrated or unavailable",
  accountability_risk: "Risk that accountability for outcomes will be unclear",
};

export interface RiskFactor {
  category: RiskCategory;
  probability: number; // 0-1
  impact: number; // 0-1 (relative to decision importance)
  exposure: number; // probability * impact
  mitigationRequired: boolean;
}

export interface RiskProfile {
  workspaceId: string;
  engagementId: string;
  decisionId?: string;
  assessedAt: Date;
  factors: Record<RiskCategory, RiskFactor>;
  overallExposure: number; // 0-1
  highRiskFactors: RiskCategory[];
  mitigationPriority: RiskCategory[];
}

/**
 * Calculate risk exposure
 */
export function calculateExposure(probability: number, impact: number): number {
  if (probability < 0 || probability > 1) {
    throw new Error("Probability must be between 0 and 1");
  }
  if (impact < 0 || impact > 1) {
    throw new Error("Impact must be between 0 and 1");
  }
  return probability * impact;
}

/**
 * Calculate overall risk exposure from all factors
 */
export function calculateOverallExposure(
  factors: Record<RiskCategory, RiskFactor>
): number {
  const exposures = Object.values(factors).map((f) => f.exposure);
  if (exposures.length === 0) return 0;
  return exposures.reduce((a, b) => a + b, 0) / exposures.length;
}

/**
 * Identify high-risk factors (exposure > 0.5)
 */
export function identifyHighRiskFactors(
  factors: Record<RiskCategory, RiskFactor>
): RiskCategory[] {
  return Object.entries(factors)
    .filter(([, factor]) => factor.exposure > 0.5)
    .map(([key]) => key as RiskCategory);
}

/**
 * Prioritize risk factors for mitigation
 */
export function prioritizeRisksForMitigation(
  factors: Record<RiskCategory, RiskFactor>
): RiskCategory[] {
  return Object.entries(factors)
    .filter(([, factor]) => factor.mitigationRequired)
    .sort(([, a], [, b]) => b.exposure - a.exposure)
    .map(([key]) => key as RiskCategory);
}

/**
 * Validate risk factor
 */
export function validateRiskFactor(
  factor: RiskFactor
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!RISK_CATEGORIES.includes(factor.category)) {
    errors.push(`Invalid risk category: ${factor.category}`);
  }

  if (factor.probability < 0 || factor.probability > 1) {
    errors.push("Probability must be between 0 and 1");
  }

  if (factor.impact < 0 || factor.impact > 1) {
    errors.push("Impact must be between 0 and 1");
  }

  const expectedExposure = calculateExposure(factor.probability, factor.impact);
  if (Math.abs(expectedExposure - factor.exposure) > 0.001) {
    errors.push(
      `Exposure mismatch: expected ${expectedExposure}, got ${factor.exposure}`
    );
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate risk profile
 */
export function validateRiskProfile(
  profile: RiskProfile
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!profile.workspaceId?.trim()) {
    errors.push("workspaceId is required");
  }

  if (!profile.engagementId?.trim()) {
    errors.push("engagementId is required");
  }

  if (Object.keys(profile.factors).length !== RISK_CATEGORIES.length) {
    errors.push(`All ${RISK_CATEGORIES.length} risk categories must be assessed`);
  }

  Object.values(profile.factors).forEach((factor) => {
    const { valid, errors: factorErrors } = validateRiskFactor(factor);
    if (!valid) {
      errors.push(...factorErrors);
    }
  });

  if (profile.overallExposure < 0 || profile.overallExposure > 1) {
    errors.push("Overall exposure must be between 0 and 1");
  }

  if (profile.highRiskFactors.some((f) => !RISK_CATEGORIES.includes(f))) {
    errors.push("Invalid risk category in highRiskFactors");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Risk level description
 */
export function getRiskLevel(exposure: number): string {
  if (exposure < 0.2) return "Low";
  if (exposure < 0.4) return "Moderate";
  if (exposure < 0.6) return "High";
  if (exposure < 0.8) return "Very High";
  return "Critical";
}

/**
 * Recommended action based on risk exposure
 */
export function recommendedAction(exposure: number): string {
  if (exposure < 0.2) return "Monitor and proceed";
  if (exposure < 0.4) return "Monitor closely; implement safeguards";
  if (exposure < 0.6) return "Implement mitigation plan before proceeding";
  if (exposure < 0.8) return "Significant mitigation required; consider delay";
  return "Critical risk; halt and reassess";
}
