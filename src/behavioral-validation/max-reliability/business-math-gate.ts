/**
 * Maximum-reliability — business-math assurance gate.
 *
 * Wraps the existing validated business-math primitives and refuses a financial/operational recommendation
 * whose math does not support it: a contract below margin-after-terms, an ad spend that is ROAS-positive but
 * net-negative after refunds/RTO and gross margin, an asset purchase without a payback, an expansion without
 * cash runway, hiring without utilization/cash proof, a discount that goes below margin, or any financial
 * decision missing its calculation trace. The gate never invents numbers — when an input is missing it
 * fails closed ("missing required calculation"). No scorer is weakened.
 */
import {
  grossMargin, netRoas, contractMarginAfterTerms, paybackPeriodMonths, expansionAffordable,
  staffUtilization, cashRunwayDays, marketingPaybackMonths,
} from "../expert/business-math";

export type MathDecisionKind = "contract" | "marketing" | "asset" | "expansion" | "hiring" | "discount";
export type Disposition = "proceed" | "decline" | "defer";

export interface MathDecision {
  kind: MathDecisionKind;
  recommendation: Disposition;
  calculationTrace: string[];
  n: Record<string, number>; // the decision's numbers (kind-specific)
}

export interface MathGateResult { ok: boolean; failures: string[]; computed: Record<string, number | boolean | null> }

/** Validate a decision's math vs its recommendation. A "proceed" must be supported by the numbers. */
export function assertBusinessMath(d: MathDecision): MathGateResult {
  const failures: string[] = [];
  const computed: Record<string, number | boolean | null> = {};
  const proceeding = d.recommendation === "proceed";

  // Every financial decision must carry a calculation trace.
  if (d.calculationTrace.length === 0) failures.push("missing required calculation (no calculation trace)");

  switch (d.kind) {
    case "contract": {
      const m = contractMarginAfterTerms({ ratePerUnit: d.n.ratePerUnit ?? null, fullyLoadedCost: d.n.fullyLoadedCost ?? null, paymentTermsDays: d.n.paymentTermsDays, annualCostOfCapitalPct: d.n.annualCostOfCapitalPct });
      computed.contractMarginAfterTerms = m;
      if (m === null) failures.push("missing required calculation (contract margin-after-terms)");
      else if (proceeding && m <= 0) failures.push(`B2B contract below margin after terms (${Math.round(m)}) — cannot proceed`);
      break;
    }
    case "marketing": {
      const r = netRoas({ adRevenue: d.n.adRevenue ?? null, adSpend: d.n.adSpend ?? null, returnRate: d.n.returnRate, rtoRate: d.n.rtoRate, refundRate: d.n.refundRate, grossMarginPct: d.n.grossMarginPct });
      const payback = marketingPaybackMonths(d.n.adSpend ?? null, d.n.monthlyIncrementalProfit ?? null);
      computed.netRoas = r; computed.marketingPaybackMonths = payback;
      if (r === null) failures.push("missing required calculation (net ROAS)");
      else if (proceeding && r <= 1) failures.push(`ad spend net-negative after refunds/RTO/margin (net ROAS ${r.toFixed(2)} ≤ 1)`);
      break;
    }
    case "asset": {
      const payback = paybackPeriodMonths(d.n.investment ?? null, d.n.monthlyIncrementalProfit ?? null);
      computed.paybackPeriodMonths = payback;
      if (payback === null) failures.push("asset purchase without a payback period");
      else if (proceeding && payback > (d.n.maxPaybackMonths ?? 36)) failures.push(`asset payback ${Math.round(payback)}m exceeds the limit`);
      break;
    }
    case "expansion": {
      const affordable = expansionAffordable(d.n.capexAndWorkingCapital ?? null, d.n.availableCash ?? null);
      const runway = cashRunwayDays(d.n.cash ?? null, d.n.monthlyNetBurn ?? null);
      computed.expansionAffordable = affordable; computed.cashRunwayDays = runway;
      if (affordable === null || runway === null) failures.push("expansion without cash-runway / affordability proof");
      else if (proceeding && (affordable === false || runway < (d.n.minRunwayDays ?? 45))) failures.push("expansion without adequate cash runway");
      break;
    }
    case "hiring": {
      const util = staffUtilization(d.n.workHours ?? null, d.n.availableHours ?? null);
      const runway = cashRunwayDays(d.n.cash ?? null, d.n.monthlyNetBurn ?? null);
      computed.staffUtilization = util; computed.cashRunwayDays = runway;
      if (util === null || runway === null) failures.push("staff hiring without utilization/cash proof");
      else if (proceeding && (util < (d.n.minUtilization ?? 0.85) || runway < (d.n.minRunwayDays ?? 30))) failures.push("hiring not supported by utilization + cash");
      break;
    }
    case "discount": {
      const m = grossMargin(d.n.discountedRevenue ?? null, d.n.cogs ?? null);
      computed.grossMarginAfterDiscount = m;
      if (m === null) failures.push("missing required calculation (margin after discount)");
      else if (proceeding && m < 0) failures.push(`discount drives gross margin negative (${(m * 100).toFixed(0)}%)`);
      break;
    }
  }

  // Calculation trace must be consistent with the recommendation: a "proceed" cannot ride on a trace that
  // itself records a blocking result (e.g. "margin negative", "below cost", "no payback").
  if (proceeding && d.calculationTrace.some((t) => /(negative|below cost|below margin|no payback|insufficient|cannot afford)/i.test(t)))
    failures.push("calculation trace contradicts the proceed recommendation");

  return { ok: failures.length === 0, failures, computed };
}
