/**
 * STAGE 9 SLICE 1: Survival Intelligence Domain
 *
 * Deterministic survival assessment engine for cash runway, financial health,
 * debt pressure, and margin pressure. Gates risky interventions.
 *
 * Design principles:
 * 1. Fail-closed: Missing financials = CRITICAL survival status (blocked)
 * 2. Deterministic: Same inputs always produce same scores
 * 3. Survival-first: Prioritize cash preservation over growth
 * 4. Explicit gates: Interventions blocked if survival threatened
 * 5. No AI guessing: All calculations based on real financials
 */

import { z } from "zod";
import { Financials, FinancialHealth } from "../business-condition/business-condition";

/**
 * Survival status: comprehensive assessment of business viability
 */
export enum SurvivalStatus {
  CRITICAL = "critical", // <1 month runway or negative cash, immediate crisis
  STRESSED = "stressed", // 1-3 months runway, high-risk interventions blocked
  STABLE = "stable", // 3-6 months runway, moderate-risk allowed
  HEALTHY = "healthy", // 6-12 months runway, growth possible
  THRIVING = "thriving", // 12+ months runway + positive unit economics
}

/**
 * Debt pressure levels
 */
export enum DebtPressure {
  NONE = "none", // No debt or <10% of monthly revenue
  LOW = "low", // 10-25% of monthly revenue
  MODERATE = "moderate", // 25-50% of monthly revenue
  HIGH = "high", // 50-100% of monthly revenue
  CRITICAL = "critical", // >100% of monthly revenue (unsustainable)
}

/**
 * Margin pressure levels (operating margin assessment)
 */
export enum MarginPressure {
  HEALTHY = "healthy", // >20% operating margin
  ADEQUATE = "adequate", // 10-20% operating margin
  CONCERNING = "concerning", // 0-10% operating margin
  NEGATIVE = "negative", // <0% operating margin (burning cash)
  CRITICAL = "critical", // <-20% operating margin (unsustainable burn)
}

/**
 * Survival metrics: comprehensive financial health assessment
 */
export const SurvivalMetricsSchema = z.object({
  cashRunwayMonths: z.number().min(0).max(120).describe("Months until out of cash (clamped 0-120)"),
  survivalStatus: z.nativeEnum(SurvivalStatus).describe("Overall survival assessment"),
  debtPressure: z.nativeEnum(DebtPressure).describe("Debt-to-revenue ratio assessment"),
  marginPressure: z.nativeEnum(MarginPressure).describe("Operating margin health"),
  financialHealthScore: z
    .number()
    .min(0)
    .max(100)
    .describe("Composite financial health 0-100 (higher = healthier)"),
  risksIdentified: z.array(z.string()).describe("List of financial risks: 'negative_cash', 'high_debt', 'negative_margin', 'low_runway'"),
  interventionBlocked: z.boolean().describe("True if survival status blocks risky interventions"),
  lastAssessedAt: z.date().describe("When this assessment was calculated"),
});

export type SurvivalMetrics = z.infer<typeof SurvivalMetricsSchema>;

/**
 * Input for survival assessment
 */
export const SurvivalAssessmentInputSchema = z.object({
  financials: z.object({
    monthlyRecurringRevenue: z.number().min(0),
    monthlyExpenses: z.number().min(0),
    cashOnHand: z.number(),
    burnRate: z.number().min(0),
    cashRunwayMonths: z.number().min(0),
    grossMargin: z.number().min(0).max(100),
    operatingMargin: z.number().min(-100).max(100),
    debtOutstanding: z.number().min(0).optional(),
    customerConcentration: z.number().min(0).max(100).optional(),
  }).describe("Financial metrics from business condition"),
});

export type SurvivalAssessmentInput = z.infer<typeof SurvivalAssessmentInputSchema>;

/**
 * Validate survival assessment input has required fields
 */
