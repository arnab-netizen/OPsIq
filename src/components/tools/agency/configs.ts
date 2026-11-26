import type { AgencyToolId } from "@/services/tools/agency/registry";
import { formatMoney, formatPercent, type CurrencyCode, type FieldRule } from "@/services/tools/agency/shared";
import { calculateClientProfitability } from "@/services/tools/agency/client-profitability";
import { calculateRetainerPricing } from "@/services/tools/agency/retainer-pricing";
import { calculateUtilization } from "@/services/tools/agency/utilization";
import { calculateScopeCreep } from "@/services/tools/agency/scope-creep";
import { calculateHourlyRate } from "@/services/tools/agency/hourly-rate";
import { calculateCapacity } from "@/services/tools/agency/capacity";

/**
 * Presentation layer for the six agency calculators. No arithmetic beyond formatting happens here: every number comes from
 * the pure engines in src/services/tools/agency. Interpretation is deterministic rule text driven by the engine results.
 * Targets entered by the visitor are the visitor's own targets, never presented as industry benchmarks.
 */

export const NOT_AVAILABLE = "Not available";

export type Tone = "pos" | "neg" | "warn" | "";
export type Row = { label: string; value: string; tone?: Tone; note?: string };
export type Section = { title?: string; rows: Row[] };
export type Compare = { label: string; current: string; target: string; gap: string };
export type TableData = { title: string; columns: string[]; rows: string[][] };

export type Presentation = {
  headline: string;
  headlineTone: Tone;
  sections: Section[];
  compare?: Compare[];
  table?: TableData;
  interpretation: string[];
  nextSteps: string[];
  notes: string[];
  /** Plain-text summary for "Copy my results". */
  summary: string[];
};

export type FieldDef = { key: string; label: string; hint?: string; rule: FieldRule; sample: string };

export type Fmt = { money: (n: number) => string; pct: (fraction: number | null, digits?: number) => string; currency: CurrencyCode };

export type EvalOutcome = { ok: true; view: Presentation } | { ok: false; errors: string[] };

export type CalcConfig = {
  id: AgencyToolId;
  /** Period and basis shown in the inputs heading. */
  basis: string;
  fields: FieldDef[];
  evaluate: (v: Record<string, number>, f: Fmt) => EvalOutcome;
};

export function makeFmt(currency: CurrencyCode): Fmt {
  return {
    currency,
    money: (n) => formatMoney(n, currency),
    pct: (fraction, digits = 1) => (fraction === null ? NOT_AVAILABLE : formatPercent(fraction * 100, digits)),
  };
}

const na = (v: number | null, fmt: (n: number) => string): string => (v === null ? NOT_AVAILABLE : fmt(v));
const hrs = (n: number): string => `${n.toLocaleString("en-US", { maximumFractionDigits: 1 })} h`;
const tone = (n: number | null): Tone => (n === null ? "" : n < 0 ? "neg" : n > 0 ? "pos" : "");

const MONEY: FieldRule = { kind: "money", required: true };
const MONEY_OPT: FieldRule = { kind: "money", required: false, defaultWhenBlank: 0 };
const HOURS: FieldRule = { kind: "hours", required: true };
const HOURS_OPT: FieldRule = { kind: "hours", required: false, defaultWhenBlank: 0 };
const HOURS_POS: FieldRule = { kind: "hours", required: true, exclusiveMin: true };
const PCT_TARGET: FieldRule = { kind: "percent", required: true };
const PCT_UTIL: FieldRule = { kind: "percent", required: true, min: 1 };

function errorsOnly(errors: string[]): EvalOutcome {
  return { ok: false, errors };
}

