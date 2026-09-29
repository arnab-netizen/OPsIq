/**
 * Cash / Profit Protection Depth (depth pass).
 *
 * Surfaces where the business is losing (or is about to lose) cash or margin, and the single protective
 * action for each — WITHOUT ever fabricating a money figure. It consumes financial observations the caller
 * has already counted or read from a real financial snapshot (never guessed here): cash runway, net margin,
 * counts of below-cost / discounted / reworked / under-priced work, working-capital strain, and whether the
 * unit economics exist at all. It expresses risk as a TYPE + SEVERITY + a real metric value (or null) — never
 * an invented amount. Material money decisions (pricing, discount, B2B terms, spend) stay owner-controlled.
 *
 * Governance stance (matches OpsIQ rules):
 * - No fabricated financial impact: metricValue is only ever a real number the caller provided, else null.
 * - Material money decisions require owner review; nothing is auto-changed.
 * - When unit economics or financial data are missing, it says so honestly (MISSING_UNIT_ECONOMICS /
 *   PROFIT_DATA_INSUFFICIENT) rather than inventing a profit picture.
 * - No fraud/negligence/firing/payroll/discipline language; no hidden staff score.
 */

import type { ApprovalLevel } from "./process-intelligence";

import { totalCosts } from "@/domain/owner-finance/metrics";

export type CashProfitSignalType =
  | "CASH_SAFETY_RISK"
  | "LOW_MARGIN_WORK_RISK"
  | "PRICING_LEAK"
  | "DISCOUNT_LEAK"
  | "REWORK_COST_RISK"
  | "DELIVERY_COST_RISK"
  | "STAFF_INEFFICIENCY_COST_RISK"
  | "B2B_UNDERPRICING_RISK"
  | "WORKING_CAPITAL_STRAIN"
  | "MISSING_UNIT_ECONOMICS"
  | "PROFIT_DATA_INSUFFICIENT";

export type CashProfitCategory = "CASH" | "MARGIN" | "PRICING" | "COST" | "WORKING_CAPITAL" | "DATA";
export type CashProfitSeverity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
export type CashProfitConfidence = "HIGH" | "MEDIUM" | "LOW" | "NEEDS_DATA";
export type ProtectiveAction =
  | "REVIEW_PRICING"
  | "TIGHTEN_DISCOUNT_POLICY"
  | "REPRICE_B2B_CONTRACT"
  | "REDUCE_REWORK_AT_SOURCE"
  | "REVIEW_DELIVERY_COST"
  | "REBALANCE_STAFFING"
  | "PROTECT_CASH_RUNWAY"
  | "CHASE_RECEIVABLES"
  | "CAPTURE_UNIT_ECONOMICS"
  | "COLLECT_FINANCIAL_DATA";

/**
 * Categorical survival/cashflow state the caller may hold when it does NOT have a real measured day/percent
 * figure. Lets OpsIQ warn about cash/margin risk from a qualitative state WITHOUT fabricating a precise number.
 */
export type CashRiskState = "SAFE" | "WATCH" | "AT_RISK" | "CRITICAL" | "INSOLVENT_RISK";