export function validateSurvivalInput(input: SurvivalAssessmentInput): string[] {
  const errors: string[] = [];
  const f = input.financials;

  if (f.monthlyRecurringRevenue < 0) errors.push("Monthly recurring revenue cannot be negative");
  if (f.monthlyExpenses < 0) errors.push("Monthly expenses cannot be negative");
  if (f.burnRate < 0) errors.push("Burn rate cannot be negative");
  if (f.cashRunwayMonths < 0) errors.push("Cash runway cannot be negative");
  if (f.grossMargin < 0 || f.grossMargin > 100)
    errors.push("Gross margin must be 0-100");
  if (f.operatingMargin < -100 || f.operatingMargin > 100)
    errors.push("Operating margin must be -100 to 100");
  if (f.debtOutstanding !== undefined && f.debtOutstanding < 0)
    errors.push("Debt outstanding cannot be negative");
  if (f.customerConcentration !== undefined && (f.customerConcentration < 0 || f.customerConcentration > 100))
    errors.push("Customer concentration must be 0-100");

  return errors;
}

/**
 * Calculate cash runway in months
 *
 * Formula: monthlyRecurringRevenue > 0 ?
 *   (cashOnHand + 12 * monthlyRecurringRevenue - 12 * monthlyExpenses) / monthlyExpenses :
 *   cashOnHand / monthlyExpenses (if no revenue, pure burn)
 *
 * Clamped to 0-120 to prevent extreme outliers from skewing assessment
 */
export function calculateCashRunway(
  monthlyRecurringRevenue: number,
  monthlyExpenses: number,
  cashOnHand: number
): number {
  if (monthlyExpenses <= 0) return 120;

  let runway: number;

  if (monthlyRecurringRevenue > 0) {
    // With revenue: how long can we survive if revenue continues?
    const netCashFlow = monthlyRecurringRevenue - monthlyExpenses;
    if (netCashFlow >= 0) {
      // Profitable: infinite runway (cap at 120)
      runway = 120;
    } else {
      // Loss-making: runway = cash / monthly burn
      runway = cashOnHand / Math.abs(netCashFlow);
    }
  } else {
    // No revenue: runway = cash / monthly burn
    runway = Math.max(0, cashOnHand / monthlyExpenses);
  }

  // Clamp to 0-120 for assessment stability
  return Math.max(0, Math.min(120, Math.round(runway * 10) / 10));
}

/**
 * Classify survival status based on cash runway and cash position
 */
export function classifySurvivalStatus(
  cashRunwayMonths: number,
  cashOnHand: number
): SurvivalStatus {
  // Negative or zero cash = immediate crisis
  if (cashOnHand <= 0) return SurvivalStatus.CRITICAL;

  // Runway tiers
  if (cashRunwayMonths < 1) return SurvivalStatus.CRITICAL;
  if (cashRunwayMonths < 3) return SurvivalStatus.STRESSED;
  if (cashRunwayMonths < 6) return SurvivalStatus.STABLE;
  if (cashRunwayMonths < 12) return SurvivalStatus.HEALTHY;
  return SurvivalStatus.THRIVING;
}

/**
 * Classify debt pressure based on debt-to-revenue ratio
 */
export function classifyDebtPressure(
  debtOutstanding: number | undefined,
  monthlyRecurringRevenue: number
): DebtPressure {
  if (!debtOutstanding || debtOutstanding <= 0) return DebtPressure.NONE;

  const mrrSafe = Math.max(monthlyRecurringRevenue, 1); // Avoid division by zero
  const debtToMonthlyRatio = debtOutstanding / mrrSafe;

  if (debtToMonthlyRatio < 0.1) return DebtPressure.NONE;
  if (debtToMonthlyRatio < 0.25) return DebtPressure.LOW;
  if (debtToMonthlyRatio < 0.5) return DebtPressure.MODERATE;
  if (debtToMonthlyRatio < 1.0) return DebtPressure.HIGH;
  return DebtPressure.CRITICAL;
}

/**
 * Classify margin pressure based on operating margin
 */
export function classifyMarginPressure(operatingMargin: number): MarginPressure {
  if (operatingMargin >= 20) return MarginPressure.HEALTHY;
  if (operatingMargin >= 10) return MarginPressure.ADEQUATE;
  if (operatingMargin >= 0) return MarginPressure.CONCERNING;
  if (operatingMargin >= -20) return MarginPressure.NEGATIVE;
  return MarginPressure.CRITICAL;
}

