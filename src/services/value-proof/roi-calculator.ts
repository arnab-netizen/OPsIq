/**
 * ROI Calculator Service
 *
 * Calculates return on investment for decisions and engagements.
 * Incorporates human execution reality factors to adjust expected returns.
 *
 * ROI formula: (Value Recovered - Intervention Cost) / Intervention Cost * 100
 * Adjusted ROI accounts for:
 * - Success probability from human factors
 * - Time to mitigation delays
 * - Execution risk multiplier
 */

import { HumanRealityImpact } from "@/services/reality-awareness/human-factors-engine";

export interface ROIInput {
  valueRecoveredINR: number; // From outcome.service
  interventionCostINR: number; // Cost to implement decision
  timeToValueMonths: number; // How long before value is realized
  baseSuccessProbability: number; // 0-1, from decision confidence
  humanRealityImpact?: HumanRealityImpact; // From human factors assessment
}

export interface ROICalculation {
  grossValueINR: number;
  interventionCostINR: number;
  baseROI: number; // Before human factors adjustment
  adjustedROI: number; // After human factors
  successProbability: number; // Adjusted for human reality
  timeDiscountFactor: number; // Cost of delay
  paybackMonths: number;
  npv: number; // Net present value
  profitabilityIndex: number; // Value / Cost ratio
  assessment: string;
}

export interface EngagementROI {
  engagementId: string;
  totalValueRecoveredINR: number;
  totalInterventionCostINR: number;
  averageROI: number; // Across all decisions
  adjustedROI: number; // With human factors
  totalProfitINR: number;
  decisionCount: number;
  averageAccuracy: number; // From accuracy validator
}

/**
 * Calculate ROI for a single decision
 */
export function calculateROI(input: ROIInput): ROICalculation {
  // Validate inputs
  const valueRecovered = Math.max(0, input.valueRecoveredINR);
  const interventionCost = Math.max(1, input.interventionCostINR); // Avoid division by zero
  const timeToValue = Math.max(0.1, input.timeToValueMonths);
  const baseSuccess = Math.max(0, Math.min(1, input.baseSuccessProbability));

  // Base ROI (before human factors)
  const grossProfit = valueRecovered - interventionCost;
  const baseROI = (grossProfit / interventionCost) * 100;

  // Time discount factor
  // Delay costs money: 10% per month (simple, not compounded)
  const timeDiscount = Math.max(0, 1 - (timeToValue * 0.1));
  const timeDiscountFactor = Math.max(0.5, timeDiscount); // Floor at 50%

  // Human reality adjustments
  let successProbability = baseSuccess;
  let executionRiskMultiplier = 1.0;
  let delayMonths = 0;

  if (input.humanRealityImpact) {
    // Adjust success probability down by human factors
    // successProbabilityAdjustment is negative (up to -30%)
    const adjustment = input.humanRealityImpact.successProbabilityAdjustment;
    successProbability = Math.max(0.1, baseSuccess + adjustment);

    // Risk multiplier increases intervention cost equivalent
    executionRiskMultiplier = input.humanRealityImpact.riskFactor; // 1-3x

    // Delay extends time to value
    delayMonths = input.humanRealityImpact.delayDays / 30;
  }

  // Calculate adjusted values
  const adjustedTimeToValue = timeToValue + delayMonths;
  const adjustedTimeDiscount = Math.max(0, 1 - (adjustedTimeToValue * 0.1));
  const adjustedTimeDiscountFactor = Math.max(0.5, adjustedTimeDiscount);

  // Effective intervention cost (adjusted for risk)
  const effectiveInterventionCost = interventionCost * executionRiskMultiplier;

  // Adjusted profit accounting for success probability and time value
  const expectedValue = valueRecovered * successProbability * adjustedTimeDiscountFactor;
  const adjustedProfit = expectedValue - effectiveInterventionCost;
  const adjustedROI = (adjustedProfit / effectiveInterventionCost) * 100;

  // Calculate payback period
  const monthlyValue = expectedValue / Math.max(1, adjustedTimeToValue);
  const paybackMonths =
    monthlyValue > 0 ? Math.ceil(effectiveInterventionCost / monthlyValue) : Infinity;

  // NPV (simplified: discount at 5% per month)
  const discountRate = 0.05;
  const npv = expectedValue / Math.pow(1 + discountRate, adjustedTimeToValue) - effectiveInterventionCost;

  // Profitability index
  const profitabilityIndex = expectedValue > 0 ? expectedValue / effectiveInterventionCost : 0;

  // Generate assessment
  const assessment = generateROIAssessment(adjustedROI, profitabilityIndex, successProbability);

  return {
    grossValueINR: Math.round(valueRecovered),
    interventionCostINR: Math.round(effectiveInterventionCost),
    baseROI: Math.round(baseROI),
    adjustedROI: Math.round(adjustedROI),
    successProbability: Math.round(successProbability * 100) / 100,
    timeDiscountFactor: Math.round(adjustedTimeDiscountFactor * 100) / 100,
    paybackMonths: isFinite(paybackMonths) ? Math.ceil(paybackMonths) : 24,
    npv: Math.round(npv),
    profitabilityIndex: Math.round(profitabilityIndex * 100) / 100,
    assessment,
  };
}

