/**
 * ADDENDUM F: Business Impact Engine
 *
 * Calculates financial ROI, payback period, business value scoring,
 * and risk-adjusted returns for decisions and recommendations.
 *
 * Non-DB: Contains only calculation logic and mock data (no persistence).
 * Ready for: Integration with decision evaluation pipeline once database available.
 */

import { z } from "zod";

// ============================================================================
// IMPACT CALCULATION CONTRACTS
// ============================================================================

/** Financial impact measurement */
export const FinancialImpactSchema = z.object({
  initialInvestment: z.number().min(0),
  expectedBenefit: z.number(),
  timeToValue: z.number().min(0), // months
  riskAdjustmentFactor: z.number().min(0).max(1).default(1.0),
  discountRate: z.number().min(0).max(1).default(0.1),
});

export type FinancialImpact = z.infer<typeof FinancialImpactSchema>;

/** ROI calculation result */
export const ROIResultSchema = z.object({
  initialInvestment: z.number(),
  expectedBenefit: z.number(),
  roiPercent: z.number(), // (benefit - cost) / cost * 100
  roiRatio: z.number(), // benefit / cost
  paybackMonths: z.number().nullable(), // null if cost ≥ benefit
  npv: z.number(), // Net present value
  irr: z.number(), // Internal rate of return (%)
  riskAdjustedReturn: z.number(), // roiPercent * riskAdjustmentFactor
  valueCategoryRating: z.enum(["exceptional", "high", "moderate", "low", "negative"]),
});

export type ROIResult = z.infer<typeof ROIResultSchema>;

/** Business value scoring */
export const BusinessValueSchema = z.object({
  recordId: z.string(),
  strategicAlignment: z.number().min(0).max(1), // 0-1 score
  operationalExcellence: z.number().min(0).max(1),
  customerValue: z.number().min(0).max(1),
  riskMitigation: z.number().min(0).max(1),
  timelinessScore: z.number().min(0).max(1),
  scalabilityScore: z.number().min(0).max(1),
  overallScore: z.number().min(0).max(1),
  valueRating: z.enum(["critical", "high", "medium", "low"]),
  scoreBreakdown: z.object({
    strategicWeight: z.number().default(0.25),
    operationalWeight: z.number().default(0.25),
    customerWeight: z.number().default(0.2),
    riskWeight: z.number().default(0.15),
    timelinessWeight: z.number().default(0.1),
    scalabilityWeight: z.number().default(0.05),
  }),
});

export type BusinessValue = z.infer<typeof BusinessValueSchema>;

/** Impact multiplier configuration */
export const ImpactMultiplierSchema = z.object({
  implementationSuccessProbability: z.number().min(0).max(1),
  adoptionRate: z.number().min(0).max(1),
  marketMultiplier: z.number().min(0.5).max(3), // Market size factor
  competitiveAdvantageMultiplier: z.number().min(0.5).max(3),
  sustainabilityFactor: z.number().min(0).max(1), // Probability impact sustains
});

export type ImpactMultiplier = z.infer<typeof ImpactMultiplierSchema>;

/** Business impact assessment */
export const BusinessImpactAssessmentSchema = z.object({
  recordId: z.string(),
  recordType: z.enum(["decision", "action", "recommendation", "experiment"]),
  sourceConnector: z.string().optional(),
  roi: ROIResultSchema,
  businessValue: BusinessValueSchema,
  multipliers: ImpactMultiplierSchema,
  adjustedROI: z.number(), // ROI after applying multipliers
  confidenceScore: z.number().min(0).max(1),
  riskLevel: z.enum(["critical", "high", "medium", "low"]),
  recommendations: z.array(
    z.object({
      area: z.string(),
      recommendation: z.string(),
      potentialROIImprovement: z.number(),
    }),
  ),
  assessedAt: z.date(),
});

export type BusinessImpactAssessment = z.infer<typeof BusinessImpactAssessmentSchema>;

/** Batch impact analysis */
export const BatchImpactResultSchema = z.object({
  batchId: z.string(),
  totalRecords: z.number(),
  analyzedRecords: z.number(),
  averageROI: z.number(),
  averageBusinessValue: z.number(),
  totalExpectedValue: z.number(),
  roiDistribution: z.object({
    exceptional: z.number(), // >50% ROI
    high: z.number(), // 25-50% ROI
    moderate: z.number(), // 5-25% ROI
    low: z.number(), // 0-5% ROI
    negative: z.number(), // <0% ROI
  }),
  criticalRiskCount: z.number(),
  highRiskCount: z.number(),
  paybackPeriodAverage: z.number(), // months
  analysisTimeMs: z.number(),
});