/* ---------------------------------------------------------------- client profitability */
const clientProfitability: CalcConfig = {
  id: "client-profitability",
  basis: "One client, one month (or one project)",
  fields: [
    { key: "revenue", label: "Client revenue", hint: "Everything invoiced to this client in the period, including pass-through amounts", rule: MONEY, sample: "12000" },
    { key: "passThrough", label: "Pass-through expenses included in that revenue", hint: "Media spend, licences or fees billed to the client at cost. Enter them here only, not again below", rule: MONEY_OPT, sample: "2000" },
    { key: "role1Hours", label: "Delivery hours: main team or blended total", rule: HOURS, sample: "40" },
    { key: "role1Rate", label: "Loaded staff cost per hour: main team", hint: "Salary plus employer costs divided by paid hours. Not your sell rate", rule: MONEY, sample: "55" },
    { key: "role2Hours", label: "Delivery hours: second role", hint: "For example a specialist. Leave blank if you used a blended total above", rule: HOURS_OPT, sample: "10" },
    { key: "role2Rate", label: "Loaded staff cost per hour: second role", rule: MONEY_OPT, sample: "80" },
    { key: "otherDirectCosts", label: "Other direct delivery costs", hint: "Freelancers and tools used only for this client. Exclude staff time already counted above and exclude pass-through", rule: MONEY_OPT, sample: "500" },
    { key: "targetMarginPct", label: "Target delivery margin (%)", hint: "Your own target as a share of agency gross income, 0 to 99.9", rule: PCT_TARGET, sample: "70" },
  ],
  evaluate(v, f) {
    const r = calculateClientProfitability({
      revenue: v.revenue, passThrough: v.passThrough, role1Hours: v.role1Hours, role1Rate: v.role1Rate,
      role2Hours: v.role2Hours, role2Rate: v.role2Rate, otherDirectCosts: v.otherDirectCosts, targetMarginPct: v.targetMarginPct,
    });
    if (!r.ok) return errorsOnly(r.errors);
    const x = r.result;
    const gapPts = x.deliveryMargin === null ? null : (x.targetMargin - x.deliveryMargin) * 100;
    const interpretation: string[] = [];
    if (x.deliveryProfit < 0) interpretation.push(`Delivery costs are ${f.money(-x.deliveryProfit)} higher than agency gross income, so this client loses money before any overhead is counted.`);
    if (x.deliveryMargin !== null && x.meetsTarget) interpretation.push("Delivery margin is at or above your target. It is measured before overhead, so it is not net profit.");
    if (x.meetsTarget === false && gapPts !== null) {
      const hoursText = x.hoursReductionEquivalent === null ? "" : `, roughly ${x.hoursReductionEquivalent} fewer delivery hours at your blended loaded cost`;
      interpretation.push(`Delivery margin is ${gapPts.toFixed(1)} points below your target. Closing the gap takes about ${f.money(x.feeIncreaseNeeded ?? 0)} more agency fee, or about ${f.money(x.costReductionNeeded)} less delivery cost${hoursText}.`);
    }
    if (x.effectiveHourlyRate !== null && x.blendedCostPerHour !== null) {
      interpretation.push(`You earn ${f.money(x.effectiveHourlyRate)} of agency gross income per delivery hour against a loaded cost of ${f.money(x.blendedCostPerHour)} per hour.`);
    }
    const nextSteps = x.deliveryProfit < 0
      ? ["Review scope and staffing for this client before the next invoice cycle.", "Compare hours logged with hours scoped for the last three periods to see whether this is one bad month or a pattern."]
      : x.meetsTarget === false
        ? ["Compare hours logged with hours scoped for the last three periods. If the gap repeats, price the next renewal at the required fee or reduce scope.", "Re-run with a different target to see how sensitive the answer is."]
        : ["Re-run with next period's actual hours to confirm the margin holds.", "Check the same numbers for your other large clients so the comparison is like for like."];
    return {
      ok: true,
      view: {
        headline: x.deliveryMargin === null ? "Delivery margin not available: agency gross income is 0" : `Delivery margin ${f.pct(x.deliveryMargin)} against a ${f.pct(x.targetMargin)} target`,
        headlineTone: x.meetsTarget === null ? "warn" : x.meetsTarget ? "pos" : "neg",
        sections: [
          { title: "Current position", rows: [
            { label: "Agency gross income (revenue minus pass-through)", value: f.money(x.agi) },
            { label: "Direct delivery cost", value: f.money(x.deliveryCost), note: `Staff time ${f.money(x.staffCost)} plus other direct costs` },
            { label: "Delivery profit (not net profit)", value: f.money(x.deliveryProfit), tone: tone(x.deliveryProfit) },
            { label: "Delivery margin", value: f.pct(x.deliveryMargin), tone: x.meetsTarget === null ? "" : x.meetsTarget ? "pos" : "neg" },
            { label: "Effective earned hourly rate", value: na(x.effectiveHourlyRate, f.money), note: "Agency gross income divided by delivery hours" },
          ] },
          { title: "To reach your target", rows: [
            { label: "Required agency fee at target margin", value: na(x.requiredAgi, f.money) },
            { label: "Fee increase needed", value: na(x.feeIncreaseNeeded, f.money) },
            { label: "Total client invoice at that fee (adds pass-through back)", value: na(x.requiredInvoice, f.money) },
            { label: "Or: delivery cost reduction needed at today's fee", value: f.money(x.costReductionNeeded) },
          ] },
        ],
        compare: [
          { label: "Delivery margin", current: f.pct(x.deliveryMargin), target: f.pct(x.targetMargin), gap: gapPts === null ? NOT_AVAILABLE : `${gapPts > 0 ? "-" : "+"}${Math.abs(gapPts).toFixed(1)} points` },
          { label: "Agency gross income", current: f.money(x.agi), target: na(x.requiredAgi, f.money), gap: x.feeIncreaseNeeded === null ? NOT_AVAILABLE : x.feeIncreaseNeeded === 0 ? "None needed" : `+${f.money(x.feeIncreaseNeeded)}` },
          { label: "Direct delivery cost", current: f.money(x.deliveryCost), target: f.money(x.targetDeliveryCost), gap: x.costReductionNeeded === 0 ? "None needed" : `-${f.money(x.costReductionNeeded)}` },
        ],
        interpretation, nextSteps,
        notes: [
          "Delivery profit is agency gross income minus direct delivery cost. Overhead such as rent, management and sales is not subtracted, so it is not net operating profit.",
          "Pass-through expenses are removed from revenue once. Do not enter them again as delivery costs, and do not count staff time twice.",
        ],
        summary: [
          `Client profitability (${f.currency}, one period)`,
          `Agency gross income ${f.money(x.agi)}; delivery cost ${f.money(x.deliveryCost)}; delivery profit ${f.money(x.deliveryProfit)}`,
          `Delivery margin ${f.pct(x.deliveryMargin)} vs target ${f.pct(x.targetMargin)}`,
        ],
      },
    };
  },
};

