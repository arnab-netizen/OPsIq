/**
 * Budget Mode Classifier (Section 5). Pure, deterministic, evidence-backed.
 *
 * Classifies the business into EMERGENCY / STABILIZE / GROW / SCALE /
 * PROFIT_INCREASE / HYBRID / DATA_INSUFFICIENT using cash timing, reserve safety,
 * margin, unit economics, capacity, workload, data confidence and control state —
 * never revenue alone. Reuses owner-finance metrics; invents no values.
 */

import { resolveLiquidity } from "@/domain/owner-finance/liquidity";
import { cashRunwayDays, cashDaysOfCosts, netMarginPct } from "@/domain/owner-finance/metrics";
import {
  type BudgetAssessmentInput,
  type BudgetMode,
  type BudgetModeResult,
  type BudgetConfidenceLevel,
  type CashPosture,
  CONFIDENCE_ORDER,
} from "@/domain/owner-budget/types";

const EMERGENCY_RUNWAY_DAYS = 14;
const STABILIZE_RUNWAY_DAYS = 45;
const SEVERE_NEGATIVE_MARGIN = -20;
const PROFIT_TARGET_MARGIN = 10;
const CRITICAL_DUE_DAYS = 7;

export function confidenceAtLeast(a: BudgetConfidenceLevel, min: BudgetConfidenceLevel): boolean {
  return CONFIDENCE_ORDER.indexOf(a) >= CONFIDENCE_ORDER.indexOf(min);
}

function deriveConfidence(input: BudgetAssessmentInput): BudgetConfidenceLevel {
  if (input.dataConfidence) return input.dataConfidence;
  const missing = input.criticalMissingInputs ?? [];
  if (missing.length >= 3) return "UNVERIFIED";
  if (missing.length >= 1) return "PARTIAL";
  const f = input.finance;
  const hasCore = typeof f.revenue === "number" && typeof f.cashOnHand === "number";
  return hasCore ? "OPERATIONAL" : "PARTIAL";
}

function computeCashPosture(input: BudgetAssessmentInput): CashPosture {
  const f = input.finance;
  const horizon = input.horizonDays ?? 30;
  // Total liquid funds on the shared basis; null while the position is incomplete (cash in hand alone is
  // not the business's total cash, so no reserve/free-cash claim is made from it).
  const cashOnHand = resolveLiquidity(f).totalLiquidFunds;
  const reserve = Math.max(0, input.statutoryReserveRequired ?? 0, input.cashReserveTarget ?? 0);
  const obligations = input.obligations ?? [];
  const dueInHorizon = obligations
    .filter((o) => o.dueInDays <= horizon)
    .reduce((sum, o) => sum + Math.max(0, o.amount), 0);
  const nextCritical = obligations.length
    ? Math.min(...obligations.map((o) => o.dueInDays))
    : null;

  const freeCash =
    cashOnHand === null ? null : cashOnHand - reserve - dueInHorizon;

  // Reserve is breached if cash cannot even cover the mandatory reserve.
  const reserveBreached = cashOnHand !== null && reserve > 0 && cashOnHand < reserve;

  return {
    cashOnHand,
    runwayDays: cashRunwayDays(f),
    cashDaysOfCosts: cashDaysOfCosts(f),
    statutoryReserveRequired: reserve,
    obligationsDueInHorizon: dueInHorizon,
    freeCashAfterObligations: freeCash,
    reserveBreached,
    nextCriticalDueInDays: nextCritical,
  };
}

