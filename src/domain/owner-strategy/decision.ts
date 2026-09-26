/**
 * Owner Strategy — the owner-facing decision (Decision Overhaul, model v1).
 *
 * Pure and deterministic (no DB, no I/O, no clock beyond an injected `now`). Consumes the
 * Phase 1 full-precision decision values (`metrics.raw`), the missing-input contract
 * (input-status.ts) and the thresholds, and returns ONE decision with machine-readable reasons,
 * four dimension states with owner-facing support lines, the required conditions, the reasons
 * the option looks promising, and exactly one primary next step.
 *
 * Precedence (first match wins):
 *  1. NEED_INFO          — a missing/invalid input could still change the answer: currency invalid,
 *                          an invalid (negative) investment or cash, revenue/cost change missing
 *                          (profit unknown), or — when profit is known to be positive — the
 *                          investment missing or cash missing for a positive investment. A decision
 *                          already fixed by known facts (a known loss) is not withheld for data
 *                          that cannot change it; the missing input stays listed as a reason.
 *  2. DONT_AS_PLANNED    — the economics fail on their own: monthly profit change ≤ 0 or ROI below
 *                          the critical ROI. Never merely lack of cash (a funding gap found at the
 *                          same time is listed as a secondary reason, never hidden).
 *  3. NOT_YET            — economics work but cash < investment (a known funding gap, including cash 0).
 *  4. GO_WITH_CONDITIONS — go, once the top condition is handled: downside loses money, high
 *                          execution risk, downside unknown (risk level not chosen), the investment
 *                          uses all the cash (no reserve), payback slower than target, weak ROI.
 *                          Missing risk resolves here, not NEED_INFO: profit and cash are known, and
 *                          no risk level can turn a positive, affordable option into a loss or a
 *                          funding gap — only the downside is unknown, so it becomes the condition.
 *  5. GO                 — none of the above. The only decision whose next step is to proceed.
 *
 * The decision is additive: it is derived on read from the evaluated snapshot and is NOT
 * persisted; the legacy `strategyState` stays as stored.
 */
import type { StrategySnapshotInput, StrategyDerivedMetrics } from "./types";
import { resolveStrategyThresholds, RISK_LEVEL_SPREAD, type StrategyThresholds } from "./thresholds";
import { computeStrategyMetrics, num, rawFundingShortfall, ruleConsistentValue } from "./metrics";
import { classifyStrategyInputs, type StrategyInputStatus } from "./input-status";
import { isValidCurrency, isStaleSnapshot } from "./data-confidence";
import { formatStrategyMoney, formatStrategyMonths } from "./decision-format";

export const STRATEGY_DECISION_MODEL_VERSION = "strategy-decision-v1" as const;

export const STRATEGY_DECISION_CODES = [
  "NEED_INFO",
  "DONT_AS_PLANNED",
  "NOT_YET",
  "GO_WITH_CONDITIONS",
  "GO",
] as const;
export type StrategyDecisionCode = (typeof STRATEGY_DECISION_CODES)[number];

export const STRATEGY_DECISION_HEADLINE: Record<StrategyDecisionCode, string> = {
  NEED_INFO: "Can't say yet",
  DONT_AS_PLANNED: "Don't do it as planned",
  NOT_YET: "Not yet",
  GO_WITH_CONDITIONS: "Go ahead — but first…",
  GO: "Go ahead",
};

export type StrategyDecisionDimension = "profit" | "cash" | "downside" | "evidence";

export const STRATEGY_DECISION_REASON_CODES = [
  // NEED_INFO
  "INVALID_CURRENCY",
  "INVALID_INVESTMENT",
  "INVALID_CASH",
  "MISSING_REVENUE_CHANGE",
  "MISSING_COST_CHANGE",
  "MISSING_INVESTMENT",
  "MISSING_CASH",
  // DONT_AS_PLANNED
  "LOSES_MONEY",
  "NO_PROFIT_GAIN",
  "NEGATIVE_RETURN",
  // NOT_YET
  "FUNDING_GAP",
  // GO_WITH_CONDITIONS (in condition priority order)
  "DOWNSIDE_LOSS",
  "HIGH_EXECUTION_RISK",
  "DOWNSIDE_UNKNOWN",
  "NO_CASH_RESERVE",
  "LONG_PAYBACK",
  "WEAK_RETURN",
] as const;
export type StrategyDecisionReasonCode = (typeof STRATEGY_DECISION_REASON_CODES)[number];