/* ---------------------------------------------------------------- retainer pricing */
const retainerPricing: CalcConfig = {
  id: "retainer-pricing",
  basis: "One retainer, per month",
  fields: [
    { key: "monthlyHours", label: "Estimated monthly delivery hours", rule: HOURS_POS, sample: "40" },
    { key: "costPerHour", label: "Loaded delivery cost per hour", hint: "Salary plus employer costs divided by paid hours. Not your sell rate", rule: MONEY, sample: "55" },
    { key: "otherDirectMonthly", label: "Other direct monthly costs", hint: "Freelancers or tools used only for this client", rule: MONEY_OPT, sample: "300" },
    { key: "passThroughMonthly", label: "Pass-through expenses per month", hint: "Billed to the client at cost and kept out of your fee", rule: MONEY_OPT, sample: "1000" },
    { key: "targetMarginPct", label: "Target delivery margin (%)", hint: "Your own target as a share of the agency fee, 0 to 99.9", rule: PCT_TARGET, sample: "50" },
    { key: "proposedFee", label: "A fee you are considering", hint: "Monthly agency fee excluding pass-through. Leave blank to skip", rule: MONEY_OPT, sample: "4000" },
  ],
  evaluate(v, f) {
    const r = calculateRetainerPricing({
      monthlyHours: v.monthlyHours, costPerHour: v.costPerHour, otherDirectMonthly: v.otherDirectMonthly,
      passThroughMonthly: v.passThroughMonthly, targetMarginPct: v.targetMarginPct, proposedFee: v.proposedFee,
    });
    if (!r.ok) return errorsOnly(r.errors);
    const x = r.result;
    const interpretation: string[] = [
      `At ${f.pct(v.targetMarginPct / 100)} delivery margin the agency fee is ${f.money(x.targetFee)} per month (${f.money(x.annualFee)} per year), which earns ${na(x.effectiveHourlyRate, f.money)} per delivery hour against a loaded cost of ${f.money(v.costPerHour)}.`,
      `The delivery break-even fee is ${f.money(x.breakEvenFee)}. Below it the retainer loses money on delivery alone. Whole-agency break-even is higher because it must also cover overhead.`,
    ];
    if (x.proposed) {
      if (x.proposed.sustainable && x.proposed.maxSustainableHours !== null) {
        interpretation.push(`At ${f.money(x.proposed.fee)} per month and your target margin, the retainer can sustain about ${x.proposed.maxSustainableHours} delivery hours. At ${v.monthlyHours} hours its delivery margin is ${f.pct(x.proposed.deliveryMargin)}.`);
      } else {
        interpretation.push(`At ${f.money(x.proposed.fee)} per month the fee does not cover your other direct costs at the target margin, so no delivery hours are sustainable at that target.`);
      }
    }
    return {
      ok: true,
      view: {
        headline: `Target agency fee ${f.money(x.targetFee)} per month`,
        headlineTone: "",
        sections: [
          { title: "Target fee", rows: [
            { label: "Monthly delivery cost", value: f.money(x.deliveryCost) },
            { label: "Delivery break-even fee (0% delivery margin)", value: f.money(x.breakEvenFee), note: "Not whole-agency break-even" },
            { label: "Target agency fee", value: f.money(x.targetFee) },
            { label: "Total client invoice (fee plus pass-through)", value: f.money(x.invoice) },
            { label: "Effective hourly rate", value: na(x.effectiveHourlyRate, f.money) },
            { label: "Monthly contribution after delivery cost", value: f.money(x.contribution), tone: tone(x.contribution) },
            { label: "Annual fee equivalent", value: f.money(x.annualFee) },
          ] },
          ...(x.proposed ? [{ title: `If you charge ${f.money(x.proposed.fee)}`, rows: [
            { label: "Delivery margin at your estimated hours", value: f.pct(x.proposed.deliveryMargin), tone: tone(x.proposed.deliveryMargin) },
            { label: "Monthly contribution", value: f.money(x.proposed.contribution), tone: tone(x.proposed.contribution) },
            { label: "Maximum sustainable delivery hours at your target margin", value: x.proposed.maxSustainableHours === null ? NOT_AVAILABLE : hrs(x.proposed.maxSustainableHours) },
          ] }] : []),
        ],
        table: {
          title: "Other target margins",
          columns: ["Target delivery margin", "Agency fee", "Client invoice", "Effective hourly rate", "Contribution"],
          rows: x.scenarios.map((s) => [`${s.marginPct}%`, f.money(s.fee), f.money(s.invoice), na(s.effectiveHourlyRate, f.money), f.money(s.contribution)]),
        },
        interpretation,
        nextSteps: [
          "Confirm the hours estimate against actual hours logged on similar retainers before quoting.",
          "Agree what happens when scope grows: a change-order price or a cap on included hours protects the margin you just calculated.",
        ],
        notes: [
          "Delivery break-even covers only direct delivery cost. Whole-agency break-even must also cover overhead, so a retainer priced at delivery break-even still loses money for the agency.",
          "Pass-through amounts are shown separately and are not part of the agency fee or margin.",
        ],
        summary: [`Retainer pricing (${f.currency}, per month)`, `Delivery cost ${f.money(x.deliveryCost)}; target fee ${f.money(x.targetFee)}; invoice ${f.money(x.invoice)}`],
      },
    };
  },
};