/** The financial observations the caller provides — all directly counted or read from a snapshot. */
export interface CashProfitInput {
  cashRunwayDays: number | null;
  netMarginPct: number | null;
  /**
   * Optional categorical survival/margin state, used ONLY when no real cashRunwayDays/netMarginPct figure
   * exists. OpsIQ then fires the cash/margin risk qualitatively (metricValue stays null) — never inventing a
   * precise day/percent from a category (which would be false precision).
   */
  cashRunwayState?: CashRiskState | null;
  netMarginState?: CashRiskState | null;
  lowMarginJobCount: number;
  pricingLeakCount: number;
  discountLeakCount: number;
  reworkCostEventCount: number;
  deliveryCostEventCount: number;
  staffInefficiencyCount: number;
  b2bUnderpricedCount: number;
  overdueReceivableCount: number;
  hasUnitEconomics: boolean;
  /**
   * The CURRENT Finance diagnosis's measured "cash on hand ÷ daily total costs" figure (see
   * deriveFinanceCashMeasure). It is a different metric from `cashRunwayDays` (cash ÷ daily NET burn), so it is
   * carried separately and never relabelled as runway. Enrichment only: it sharpens the wording of a cash-risk
   * the arbitrated state already raised; it never raises or clears one on its own.
   */
  financeCashDaysOfCosts?: { days: number; threshold: number | null } | null;
  /**
   * True when a current Finance diagnosis assessed profit from the submitted figures. This is Finance's own
   * completeness, not the Cash-flow cycle's — a Finance-only owner has a complete profit picture.
   */
  financialDataComplete: boolean;
  /**
   * The specific figures a current Finance snapshot lacks for a profit assessment (e.g. "revenue"). When
   * non-empty, the data-gap names exactly these instead of the generic "not enough financial data".
   */
  missingFinancialFields?: string[];
  supportingProofIds: string[];
  supportingOperationalEventIds: string[];
  supportingFinancialSnapshotIds: string[];
}

/** The 23-field cash/profit protection signal. */
export interface CashProfitSignal {
  workspaceId: string; // 1
  signalType: CashProfitSignalType; // 2
  category: CashProfitCategory; // 3
  severity: CashProfitSeverity; // 4
  confidence: CashProfitConfidence; // 5
  title: string; // 6
  ownerExplanation: string; // 7
  protectiveAction: ProtectiveAction; // 8
  approvalLevel: ApprovalLevel; // 9
  requiresOwnerReview: boolean; // 10
  riskGuardrail: string; // 11
  observedCount: number; // 12 — a directly-counted number, never guessed
  metricType: string | null; // 13 — which metric this is about
  metricValue: number | null; // 14 — a REAL value the caller provided, else null (never fabricated)
  metricThreshold: number | null; // 15 — the floor/threshold applied
  thresholdBreached: boolean; // 16
  directionOnly: boolean; // 17 — true: we report the leak direction, never an invented amount
  supportingProofIds: string[]; // 18
  supportingOperationalEventIds: string[]; // 19
  supportingFinancialSnapshotIds: string[]; // 20
  relatedProcessFinding: string | null; // 21
  missingData: string[]; // 22
  evaluatedAt: string; // 23
}

export interface CashProfitSummary {
  total: number;
  critical: number;
  high: number;
  ownerReviewRequired: number;
}

export interface CashProfitProtectionAnalysis {
  workspaceId: string;
  signals: CashProfitSignal[];
  topSignal: CashProfitSignal | null;
  summary: CashProfitSummary;
  evaluatedAt: string;
}

const SEVERITY_RANK: Record<CashProfitSeverity, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

const MATERIAL_GUARDRAIL =
  "This is a material money decision — OpsIQ recommends and shows the evidence, but you review and decide; nothing is repriced or changed automatically.";
const COST_GUARDRAIL =
  "This protects margin by fixing a cost at its source; the change is operational and reversible, and anything that touches price or pay still returns to you.";
const DATA_GUARDRAIL =
  "OpsIQ will not estimate a profit figure it cannot support — capture the missing data and the protection sharpens.";

// Thresholds — conservative floors; a breach is a real counted/read comparison, never a guess.
const CASH_RUNWAY_FLOOR = 30; // days
const NET_MARGIN_FLOOR = 5; // percent
const LOW_MARGIN_JOBS = 3;
const PRICING_LEAK = 2;
const DISCOUNT_LEAK = 3;
const REWORK_COST = 3;
const DELIVERY_COST = 3;
const STAFF_INEFFICIENCY = 3;
const B2B_UNDERPRICED = 1;
const OVERDUE_RECEIVABLES = 3;