export type BatchImpactResult = z.infer<typeof BatchImpactResultSchema>;

// ============================================================================
// IMPACT CALCULATION ALGORITHMS
// ============================================================================

/**
 * Calculate ROI and payback period from financial impact
 */
export function calculateROI(impact: FinancialImpact): ROIResult {
  const { initialInvestment, expectedBenefit, riskAdjustmentFactor, discountRate } = impact;

  // ROI Percentage
  const roiPercent =
    initialInvestment > 0 ? ((expectedBenefit - initialInvestment) / initialInvestment) * 100 : 0;

  // ROI Ratio
  const roiRatio = initialInvestment > 0 ? expectedBenefit / initialInvestment : 0;

  // Payback Period (months)
  let paybackMonths: number | null = null;
  if (expectedBenefit > initialInvestment && impact.timeToValue > 0) {
    paybackMonths = Math.round((initialInvestment / (expectedBenefit - initialInvestment)) * impact.timeToValue * 12) / 12;
  }

  // NPV (simplified: benefit - cost, discounted)
  const npv = expectedBenefit / Math.pow(1 + discountRate, impact.timeToValue / 12) - initialInvestment;

  // IRR (simplified: annualized return rate)
  let irr = 0;
  if (initialInvestment > 0) {
    const monthlyRate = Math.pow(expectedBenefit / initialInvestment, 1 / Math.max(impact.timeToValue, 1)) - 1;
    irr = Math.max(0, monthlyRate * 12 * 100); // Annualized, cap at 0
  }

  // Risk-adjusted return
  const riskAdjustedReturn = roiPercent * riskAdjustmentFactor;

  // Value category rating
  let valueCategoryRating: "exceptional" | "high" | "moderate" | "low" | "negative";
  if (roiPercent > 50) {
    valueCategoryRating = "exceptional";
  } else if (roiPercent > 25) {
    valueCategoryRating = "high";
  } else if (roiPercent > 5) {
    valueCategoryRating = "moderate";
  } else if (roiPercent >= 0) {
    valueCategoryRating = "low";
  } else {
    valueCategoryRating = "negative";
  }

  return {
    initialInvestment,
    expectedBenefit,
    roiPercent: Math.round(roiPercent * 100) / 100,
    roiRatio: Math.round(roiRatio * 100) / 100,
    paybackMonths,
    npv: Math.round(npv * 100) / 100,
    irr: Math.round(irr * 100) / 100,
    riskAdjustedReturn: Math.round(riskAdjustedReturn * 100) / 100,
    valueCategoryRating,
  };
}

/**
 * Calculate business value score from multiple factors
 */
export function calculateBusinessValue(factors: {
  strategicAlignment: number;
  operationalExcellence: number;
  customerValue: number;
  riskMitigation: number;
  timelinessScore?: number;
  scalabilityScore?: number;
}): Omit<BusinessValue, "recordId" | "scoreBreakdown"> & {
  scoreBreakdown: { strategicWeight: number; operationalWeight: number; customerWeight: number; riskWeight: number; timelinessWeight: number; scalabilityWeight: number };
} {
  const weights = {
    strategicWeight: 0.25,
    operationalWeight: 0.25,
    customerWeight: 0.2,
    riskWeight: 0.15,
    timelinessWeight: 0.1,
    scalabilityWeight: 0.05,
  };

  const timelinessScore = factors.timelinessScore ?? 0.5;
  const scalabilityScore = factors.scalabilityScore ?? 0.5;

  const overallScore =
    factors.strategicAlignment * weights.strategicWeight +
    factors.operationalExcellence * weights.operationalWeight +
    factors.customerValue * weights.customerWeight +
    factors.riskMitigation * weights.riskWeight +
    timelinessScore * weights.timelinessWeight +
    scalabilityScore * weights.scalabilityWeight;

  let valueRating: "critical" | "high" | "medium" | "low";
  if (overallScore >= 0.8) {
    valueRating = "critical";
  } else if (overallScore >= 0.6) {
    valueRating = "high";
  } else if (overallScore >= 0.4) {
    valueRating = "medium";
  } else {
    valueRating = "low";
  }

  return {
    strategicAlignment: factors.strategicAlignment,
    operationalExcellence: factors.operationalExcellence,
    customerValue: factors.customerValue,
    riskMitigation: factors.riskMitigation,
    timelinessScore,
    scalabilityScore,
    overallScore: Math.round(overallScore * 100) / 100,
    valueRating,
    scoreBreakdown: weights,
  };
}

