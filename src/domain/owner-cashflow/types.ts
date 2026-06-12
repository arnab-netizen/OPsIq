/**
 * Owner Cashflow (Module 5) — shared types for the deterministic cashflow engine.
 *
 * Pure types only: no DB, no I/O, no LLM. Monetary values are in the business
 * currency (never assumed USD). Every snapshot input is optional at the type
 * level; the engine treats missing/invalid numbers as `null` (missing) and never
 * invents a value. `null` on a derived metric means "not computable from the
 * provided data". This module answers the liquidity question (can the business
 * survive the next ~30 days of cash demands) separately from profit.
 */

export const CASHFLOW_BUSINESS_MODELS = ["service", "inventory", "hybrid"] as const;
export type CashflowBusinessModel = (typeof CASHFLOW_BUSINESS_MODELS)[number];

/** Cashflow survival state, escalating from healthy to insolvency risk. */
export const CASHFLOW_STATES = ["SAFE", "WATCH", "AT_RISK", "CRITICAL", "INSOLVENT_RISK"] as const;
export type CashflowState = (typeof CASHFLOW_STATES)[number];

/** Survival priority hierarchy — what class of cash work is the priority. */
export const CASHFLOW_TIERS = ["existential", "recovery", "growth", "optimization"] as const;
export type CashflowTier = (typeof CASHFLOW_TIERS)[number];

/** Raw cashflow snapshot entered by the owner for one reporting period. */
export interface CashflowSnapshotInput {
  periodStart: string; // ISO date
  periodEnd: string; // ISO date
  currency: string;
  businessModel?: CashflowBusinessModel;
  industryTemplate?: string;

  // Cash position
  cashInHand?: number;
  bankBalance?: number;

  // Inflow
  dailyCollections?: number; // average cash collected per day
  receivables?: number; // money owed to the business
  receivablesOverdue?: number; // of which is past due

  // Outflow — payables
  payables?: number; // money the business owes
  payablesOverdue?: number; // of which is past due

  // Outflow — near-term obligations (this period)
  upcomingEmi?: number; // loan / EMI due
  rentDue?: number;
  salaryDue?: number;
  vendorDue?: number;
  taxDue?: number;
  ownerWithdrawal?: number; // planned owner draw this period

  notes?: string;
}

/**
 * Deterministic derived cashflow metrics. Amount/ratio metrics are
 * `number | null` (`null` = not computable). Composite scores are always
 * `0..100`; their trustworthiness is carried by `dataConfidenceScore`.
 */
export interface CashflowDerivedMetrics {
  currency: string;
  currencyValid: boolean;

  totalCash: number | null;
  nearTermObligations: number | null;
  cashRunwayDays: number | null;
  collectionGapDays: number | null;
  overdueReceivablesPct: number | null;
  payablesPressurePct: number | null;
  urgentPaymentRiskPct: number | null;
  ownerWithdrawalPressurePct: number | null;

  cashflowHealthScore: number; // 0..100
  cashflowDangerScore: number; // 0..100 (risk)
  cashflowOpportunityScore: number; // 0..100
  dataConfidenceScore: number; // 0..100

  cashflowState: CashflowState;
  cashflowTier: CashflowTier;

  missingRequiredInputs: string[];
}