/** Categorical states that represent a real cash/margin risk (WATCH is above the floor, so it does not fire). */
const CASH_RISK_STATES: readonly CashRiskState[] = ["AT_RISK", "CRITICAL", "INSOLVENT_RISK"];
/** Cash runway severity from a categorical state (no measured figure): CRITICAL/INSOLVENT → CRITICAL, AT_RISK → HIGH. */
function cashStateSeverity(s: CashRiskState): CashProfitSeverity {
  return s === "AT_RISK" ? "HIGH" : "CRITICAL";
}
/** Margin severity from a categorical state: CRITICAL/INSOLVENT (negative margin) → HIGH, AT_RISK → MEDIUM. */
function marginStateSeverity(s: CashRiskState): CashProfitSeverity {
  return s === "AT_RISK" ? "MEDIUM" : "HIGH";
}
function humanState(s: CashRiskState): string {
  return s.replace(/_/g, " ").toLowerCase();
}

/**
 * Build the cash/profit protection signals. Pure + deterministic. Most severe first; material money
 * decisions keep owner review; no fabricated money figure ever appears.
 */
export function buildCashProfitProtection(
  input: CashProfitInput,
  workspaceId: string,
  evaluatedAt: string,
): CashProfitProtectionAnalysis {
  const out: CashProfitSignal[] = [];
  const ev = {
    supportingProofIds: input.supportingProofIds,
    supportingOperationalEventIds: input.supportingOperationalEventIds,
    supportingFinancialSnapshotIds: input.supportingFinancialSnapshotIds,
  };
  const push = (s: Omit<CashProfitSignal, "workspaceId" | "evaluatedAt" | keyof typeof ev> & Partial<typeof ev>): void => {
    out.push({ ...ev, ...s, workspaceId, evaluatedAt });
  };

  const measuredCostDays = input.financeCashDaysOfCosts ?? null;

  // 1. CASH_SAFETY_RISK — the runway is short. Prefer a REAL measured day count (precise). If no measured
  //    figure exists, fall back to the categorical survival state and flag the risk QUALITATIVELY with
  //    metricValue null — never inventing a precise day count from a category (that would be false precision).
  if (input.cashRunwayDays !== null && input.cashRunwayDays < CASH_RUNWAY_FLOOR) {
    push({
      signalType: "CASH_SAFETY_RISK", category: "CASH",
      severity: input.cashRunwayDays < 10 ? "CRITICAL" : input.cashRunwayDays < 20 ? "HIGH" : "MEDIUM",
      confidence: "HIGH", title: "Cash runway is short",
      ownerExplanation: "The cash on hand covers only a short runway. Protecting cash now avoids a forced, worse decision later.",
      protectiveAction: "PROTECT_CASH_RUNWAY", approvalLevel: "OWNER", requiresOwnerReview: true, riskGuardrail: MATERIAL_GUARDRAIL,
      observedCount: 1, metricType: "CASH_RUNWAY_DAYS", metricValue: input.cashRunwayDays, metricThreshold: CASH_RUNWAY_FLOOR,
      thresholdBreached: true, directionOnly: false, relatedProcessFinding: null, missingData: [],
    });
  } else if (input.cashRunwayDays === null && input.cashRunwayState != null && CASH_RISK_STATES.includes(input.cashRunwayState)) {
    push({
      signalType: "CASH_SAFETY_RISK", category: "CASH",
      severity: cashStateSeverity(input.cashRunwayState),
      confidence: measuredCostDays ? "HIGH" : "MEDIUM", title: `Cash survival state is ${humanState(input.cashRunwayState)}`,
      ownerExplanation: measuredCostDays
        ? `Your latest Finance figures show cash on hand covers about ${measuredCostDays.days} days of total costs${measuredCostDays.threshold !== null ? ` (the minimum is ${measuredCostDays.threshold})` : ""}. That is days of costs, not a burn-rate runway, which OpsIQ has not measured separately. Protecting cash now avoids a forced, worse decision later.`
        : "The cashflow signals put the business in an at-risk survival state. OpsIQ has no measured runway figure, so it flags the risk qualitatively rather than inventing a day count — confirm the actual runway. Protecting cash now avoids a forced, worse decision later.",
      protectiveAction: "PROTECT_CASH_RUNWAY", approvalLevel: "OWNER", requiresOwnerReview: true, riskGuardrail: MATERIAL_GUARDRAIL,
      observedCount: 1,
      metricType: measuredCostDays ? "CASH_DAYS_OF_COSTS" : "CASH_SURVIVAL_STATE",
      metricValue: measuredCostDays ? measuredCostDays.days : null,
      metricThreshold: measuredCostDays ? measuredCostDays.threshold : null,
      thresholdBreached: true, directionOnly: !measuredCostDays, relatedProcessFinding: null,
      missingData: measuredCostDays ? [] : ["measured cash runway (days of cash at current burn rate)"],
    });
  }

  // 2. LOW_MARGIN_WORK_RISK — margin below floor or too many low-margin jobs. As with cash, prefer a REAL
  //    margin figure; otherwise fall back to the categorical margin state (qualitative, metricValue null).
  const marginBreached = input.netMarginPct !== null && input.netMarginPct < NET_MARGIN_FLOOR;
  const marginStateRisk = input.netMarginPct === null && input.netMarginState != null && CASH_RISK_STATES.includes(input.netMarginState);
  if (marginBreached || input.lowMarginJobCount >= LOW_MARGIN_JOBS) {
    push({
      signalType: "LOW_MARGIN_WORK_RISK", category: "MARGIN",
      severity: marginBreached && input.netMarginPct !== null && input.netMarginPct < 0 ? "HIGH" : "MEDIUM",
      confidence: input.netMarginPct !== null ? "HIGH" : "MEDIUM", title: "Work is running at a thin margin",
      ownerExplanation: "A share of the work is completed at a margin too thin to sustain. Repricing or reducing its cost protects profit.",
      protectiveAction: "REVIEW_PRICING", approvalLevel: "OWNER", requiresOwnerReview: true, riskGuardrail: MATERIAL_GUARDRAIL,
      observedCount: input.lowMarginJobCount, metricType: "NET_MARGIN_PCT", metricValue: input.netMarginPct, metricThreshold: NET_MARGIN_FLOOR,
      thresholdBreached: marginBreached, directionOnly: input.netMarginPct === null, relatedProcessFinding: null, missingData: [],
    });
  } else if (marginStateRisk) {
    push({
      signalType: "LOW_MARGIN_WORK_RISK", category: "MARGIN",
      severity: marginStateSeverity(input.netMarginState!),
      confidence: "MEDIUM", title: `Margin state is ${humanState(input.netMarginState!)}`,
      ownerExplanation: "The financial signals put margin in an at-risk state. OpsIQ has no measured margin percentage, so it flags the risk qualitatively rather than inventing a figure — confirm the actual margin. Repricing or reducing cost protects profit.",
      protectiveAction: "REVIEW_PRICING", approvalLevel: "OWNER", requiresOwnerReview: true, riskGuardrail: MATERIAL_GUARDRAIL,
      observedCount: input.lowMarginJobCount, metricType: "MARGIN_STATE", metricValue: null, metricThreshold: null,
      thresholdBreached: true, directionOnly: true, relatedProcessFinding: null,
      missingData: ["measured net margin (revenue vs cost)"],
    });
  }

  // 3. PRICING_LEAK — work priced below cost/target.
  if (input.pricingLeakCount >= PRICING_LEAK) {
    push({
      signalType: "PRICING_LEAK", category: "PRICING", severity: input.pricingLeakCount >= 6 ? "HIGH" : "MEDIUM", confidence: "HIGH",
      title: "Some work is priced below its cost", ownerExplanation: "Repeated jobs are being sold below what they cost to deliver. A price review stops the leak.",
      protectiveAction: "REVIEW_PRICING", approvalLevel: "OWNER", requiresOwnerReview: true, riskGuardrail: MATERIAL_GUARDRAIL,
      observedCount: input.pricingLeakCount, metricType: "BELOW_COST_JOB_COUNT", metricValue: input.pricingLeakCount, metricThreshold: PRICING_LEAK,
      thresholdBreached: true, directionOnly: true, relatedProcessFinding: null, missingData: [],
    });
  }

  // 4. DISCOUNT_LEAK — discounts given away too freely.
  if (input.discountLeakCount >= DISCOUNT_LEAK) {
    push({
      signalType: "DISCOUNT_LEAK", category: "PRICING", severity: "MEDIUM", confidence: "HIGH",
      title: "Discounts are eroding margin", ownerExplanation: "Discounts are being applied often enough to erode margin. A clear discount policy protects it.",
      protectiveAction: "TIGHTEN_DISCOUNT_POLICY", approvalLevel: "OWNER", requiresOwnerReview: true, riskGuardrail: MATERIAL_GUARDRAIL,
      observedCount: input.discountLeakCount, metricType: "DISCOUNTED_JOB_COUNT", metricValue: input.discountLeakCount, metricThreshold: DISCOUNT_LEAK,
      thresholdBreached: true, directionOnly: true, relatedProcessFinding: null, missingData: [],
    });
  }

  // 5. REWORK_COST_RISK — rework is eating margin.
  if (input.reworkCostEventCount >= REWORK_COST) {
    push({
      signalType: "REWORK_COST_RISK", category: "COST", severity: input.reworkCostEventCount >= 6 ? "HIGH" : "MEDIUM", confidence: "HIGH",
      title: "Rework is eating into margin", ownerExplanation: "Repeated rework adds cost to work already sold. Fixing the failing step at the source recovers the margin.",
      protectiveAction: "REDUCE_REWORK_AT_SOURCE", approvalLevel: "MANAGER", requiresOwnerReview: false, riskGuardrail: COST_GUARDRAIL,
      observedCount: input.reworkCostEventCount, metricType: "REWORK_EVENT_COUNT", metricValue: input.reworkCostEventCount, metricThreshold: REWORK_COST,
      thresholdBreached: true, directionOnly: true, relatedProcessFinding: "REWORK_LOOP", missingData: [],
    });
  }

  // 6. DELIVERY_COST_RISK — delivery cost is disproportionate.
  if (input.deliveryCostEventCount >= DELIVERY_COST) {
    push({
      signalType: "DELIVERY_COST_RISK", category: "COST", severity: "MEDIUM", confidence: "MEDIUM",
      title: "Delivery cost is eroding margin", ownerExplanation: "Delivery is adding disproportionate cost to jobs. Reviewing the delivery route/terms protects margin.",
      protectiveAction: "REVIEW_DELIVERY_COST", approvalLevel: "MANAGER", requiresOwnerReview: false, riskGuardrail: COST_GUARDRAIL,
      observedCount: input.deliveryCostEventCount, metricType: "DELIVERY_COST_EVENT_COUNT", metricValue: input.deliveryCostEventCount, metricThreshold: DELIVERY_COST,
      thresholdBreached: true, directionOnly: true, relatedProcessFinding: "DELIVERY_HANDOFF_DELAY", missingData: [],
    });
  }

  // 7. STAFF_INEFFICIENCY_COST_RISK — avoidable labour cost (operational, never a staff score).
  if (input.staffInefficiencyCount >= STAFF_INEFFICIENCY) {
    push({
      signalType: "STAFF_INEFFICIENCY_COST_RISK", category: "COST", severity: "MEDIUM", confidence: "MEDIUM",
      title: "Avoidable labour cost on some work", ownerExplanation: "Some work takes materially longer than the norm, adding avoidable cost. Rebalancing or coaching protects margin.",
      protectiveAction: "REBALANCE_STAFFING", approvalLevel: "MANAGER", requiresOwnerReview: false, riskGuardrail: COST_GUARDRAIL,
      observedCount: input.staffInefficiencyCount, metricType: "SLOW_JOB_COUNT", metricValue: input.staffInefficiencyCount, metricThreshold: STAFF_INEFFICIENCY,
      thresholdBreached: true, directionOnly: true, relatedProcessFinding: null, missingData: [],
    });
  }

  // 8. B2B_UNDERPRICING_RISK — a B2B contract is under-priced.
  if (input.b2bUnderpricedCount >= B2B_UNDERPRICED) {
    push({
      signalType: "B2B_UNDERPRICING_RISK", category: "PRICING", severity: "HIGH", confidence: "MEDIUM",
      title: "A B2B contract looks under-priced", ownerExplanation: "A recurring B2B account is priced below the value it consumes. Repricing at renewal protects long-run profit.",
      protectiveAction: "REPRICE_B2B_CONTRACT", approvalLevel: "OWNER", requiresOwnerReview: true, riskGuardrail: MATERIAL_GUARDRAIL,
      observedCount: input.b2bUnderpricedCount, metricType: "UNDERPRICED_B2B_COUNT", metricValue: input.b2bUnderpricedCount, metricThreshold: B2B_UNDERPRICED,
      thresholdBreached: true, directionOnly: true, relatedProcessFinding: null, missingData: [],
    });
  }

  // 9. WORKING_CAPITAL_STRAIN — cash tied up in overdue receivables.
  if (input.overdueReceivableCount >= OVERDUE_RECEIVABLES) {
    push({
      signalType: "WORKING_CAPITAL_STRAIN", category: "WORKING_CAPITAL", severity: input.overdueReceivableCount >= 6 ? "HIGH" : "MEDIUM", confidence: "HIGH",
      title: "Cash is tied up in overdue receivables", ownerExplanation: "Money owed to you is sitting overdue, straining working capital. Chasing it frees cash without new sales.",
      protectiveAction: "CHASE_RECEIVABLES", approvalLevel: "MANAGER", requiresOwnerReview: false, riskGuardrail: COST_GUARDRAIL,
      observedCount: input.overdueReceivableCount, metricType: "OVERDUE_RECEIVABLE_COUNT", metricValue: input.overdueReceivableCount, metricThreshold: OVERDUE_RECEIVABLES,
      thresholdBreached: true, directionOnly: true, relatedProcessFinding: null, missingData: [],
    });
  }

  // 10. MISSING_UNIT_ECONOMICS — cannot compute per-job profit at all.
  if (!input.hasUnitEconomics) {
    push({
      signalType: "MISSING_UNIT_ECONOMICS", category: "DATA", severity: "LOW", confidence: "NEEDS_DATA",
      title: "Per-job economics are not captured", ownerExplanation: "OpsIQ cannot tell which work is profitable because per-job cost is not captured. Capturing it turns on profit protection.",
      protectiveAction: "CAPTURE_UNIT_ECONOMICS", approvalLevel: "MANAGER", requiresOwnerReview: false, riskGuardrail: DATA_GUARDRAIL,
      observedCount: 0, metricType: null, metricValue: null, metricThreshold: null, thresholdBreached: false, directionOnly: false,
      relatedProcessFinding: null, missingData: ["per-job cost / unit economics"],
    });
  }

  // 11. PROFIT_DATA_INSUFFICIENT — not enough financial data to assess profit. When a current Finance snapshot
  //     exists but lacks specific figures, name exactly those; the generic wording is only for no Finance reading.
  if (!input.financialDataComplete) {
    const missingFields = input.missingFinancialFields ?? [];
    const specific = missingFields.length > 0;
    push({
      signalType: "PROFIT_DATA_INSUFFICIENT", category: "DATA", severity: "LOW", confidence: "NEEDS_DATA",
      title: specific ? `Profit cannot be assessed without ${missingFields.join(" and ")}` : "Not enough financial data to assess profit",
      ownerExplanation: specific
        ? `Your latest Finance snapshot has no ${missingFields.join(" or ")}, so OpsIQ will not estimate a profit figure it cannot support. Add ${missingFields.join(" and ")} to the snapshot.`
        : "The financial picture is incomplete, so OpsIQ will not estimate a profit figure it cannot support. Add the missing inputs.",
      protectiveAction: "COLLECT_FINANCIAL_DATA", approvalLevel: "MANAGER", requiresOwnerReview: false, riskGuardrail: DATA_GUARDRAIL,
      observedCount: 0, metricType: null, metricValue: null, metricThreshold: null, thresholdBreached: false, directionOnly: false,
      relatedProcessFinding: null, missingData: specific ? missingFields : ["complete financial snapshot (revenue, costs, cash)"],
    });
  }

  out.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
  const summary: CashProfitSummary = {
    total: out.length,
    critical: out.filter((s) => s.severity === "CRITICAL").length,
    high: out.filter((s) => s.severity === "HIGH").length,
    ownerReviewRequired: out.filter((s) => s.requiresOwnerReview).length,
  };
  return { workspaceId, signals: out, topSignal: out[0] ?? null, summary, evaluatedAt };
}