/** Condition priority for GO_WITH_CONDITIONS (index 0 = the top condition). */
const CONDITION_ORDER: readonly StrategyDecisionReasonCode[] = [
  "DOWNSIDE_LOSS",
  "HIGH_EXECUTION_RISK",
  "DOWNSIDE_UNKNOWN",
  "NO_CASH_RESERVE",
  "LONG_PAYBACK",
  "WEAK_RETURN",
];

/** Most critical missing input first — the NEED_INFO next step asks for exactly this one. */
const NEED_INFO_ORDER: readonly StrategyDecisionReasonCode[] = [
  "INVALID_CURRENCY",
  "INVALID_INVESTMENT",
  "INVALID_CASH",
  "MISSING_REVENUE_CHANGE",
  "MISSING_COST_CHANGE",
  "MISSING_INVESTMENT",
  "MISSING_CASH",
];

export interface StrategyDecisionReason {
  code: StrategyDecisionReasonCode;
  dimension: StrategyDecisionDimension;
  /** "missing": an input is needed; "blocker": stops the option as planned; "condition": handle before going. */
  kind: "missing" | "blocker" | "condition";
  message: string;
}

export type StrategyDimensionState = "good" | "caution" | "blocker" | "unknown";
export type StrategyProfitClass = "strong" | "acceptable" | "weak" | "no_profit" | "unknown";

export interface StrategyDimensionView {
  state: StrategyDimensionState;
  line: string;
}

export interface StrategyDecisionDimensions {
  profit: StrategyDimensionView & { profitClass: StrategyProfitClass };
  cash: StrategyDimensionView;
  downside: StrategyDimensionView;
  evidence: StrategyDimensionView & { providedCount: number; totalCount: number; missingInputs: string[] };
}

export const STRATEGY_PROMISING_CODES = ["STRONG_RETURN", "FAST_PAYBACK", "DOWNSIDE_STILL_PROFITABLE"] as const;
export type StrategyPromisingCode = (typeof STRATEGY_PROMISING_CODES)[number];

export interface StrategyPromisingPoint {
  code: StrategyPromisingCode;
  text: string;
}

/**
 * The one primary next step. `recommendationCode`/`findingCode` match the persisted action a
 * diagnosis plans for it (actions.ts), so readers can find that row; `findingCode` is a
 * finding emitted by the rules, except STR_DECISION_GO / STR_DECISION_INVALID_INPUT, which have
 * no finding row.
 */
export interface StrategyPrimaryStep {
  recommendationCode: string;
  findingCode: string;
  title: string;
  description: string;
  options: string[];
}

export interface StrategyDecisionValues {
  currency: string;
  monthlyProfitChange: number | null;
  worstMonthlyProfitChange: number | null;
  bestMonthlyProfitChange: number | null;
  investment: number | null;
  cashAvailable: number | null;
  fundingGap: number | null; // investment − cash when cash < investment; 0 when covered; null when unknown/not applicable
  cashLeftAfter: number | null; // cash − investment when covered
  paybackMonths: number | null;
  roiAnnualPct: number | null;
  downsideSpreadPct: number | null; // revenue shortfall tested for the downside (risk-level spread × 100)
}

export interface StrategyDecision {
  modelVersion: typeof STRATEGY_DECISION_MODEL_VERSION;
  code: StrategyDecisionCode;
  headline: string;
  /** One sentence completing the headline ("You're ₹50,000 short."), or null. */
  headlineDetail: string | null;
  /** Every reason that applies, decision-driving reasons first. */
  reasons: StrategyDecisionReason[];
  /** Conditions to handle before going (GO_WITH_CONDITIONS; empty otherwise). */
  conditions: StrategyDecisionReason[];
  /** The reason code that drives the primary step (null for GO). */
  primaryReason: StrategyDecisionReasonCode | null;
  primaryStep: StrategyPrimaryStep;
  dimensions: StrategyDecisionDimensions;
  promising: StrategyPromisingPoint[];
  values: StrategyDecisionValues;
  /** Recommendation codes that must never be offered as a step under this decision. */
  prohibitedRecommendationCodes: string[];
}

