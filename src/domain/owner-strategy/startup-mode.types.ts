/**
 * Owner Strategy — Startup Mode (Validation + Launch Workbench) types
 * (execution.md Phases 14–15, GAP-008). Pure type definitions.
 *
 * Startup Mode begins with validation, not optimism: it scores ideas, rejects
 * weak ones, exposes capital insufficiency, and only allows launch AFTER an idea
 * has been validated.
 */
import type { WealthPathInput, WealthPathType } from "./wealth-path.types";
import type { WorkPackage } from "./work-package.types";

export interface StartupIntake {
  location?: string | null;
  capitalAvailable?: number | null;
  monthlySurvivalNeed?: number | null;
  hoursPerWeekAvailable?: number | null;
  skills?: string[] | null;
  existingAssets?: string[] | null;
  riskTolerance?: "low" | "medium" | "high" | null;
  targetMonthlyIncome?: number | null;
  preferredIndustries?: string[] | null;
  canSell?: boolean | null;
  canOperateDaily?: boolean | null;
  fastCashVsScale?: "fast_cash" | "long_term_scale" | null;
}

export interface StartupIdea {
  name: string;
  industry: string;
  /** Structural signals (reuses the wealth-path input vocabulary). */
  structural: WealthPathInput;
  estimatedStartupCost?: number | null;
  estimatedMonthlyRevenue?: number | null;
  estimatedMonthlyCost?: number | null;
  timeToFirstRevenueMonths?: number | null;
  jurisdictionKnown?: boolean | null;
}

export interface IdeaEvaluation {
  name: string;
  industry: string;
  wealthPathType: WealthPathType;
  bmqScore: number;
  riskAdjustedScore: number;
  startupCost: number | null;
  capitalSufficient: boolean | null;
  capitalGap: number | null; // >0 = shortfall
  monthlyProfit: number | null;
  breakEvenMonths: number | null;
  coversSurvival: boolean | null;
  accepted: boolean;
  reasons: string[];
  warnings: string[];
  confidence: number;
}

export interface StartupValidationResult {
  shortlist: IdeaEvaluation[]; // accepted, best first
  rejected: IdeaEvaluation[];
  recommended: IdeaEvaluation | null;
  validationWorkPackage: WorkPackage | null;
  complianceConfidence: "high" | "low" | "unknown";
  killPivotCriteria: string[];
  warnings: string[];
  /** Always false — validation never authorizes launch (must validate first). */
  launchAllowed: boolean;
}

export interface StartupLaunchResult {
  ideaName: string;
  launchWorkPackage: WorkPackage;
  plan306090: { day30: string[]; day60: string[]; day90: string[] };
  reviewCadenceDays: number;
  killPivotCriteria: string[];
  complianceReviewRequired: boolean;
}
