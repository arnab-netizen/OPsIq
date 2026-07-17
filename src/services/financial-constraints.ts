/**
 * STAGE 10 SLICE 1: Financial Constraints Engine
 *
 * Determines whether the business can afford to take on risky interventions
 * based on financial health, survival status, and cash runway.
 *
 * Applies fail-closed gating: risky actions are BLOCKED by default unless
 * financial position is healthy enough.
 *
 * Non-DB buildable service: uses Survival Intelligence + Business Condition
 * to make constraint decisions.
 */

import {
  SurvivalStatus,
  DebtPressure,
  MarginPressure,
  SurvivalMetrics,
  assessSurvivalIntelligence,
} from "@/domain/survival/survival-intelligence";
import {
  Financials,
} from "@/domain/business-condition/business-condition";
import { z } from "zod";

/**
 * Constraint evaluation result
 */
export const ConstraintEvaluationSchema = z.object({
  canAffordGrowth: z.boolean().describe("Can invest in growth initiatives"),
  canAffordExperiment: z.boolean().describe("Can run experiments (lower cost)"),
  canAffordAcquisition: z.boolean().describe("Can invest in customer acquisition"),
  canAffordTalent: z.boolean().describe("Can invest in team/hiring"),
  cashRunwayMonths: z.number().describe("Available months of runway"),
  survivalStatus: z.nativeEnum(SurvivalStatus),
  debtPressure: z.nativeEnum(DebtPressure),
  marginPressure: z.nativeEnum(MarginPressure),
  constraints: z.array(z.string()).describe("List of active constraints"),
  recommendedActions: z.array(z.string()).describe("Recommended actions given constraints"),
  evaluatedAt: z.date(),
});

export type ConstraintEvaluation = z.infer<typeof ConstraintEvaluationSchema>;

/**
 * Calculate financial constraints on decision-making
 *
 * Fail-closed: all interventions blocked by default unless conditions pass
 *
 * Growth investments allowed if:
 * - Survival status is HEALTHY or THRIVING
 * - Runway >= 12 months
 * - Debt pressure is LOW or NONE
 *
 * Experiments allowed if:
 * - Survival status is STABLE or better
 * - Runway >= 6 months
 *
 * Acquisition allowed if:
 * - Survival status is HEALTHY or THRIVING
 * - Runway >= 12 months
 * - Debt pressure is MODERATE or better
 *
 * Talent investment allowed if:
 * - Survival status is HEALTHY or THRIVING
 * - Runway >= 12 months
 * - Operating margin >= 0
 */
