/**
 * Owner Finance (Module 2) — shared types for the deterministic finance engine.
 *
 * Pure types only: no DB, no I/O. Monetary values are in the business currency
 * (never assumed USD). Every metric input is optional at the type level; the
 * engine treats missing/invalid numbers as `null` (missing) and never invents a
 * value. `null` on a derived metric means "not computable from provided data".
 */

export const FINANCIAL_BUSINESS_MODELS = ["service", "inventory", "hybrid"] as const;
export type FinancialBusinessModel = (typeof FINANCIAL_BUSINESS_MODELS)[number];

/** Business survival state, escalating from healthy to insolvency risk. */
export const SURVIVAL_STATES = ["SAFE", "WATCH", "AT_RISK", "CRITICAL", "INSOLVENT_RISK"] as const;
export type SurvivalState = (typeof SURVIVAL_STATES)[number];

/** Survival priority hierarchy — what class of work is the priority. */
export const SURVIVAL_TIERS = ["existential", "recovery", "growth", "optimization"] as const;
export type SurvivalTier = (typeof SURVIVAL_TIERS)[number];

/** Raw finance snapshot entered by the owner for one reporting period. */
export interface FinancialSnapshotInput {
  periodStart: string; // ISO date
  periodEnd: string; // ISO date
  currency: string;
  businessModel?: FinancialBusinessModel;
  industryTemplate?: string;

  // Revenue
  revenue?: number;
  b2cRevenue?: number;
  b2bRevenue?: number;

  // Costs
  costOfGoodsOrServices?: number;
  fixedCosts?: number;
  variableCosts?: number;
  rent?: number;
  salaryPayroll?: number;
  utilities?: number;
  deliveryFulfilmentCost?: number;
  marketingSpend?: number;
  marketingAttributedRevenue?: number;

  // Leakage
  discountAmount?: number;
  refundAmount?: number;
  reworkCost?: number;
  complaintCost?: number;

  // Debt / cash
  loanEmiDebtPayments?: number;
  totalDebtOutstanding?: number;
  cashOnHand?: number;
  /**
   * Bank balance from the latest compatible cashflow snapshot — enriched by the service layer
   * before calling the engine. Never persisted on the finance snapshot itself; absent when no
   * compatible cashflow snapshot exists (fail-closed, not zero).
   */
  bankBalance?: number;
  receivables?: number;
  receivablesOverdue?: number;
  payables?: number;
  payablesOverdue?: number;
  ownerWithdrawals?: number;
  inventoryStockCashLock?: number;

  // Volume
  orderCount?: number;
  customerCount?: number;

  notes?: string;
}

/**
 * Deterministic derived metrics. Ratio/per-unit metrics are `number | null`
 * (`null` = not computable). Composite scores are always `0..100`; their
 * trustworthiness is carried by `dataConfidenceScore`.
 */
export interface FinancialDerivedMetrics {
  currency: string;
  currencyValid: boolean;

  grossMarginPct: number | null;
  netMarginPct: number | null;
  contributionMarginPct: number | null;
  fixedCostBurdenPct: number | null;
  payrollBurdenPct: number | null;
  breakEvenRevenue: number | null;
  dailyBreakEvenRevenue: number | null;
  cashRunwayDays: number | null;
  cashDaysOfCosts: number | null; // cash / daily cost — valid even when profitable
  debtServicePressurePct: number | null;
  receivablesPressurePct: number | null;
  payablesPressurePct: number | null;
  costLeakageRatioPct: number | null;
  discountLeakagePct: number | null;
  refundReworkLeakagePct: number | null;
  revenueQualityScore: number | null;
  profitPerOrder: number | null;
  profitPerCustomer: number | null;
  ownerWithdrawalPressurePct: number | null;

  netProfit: number | null;

  financialHealthScore: number; // 0..100
  financialRiskScore: number; // 0..100
  financialOpportunityScore: number; // 0..100
  dataConfidenceScore: number; // 0..100

  survivalState: SurvivalState;
  survivalTier: SurvivalTier;

  missingRequiredInputs: string[];
}