/** Recommendation codes that tell the owner to go ahead. Only GO may carry one (as its primary step). */
export const STRATEGY_PROCEED_RECOMMENDATION_CODES: readonly string[] = ["STRREC_PROCEED", "STRREC_PURSUE", "STRREC_SCALE"];

/** Inputs counted for the Evidence line ("8 of 9 inputs provided"). */
const EVIDENCE_INPUTS: ReadonlyArray<keyof StrategySnapshotInput> = [
  "expectedRevenueChange",
  "costChange",
  "investmentRequired",
  "cashAvailable",
  "riskLevel",
  "currentRevenue",
  "timeToImpactMonths",
  "capacityImpactPct",
  "staffImpact",
];

const INPUT_LABEL: Record<string, string> = {
  expectedRevenueChange: "expected revenue change per month",
  costChange: "expected cost change per month",
  investmentRequired: "upfront investment",
  cashAvailable: "cash you can put into this",
  riskLevel: "execution risk",
  currentRevenue: "current monthly revenue",
  timeToImpactMonths: "time to impact",
  capacityImpactPct: "capacity impact",
  staffImpact: "staff impact",
};

function inputProvided(input: StrategySnapshotInput, key: keyof StrategySnapshotInput, s: StrategyInputStatus): boolean {
  if (key === "riskLevel") return s.riskLevel !== null;
  return num(input[key] as number | undefined) !== null;
}

function round1(x: number): number {
  return Math.round(x * 10) / 10 || 0;
}

export interface DeriveStrategyDecisionOptions {
  now?: Date;
  /** Pre-computed metrics for the same input (avoids recomputation); computed when omitted. */
  metrics?: StrategyDerivedMetrics;
}