/**
 * Calculate impact multipliers based on success probability and adoption
 */
export function calculateImpactMultipliers(factors: {
  implementationSuccessProbability: number;
  adoptionRate: number;
  marketSize?: "global" | "regional" | "local";
  hasCompetitiveAdvantage?: boolean;
  sustainabilityYears?: number;
}): ImpactMultiplier {
  const marketMultiplierMap = {
    global: 2.5,
    regional: 1.5,
    local: 0.8,
  };

  const marketSize = factors.marketSize ?? "regional";
  const hasCompetitiveAdvantage = factors.hasCompetitiveAdvantage ?? false;
  const sustainabilityYears = factors.sustainabilityYears ?? 3;

  const marketMultiplier = marketMultiplierMap[marketSize];
  const competitiveAdvantageMultiplier = hasCompetitiveAdvantage ? 2.0 : 1.0;
  const sustainabilityFactor = Math.min(1.0, Math.max(0.2, sustainabilityYears / 5)); // 0.2-1.0 based on years

  return {
    implementationSuccessProbability: Math.max(0, Math.min(1, factors.implementationSuccessProbability)),
    adoptionRate: Math.max(0, Math.min(1, factors.adoptionRate)),
    marketMultiplier,
    competitiveAdvantageMultiplier,
    sustainabilityFactor,
  };
}

/**
 * Assess comprehensive business impact
 */
export function assessBusinessImpact(params: {
  recordId: string;
  recordType: "decision" | "action" | "recommendation" | "experiment";
  sourceConnector?: string;
  financialImpact: FinancialImpact;
  businessValueFactors: Parameters<typeof calculateBusinessValue>[0];
  multiplierFactors: Parameters<typeof calculateImpactMultipliers>[0];
}): BusinessImpactAssessment {
  const roi = calculateROI(params.financialImpact);
  const businessValue = calculateBusinessValue(params.businessValueFactors);
  const multipliers = calculateImpactMultipliers(params.multiplierFactors);

  // Calculate adjusted ROI with multipliers
  const successMultiplier = multipliers.implementationSuccessProbability * multipliers.adoptionRate;
  const scaleMultiplier = multipliers.marketMultiplier * multipliers.competitiveAdvantageMultiplier * multipliers.sustainabilityFactor;
  const adjustedROI = roi.roiPercent * successMultiplier * scaleMultiplier;

  // Calculate confidence score
  const confidenceScore = (multipliers.implementationSuccessProbability + multipliers.adoptionRate) / 2;

  // Determine risk level
  let riskLevel: "critical" | "high" | "medium" | "low";
  if (confidenceScore < 0.3 || adjustedROI < 0) {
    riskLevel = "critical";
  } else if (confidenceScore < 0.5 || adjustedROI < 10) {
    riskLevel = "high";
  } else if (confidenceScore < 0.7 || adjustedROI < 25) {
    riskLevel = "medium";
  } else {
    riskLevel = "low";
  }

  // Generate recommendations
  const recommendations = [];
  if (multipliers.implementationSuccessProbability < 0.8) {
    recommendations.push({
      area: "Implementation Risk",
      recommendation: "Improve implementation planning and risk mitigation",
      potentialROIImprovement: adjustedROI * 0.15,
    });
  }
  if (multipliers.adoptionRate < 0.7) {
    recommendations.push({
      area: "Adoption",
      recommendation: "Develop change management and stakeholder engagement plan",
      potentialROIImprovement: adjustedROI * 0.2,
    });
  }
  if (businessValue.overallScore < 0.6) {
    recommendations.push({
      area: "Business Value",
      recommendation: "Realign with strategic priorities and customer needs",
      potentialROIImprovement: adjustedROI * 0.25,
    });
  }

  return {
    recordId: params.recordId,
    recordType: params.recordType,
    sourceConnector: params.sourceConnector,
    roi,
    businessValue: {
      ...businessValue,
      recordId: params.recordId,
    },
    multipliers,
    adjustedROI: Math.round(adjustedROI * 100) / 100,
    confidenceScore: Math.round(confidenceScore * 100) / 100,
    riskLevel,
    recommendations,
    assessedAt: new Date(),
  };
}

