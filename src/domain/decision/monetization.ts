/**
 * Monetization-Grade Decision Output
 *
 * Business-focused decision format optimized for sales/value communication.
 * Removes technical details, focuses on impact and recommendations.
 */

import { ScenarioComparison } from "@/services/control/scenario-comparison";

export interface MonetizationDecision {
  // Business problem statement
  problem: string;

  // Financial impact of NOT acting
  estimatedLoss: number;

  // What to do (action-oriented)
  recommendedAction: string;

  // What happens if we act
  expectedImpact: number;

  // How confident are we
  confidence: number;

  // Is this blocked for safety/data reasons
  blocked: boolean;

  // Why is it blocked (if blocked)
  blockReason?: string;

  // Scenario analysis for what-if planning
  scenarios: {
    baseline: { impact: number; assumptions: string[] };
    recommended: { impact: number; assumptions: string[] };
    alternatives: Array<{ name: string; impact: number; assumptions: string[] }>;
  };

  // Severity level for UI coloring
  severity: "critical" | "high" | "medium" | "low";

  // Timeframe for impact
  timeframe?: string;

  // Risk level
  riskLevel: "low" | "medium" | "high";
}

/**
 * Build monetization decision from decision data.
 * Transforms technical decision output into business-focused format.
 */
export function buildMonetizationDecision(
  problem: string,
  estimatedLoss: number,
  recommendedAction: string,
  expectedImpact: number,
  confidence: number,
  scenarios: ScenarioComparison,
  blocked: boolean = false,
  blockReason?: string,
  timeframe?: string
): MonetizationDecision {
  // Determine severity based on loss amount
  let severity: "critical" | "high" | "medium" | "low";
  if (estimatedLoss > 500000) {
    severity = "critical";
  } else if (estimatedLoss > 100000) {
    severity = "high";
  } else if (estimatedLoss > 25000) {
    severity = "medium";
  } else {
    severity = "low";
  }

  // Determine risk level based on confidence
  let riskLevel: "low" | "medium" | "high";
  if (confidence >= 0.8) {
    riskLevel = "low";
  } else if (confidence >= 0.6) {
    riskLevel = "medium";
  } else {
    riskLevel = "high";
  }

  return {
    problem,
    estimatedLoss,
    recommendedAction,
    expectedImpact,
    confidence,
    blocked,
    blockReason,
    scenarios,
    severity,
    timeframe,
    riskLevel,
  };
}

/**
 * Get severity color for UI display.
 */
export function getSeverityColor(severity: string): string {
  switch (severity) {
    case "critical":
      return "text-red-600";
    case "high":
      return "text-orange-600";
    case "medium":
      return "text-yellow-600";
    case "low":
      return "text-green-600";
    default:
      return "text-gray-600";
  }
}

/**
 * Get severity background color for UI display.
 */
export function getSeverityBgColor(severity: string): string {
  switch (severity) {
    case "critical":
      return "bg-red-50 border-red-200";
    case "high":
      return "bg-orange-50 border-orange-200";
    case "medium":
      return "bg-yellow-50 border-yellow-200";
    case "low":
      return "bg-green-50 border-green-200";
    default:
      return "bg-gray-50 border-gray-200";
  }
}

/**
 * Get risk color for confidence display.
 */
export function getRiskColor(riskLevel: string): string {
  switch (riskLevel) {
    case "low":
      return "text-green-600";
    case "medium":
      return "text-yellow-600";
    case "high":
      return "text-red-600";
    default:
      return "text-gray-600";
  }
}

/**
 * Format currency value for display.
 */
export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

/**
 * Format percentage for display.
 */
export function formatPercentage(value: number): string {
  return `${(value * 100).toFixed(0)}%`;
}

/**
 * Phase C Monetization Engine Types
 * Quantify financial impact, ROI, payback period for decision paths
 */

export interface MonetizationMetrics {
  revenue_delta: number; // New revenue or prevented loss ($)
  cost_delta: number; // Savings (positive) or new costs (negative) ($)
  margin_delta: number; // Change in gross margin percentage (0-100)
  payback_days: number; // Days to recover capital_required from cash flow
  capital_required: number; // Initial investment required ($)
}

export interface FinancialProjection {
  pathId: string;
  baseline: {
    annual_revenue: number;
    annual_cost: number;
    gross_margin_pct: number;
  };
  projected: {
    annual_revenue: number;
    annual_cost: number;
    gross_margin_pct: number;
  };
  delta: MonetizationMetrics;
  cashFlowProjection: {
    month_1: number;
    month_3: number;
    month_6: number;
    month_12: number;
  };
  breakEvenDate?: string; // ISO date when project breaks even
  roi_percent: number; // Return on Investment (%)
  npv_12months: number; // Net Present Value over 12 months
}

export interface PathWithMonetization {
  pathId: string;
  expectedValue: number; // From scenarios
  monetization: FinancialProjection;
}