export function deriveStrategyDecision(
  input: StrategySnapshotInput,
  opts: DeriveStrategyDecisionOptions = {}
): StrategyDecision {
  const t: StrategyThresholds = resolveStrategyThresholds(input.industryTemplate);
  const m = opts.metrics ?? computeStrategyMetrics(input, { now: opts.now });
  const r = m.raw;
  const s = classifyStrategyInputs(input);
  const currency = (input.currency ?? "").trim().toUpperCase();
  const money = (x: number) => formatStrategyMoney(x, currency);

  const investment = num(input.investmentRequired);
  const cash = num(input.cashAvailable);
  const base = r.baseMonthlyProfitDelta;
  const worst = r.worstMonthlyProfitDelta;
  const spread = s.riskLevel ? RISK_LEVEL_SPREAD[s.riskLevel] : null;

  // --- funding (decision precision; known cash 0 is a real gap) -------------------------------
  const diff = s.cashAvailable === "negative" ? null : rawFundingShortfall(input); // > 0 → short
  const fundingGap = diff === null ? null : Math.max(diff, 0);
  const cashLeftAfter = diff === null ? null : diff <= 0 ? Math.abs(diff) || 0 : null;

  // --- economics --------------------------------------------------------------------------------
  const profitKnown = base !== null;
  const noProfit = base !== null && base <= 0;
  const negativeReturn = !noProfit && r.roiAnnualPct !== null && r.roiAnnualPct < t.criticalRoiPct;
  const economicsFail = noProfit || negativeReturn;
  const weakReturn = !economicsFail && r.roiAnnualPct !== null && r.roiAnnualPct < t.lowRoiPct;
  const longPayback = !economicsFail && investment !== null && investment > 0 && r.paybackMonths !== null && r.paybackMonths > t.longPaybackMonths;
  const strongReturn = !economicsFail && r.roiAnnualPct !== null && r.roiAnnualPct >= t.strongRoiPct;

  // --- reasons ----------------------------------------------------------------------------------
  const reasons: StrategyDecisionReason[] = [];
  const add = (code: StrategyDecisionReasonCode, dimension: StrategyDecisionDimension, kind: StrategyDecisionReason["kind"], message: string) =>
    reasons.push({ code, dimension, kind, message });

  if (!isValidCurrency(input.currency)) add("INVALID_CURRENCY", "evidence", "missing", "The currency code is not valid, so the money figures can't be trusted.");
  if (s.investmentRequired === "negative") add("INVALID_INVESTMENT", "cash", "missing", "The upfront investment is negative — enter the amount you would spend (0 if none).");
  if (s.cashAvailable === "negative") add("INVALID_CASH", "cash", "missing", "The cash you can put into this is negative — enter what is actually available (0 if none).");
  if (s.expectedRevenueChange === "missing") add("MISSING_REVENUE_CHANGE", "profit", "missing", "The expected revenue change per month is not entered, so the profit effect is unknown.");
  if (s.costChange === "missing") add("MISSING_COST_CHANGE", "profit", "missing", "The expected cost change per month is not entered, so the profit effect is unknown.");
  if (s.investmentRequired === "missing") add("MISSING_INVESTMENT", "cash", "missing", "The upfront investment is not entered (enter 0 if there is none).");
  if (s.cashNeededButMissing) add("MISSING_CASH", "cash", "missing", "The cash you can put into this is not entered, so it's unknown whether you can afford it.");

  if (base !== null && base < 0) add("LOSES_MONEY", "profit", "blocker", `As planned this loses about ${money(base)} a month.`);
  if (base !== null && base === 0) add("NO_PROFIT_GAIN", "profit", "blocker", "As planned the extra revenue only covers the extra cost — it adds no profit.");
  if (negativeReturn) add("NEGATIVE_RETURN", "profit", "blocker", "The profit it adds never earns back the upfront investment.");

  if (fundingGap !== null && fundingGap > 0) {
    add("FUNDING_GAP", "cash", "blocker", cash === 0
      ? `You have no cash available for this — you're ${money(fundingGap)} short.`
      : `You're ${money(fundingGap)} short of the ${money(investment!)} needed.`);
  }

  const downsideLoss = !economicsFail && worst !== null && worst < 0;
  if (downsideLoss) add("DOWNSIDE_LOSS", "downside", "condition", `If the extra sales come in ${Math.round(spread! * 100)}% lower, this loses about ${money(worst!)} a month.`);
  if (!economicsFail && s.riskLevel === "high") add("HIGH_EXECUTION_RISK", "downside", "condition", "You rated execution risk high.");
  if (!economicsFail && s.riskLevel === null && profitKnown) add("DOWNSIDE_UNKNOWN", "downside", "condition", "Execution risk isn't chosen, so the downside isn't calculated.");
  if (!economicsFail && cashLeftAfter === 0) add("NO_CASH_RESERVE", "cash", "condition", `The ${money(investment!)} uses all the cash you have for this — nothing is left in reserve.`);
  const paybackShown = r.paybackMonths !== null && m.paybackMonths !== null
    ? ruleConsistentValue(r.paybackMonths, m.paybackMonths, (v) => v > t.longPaybackMonths)
    : null;
  if (longPayback) add("LONG_PAYBACK", "profit", "condition", `It takes about ${formatStrategyMonths(paybackShown!)} to earn back the investment (target: ${t.longPaybackMonths} months or less).`);
  if (weakReturn) add("WEAK_RETURN", "profit", "condition", `It returns only about ${round1(ruleConsistentValue(r.roiAnnualPct!, m.roiAnnualPct!, (v) => v < t.lowRoiPct))}% a year on the investment.`);

  const has = (c: StrategyDecisionReasonCode) => reasons.some((x) => x.code === c);

  // --- decision (precedence) --------------------------------------------------------------------
  const hardNeedInfo = has("INVALID_CURRENCY") || has("INVALID_INVESTMENT") || has("INVALID_CASH") || !profitKnown;
  const economicsPositive = profitKnown && !economicsFail;
  const softNeedInfo = economicsPositive && (has("MISSING_INVESTMENT") || has("MISSING_CASH"));

  let code: StrategyDecisionCode;
  if (hardNeedInfo || softNeedInfo) code = "NEED_INFO";
  else if (economicsFail) code = "DONT_AS_PLANNED";
  else if (has("FUNDING_GAP")) code = "NOT_YET";
  else if (CONDITION_ORDER.some(has)) code = "GO_WITH_CONDITIONS";
  else code = "GO";

  const conditions = code === "GO_WITH_CONDITIONS"
    ? CONDITION_ORDER.filter(has).map((c) => reasons.find((x) => x.code === c)!)
    : [];

  let primaryReason: StrategyDecisionReasonCode | null = null;
  if (code === "NEED_INFO") primaryReason = NEED_INFO_ORDER.find(has) ?? null;
  else if (code === "DONT_AS_PLANNED") primaryReason = (["LOSES_MONEY", "NO_PROFIT_GAIN", "NEGATIVE_RETURN"] as const).find(has) ?? null;
  else if (code === "NOT_YET") primaryReason = "FUNDING_GAP";
  else if (code === "GO_WITH_CONDITIONS") primaryReason = conditions[0].code;

  // Decision-driving reasons first, then the rest in their natural order.
  const driving = new Set<StrategyDecisionReasonCode>();
  if (code === "NEED_INFO") reasons.filter((x) => x.kind === "missing").forEach((x) => driving.add(x.code));
  if (code === "DONT_AS_PLANNED") reasons.filter((x) => x.kind === "blocker" && x.dimension === "profit").forEach((x) => driving.add(x.code));
  if (code === "NOT_YET") driving.add("FUNDING_GAP");
  if (code === "GO_WITH_CONDITIONS") conditions.forEach((x) => driving.add(x.code));
  const orderedReasons = [...reasons.filter((x) => driving.has(x.code)), ...reasons.filter((x) => !driving.has(x.code))];

  // --- dimensions ---------------------------------------------------------------------------------
  const dimensions = buildDimensions({ input, s, t, base, worst, spread, investment, cash, fundingGap, cashLeftAfter, paybackShown, economicsFail, weakReturn, longPayback, strongReturn, money, now: opts.now });

  // --- promising (facts, never commands) -----------------------------------------------------------
  const promising: StrategyPromisingPoint[] = [];
  if (strongReturn) {
    const roiShown = round1(ruleConsistentValue(r.roiAnnualPct!, m.roiAnnualPct!, (v) => v >= t.strongRoiPct));
    promising.push({ code: "STRONG_RETURN", text: `Strong return — about ${roiShown}% a year on the investment.` });
  }
  if (!economicsFail && investment !== null && investment > 0 && r.paybackMonths !== null && r.paybackMonths <= t.longPaybackMonths) {
    const shown = ruleConsistentValue(r.paybackMonths, m.paybackMonths!, (v) => v <= t.longPaybackMonths);
    promising.push({ code: "FAST_PAYBACK", text: `Earns back the investment quickly — in about ${formatStrategyMonths(shown)}.` });
  }
  if (!economicsFail && worst !== null && worst > 0) {
    promising.push({ code: "DOWNSIDE_STILL_PROFITABLE", text: `Even if the extra sales come in ${Math.round(spread! * 100)}% lower, it still adds about ${money(worst)} a month.` });
  }

  const values: StrategyDecisionValues = {
    currency,
    monthlyProfitChange: base,
    worstMonthlyProfitChange: worst,
    bestMonthlyProfitChange: r.bestMonthlyProfitDelta,
    investment,
    cashAvailable: cash,
    fundingGap,
    cashLeftAfter,
    paybackMonths: r.paybackMonths,
    roiAnnualPct: r.roiAnnualPct,
    downsideSpreadPct: spread === null ? null : Math.round(spread * 100),
  };

  return {
    modelVersion: STRATEGY_DECISION_MODEL_VERSION,
    code,
    headline: STRATEGY_DECISION_HEADLINE[code],
    headlineDetail: headlineDetail(code, primaryReason, orderedReasons, fundingGap, money),
    reasons: orderedReasons,
    conditions,
    primaryReason,
    primaryStep: primaryStepFor(code, primaryReason, { fundingGap, cash, base, worst, spread, money }),
    dimensions,
    promising,
    values,
    prohibitedRecommendationCodes: code === "GO"
      ? ["STRREC_PURSUE", "STRREC_SCALE"]
      : [...STRATEGY_PROCEED_RECOMMENDATION_CODES],
  };
}