/** Classify the budget mode. Deterministic; same input → same output. */
export function classifyBudgetMode(input: BudgetAssessmentInput): BudgetModeResult {
  const confidence = deriveConfidence(input);
  const cash = computeCashPosture(input);
  const margin = netMarginPct(input.finance);
  const reasons: string[] = [];
  const missing = [...(input.criticalMissingInputs ?? [])];

  // DATA_INSUFFICIENT — missing critical inputs or unverified data blocks a full plan.
  const f = input.finance;
  if (typeof f.revenue !== "number" && typeof f.cashOnHand !== "number") {
    missing.push("revenue", "cashOnHand");
  }
  const dataInsufficient =
    confidence === "UNVERIFIED" || missing.length >= 3;
  if (dataInsufficient) {
    reasons.push("Critical financial inputs missing or unverified; cautious data-seeking mode.");
    return {
      primaryMode: "DATA_INSUFFICIENT",
      activeModes: ["DATA_INSUFFICIENT"],
      reasons,
      confidence,
      cash,
      missingCriticalData: [...new Set(missing)],
      netMarginPct: margin,
    };
  }

  // EMERGENCY — survival-threatening conditions (any one).
  const emergency =
    cash.reserveBreached ||
    input.controlBreach === true ||
    (cash.runwayDays !== null && cash.runwayDays < EMERGENCY_RUNWAY_DAYS) ||
    (margin !== null && margin < SEVERE_NEGATIVE_MARGIN) ||
    (cash.nextCriticalDueInDays !== null &&
      cash.nextCriticalDueInDays <= CRITICAL_DUE_DAYS &&
      cash.freeCashAfterObligations !== null &&
      cash.freeCashAfterObligations < 0);
  if (emergency) {
    if (cash.reserveBreached) reasons.push("Statutory/cash reserve breached.");
    if (input.controlBreach) reasons.push("Active fraud/control breach requires containment.");
    if (cash.runwayDays !== null && cash.runwayDays < EMERGENCY_RUNWAY_DAYS)
      reasons.push(`Cash runway critically low (${cash.runwayDays} days).`);
    if (margin !== null && margin < SEVERE_NEGATIVE_MARGIN)
      reasons.push(`Severe negative net margin (${margin.toFixed(1)}%).`);
    if (cash.nextCriticalDueInDays !== null && cash.nextCriticalDueInDays <= CRITICAL_DUE_DAYS &&
        cash.freeCashAfterObligations !== null && cash.freeCashAfterObligations < 0)
      reasons.push(`Imminent obligation in ${cash.nextCriticalDueInDays}d exceeds free cash.`);
    return {
      primaryMode: "EMERGENCY",
      activeModes: ["EMERGENCY"],
      reasons,
      confidence,
      cash,
      missingCriticalData: [...new Set(missing)],
      netMarginPct: margin,
    };
  }

  // Derive non-emergency candidate flags.
  const runwayWeak =
    cash.runwayDays !== null && cash.runwayDays < STABILIZE_RUNWAY_DAYS;
  const marginWeakOrNeg = margin !== null && margin < PROFIT_TARGET_MARGIN;
  const confidenceBelowOperational = !confidenceAtLeast(confidence, "OPERATIONAL");
  const cashSafe =
    !runwayWeak &&
    !cash.reserveBreached &&
    (cash.freeCashAfterObligations === null || cash.freeCashAfterObligations >= 0);
  const unitEconomicsOk =
    input.unitEconomicsPositive === true ||
    (input.unitEconomicsPositive == null && margin !== null && margin > 0);
  const capacityAvailable =
    input.workloadOverloaded !== true &&
    input.qualityDeteriorating !== true &&
    (input.capacityUtilizationPct == null || input.capacityUtilizationPct < 90);
  const revenuePresent = typeof f.revenue === "number" && f.revenue > 0;

  const stabilize =
    runwayWeak || confidenceBelowOperational ||
    (margin !== null && margin < 0) ||
    input.workloadOverloaded === true || input.qualityDeteriorating === true;

  const profitIncrease = revenuePresent && marginWeakOrNeg && (margin === null || margin >= 0);

  const grow =
    cashSafe && unitEconomicsOk && capacityAvailable &&
    confidenceAtLeast(confidence, "OPERATIONAL");

  // Scale is NOT gated on growth headroom: a real capacity constraint (high
  // utilization) is the reason to invest in scaling. It requires proven repeatable
  // demand, stable margin, safe cash, low owner-dependency, sustainable workload,
  // and VERIFIED data.
  const scale =
    cashSafe &&
    input.demandRepeatable === true &&
    input.ownerDependencyHigh !== true &&
    input.workloadOverloaded !== true &&
    input.qualityDeteriorating !== true &&
    (margin === null || margin >= PROFIT_TARGET_MARGIN) &&
    confidenceAtLeast(confidence, "VERIFIED");

  const active: BudgetMode[] = [];
  if (stabilize) active.push("STABILIZE");
  if (profitIncrease) active.push("PROFIT_INCREASE");
  if (grow) active.push("GROW");
  if (scale) active.push("SCALE");

  let primary: BudgetMode;
  if (stabilize && (grow || scale)) {
    primary = "HYBRID";
    reasons.push("Stabilize cash/controls while running controlled growth — hybrid posture.");
  } else if (stabilize) {
    primary = "STABILIZE";
    reasons.push("Cash/margin/controls weak but not at emergency — stabilize first.");
  } else if (profitIncrease) {
    primary = "PROFIT_INCREASE";
    reasons.push("Revenue present but net margin below target — fix profit leakage.");
  } else if (scale) {
    primary = "SCALE";
    reasons.push("Demand repeatable, margins stable, cash safe, low owner-dependency — scale-ready.");
  } else if (grow) {
    primary = "GROW";
    reasons.push("Cash safe, unit economics acceptable, capacity available — controlled growth.");
  } else {
    primary = "STABILIZE";
    reasons.push("No clear offensive posture qualifies — default to conservative stabilize.");
    active.push("STABILIZE");
  }

  return {
    primaryMode: primary,
    activeModes: [...new Set(active)],
    reasons,
    confidence,
    cash,
    missingCriticalData: [...new Set(missing)],
    netMarginPct: margin,
  };
}