/* ---------------------------------------------------------------- utilization */
const utilization: CalcConfig = {
  id: "utilization",
  basis: "Whole team, one month",
  fields: [
    { key: "teamMembers", label: "Team members counted", hint: "Full-time equivalents doing delivery work", rule: { kind: "hours", required: true, exclusiveMin: true, max: 100000 }, sample: "5" },
    { key: "paidHoursPerPerson", label: "Paid hours per person per month", rule: HOURS_POS, sample: "160" },
    { key: "leaveHoursPerPerson", label: "Leave and holiday hours per person per month", hint: "Average. Leave blank if you want utilization against paid hours only", rule: HOURS_OPT, sample: "16" },
    { key: "deliveryHours", label: "Revenue-generating delivery hours actually worked", hint: "Hours spent on client work. This is not invoiced hours", rule: HOURS, sample: "540" },
    { key: "targetPct", label: "Your target utilization (% of available capacity)", hint: "Your own target, from 1 to 99.9. 100% is not offered", rule: PCT_UTIL, sample: "80" },
    { key: "earnedRate", label: "Effective earned hourly rate", hint: "Only used for the conditional revenue scenario", rule: MONEY_OPT, sample: "90" },
  ],
  evaluate(v, f) {
    const r = calculateUtilization({
      teamMembers: v.teamMembers, paidHoursPerPerson: v.paidHoursPerPerson, leaveHoursPerPerson: v.leaveHoursPerPerson,
      deliveryHours: v.deliveryHours, targetPct: v.targetPct, earnedRate: v.earnedRate,
    });
    if (!r.ok) return errorsOnly(r.errors);
    const x = r.result;
    const interpretation: string[] = [
      `Utilization is ${f.pct(x.availableUtilization)} of available capacity (${hrs(x.availableCapacity)}) and ${f.pct(x.paidUtilization)} of paid capacity (${hrs(x.paidCapacity)}). The denominators differ, so compare each only with figures that use the same one.`,
    ];
    if (x.overAvailableCapacity) interpretation.push("Delivery hours exceed available capacity. Check whether leave is under-counted, hours include overtime, or the hours entered belong to a longer period.");
    else if (x.hoursVsTarget < 0) interpretation.push(`You are ${hrs(x.hoursBelowTarget)} below your target of ${hrs(x.targetDeliveryHours)}.`);
    else interpretation.push(`You are ${hrs(x.hoursVsTarget)} above your target of ${hrs(x.targetDeliveryHours)}. Sustained overload can hurt quality and retention, so check whether it is a one-off.`);
    if (x.conditionalRevenueCapacity !== null) interpretation.push(`Conditional only: if all ${hrs(x.hoursBelowTarget)} of below-target capacity were sold at ${f.money(v.earnedRate)} per hour it would be worth about ${f.money(x.conditionalRevenueCapacity)} a month. That assumes demand and a sales process exist; unused capacity is not automatically sellable.`);
    return {
      ok: true,
      view: {
        headline: x.availableUtilization === null ? "Utilization not available" : `${f.pct(x.availableUtilization)} of available capacity`,
        headlineTone: x.overAvailableCapacity ? "warn" : x.hoursVsTarget >= 0 ? "pos" : "",
        sections: [
          { title: "Utilization, with the denominator stated", rows: [
            { label: "Paid capacity (team x paid hours)", value: hrs(x.paidCapacity) },
            { label: "Available capacity (paid hours minus leave and holidays)", value: hrs(x.availableCapacity) },
            { label: "Paid capacity utilization", value: f.pct(x.paidUtilization), note: "Delivery hours divided by paid capacity" },
            { label: "Available capacity utilization", value: f.pct(x.availableUtilization), note: "Delivery hours divided by available capacity" },
          ] },
          { title: "Against your target", rows: [
            { label: "Target delivery hours", value: hrs(x.targetDeliveryHours) },
            { label: x.hoursVsTarget >= 0 ? "Hours above target" : "Hours below target", value: hrs(Math.abs(x.hoursVsTarget)), tone: x.hoursVsTarget >= 0 ? "warn" : "" },
            ...(x.conditionalRevenueCapacity !== null ? [{ label: "Conditional revenue-capacity scenario", value: f.money(x.conditionalRevenueCapacity), note: "Only if demand exists; not a forecast" }] : []),
          ] },
        ],
        compare: [{ label: "Delivery hours", current: hrs(v.deliveryHours), target: hrs(x.targetDeliveryHours), gap: `${x.hoursVsTarget >= 0 ? "+" : "-"}${hrs(Math.abs(x.hoursVsTarget))}` }],
        interpretation,
        nextSteps: x.overAvailableCapacity
          ? ["Re-check the hours and leave figures, then re-run before drawing conclusions."]
          : x.hoursVsTarget < 0
            ? ["Before cutting cost or hiring, check pipeline and renewals: do you have demand for the spare hours?", "Split the figure by discipline if skills are not interchangeable."]
            : ["Check overtime, quality and turnover signals before treating a high figure as a success.", "Use the capacity calculator to see how many more clients the team can support at your target."],
        notes: [
          "Delivery hours are hours doing revenue-generating client work. Invoiced-hour realization (invoiced divided by delivered) is a different measure and is not included here.",
          "A higher number is not automatically better, and 100% is not a sensible target because there is always unbillable work such as sales, training and administration.",
        ],
        summary: [`Utilization (${f.currency}, per month)`, `Available ${f.pct(x.availableUtilization)}; paid ${f.pct(x.paidUtilization)}; target hours ${hrs(x.targetDeliveryHours)}`],
      },
    };
  },
};

