/**
 * Slice 4 — business-math validator.
 *
 * Pure financial calculators plus a validator that FAILS advice whose financial direction is wrong,
 * independent of wording. If the inputs needed for a decision are missing, the validator requires
 * OpsIQ to lower confidence and avoid irreversible action; if finance materially drives the decision
 * it requires a calculation trace in the output.
 *
 * Calculators return `null` when inputs are missing (so callers can ask for data, not guess).
 */
import type { AdviceOutput, BehavioralCase } from "../schema";

const n = (v: number | string | undefined): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

// ─── 1–20 calculators ───────────────────────────────────────────────────────────────────────────
export function grossMargin(revenue: number | null, cogs: number | null): number | null {
  if (revenue === null || cogs === null || revenue === 0) return null;
  return (revenue - cogs) / revenue;
}
export function contributionMarginPerUnit(price: number | null, variableCost: number | null): number | null {
  if (price === null || variableCost === null) return null;
  return price - variableCost;
}
export function fullyLoadedCostPerUnit(totalCost: number | null, units: number | null): number | null {
  if (totalCost === null || units === null || units === 0) return null;
  return totalCost / units;
}
export function cashRunwayDays(cash: number | null, monthlyNetBurn: number | null): number | null {
  if (cash === null || monthlyNetBurn === null || monthlyNetBurn <= 0) return null;
  return (cash / monthlyNetBurn) * 30;
}
export function breakEvenUnits(fixedCost: number | null, contributionPerUnit: number | null): number | null {
  if (fixedCost === null || contributionPerUnit === null || contributionPerUnit <= 0) return null;
  return fixedCost / contributionPerUnit;
}
export function workingCapitalRequirement(receivables: number | null, inventory: number | null, payables: number | null): number | null {
  if (receivables === null && inventory === null && payables === null) return null;
  return (receivables ?? 0) + (inventory ?? 0) - (payables ?? 0);
}
export function receivablesRiskRatio(receivables: number | null, monthlyRevenue: number | null): number | null {
  if (receivables === null || monthlyRevenue === null || monthlyRevenue === 0) return null;
  return receivables / monthlyRevenue;
}
export function inventoryAgeingRisk(deadStockValue: number | null, inventoryValue: number | null): number | null {
  if (deadStockValue === null || inventoryValue === null || inventoryValue === 0) return null;
  return deadStockValue / inventoryValue;
}
export function capacityUtilization(demandLoad: number | null, reliableCapacity: number | null): number | null {
  if (demandLoad === null || reliableCapacity === null || reliableCapacity === 0) return null;
  return demandLoad / reliableCapacity;
}
export function staffUtilization(workHours: number | null, availableHours: number | null): number | null {
  if (workHours === null || availableHours === null || availableHours === 0) return null;
  return workHours / availableHours;
}
export function unitEconomics(pricePerUnit: number | null, costPerUnit: number | null): number | null {
  if (pricePerUnit === null || costPerUnit === null) return null;
  return pricePerUnit - costPerUnit;
}
export function cacLtvRatio(cac: number | null, ltv: number | null): number | null {
  if (cac === null || ltv === null || cac === 0) return null;
  return ltv / cac;
}
/** Net ROAS after returns/refunds/RTO and gross margin: contribution generated per ad rupee. */
export function netRoas(args: { adRevenue: number | null; adSpend: number | null; returnRate?: number; rtoRate?: number; refundRate?: number; grossMarginPct?: number }): number | null {
  const { adRevenue, adSpend } = args;
  if (adRevenue === null || adSpend === null || adSpend === 0) return null;
  const lossRate = Math.min(1, (args.returnRate ?? 0) + (args.rtoRate ?? 0) + (args.refundRate ?? 0));
  const netRevenue = adRevenue * (1 - lossRate);
  const contribution = netRevenue * (args.grossMarginPct ?? 1);
  return contribution / adSpend;
}
/** Effective contribution per unit after financing the receivable for paymentTermsDays. */
export function contractMarginAfterTerms(args: { ratePerUnit: number | null; fullyLoadedCost: number | null; paymentTermsDays?: number; annualCostOfCapitalPct?: number }): number | null {
  const { ratePerUnit, fullyLoadedCost } = args;
  if (ratePerUnit === null || fullyLoadedCost === null) return null;
  const financingCost = ratePerUnit * ((args.annualCostOfCapitalPct ?? 0.18) * ((args.paymentTermsDays ?? 0) / 365));
  return ratePerUnit - fullyLoadedCost - financingCost;
}
export function emiAffordabilityRatio(monthlyEmi: number | null, monthlyFreeCashFlow: number | null): number | null {
  if (monthlyEmi === null || monthlyFreeCashFlow === null || monthlyFreeCashFlow <= 0) return null;
  return monthlyEmi / monthlyFreeCashFlow;
}
export function marketingPaybackMonths(spend: number | null, monthlyIncrementalProfit: number | null): number | null {
  if (spend === null || monthlyIncrementalProfit === null || monthlyIncrementalProfit <= 0) return null;
  return spend / monthlyIncrementalProfit;
}
export function expansionAffordable(capexAndWorkingCapital: number | null, availableCash: number | null): boolean | null {
  if (capexAndWorkingCapital === null || availableCash === null) return null;
  return availableCash >= capexAndWorkingCapital;
}
export function paybackPeriodMonths(investment: number | null, monthlyIncrementalProfit: number | null): number | null {
  if (investment === null || monthlyIncrementalProfit === null || monthlyIncrementalProfit <= 0) return null;
  return investment / monthlyIncrementalProfit;
}
export function worstCaseCashImpact(cash: number | null, worstCaseOutflow: number | null): number | null {
  if (cash === null || worstCaseOutflow === null) return null;
  return cash - worstCaseOutflow;
}
export function stopLossThreshold(maxAcceptableLossPct: number, capitalAtRisk: number | null): number | null {
  if (capitalAtRisk === null) return null;
  return capitalAtRisk * maxAcceptableLossPct;
}