/**
 * Aggregate ROI across engagement decisions
 */
export function calculateEngagementROI(
  engagementId: string,
  decisions: Array<{
    valueRecoveredINR: number;
    interventionCostINR: number;
    accuracyScore: number;
  }>
): EngagementROI {
  if (decisions.length === 0) {
    return {
      engagementId,
      totalValueRecoveredINR: 0,
      totalInterventionCostINR: 0,
      averageROI: 0,
      adjustedROI: 0,
      totalProfitINR: 0,
      decisionCount: 0,
      averageAccuracy: 0,
    };
  }

  const totalValueRecovered = decisions.reduce((sum, d) => sum + d.valueRecoveredINR, 0);
  const totalInterventionCost = decisions.reduce((sum, d) => sum + d.interventionCostINR, 0);
  const totalProfit = totalValueRecovered - totalInterventionCost;
  const averageROI = (totalProfit / Math.max(1, totalInterventionCost)) * 100;
  const averageAccuracy =
    decisions.reduce((sum, d) => sum + d.accuracyScore, 0) / decisions.length;

  // Adjusted ROI based on average accuracy
  // If accuracy is 85%, apply 15% penalty
  const accuracyMultiplier = Math.max(0.5, averageAccuracy / 100);
  const adjustedROI = averageROI * accuracyMultiplier;

  return {
    engagementId,
    totalValueRecoveredINR: Math.round(totalValueRecovered),
    totalInterventionCostINR: Math.round(totalInterventionCost),
    averageROI: Math.round(averageROI),
    adjustedROI: Math.round(adjustedROI),
    totalProfitINR: Math.round(totalProfit),
    decisionCount: decisions.length,
    averageAccuracy: Math.round(averageAccuracy * 100) / 100,
  };
}

/**
 * Generate ROI assessment text
 */
function generateROIAssessment(
  roi: number,
  profitabilityIndex: number,
  successProbability: number
): string {
  // ROI interpretation
  let roiStatus = "";
  if (roi >= 100) roiStatus = "exceptional";
  else if (roi >= 50) roiStatus = "strong";
  else if (roi >= 0) roiStatus = "positive";
  else roiStatus = "negative";

  // Profitability interpretation
  let profitabilityStatus = "";
  if (profitabilityIndex >= 3) profitabilityStatus = "highly profitable";
  else if (profitabilityIndex >= 2) profitabilityStatus = "very profitable";
  else if (profitabilityIndex >= 1.5) profitabilityStatus = "profitable";
  else if (profitabilityIndex >= 1) profitabilityStatus = "break-even";
  else profitabilityStatus = "unprofitable";

  // Success probability assessment
  const successStatus =
    successProbability >= 0.8
      ? "high confidence"
      : successProbability >= 0.6
        ? "moderate confidence"
        : "low confidence";

  return `${roiStatus.charAt(0).toUpperCase()}${roiStatus.slice(1)} ROI (${profitabilityStatus}) with ${successStatus} (${(successProbability * 100).toFixed(0)}%).`;
}

/**
 * Compare two ROI calculations
 */
export function compareROI(
  roiBefore: ROICalculation,
  roiAfter: ROICalculation
): {
  roiImprovement: number;
  successProbabilityChange: number;
  assessment: string;
} {
  const roiImprovement = roiAfter.adjustedROI - roiBefore.adjustedROI;
  const successChange = roiAfter.successProbability - roiBefore.successProbability;

  let assessment = "";
  if (roiImprovement > 0) {
    assessment = `ROI improved by ${roiImprovement.toFixed(1)}% points`;
  } else if (roiImprovement < 0) {
    assessment = `ROI declined by ${Math.abs(roiImprovement).toFixed(1)}% points`;
  } else {
    assessment = "ROI unchanged";
  }

  if (successChange !== 0) {
    const direction = successChange > 0 ? "increased" : "decreased";
    assessment += `, success probability ${direction} by ${Math.abs(successChange).toFixed(2)}`;
  }

  return {
    roiImprovement: Math.round(roiImprovement * 100) / 100,
    successProbabilityChange: Math.round(successChange * 10000) / 10000,
    assessment,
  };
}

/**
 * Determine ROI confidence threshold
 */
export function recommendROIThreshold(
  averageAccuracy: number
): {
  minimumROI: number;
  recommendedROI: number;
  targetROI: number;
} {
  // Scale thresholds based on accuracy
  const accuracyFactor = Math.max(0.5, averageAccuracy / 100);

  return {
    minimumROI: Math.round(0 * accuracyFactor), // Break-even
    recommendedROI: Math.round(30 * accuracyFactor), // 30% after adjustment
    targetROI: Math.round(50 * accuracyFactor), // 50% after adjustment
  };
}