/* ---------------------------------------------------------------- scope creep */
const scopeCreep: CalcConfig = {
  id: "scope-creep",
  basis: "One project or retainer period",
  fields: [
    { key: "agreedFee", label: "Agreed agency fee", hint: "Excluding pass-through amounts", rule: { kind: "money", required: true, exclusiveMin: true }, sample: "6000" },
    { key: "plannedHours", label: "Planned delivery hours", rule: HOURS, sample: "40" },
    { key: "extraHours", label: "Additional unpriced hours", hint: "Hours beyond the plan that nobody agreed to be paid for", rule: HOURS_OPT, sample: "22" },
    { key: "costPerHour", label: "Loaded delivery cost per hour", rule: MONEY, sample: "55" },
    { key: "plannedExpenses", label: "Planned direct expenses", rule: MONEY_OPT, sample: "0" },
    { key: "extraExpenses", label: "Additional direct expenses", rule: MONEY_OPT, sample: "100" },
    { key: "changeOrderRevenue", label: "Approved change-order revenue", hint: "Agency fee added by an approved change order. Leave blank if none", rule: MONEY_OPT, sample: "500" },
    { key: "changeOrderMarginPct", label: "Margin to price a change order at (%)", hint: "0 to 99.9", rule: PCT_TARGET, sample: "50" },
  ],
  evaluate(v, f) {
    const r = calculateScopeCreep({
      agreedFee: v.agreedFee, plannedHours: v.plannedHours, extraHours: v.extraHours, costPerHour: v.costPerHour,
      plannedExpenses: v.plannedExpenses, extraExpenses: v.extraExpenses, changeOrderRevenue: v.changeOrderRevenue, changeOrderMarginPct: v.changeOrderMarginPct,
    });
    if (!r.ok) return errorsOnly(r.errors);
    const x = r.result;
    const interpretation: string[] = [];
    if (x.marginErosionPoints !== null && x.marginErosionPoints > 0) interpretation.push(`Delivery margin fell from ${f.pct(x.originalMargin)} to ${f.pct(x.revisedMargin)}, a drop of ${x.marginErosionPoints.toFixed(1)} percentage points, because the extra work cost ${f.money(x.additionalDeliveryCost)}.`);
    else interpretation.push("The extra work did not reduce delivery margin on these numbers.");
    if (x.unrecoveredCost > 0) interpretation.push(`${f.money(x.unrecoveredCost)} of extra delivery cost was absorbed without matching revenue. That is the same money as the delivery profit lost, so do not add the two together.`);
    if (x.feeToPreserveMargin !== null && x.feeToPreserveMargin > 0) interpretation.push(`Hypothetically, about ${f.money(x.feeToPreserveMargin)} more fee on top of the revised revenue would have kept the original margin percentage. That is a what-if, not money you lost.`);
    return {
      ok: true,
      view: {
        headline: x.marginErosionPoints === null ? "Margin erosion not available" : `Margin ${x.marginErosionPoints > 0 ? "eroded" : "changed"} by ${Math.abs(x.marginErosionPoints).toFixed(1)} percentage points`,
        headlineTone: x.marginErosionPoints !== null && x.marginErosionPoints > 0 ? "neg" : "",
        sections: [
          { title: "Delivery margin before and after", rows: [
            { label: "Original delivery cost", value: f.money(x.originalDeliveryCost) },
            { label: "Original delivery profit", value: f.money(x.originalProfit), tone: tone(x.originalProfit) },
            { label: "Original delivery margin", value: f.pct(x.originalMargin) },
            { label: "Revised revenue (fee plus change orders)", value: f.money(x.revisedRevenue) },
            { label: "Revised delivery cost", value: f.money(x.revisedDeliveryCost) },
            { label: "Revised delivery profit", value: f.money(x.revisedProfit), tone: tone(x.revisedProfit) },
            { label: "Revised delivery margin", value: f.pct(x.revisedMargin) },
            { label: "Margin erosion", value: x.marginErosionPoints === null ? NOT_AVAILABLE : `${x.marginErosionPoints.toFixed(1)} points`, tone: x.marginErosionPoints !== null && x.marginErosionPoints > 0 ? "neg" : "" },
          ] },
          { title: "Three different measures, kept separate", rows: [
            { label: "Additional delivery cost incurred", value: f.money(x.additionalDeliveryCost), note: "Extra hours x cost per hour, plus extra expenses" },
            { label: "Absorbed cost (not recovered by change orders)", value: f.money(x.unrecoveredCost), note: "Equal to delivery profit lost. The same money, not two losses" },
            { label: "Hypothetical fee to preserve the original margin %", value: na(x.feeToPreserveMargin, f.money), note: "A what-if that never existed as revenue" },
          ] },
          { title: "Pricing the extra work", rows: [{ label: `Change-order price at ${f.pct(v.changeOrderMarginPct / 100)} margin`, value: na(x.changeOrderPrice, f.money) }] },
        ],
        interpretation,
        nextSteps: [
          "Log hours against the original scope for the next period so the first unpriced hour is visible when it happens.",
          "Use the change-order price above as the starting point for the conversation about the extra work.",
        ],
        notes: [
          "Delivery margin is before overhead. Absorbed cost, lost delivery profit and the hypothetical fee describe the same extra work from three angles and must not be added together as revenue leakage.",
        ],
        summary: [`Scope creep (${f.currency})`, `Margin ${f.pct(x.originalMargin)} to ${f.pct(x.revisedMargin)}; absorbed cost ${f.money(x.unrecoveredCost)}`],
      },
    };
  },
};