function headlineDetail(
  code: StrategyDecisionCode,
  primaryReason: StrategyDecisionReasonCode | null,
  reasons: StrategyDecisionReason[],
  fundingGap: number | null,
  money: (x: number) => string
): string | null {
  if (code === "NOT_YET" && fundingGap !== null) return `You're ${money(fundingGap)} short.`;
  if (code === "GO") return null;
  const primary = reasons.find((x) => x.code === primaryReason);
  return primary ? primary.message : null;
}

const MISSING_STEP: Partial<Record<StrategyDecisionReasonCode, { recommendationCode: string; findingCode: string; title: string; description: string }>> = {
  INVALID_CURRENCY: {
    recommendationCode: "STRREC_FIX_CURRENCY",
    findingCode: "STR_INVALID_CURRENCY",
    title: "Set a valid currency",
    description: "Set a valid 3-letter currency code for this scenario so the money figures can be trusted.",
  },
  INVALID_INVESTMENT: {
    recommendationCode: "STRREC_IMPROVE_DATA_QUALITY",
    findingCode: "STR_DECISION_INVALID_INPUT",
    title: "Correct the upfront investment",
    description: "Enter the upfront investment as a positive amount, or 0 if there is none.",
  },
  INVALID_CASH: {
    recommendationCode: "STRREC_IMPROVE_DATA_QUALITY",
    findingCode: "STR_DECISION_INVALID_INPUT",
    title: "Correct the cash you can put into this",
    description: "Enter the cash actually available for this option, or 0 if there is none.",
  },
  MISSING_REVENUE_CHANGE: {
    recommendationCode: "STRREC_IMPROVE_DATA_QUALITY",
    findingCode: "STR_MISSING_CRITICAL_DATA",
    title: "Enter the expected revenue change per month",
    description: "Estimate how much monthly revenue changes if you do this (use a negative number for a drop), then evaluate again.",
  },
  MISSING_COST_CHANGE: {
    recommendationCode: "STRREC_IMPROVE_DATA_QUALITY",
    findingCode: "STR_MISSING_CRITICAL_DATA",
    title: "Enter the expected cost change per month",
    description: "Estimate how much monthly costs change if you do this (use a negative number for savings), then evaluate again.",
  },
  MISSING_INVESTMENT: {
    recommendationCode: "STRREC_IMPROVE_DATA_QUALITY",
    findingCode: "STR_MISSING_CRITICAL_DATA",
    title: "Enter the upfront investment",
    description: "Enter the one-time amount you would spend to start this (0 if none), then evaluate again.",
  },
  MISSING_CASH: {
    recommendationCode: "STRREC_PROVIDE_CASH",
    findingCode: "STR_MISSING_CASH",
    title: "Enter the cash you can put into this",
    description: "Enter how much cash you can put into this option so affordability and any funding gap can be calculated.",
  },
};