export function evaluateFinancialConstraints(input: {
  survivalMetrics: SurvivalMetrics;
  financials: Financials;
}): ConstraintEvaluation {
  const { survivalMetrics, financials } = input;
  const now = new Date();
  const constraints: string[] = [];
  const recommendations: string[] = [];

  const { survivalStatus, cashRunwayMonths, debtPressure, marginPressure } =
    survivalMetrics;

  // Growth investment gates
  const canAffordGrowth =
    (survivalStatus === SurvivalStatus.HEALTHY ||
      survivalStatus === SurvivalStatus.THRIVING) &&
    cashRunwayMonths >= 12 &&
    (debtPressure === DebtPressure.NONE || debtPressure === DebtPressure.LOW);

  if (!canAffordGrowth) {
    constraints.push("growth_investment_blocked");
    if (survivalStatus === SurvivalStatus.CRITICAL ||
      survivalStatus === SurvivalStatus.STRESSED)
      recommendations.push("Focus on cash preservation until survival status improves");
    if (cashRunwayMonths < 12)
      recommendations.push(`Build runway to 12+ months (currently ${cashRunwayMonths.toFixed(1)})`);
    if (debtPressure === DebtPressure.CRITICAL)
      recommendations.push("Prioritize debt reduction over growth");
  } else {
    recommendations.push("Growth investments can be evaluated");
  }

  // Experiment gates (lower bar than growth)
  const canAffordExperiment =
    (survivalStatus === SurvivalStatus.STABLE ||
      survivalStatus === SurvivalStatus.HEALTHY ||
      survivalStatus === SurvivalStatus.THRIVING) &&
    cashRunwayMonths >= 6;

  if (!canAffordExperiment) {
    constraints.push("experiment_blocked");
    if (survivalStatus === SurvivalStatus.CRITICAL)
      recommendations.push("Crisis mode: no new experiments until runway > 3 months");
  } else {
    recommendations.push("Low-cost experiments are feasible");
  }

  // Acquisition gates (growth-level investment)
  const canAffordAcquisition =
    (survivalStatus === SurvivalStatus.HEALTHY ||
      survivalStatus === SurvivalStatus.THRIVING) &&
    cashRunwayMonths >= 12 &&
    (debtPressure === DebtPressure.NONE ||
      debtPressure === DebtPressure.LOW ||
      debtPressure === DebtPressure.MODERATE);

  if (!canAffordAcquisition) {
    constraints.push("acquisition_blocked");
    if (cashRunwayMonths < 12)
      recommendations.push(
        "Acquisition spending requires 12+ months runway for ROI horizon"
      );
    if (debtPressure === DebtPressure.CRITICAL)
      recommendations.push("Reduce debt before acquisition spending");
  } else {
    recommendations.push("Acquisition spending can be evaluated");
  }

  // Talent investment gates
  const canAffordTalent =
    (survivalStatus === SurvivalStatus.HEALTHY ||
      survivalStatus === SurvivalStatus.THRIVING) &&
    cashRunwayMonths >= 12 &&
    financials.operatingMargin >= 0;

  if (!canAffordTalent) {
    constraints.push("talent_investment_blocked");
    if (financials.operatingMargin < 0)
      recommendations.push("Fix unit economics (negative margin) before hiring");
    if (survivalStatus !== SurvivalStatus.HEALTHY &&
      survivalStatus !== SurvivalStatus.THRIVING)
      recommendations.push("Improve survival status before headcount expansion");
  } else {
    recommendations.push("Strategic hiring can proceed");
  }

  return {
    canAffordGrowth,
    canAffordExperiment,
    canAffordAcquisition,
    canAffordTalent,
    cashRunwayMonths,
    survivalStatus,
    debtPressure,
    marginPressure,
    constraints,
    recommendedActions: recommendations,
    evaluatedAt: now,
  };
}

/**
 * Shorthand: evaluate constraints from raw financial data
 */
export function evaluateConstraintsFromFinancials(
  financials: Financials
): ConstraintEvaluation {
  const input = { financials };
  const survivalMetrics = assessSurvivalIntelligence(input);

  return evaluateFinancialConstraints({
    survivalMetrics,
    financials,
  });
}

/**
 * Check if a specific action type is permitted given constraints
 */
export function isActionPermitted(
  evaluation: ConstraintEvaluation,
  actionType: "growth" | "experiment" | "acquisition" | "talent"
): boolean {
  switch (actionType) {
    case "growth":
      return evaluation.canAffordGrowth;
    case "experiment":
      return evaluation.canAffordExperiment;
    case "acquisition":
      return evaluation.canAffordAcquisition;
    case "talent":
      return evaluation.canAffordTalent;
    default:
      return false;
  }
}

/**
 * Get human-readable constraint explanation
 */
export function getConstraintExplanation(
  evaluation: ConstraintEvaluation,
  actionType: "growth" | "experiment" | "acquisition" | "talent"
): string {
  const isPermitted = isActionPermitted(evaluation, actionType);

  if (isPermitted) {
    return `${actionType} action is permitted (survival: ${evaluation.survivalStatus}, runway: ${evaluation.cashRunwayMonths.toFixed(1)}m)`;
  }

  const reasons: string[] = [];

  if (evaluation.survivalStatus === SurvivalStatus.CRITICAL ||
    evaluation.survivalStatus === SurvivalStatus.STRESSED) {
    reasons.push("business in survival mode");
  }

  if (evaluation.cashRunwayMonths < 6) {
    reasons.push(`low runway (${evaluation.cashRunwayMonths.toFixed(1)}m)`);
  }

  if (evaluation.debtPressure === DebtPressure.CRITICAL) {
    reasons.push("critical debt pressure");
  }

  if (evaluation.marginPressure === MarginPressure.NEGATIVE ||
    evaluation.marginPressure === MarginPressure.CRITICAL) {
    reasons.push("negative unit economics");
  }

  return `${actionType} action blocked: ${reasons.join(", ")}`;
}