/* ---------------------------------------------------------------- hourly rate */
const hourlyRate: CalcConfig = {
  id: "hourly-rate",
  basis: "Whole agency, one year",
  fields: [
    { key: "annualPayroll", label: "Annual delivery payroll and employer costs", hint: "Wages, payroll taxes, benefits for the people who deliver client work", rule: MONEY, sample: "600000" },
    { key: "annualOverhead", label: "Annual agency overhead", hint: "Rent, management, sales, software and everything not charged to clients. Counted once here", rule: MONEY, sample: "240000" },
    { key: "annualCapacityHours", label: "Annual available delivery capacity (hours)", hint: "Already net of leave and holidays", rule: HOURS_POS, sample: "12000" },
    { key: "targetUtilizationPct", label: "Target utilization of that capacity (%)", hint: "Applied once. 1 to 99.9", rule: PCT_UTIL, sample: "70" },
    { key: "targetOperatingMarginPct", label: "Target operating margin (% of agency gross income)", hint: "0 to 99.9", rule: PCT_TARGET, sample: "20" },
  ],
  evaluate(v, f) {
    const r = calculateHourlyRate({
      annualPayroll: v.annualPayroll, annualOverhead: v.annualOverhead, annualCapacityHours: v.annualCapacityHours,
      targetUtilizationPct: v.targetUtilizationPct, targetOperatingMarginPct: v.targetOperatingMarginPct,
    });
    if (!r.ok) return errorsOnly(r.errors);
    const x = r.result;
    return {
      ok: true,
      view: {
        headline: x.requiredRate === null ? "Required rate not available" : `Required earned hourly rate ${f.money(x.requiredRate)}`,
        headlineTone: "",
        sections: [{ title: "Rates", rows: [
          { label: "Annual cost pool (payroll plus overhead)", value: f.money(x.costPool) },
          { label: "Annual billable capacity", value: hrs(x.billableCapacity), note: "Available capacity x target utilization" },
          { label: "Break-even earned hourly rate", value: na(x.breakEvenRate, f.money), note: "Recovers all costs, no profit" },
          { label: "Required annual agency income", value: f.money(x.requiredIncome) },
          { label: "Required earned hourly rate", value: na(x.requiredRate, f.money) },
          { label: "Target annual operating profit", value: f.money(x.targetProfit), tone: tone(x.targetProfit) },
        ] }],
        table: {
          title: "Sensitivity: required earned hourly rate",
          columns: ["Scenario", "Utilization", "Cost change", "Required rate"],
          rows: x.sensitivity.map((s) => [s.label, `${s.utilizationPct}%`, `${s.costChangePct > 0 ? "+" : ""}${s.costChangePct}%`, na(s.requiredRate, f.money)]),
        },
        interpretation: [
          `To recover ${f.money(x.costPool)} of cost and keep a ${f.pct(v.targetOperatingMarginPct / 100)} operating margin, the agency must earn about ${na(x.requiredRate, f.money)} of agency gross income per billable hour on average.`,
          `Break-even is ${na(x.breakEvenRate, f.money)} per hour. Anything between break-even and the required rate covers costs but misses your margin target.`,
          "This is an earned average, not a rate card. Discounts, fixed-fee work and unbilled time pull the earned rate below the rate card, so a rate card usually has to sit above the earned figure.",
        ],
        nextSteps: [
          "Compare the required earned rate with your actual agency gross income divided by delivery hours for the last quarter.",
          "Use the utilization calculator to check the utilization you assumed against what the team actually delivers.",
        ],
        notes: [
          "Overhead is counted once in the cost pool and utilization is applied once to capacity. Do not also spread overhead into payroll or discount capacity twice.",
          "The required rate assumes all costs are recovered through billable hours of delivery staff. Pass-through costs belong outside this calculation.",
        ],
        summary: [`Agency hourly rate (${f.currency}, per year)`, `Break-even ${na(x.breakEvenRate, f.money)}/h; required ${na(x.requiredRate, f.money)}/h`],
      },
    };
  },
};