function primaryStepFor(
  code: StrategyDecisionCode,
  primaryReason: StrategyDecisionReasonCode | null,
  ctx: { fundingGap: number | null; cash: number | null; base: number | null; worst: number | null; spread: number | null; money: (x: number) => string }
): StrategyPrimaryStep {
  const { money } = ctx;
  if (code === "NEED_INFO") {
    const step = (primaryReason && MISSING_STEP[primaryReason]) ?? MISSING_STEP.MISSING_REVENUE_CHANGE!;
    return { ...step, options: [] };
  }
  if (code === "DONT_AS_PLANNED") {
    const why = ctx.base !== null && ctx.base < 0
      ? `As planned this loses about ${money(ctx.base)} a month.`
      : ctx.base === 0
        ? "As planned it adds no profit."
        : "As planned it never earns back the investment.";
    return {
      recommendationCode: "STRREC_DROP_OR_RESCOPE",
      findingCode: primaryReason === "NEGATIVE_RETURN" ? "STR_NEGATIVE_ROI" : "STR_NEGATIVE_BASE_CASE",
      title: "Change the plan, re-scope it, or drop it",
      description: `${why} Change the numbers until it adds profit, or put the money to another use.`,
      options: [
        "Raise the price or the extra revenue it brings in",
        "Cut the cost it adds",
        "Start smaller with less upfront spend",
        "Drop it and use the money elsewhere",
      ],
    };
  }
  if (code === "NOT_YET") {
    const gap = money(ctx.fundingGap ?? 0);
    return {
      recommendationCode: "STRREC_SECURE_FUNDING",
      findingCode: "STR_UNAFFORDABLE",
      title: `Close the ${gap} funding gap`,
      description: `The numbers work, but you're ${gap} short. Close the gap before committing.`,
      options: [
        "Stage the spend so the first step fits the cash you have",
        ctx.cash !== null && ctx.cash > 0 ? `Reduce the scope to fit ${money(ctx.cash)}` : "Reduce the scope so less cash is needed upfront",
        `Secure ${gap} of funding before committing`,
      ],
    };
  }
  if (code === "GO_WITH_CONDITIONS") {
    switch (primaryReason) {
      case "DOWNSIDE_LOSS":
        return {
          recommendationCode: "STRREC_CAP_DOWNSIDE",
          findingCode: "STR_NEGATIVE_WORST_CASE",
          title: "Cap the downside before committing",
          description: `If the extra sales come in ${Math.round((ctx.spread ?? 0) * 100)}% lower, this loses about ${money(ctx.worst ?? 0)} a month. Stage the spend or set an exit trigger so a bad month is survivable.`,
          options: ["Stage the spend", "Set an exit trigger", "Shrink the commitment"],
        };
      case "HIGH_EXECUTION_RISK":
        return {
          recommendationCode: "STRREC_DE_RISK",
          findingCode: "STR_HIGH_EXECUTION_RISK",
          title: "Run a small pilot first",
          description: "You rated execution risk high. Run a small pilot with a clear success measure and an exit trigger before committing fully.",
          options: [],
        };
      case "DOWNSIDE_UNKNOWN":
        return {
          recommendationCode: "STRREC_SET_RISK_LEVEL",
          findingCode: "STR_MISSING_RISK_LEVEL",
          title: "Choose an execution risk level",
          description: "Choose low, medium or high execution risk and evaluate again, so the downside is calculated before you commit.",
          options: [],
        };
      case "NO_CASH_RESERVE":
        return {
          recommendationCode: "STRREC_KEEP_RESERVE",
          findingCode: "STR_NO_CASH_RESERVE",
          title: "Keep a cash reserve",
          description: "This uses all the cash you have for it. Stage the spend or line up a buffer so one bad month doesn't leave you short.",
          options: ["Stage the spend", "Line up a cash buffer first"],
        };
      case "LONG_PAYBACK":
        return {
          recommendationCode: "STRREC_STAGE_PAYBACK",
          findingCode: "STR_LONG_PAYBACK",
          title: "Shorten or stage the payback",
          description: "The investment takes too long to come back. Phase it, negotiate vendor terms, or start smaller so cash returns sooner.",
          options: ["Phase the investment", "Negotiate vendor terms", "Start smaller"],
        };
      case "WEAK_RETURN":
      default:
        return {
          recommendationCode: "STRREC_COMPARE_ALTERNATIVES",
          findingCode: "STR_WEAK_ROI",
          title: "Compare a better use of the cash",
          description: "The return is weak. Compare 1–2 other uses of the same money before committing to this one.",
          options: [],
        };
    }
  }
  return {
    recommendationCode: "STRREC_PROCEED",
    findingCode: "STR_DECISION_GO",
    title: "Go ahead and track the result",
    description: ctx.base !== null
      ? `Go ahead, then check actual monthly profit against the estimate of about ${money(ctx.base)} a month once it's running.`
      : "Go ahead, then check actual monthly profit against the estimate once it's running.",
    options: [],
  };
}