// ─── Case-driven derivation + trace ─────────────────────────────────────────────────────────────
export interface CaseCalcs {
  monthlyNetBurn: number | null;
  cashRunwayDays: number | null;
  receivablesRisk: number | null;
  capacityUtilization: number | null;
  contractMarginAfterTerms: number | null;
  netRoas: number | null;
  trace: string[];
  missingForDecision: string[];
}

/** Compute whatever the case's labelled numbers allow, and a human-readable trace. */
export function deriveCalcs(c: BehavioralCase): CaseCalcs {
  const num = c.numbers;
  const cash = n(num.cash);
  const revNow = n(num.grossSalesNow) ?? n(num.grossSalesPrev);
  const fixed = (n(num.rent) ?? 0) + (n(num.electricity) ?? 0) + (n(num.water) ?? 0) + (n(num.staff) ?? 0);
  const variable = (n(num.chemicals) ?? 0);
  const monthlyCost = fixed + variable;
  const monthlyNetBurn = revNow !== null ? monthlyCost - revNow : monthlyCost > 0 ? monthlyCost : null;
  const runway = cashRunwayDays(cash, monthlyNetBurn !== null && monthlyNetBurn > 0 ? monthlyNetBurn : null);
  const receivablesRisk = receivablesRiskRatio(n(num.receivables), revNow);
  const util = capacityUtilization(n(num.offeredKgPerDay) ?? n(num.reliableKgPerDay), n(num.reliableKgPerDay) ?? n(num.machineMaxKgPerDay));
  const contractMargin = contractMarginAfterTerms({
    ratePerUnit: n(num.consideredRate) ?? n(num.competitorRate),
    fullyLoadedCost: n(num.fullyLoadedCost) ?? (n(num.competitorRate) !== null ? (n(num.competitorRate)! * 0.95) : null),
    paymentTermsDays: n(num.paymentTermsDays) ?? 0,
  });
  const roas = netRoas({ adRevenue: n(num.adRevenue), adSpend: n(num.adSpend), returnRate: (n(num.returnRatePct) ?? 0) / 100, rtoRate: (n(num.rtoRatePct) ?? 0) / 100, grossMarginPct: (n(num.grossMarginPct) ?? 100) / 100 });

  const trace: string[] = [];
  if (runway !== null) trace.push(`Cash runway ≈ ${Math.round(runway)} days (cash ${cash} / net burn ${Math.round(monthlyNetBurn!)}/mo).`);
  if (revNow !== null) trace.push(`Monthly cost ≈ ${monthlyCost} vs revenue ${revNow} → net ${revNow - monthlyCost}/mo.`);
  if (receivablesRisk !== null) trace.push(`Receivables ≈ ${receivablesRisk.toFixed(2)}× monthly revenue.`);
  if (util !== null) trace.push(`Capacity utilization ≈ ${Math.round(util * 100)}% of reliable capacity.`);
  if (contractMargin !== null) trace.push(`Contract margin after ${n(num.paymentTermsDays) ?? 0}-day terms ≈ ${contractMargin.toFixed(2)}/unit.`);
  if (roas !== null) trace.push(`Net ROAS after returns ≈ ${roas.toFixed(2)}× ad spend.`);

  // "Missing" means the raw input the decision needs is absent — NOT merely that a derived ratio is
  // null because the business is profitable on paper.
  const missingForDecision: string[] = [];
  const haveRate = n(num.consideredRate) !== null || n(num.competitorRate) !== null;
  const haveCost = n(num.fullyLoadedCost) !== null;
  if (c.decisionCategory === "marketing_opportunity_contract" && (!haveRate || !haveCost)) missingForDecision.push("fully-loaded cost/kg and quoted rate");
  if (c.flags.cashRisk && cash === null) missingForDecision.push("current cash balance");
  if (c.flags.capacityRisk && n(num.reliableKgPerDay) === null && n(num.machineMaxKgPerDay) === null) missingForDecision.push("reliable capacity");

  return { monthlyNetBurn, cashRunwayDays: runway, receivablesRisk, capacityUtilization: util, contractMarginAfterTerms: contractMargin, netRoas: roas, trace, missingForDecision };
}