/** The Finance diagnosis facts the cash/profit layer may read (a current cycle's findings and snapshot). */
export interface FinanceReadingFacts {
  findings?: ReadonlyArray<{ sourceMetric?: unknown; sourceValue?: unknown; threshold?: unknown }> | null;
  snapshot?: {
    revenue?: number | null; costOfGoods?: number | null; fixedCosts?: number | null;
    variableCosts?: number | null; rent?: number | null; payroll?: number | null; utilities?: number | null;
    deliveryCost?: number | null; marketingSpend?: number | null; cashOnHand?: number | null;
  } | null;
}

export interface FinanceCashProfitFacts {
  /** Finance's measured cash ÷ daily NET burn (a true runway), or null when Finance did not measure one. */
  cashRunwayDays: number | null;
  /** Finance's measured cash ÷ daily TOTAL costs, or null. Never the same metric as runway. */
  cashDaysOfCosts: { days: number; threshold: number | null } | null;
  /** The snapshot carries a cash-on-hand figure (the cash position is measured). */
  cashPositionMeasured: boolean;
  /** Figures a profit assessment needs that the snapshot lacks; empty when revenue and a cost figure exist. */
  missingFinancialFields: string[];
}

function finiteNumber(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/**
 * Read the measured cash figures and snapshot gaps from a CURRENT Finance diagnosis. Pure. The caller passes
 * facts only when the Finance reading is current (not stale/amended/superseded); nothing here is inferred from
 * a categorical state, and a missing figure stays null rather than becoming zero.
 */
export function deriveFinanceCashProfitFacts(fin: FinanceReadingFacts): FinanceCashProfitFacts {
  let cashRunwayDays: number | null = null;
  let cashDaysOfCosts: FinanceCashProfitFacts["cashDaysOfCosts"] = null;
  for (const f of fin.findings ?? []) {
    const value = finiteNumber(f.sourceValue);
    if (value === null) continue;
    if (f.sourceMetric === "cashRunwayDays") cashRunwayDays = value;
    else if (f.sourceMetric === "cashDaysOfCosts") cashDaysOfCosts = { days: value, threshold: finiteNumber(f.threshold) };
  }
  const snap = fin.snapshot ?? null;
  const missing: string[] = [];
  if (snap) {
    if (finiteNumber(snap.revenue) === null) missing.push("revenue");
    // Finance's own cost model decides whether costs are known — never a second definition of completeness.
    const costs = totalCosts({
      periodStart: "", periodEnd: "", currency: "",
      fixedCosts: snap.fixedCosts ?? undefined, variableCosts: snap.variableCosts ?? undefined,
      rent: snap.rent ?? undefined, salaryPayroll: snap.payroll ?? undefined, utilities: snap.utilities ?? undefined,
      costOfGoodsOrServices: snap.costOfGoods ?? undefined, deliveryFulfilmentCost: snap.deliveryCost ?? undefined,
      marketingSpend: snap.marketingSpend ?? undefined,
    });
    if (costs === null) missing.push("cost figures");
  }
  return {
    cashRunwayDays, cashDaysOfCosts,
    cashPositionMeasured: finiteNumber(snap?.cashOnHand) !== null,
    missingFinancialFields: missing,
  };
}