function buildDimensions(a: {
  input: StrategySnapshotInput;
  s: StrategyInputStatus;
  t: StrategyThresholds;
  base: number | null;
  worst: number | null;
  spread: number | null;
  investment: number | null;
  cash: number | null;
  fundingGap: number | null;
  cashLeftAfter: number | null;
  paybackShown: number | null;
  economicsFail: boolean;
  weakReturn: boolean;
  longPayback: boolean;
  strongReturn: boolean;
  money: (x: number) => string;
  now?: Date;
}): StrategyDecisionDimensions {
  const { s, t, base, worst, spread, investment, cash, money } = a;

  // Profit
  let profit: StrategyDecisionDimensions["profit"];
  if (base === null) {
    const missing = [s.expectedRevenueChange === "missing" ? INPUT_LABEL.expectedRevenueChange : null, s.costChange === "missing" ? INPUT_LABEL.costChange : null].filter(Boolean);
    profit = { state: "unknown", profitClass: "unknown", line: `Profit not calculated — enter the ${missing.join(" and ")}.` };
  } else if (base < 0) {
    profit = { state: "blocker", profitClass: "no_profit", line: `Loses about ${money(base)} a month.` };
  } else if (base === 0) {
    profit = { state: "blocker", profitClass: "no_profit", line: "Doesn't add profit — the extra revenue only covers the extra cost." };
  } else {
    const adds = `Adds about ${money(base)} a month`;
    let tail: string;
    if (investment === null || s.investmentRequired === "negative") tail = " · upfront investment not entered";
    else if (investment === 0) tail = " · no upfront investment";
    else if (a.paybackShown !== null) tail = ` · earns back ${money(investment)} in about ${formatStrategyMonths(a.paybackShown)}`;
    else tail = "";
    const profitClass: StrategyProfitClass = a.economicsFail ? "no_profit" : a.weakReturn || a.longPayback ? "weak" : a.strongReturn ? "strong" : "acceptable";
    profit = {
      state: a.economicsFail ? "blocker" : profitClass === "weak" ? "caution" : "good",
      profitClass,
      line: a.economicsFail ? `${adds}, but it never earns back the investment.` : `${adds}${tail}.`,
    };
  }

  // Cash
  let cashView: StrategyDimensionView;
  if (s.investmentRequired === "negative" || s.cashAvailable === "negative") cashView = { state: "unknown", line: "Cash not assessed — an entered amount is negative." };
  else if (investment === null) cashView = { state: "unknown", line: "Upfront investment not entered — affordability not calculated." };
  else if (investment === 0) cashView = { state: "good", line: "No upfront investment needed." };
  else if (cash === null) cashView = { state: "unknown", line: `Cash you can put into this not entered — can't tell if ${money(investment)} is affordable.` };
  else if (a.fundingGap !== null && a.fundingGap > 0) {
    cashView = { state: "blocker", line: cash === 0 ? `No cash available for this — ${money(a.fundingGap)} short.` : `${money(cash)} available for this — ${money(a.fundingGap)} short.` };
  } else if (a.cashLeftAfter === 0) cashView = { state: "caution", line: `${money(cash)} available — covers the ${money(investment)} but leaves nothing in reserve.` };
  else cashView = { state: "good", line: `${money(cash)} available — covers the ${money(investment)} with ${money(a.cashLeftAfter ?? 0)} to spare.` };

  // Downside
  let downside: StrategyDimensionView;
  const rev = num(a.input.expectedRevenueChange);
  if (base === null) downside = { state: "unknown", line: "Downside not calculated — profit is unknown." };
  else if (s.riskLevel === null || worst === null || spread === null) downside = { state: "unknown", line: "Downside not calculated — choose an execution risk." };
  else {
    const pct = Math.round(spread * 100);
    const when = rev !== null && rev < 0 ? `If revenue drops ${pct}% more than expected` : rev === 0 ? "With no revenue change expected" : `If the extra sales come in ${pct}% lower`;
    const outcome = worst > 0 ? `this still adds about ${money(worst)} a month` : worst === 0 ? "this only breaks even" : `this loses about ${money(worst)} a month`;
    const high = s.riskLevel === "high" ? " · you rated execution risk high" : "";
    const state: StrategyDimensionState = worst < 0 || worst === 0 || s.riskLevel === "high" ? "caution" : "good";
    downside = { state, line: `${when}, ${outcome}${high}.` };
  }

  // Evidence
  const provided = EVIDENCE_INPUTS.filter((k) => inputProvided(a.input, k, s));
  const missingInputs = EVIDENCE_INPUTS.filter((k) => !provided.includes(k)).map(String);
  const notes: string[] = ["values are owner estimates"];
  if (!isValidCurrency(a.input.currency)) notes.push("currency code is not valid");
  if (a.now && isStaleSnapshot(a.input.periodEnd, a.now, t.staleSnapshotDays)) notes.push(`assessed more than ${t.staleSnapshotDays} days ago`);
  const decisionInputMissing = s.coreEconomicsMissing || s.investmentRequired === "missing" || s.cashNeededButMissing || !isValidCurrency(a.input.currency);
  const evidence: StrategyDecisionDimensions["evidence"] = {
    state: decisionInputMissing ? "unknown" : provided.length < EVIDENCE_INPUTS.length || notes.length > 1 ? "caution" : "good",
    line: `${provided.length} of ${EVIDENCE_INPUTS.length} inputs provided · ${notes.join(" · ")}`,
    providedCount: provided.length,
    totalCount: EVIDENCE_INPUTS.length,
    missingInputs,
  };

  return { profit, cash: cashView, downside, evidence };
}

/** Owner-facing label for a scenario input key (evidence lists, missing-input prompts). */
export function strategyInputLabel(key: string): string {
  return INPUT_LABEL[key] ?? key;
}