// ─── Validator ──────────────────────────────────────────────────────────────────────────────────
export interface MathViolation {
  code: string;
  reason: string;
}
export interface MathValidation {
  calcs: CaseCalcs;
  violations: MathViolation[];
  financeMaterial: boolean;
  passed: boolean;
}

const SPEND = ["spend", "invest", "marketing", "hoarding", "advertis", "hire", "buy", "purchase", "expand", "scale", "open another", "accept", "sign", "take the contract"];
function recText(a: AdviceOutput): string {
  return `${a.recommendedNextAction ?? ""} ${a.whyThisAction ?? ""}`.toLowerCase();
}
/** Affirmative-action text only: strip "before accepting…", "compute … before", and negations so a
 *  cautious "before accepting, compute cost" answer does NOT read as a recommendation to accept. */
function cleanRec(a: AdviceOutput): string {
  return recText(a)
    .replace(/before (accepting|spending|hiring|expanding|committing)/g, " ")
    .replace(/\b(do not|don't|never|avoid|without)\b/g, " ");
}
function recommendsAny(a: AdviceOutput, words: string[]): boolean {
  const t = cleanRec(a);
  return words.some((w) => t.includes(w));
}
function blocksSpend(a: AdviceOutput): boolean {
  const b = `${(a.blockedActions ?? []).join(" ")} ${(a.whatNotToDo ?? []).join(" ")}`.toLowerCase();
  return /spend|marketing|hire|accept|sign|expand|below|margin/.test(b);
}

export function validateBusinessMath(c: BehavioralCase, a: AdviceOutput): MathValidation {
  const calcs = deriveCalcs(c);
  const violations: MathViolation[] = [];
  const financeMaterial =
    c.decisionCategory === "cash_margin_working_capital" ||
    c.decisionCategory === "marketing_opportunity_contract" ||
    c.flags.cashRisk ||
    c.flags.capacityRisk;

  // below-margin contract accepted
  if (c.decisionCategory === "marketing_opportunity_contract" && calcs.contractMarginAfterTerms !== null && calcs.contractMarginAfterTerms <= 0) {
    if (recommendsAny(a, ["accept", "sign", "take the contract", "go ahead"]) && !blocksSpend(a))
      violations.push({ code: "below_margin_accepted", reason: `Contract margin after terms is ${calcs.contractMarginAfterTerms.toFixed(2)}/unit (≤0) but advice accepts it.` });
  }

  // high revenue / low cash but recommends spend
  if (c.flags.cashRisk && recommendsAny(a, SPEND) && !blocksSpend(a) && !(a.cashMarginRisk && a.cashMarginRisk.length > 8))
    violations.push({ code: "spend_in_cash_risk", reason: "Recommends spend/commitment in a cash-risk case without a cash warning or block." });

  // ROAS-only marketing scale when net ROAS < 1
  if (calcs.netRoas !== null && calcs.netRoas < 1 && recommendsAny(a, ["scale", "increase ad", "more marketing", "spend more"]))
    violations.push({ code: "negative_net_roas_scale", reason: `Net ROAS after returns is ${calcs.netRoas.toFixed(2)}× (<1) but advice scales marketing.` });

  // capacity utilization >= 100% but recommends growth
  if (calcs.capacityUtilization !== null && calcs.capacityUtilization >= 1 && recommendsAny(a, ["expand", "scale", "take on", "grow", "accept"]) && !(a.capacityImpact && a.capacityImpact.length > 8))
    violations.push({ code: "growth_over_capacity", reason: `Capacity utilization ${Math.round(calcs.capacityUtilization * 100)}% ≥100% but advice pushes growth without a capacity check.` });

  // back-loaded payment contract accepted without WC consideration
  const terms = n(c.numbers.paymentTermsDays);
  if (terms !== null && terms >= 30 && recommendsAny(a, ["accept", "sign", "take the contract"]) && !/payment|terms|working capital|receivable/i.test(`${a.cashMarginRisk ?? ""} ${(a.whatNotToDo ?? []).join(" ")}`))
    violations.push({ code: "working_capital_terms_ignored", reason: `Accepts a ${terms}-day-terms contract without addressing working-capital risk.` });

  // With key inputs missing, the harm is taking an IRREVERSIBLE action anyway. Requiring the data as
  // proof, blocking spend, or lowering confidence are all acceptable expert responses.
  if (financeMaterial && calcs.missingForDecision.length > 0) {
    const cautious = a.dataConfidence === "low" || a.dataConfidence === "cannot_determine";
    const requiresData = /compute|reconcile|fully-loaded|cost\b|measure/i.test(`${a.recommendedNextAction ?? ""} ${(a.proofRequired ?? []).join(" ")}`);
    const irreversible = recommendsAny(a, SPEND) && !blocksSpend(a) && !requiresData;
    if (irreversible && !cautious)
      violations.push({ code: "missing_financials_overconfident", reason: `Key inputs missing (${calcs.missingForDecision.join("; ")}) but an irreversible action is recommended without lowering confidence or requiring the data.` });
  }

  // calculation trace must appear when finance materially drives the decision and numbers exist
  if (financeMaterial && calcs.trace.length > 0 && (a.calculationTrace ?? []).length === 0)
    violations.push({ code: "no_calculation_trace", reason: "Finance materially affects this decision but the output has no calculation trace." });

  return { calcs, violations, financeMaterial, passed: violations.length === 0 };
}