/**
 * Calculate composite financial health score (0-100)
 *
 * Formula weights:
 * - Runway (40%): 0 months = 0pts, 12+ months = 40pts
 * - Margin (30%): negative = 0pts, 20%+ = 30pts
 * - Debt (20%): high = 0pts, none = 20pts
 * - Cash position (10%): negative = 0pts, healthy = 10pts
 */
export function calculateFinancialHealthScore(
  cashRunwayMonths: number,
  operatingMargin: number,
  debtPressure: DebtPressure,
  cashOnHand: number
): number {
  let score = 0;

  // Runway component (40 points max)
  const runwayScore = Math.min(40, (cashRunwayMonths / 12) * 40);
  score += runwayScore;

  // Margin component (30 points max)
  const marginScore = Math.max(0, Math.min(30, operatingMargin * 1.5));
  score += marginScore;

  // Debt component (20 points max)
  const debtScores = {
    [DebtPressure.NONE]: 20,
    [DebtPressure.LOW]: 15,
    [DebtPressure.MODERATE]: 10,
    [DebtPressure.HIGH]: 5,
    [DebtPressure.CRITICAL]: 0,
  };
  score += debtScores[debtPressure];

  // Cash position component (10 points max)
  const cashScore = cashOnHand > 0 ? 10 : 0;
  score += cashScore;

  return Math.round(score);
}

/**
 * Identify financial risks from assessment
 */
export function identifyFinancialRisks(
  cashOnHand: number,
  cashRunwayMonths: number,
  operatingMargin: number,
  debtPressure: DebtPressure
): string[] {
  const risks: string[] = [];

  if (cashOnHand < 0) risks.push("negative_cash");
  if (cashRunwayMonths < 3) risks.push("low_runway");
  if (operatingMargin < 0) risks.push("negative_margin");
  if (
    debtPressure === DebtPressure.HIGH ||
    debtPressure === DebtPressure.CRITICAL
  )
    risks.push("high_debt");

  return risks;
}

/**
 * Assess whether risky interventions should be blocked
 *
 * Block interventions if:
 * - Survival status is CRITICAL or STRESSED
 * - Negative cash position
 * - Runway < 3 months
 */
export function shouldBlockIntervention(
  survivalStatus: SurvivalStatus,
  cashOnHand: number,
  cashRunwayMonths: number
): boolean {
  if (
    survivalStatus === SurvivalStatus.CRITICAL ||
    survivalStatus === SurvivalStatus.STRESSED
  )
    return true;
  if (cashOnHand < 0) return true;
  if (cashRunwayMonths < 3) return true;
  return false;
}

/**
 * Comprehensive survival assessment
 *
 * Combines all metrics into a single assessment with survival status,
 * identified risks, and intervention blocking decision.
 */
export function assessSurvivalIntelligence(
  input: SurvivalAssessmentInput
): SurvivalMetrics {
  const f = input.financials;
  const now = new Date();

  // Calculate metrics
  const cashRunwayMonths = calculateCashRunway(
    f.monthlyRecurringRevenue,
    f.monthlyExpenses,
    f.cashOnHand
  );

  const survivalStatus = classifySurvivalStatus(
    cashRunwayMonths,
    f.cashOnHand
  );

  const debtPressure = classifyDebtPressure(f.debtOutstanding, f.monthlyRecurringRevenue);

  const marginPressure = classifyMarginPressure(f.operatingMargin);

  const financialHealthScore = calculateFinancialHealthScore(
    cashRunwayMonths,
    f.operatingMargin,
    debtPressure,
    f.cashOnHand
  );

  const risksIdentified = identifyFinancialRisks(
    f.cashOnHand,
    cashRunwayMonths,
    f.operatingMargin,
    debtPressure
  );

  const interventionBlocked = shouldBlockIntervention(
    survivalStatus,
    f.cashOnHand,
    cashRunwayMonths
  );

  return {
    cashRunwayMonths,
    survivalStatus,
    debtPressure,
    marginPressure,
    financialHealthScore,
    risksIdentified,
    interventionBlocked,
    lastAssessedAt: now,
  };
}