/**
 * Analyze batch of records for impact
 */
export function assessBatchImpact(records: Array<Parameters<typeof assessBusinessImpact>[0]>): BatchImpactResult {
  const startTime = Date.now();
  const assessments = records.map(assessBusinessImpact);

  const totalExpectedValue = assessments.reduce((sum, a) => sum + a.roi.expectedBenefit, 0);

  const roiDistribution = {
    exceptional: assessments.filter((a) => a.roi.roiPercent > 50).length,
    high: assessments.filter((a) => a.roi.roiPercent > 25 && a.roi.roiPercent <= 50).length,
    moderate: assessments.filter((a) => a.roi.roiPercent > 5 && a.roi.roiPercent <= 25).length,
    low: assessments.filter((a) => a.roi.roiPercent >= 0 && a.roi.roiPercent <= 5).length,
    negative: assessments.filter((a) => a.roi.roiPercent < 0).length,
  };

  const paybackMonths = assessments
    .filter((a) => a.roi.paybackMonths !== null)
    .map((a) => a.roi.paybackMonths as number)
    .reduce((sum, val) => sum + val, 0);

  const paybackPeriodAverage =
    assessments.filter((a) => a.roi.paybackMonths !== null).length > 0
      ? Math.round((paybackMonths / assessments.filter((a) => a.roi.paybackMonths !== null).length) * 10) / 10
      : 0;

  return {
    batchId: `batch_${Date.now()}`,
    totalRecords: records.length,
    analyzedRecords: assessments.length,
    averageROI:
      Math.round(
        (assessments.reduce((sum, a) => sum + a.roi.roiPercent, 0) / Math.max(1, assessments.length)) * 100,
      ) / 100,
    averageBusinessValue:
      Math.round(
        (assessments.reduce((sum, a) => sum + a.businessValue.overallScore, 0) / Math.max(1, assessments.length)) * 100,
      ) / 100,
    totalExpectedValue: Math.round(totalExpectedValue),
    roiDistribution,
    criticalRiskCount: assessments.filter((a) => a.riskLevel === "critical").length,
    highRiskCount: assessments.filter((a) => a.riskLevel === "high").length,
    paybackPeriodAverage,
    analysisTimeMs: Date.now() - startTime,
  };
}

/**
 * Generate mock business impact data for testing
 */
export function generateMockBusinessImpactAssessment(count: number = 10): BusinessImpactAssessment[] {
  const assessments: BusinessImpactAssessment[] = [];

  for (let i = 0; i < count; i++) {
    const recordId = `rec_${i + 1}`;
    const recordTypes: Array<"decision" | "action" | "recommendation" | "experiment"> = [
      "decision",
      "action",
      "recommendation",
      "experiment",
    ];
    const recordType = recordTypes[i % recordTypes.length];

    const assessment = assessBusinessImpact({
      recordId,
      recordType,
      sourceConnector: ["hubspot", "salesforce", "api"][i % 3],
      financialImpact: {
        initialInvestment: 10000 + Math.random() * 90000,
        expectedBenefit: 50000 + Math.random() * 450000,
        timeToValue: 6 + Math.random() * 18,
        riskAdjustmentFactor: 0.7 + Math.random() * 0.3,
        discountRate: 0.08 + Math.random() * 0.04,
      },
      businessValueFactors: {
        strategicAlignment: 0.4 + Math.random() * 0.6,
        operationalExcellence: 0.3 + Math.random() * 0.7,
        customerValue: 0.4 + Math.random() * 0.6,
        riskMitigation: 0.3 + Math.random() * 0.7,
        timelinessScore: 0.5 + Math.random() * 0.5,
        scalabilityScore: 0.4 + Math.random() * 0.6,
      },
      multiplierFactors: {
        implementationSuccessProbability: 0.6 + Math.random() * 0.4,
        adoptionRate: 0.5 + Math.random() * 0.5,
        marketSize: ["global", "regional", "local"][i % 3] as "global" | "regional" | "local",
        hasCompetitiveAdvantage: Math.random() > 0.5,
        sustainabilityYears: 2 + Math.random() * 4,
      },
    });

    assessments.push(assessment);
  }

  return assessments;
}
