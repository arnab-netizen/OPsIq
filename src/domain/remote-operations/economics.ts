/**
 * R24 — Location unit economics + cash risk (§40). Pure.
 *
 * Earned, invoiced, and collected cash are kept separate. A location cannot be marked
 * financially healthy without collected cash (or an explicitly labelled accrual-only
 * confidence). Aged receivables >30 days raise a cash-risk alert. Profit is never invented;
 * high activity cannot hide an unprofitable/cash-negative location.
 */

export interface LocationEconomics {
  earnedRevenue?: number;
  invoicedRevenue?: number;
  collectedCash?: number;
  agedReceivables30?: number;
  directLabour?: number;
  consumables?: number;
  vendorMaintenance?: number;
  refunds?: number;
  reworkCost?: number;
}

export type FinancialConfidence = "HEALTHY_CASH_BACKED" | "ACCRUAL_ONLY" | "LOW_OR_MISSING";

export interface EconomicsAssessment {
  financialConfidence: FinancialConfidence;
  cashRiskAlert: boolean;
  contributionMargin?: number;
  canClaimHealthy: boolean;
  reasons: string[];
}

export function assessEconomics(e: LocationEconomics): EconomicsAssessment {
  const reasons: string[] = [];
  const hasCollected = typeof e.collectedCash === "number";
  const hasCosts = [e.directLabour, e.consumables, e.vendorMaintenance].some((x) => typeof x === "number");

  let contributionMargin: number | undefined;
  if (hasCollected && hasCosts) {
    contributionMargin = (e.collectedCash ?? 0) - (e.directLabour ?? 0) - (e.consumables ?? 0) - (e.vendorMaintenance ?? 0) - (e.refunds ?? 0) - (e.reworkCost ?? 0);
  }

  const cashRiskAlert = typeof e.agedReceivables30 === "number" && e.agedReceivables30 > 0;
  if (cashRiskAlert) reasons.push("CASH_RISK_ALERT_receivables_over_30d");

  let financialConfidence: FinancialConfidence;
  if (hasCollected) financialConfidence = "HEALTHY_CASH_BACKED";
  else if (typeof e.invoicedRevenue === "number" || typeof e.earnedRevenue === "number") { financialConfidence = "ACCRUAL_ONLY"; reasons.push("accrual_only_no_collected_cash"); }
  else { financialConfidence = "LOW_OR_MISSING"; reasons.push("financial_data_missing"); }

  // Healthy claim requires collected cash AND positive contribution AND no cash-risk alert.
  const canClaimHealthy = financialConfidence === "HEALTHY_CASH_BACKED" && (contributionMargin ?? -1) > 0 && !cashRiskAlert;
  if (!canClaimHealthy && financialConfidence === "HEALTHY_CASH_BACKED" && (contributionMargin ?? -1) <= 0) reasons.push("not_profitable_despite_activity");

  return { financialConfidence, cashRiskAlert, contributionMargin, canClaimHealthy, reasons };
}