/* ---------------------------------------------------------------- capacity */
const capacity: CalcConfig = {
  id: "capacity",
  basis: "One team, one month",
  fields: [
    { key: "staff", label: "Delivery staff (full-time equivalents)", rule: { kind: "hours", required: true, exclusiveMin: true, max: 100000 }, sample: "6" },
    { key: "availableHoursPerPerson", label: "Available hours per person per month", hint: "After leave and holidays", rule: HOURS_POS, sample: "140" },
    { key: "targetPct", label: "Your target delivery utilization (%)", hint: "1 to 99.9", rule: PCT_UTIL, sample: "80" },
    { key: "committedHours", label: "Existing committed client workload (hours per month)", rule: HOURS, sample: "600" },
    { key: "hoursPerNewClient", label: "Estimated workload per additional client (hours per month)", rule: HOURS_OPT, sample: "25" },
    { key: "plannedNewClients", label: "New clients you are considering", hint: "Whole number", rule: { kind: "count", required: false, defaultWhenBlank: 0 }, sample: "4" },
  ],
  evaluate(v, f) {
    const r = calculateCapacity({
      staff: v.staff, availableHoursPerPerson: v.availableHoursPerPerson, targetPct: v.targetPct,
      committedHours: v.committedHours, hoursPerNewClient: v.hoursPerNewClient, plannedNewClients: v.plannedNewClients,
    });
    if (!r.ok) return errorsOnly(r.errors);
    const x = r.result;
    const interpretation: string[] = x.shortfall
      ? [`Committed work is ${hrs(-x.remaining)} above your target capacity of ${hrs(x.targetCapacity)}, equal to about ${x.fteShortCurrent} full-time equivalents at your target utilization.`]
      : [`Committed work is ${hrs(x.committedHours)} against a target capacity of ${hrs(x.targetCapacity)}, leaving ${hrs(x.remaining)}.`];
    if (x.additionalClientsSupportable !== null && !x.shortfall) interpretation.push(`That supports about ${x.additionalClientsSupportable} more client${x.additionalClientsSupportable === 1 ? "" : "s"} at ${hrs(v.hoursPerNewClient)} each.`);
    if (x.fteShortWithPlanned !== null) interpretation.push(x.fteShortWithPlanned > 0 ? `Taking on ${v.plannedNewClients} new client${v.plannedNewClients === 1 ? "" : "s"} would need about ${x.fteShortWithPlanned} more full-time equivalents.` : `The ${v.plannedNewClients} planned new client${v.plannedNewClients === 1 ? "" : "s"} fit within current target capacity.`);
    return {
      ok: true,
      view: {
        headline: x.shortfall ? `Shortfall of ${hrs(-x.remaining)} against target capacity` : `${hrs(x.remaining)} of target capacity remaining`,
        headlineTone: x.shortfall ? "neg" : "pos",
        sections: [{ title: "Capacity", rows: [
          { label: "Target delivery capacity", value: hrs(x.targetCapacity), note: `${hrs(x.hoursPerFte)} per person at your target` },
          { label: "Existing committed hours", value: hrs(x.committedHours) },
          { label: x.shortfall ? "Shortfall" : "Remaining capacity", value: hrs(Math.abs(x.remaining)), tone: x.shortfall ? "neg" : "pos" },
          { label: "Additional whole clients supportable", value: x.additionalClientsSupportable === null ? NOT_AVAILABLE : String(x.additionalClientsSupportable), note: x.additionalClientsSupportable === null ? "Enter a workload per client" : undefined },
          { label: "Full-time equivalents short today", value: String(x.fteShortCurrent) },
          ...(x.fteShortWithPlanned !== null ? [{ label: "Full-time equivalents short with the planned clients", value: String(x.fteShortWithPlanned) }] : []),
        ] }],
        compare: [{ label: "Hours per month", current: hrs(x.committedHours), target: hrs(x.targetCapacity), gap: `${x.shortfall ? "-" : "+"}${hrs(Math.abs(x.remaining))}` }],
        interpretation,
        nextSteps: [
          "Check whether the shortfall or spare time sits in one discipline: this calculator pools all staff and treats hours as interchangeable.",
          "Before adding headcount, confirm the demand and the cash to fund it; an hours gap alone does not prove either.",
        ],
        notes: [
          "Staff are treated as interchangeable. If skills differ, run it separately for each team or discipline.",
          "The result describes hours, not whether to hire. Hiring also depends on verified demand, margin and cash.",
        ],
        summary: [`Capacity (${f.currency} not used, hours per month)`, `Target ${hrs(x.targetCapacity)}; committed ${hrs(x.committedHours)}; remaining ${hrs(x.remaining)}`],
      },
    };
  },
};

export const CALC_CONFIGS: Record<AgencyToolId, CalcConfig> = {
  "client-profitability": clientProfitability,
  "retainer-pricing": retainerPricing,
  utilization,
  "scope-creep": scopeCreep,
  "hourly-rate": hourlyRate,
  capacity,
};
