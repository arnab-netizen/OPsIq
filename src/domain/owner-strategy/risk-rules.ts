/**
 * Owner Strategy & Scenario Planning (Module 8 Slice 2) — deterministic RISK
 * findings.
 *
 * Pure: maps Slice 1 scenario metrics → `OwnerFinding[]` (findingType "risk") using
 * the Owner Intelligence Spine contract. A rule emits ONLY when its metric is
 * computable and crosses its threshold (or, for data findings, when data is
 * missing/invalid). Nothing is invented: `sourceValue` is set only from a real
 * metric; missing inputs surface as `missingData` + a missing-data finding.
 */
import {
  clampScore,
  clampConfidence,
  type OwnerFinding,
  type OwnerSeverity,
} from "@/domain/owner-spine/contracts";
import type { StrategySnapshotInput, StrategyDerivedMetrics } from "./types";
import type { StrategyThresholds } from "./thresholds";
import { isValidCurrency } from "./data-confidence";
import { num, rawFundingShortfall, ruleConsistentValue } from "./metrics";
import { classifyStrategyInputs } from "./input-status";
import { aboutStrategyMoney, downsideWhen, formatStrategyMoney } from "./decision-format";
import { RISK_LEVEL_SPREAD } from "./thresholds";

/** The risk-level spread applied to the revenue change (0 when no valid level is set). */
function riskSpread(input: StrategySnapshotInput): number {
  const level = input.riskLevel;
  return level && Object.prototype.hasOwnProperty.call(RISK_LEVEL_SPREAD, level) ? RISK_LEVEL_SPREAD[level] : 0;
}

/** Default urgency by severity (deterministic baseline). */
const SEVERITY_URGENCY: Record<OwnerSeverity, number> = {
  low: 20,
  medium: 45,
  high: 70,
  critical: 90,
};

interface FindingArgs {
  code: string;
  title: string;
  summary: string;
  sourceMetric: string;
  sourceValue?: number | null;
  threshold?: number | null;
  severity: OwnerSeverity;
  confidence: number;
  impactScore: number;
  urgencyScore?: number;
  evidence: string[];
  missingData?: string[];
  verificationMetric: string;
}

function risk(args: FindingArgs): OwnerFinding {
  return {
    domain: "strategy",
    code: args.code,
    title: args.title,
    summary: args.summary,
    sourceMetric: args.sourceMetric,
    sourceValue: args.sourceValue ?? null,
    threshold: args.threshold ?? null,
    severity: args.severity,
    confidence: clampConfidence(args.confidence),
    impactScore: clampScore(args.impactScore),
    urgencyScore: clampScore(args.urgencyScore ?? SEVERITY_URGENCY[args.severity]),
    findingType: "risk",
    evidence: args.evidence,
    missingData: args.missingData ?? [],
    verificationMetric: args.verificationMetric,
  };
}

/**
 * Build all triggered scenario risk findings for one option. Metric-derived
 * findings carry the data-confidence as their confidence; data/currency findings
 * are themselves certain.
 */
export function buildStrategyRiskFindings(
  input: StrategySnapshotInput,
  m: StrategyDerivedMetrics,
  t: StrategyThresholds
): OwnerFinding[] {
  const findings: OwnerFinding[] = [];
  const conf = clampConfidence(m.dataConfidenceScore / 100);
  // Thresholds are compared on FULL-PRECISION values only; display values are shown (made
  // rule-consistent at boundaries) but never decide an outcome.
  const r = m.raw;
  const about = (x: number | null) => aboutStrategyMoney(x ?? 0, input.currency);

  // Invalid currency (certain)
  if (!isValidCurrency(input.currency)) {
    findings.push(
      risk({
        code: "STR_INVALID_CURRENCY",
        title: "Currency code is not valid",
        summary:
          "The scenario's currency code isn't valid, so the money figures can't be trusted.",
        sourceMetric: "currency",
        sourceValue: null,
        severity: "medium",
        confidence: 1,
        impactScore: 25,
        evidence: [`currency = "${String(input.currency)}" is not a valid code`],
        missingData: ["currency"],
        verificationMetric: "currency",
      })
    );
  }

  // Missing critical data (certain about the absence)
  if (m.missingRequiredInputs.length > 0) {
    const severity: OwnerSeverity = m.missingRequiredInputs.length >= 2 ? "high" : "medium";
    findings.push(
      risk({
        code: "STR_MISSING_CRITICAL_DATA",
        title: "Critical scenario inputs are missing",
        summary:
          "Inputs needed to judge this option are missing, so its profit effect or affordability can't be calculated.",
        sourceMetric: "dataConfidenceScore",
        sourceValue: m.dataConfidenceScore,
        severity,
        confidence: 1,
        impactScore: 40,
        evidence: [
          `missing: ${m.missingRequiredInputs.join(", ")}`,
          `dataConfidenceScore = ${m.dataConfidenceScore}`,
        ],
        missingData: m.missingRequiredInputs,
        verificationMetric: "dataConfidenceScore",
      })
    );
  }

  // Missing cash while an investment is required (certain about the absence). Affordability and
  // the funding gap are UNKNOWN — not "affordable". A known cash = 0 is a fact handled by the
  // affordability bands below; with no (or zero) investment, missing cash blocks nothing.
  const status = classifyStrategyInputs(input);
  if (status.cashNeededButMissing) {
    findings.push(
      risk({
        code: "STR_MISSING_CASH",
        title: "Cash available is not entered",
        summary:
          "This option needs an upfront investment, but the cash you can put into it is not entered — whether you can afford it, and how much you would be short, is unknown.",
        sourceMetric: "cashAvailable",
        sourceValue: null,
        severity: "high",
        confidence: 1,
        impactScore: 45,
        evidence: ["cashAvailable not provided", `investmentRequired = ${num(input.investmentRequired)}`],
        missingData: ["cashAvailable"],
        verificationMetric: "affordabilityRatio",
      })
    );
  }

  // Missing execution risk (certain about the absence). The downside range cannot be calculated,
  // so no downside (and no "safe upside") is asserted either way.
  if (status.riskLevel === null) {
    findings.push(
      risk({
        code: "STR_MISSING_RISK_LEVEL",
        title: "Execution risk is not chosen",
        summary:
          "Without an execution risk level the downside can't be calculated — it is unknown, not safe.",
        sourceMetric: "riskLevel",
        sourceValue: null,
        severity: "medium",
        confidence: 1,
        impactScore: 35,
        evidence: ["riskLevel not provided"],
        missingData: ["riskLevel"],
        verificationMetric: "worstMonthlyProfitDelta",
      })
    );
  }

  // Negative base case (the option loses money in the expected case)
  if (r.baseMonthlyProfitDelta !== null && r.baseMonthlyProfitDelta <= 0) {
    const shown = ruleConsistentValue(r.baseMonthlyProfitDelta, m.baseMonthlyProfitDelta!, (v) => v <= 0);
    findings.push(
      risk({
        code: "STR_NEGATIVE_BASE_CASE",
        title: r.baseMonthlyProfitDelta === 0 ? "Adds no profit on your numbers" : "Loses money on your numbers",
        summary:
          r.baseMonthlyProfitDelta === 0
            ? "On the expected numbers the revenue and cost changes cancel out — monthly profit does not go up."
            : `On the expected numbers this reduces monthly profit by ${about(r.baseMonthlyProfitDelta)}.`,
        sourceMetric: "baseMonthlyProfitDelta",
        sourceValue: shown,
        threshold: 0,
        severity: "critical",
        confidence: conf,
        impactScore: 85,
        evidence: [`baseMonthlyProfitDelta = ${shown} ≤ 0`],
        verificationMetric: "baseMonthlyProfitDelta",
      })
    );
  } else if (r.roiAnnualPct !== null && r.roiAnnualPct < t.criticalRoiPct) {
    // Negative ROI with a (barely) positive base is still value-destroying on capital.
    const shown = ruleConsistentValue(r.roiAnnualPct, m.roiAnnualPct!, (v) => v < t.criticalRoiPct);
    findings.push(
      risk({
        code: "STR_NEGATIVE_ROI",
        title: "The investment is never earned back",
        summary:
          "The profit it adds does not earn back the upfront investment.",
        sourceMetric: "roiAnnualPct",
        sourceValue: shown,
        threshold: t.criticalRoiPct,
        severity: "critical",
        confidence: conf,
        impactScore: 80,
        evidence: [`roiAnnualPct = ${shown}% < ${t.criticalRoiPct}%`],
        verificationMetric: "roiAnnualPct",
      })
    );
  } else if (r.roiAnnualPct !== null && r.roiAnnualPct < t.lowRoiPct) {
    const shown = ruleConsistentValue(r.roiAnnualPct, m.roiAnnualPct!, (v) => v < t.lowRoiPct);
    findings.push(
      risk({
        code: "STR_WEAK_ROI",
        title: "Low return on the investment",
        summary:
          `It returns only about ${shown}% a year on the money put in.`,
        sourceMetric: "roiAnnualPct",
        sourceValue: shown,
        threshold: t.lowRoiPct,
        severity: "high",
        confidence: conf,
        impactScore: 50,
        evidence: [`roiAnnualPct = ${shown}% < ${t.lowRoiPct}%`],
        verificationMetric: "roiAnnualPct",
      })
    );
  }

  // Negative worst case (downside loses money even though the base case is positive)
  if (
    r.worstMonthlyProfitDelta !== null &&
    r.worstMonthlyProfitDelta < 0 &&
    r.baseMonthlyProfitDelta !== null &&
    r.baseMonthlyProfitDelta > 0
  ) {
    const shown = ruleConsistentValue(r.worstMonthlyProfitDelta, m.worstMonthlyProfitDelta!, (v) => v < 0);
    findings.push(
      risk({
        code: "STR_NEGATIVE_WORST_CASE",
        title: "The downside loses money",
        summary:
          `${downsideWhen(num(input.expectedRevenueChange), riskSpread(input)) ?? "In the downside case"}, this becomes a monthly loss of ${about(r.worstMonthlyProfitDelta)}.`,
        sourceMetric: "worstMonthlyProfitDelta",
        sourceValue: shown,
        threshold: 0,
        severity: "high",
        confidence: conf,
        impactScore: 55,
        evidence: [`worstMonthlyProfitDelta = ${shown} < 0`],
        verificationMetric: "worstMonthlyProfitDelta",
      })
    );
  }

  // Payback bands (only meaningful when the base case is positive)
  if (r.baseMonthlyProfitDelta !== null && r.baseMonthlyProfitDelta > 0) {
    if (r.paybackMonths === null) {
      // positive base but payback not computable here only if investment missing — skip
    } else if (r.paybackMonths > t.criticalPaybackMonths) {
      const shown = ruleConsistentValue(r.paybackMonths, m.paybackMonths!, (v) => v > t.criticalPaybackMonths);
      findings.push(
        risk({
          code: "STR_LONG_PAYBACK",
          title: "Takes far too long to earn back",
          summary:
            `It takes about ${shown} months to earn back the investment — longer than the ${t.criticalPaybackMonths}-month limit.`,
          sourceMetric: "paybackMonths",
          sourceValue: shown,
          threshold: t.criticalPaybackMonths,
          severity: "high",
          confidence: conf,
          impactScore: 55,
          evidence: [`paybackMonths = ${shown} > ${t.criticalPaybackMonths}`],
          verificationMetric: "paybackMonths",
        })
      );
    } else if (r.paybackMonths > t.longPaybackMonths) {
      const shown = ruleConsistentValue(r.paybackMonths, m.paybackMonths!, (v) => v > t.longPaybackMonths);
      findings.push(
        risk({
          code: "STR_LONG_PAYBACK",
          title: "Slower to earn back than target",
          summary: `It takes about ${shown} months to earn back the investment (target: ${t.longPaybackMonths} months or less).`,
          sourceMetric: "paybackMonths",
          sourceValue: shown,
          threshold: t.longPaybackMonths,
          severity: "medium",
          confidence: conf,
          impactScore: 40,
          evidence: [`paybackMonths = ${shown} > ${t.longPaybackMonths}`],
          verificationMetric: "paybackMonths",
        })
      );
    }
  }

  // Affordability bands (cash cannot fund the investment)
  const shortfall = rawFundingShortfall(input);
  const gapSummary = () => {
    const cash = num(input.cashAvailable) ?? 0;
    const inv = num(input.investmentRequired) ?? 0;
    const digits = shortfall !== null && shortfall < 100 && !Number.isInteger(Math.round(shortfall * 100) / 100) ? 2 : undefined;
    const f = (x: number) => formatStrategyMoney(x, input.currency, digits);
    return cash === 0
      ? `No cash is available for the ${f(inv)} investment — ${f(shortfall ?? inv)} short.`
      : `You have ${f(cash)} for the ${f(inv)} investment — ${f(shortfall ?? 0)} short.`;
  };
  if (r.affordabilityRatio !== null && shortfall !== null && shortfall > 0) {
    if (r.affordabilityRatio < t.criticalAffordabilityRatio) {
      const shown = ruleConsistentValue(r.affordabilityRatio, m.affordabilityRatio!, (v) => v < t.criticalAffordabilityRatio);
      findings.push(
        risk({
          code: "STR_UNAFFORDABLE",
          title: "Cash covers less than half of the investment",
          summary: gapSummary(),
          sourceMetric: "affordabilityRatio",
          sourceValue: shown,
          threshold: t.criticalAffordabilityRatio,
          severity: "critical",
          confidence: conf,
          impactScore: 75,
          evidence: [`affordabilityRatio = ${shown} < ${t.criticalAffordabilityRatio}`],
          verificationMetric: "affordabilityRatio",
        })
      );
    } else {
      const shown = ruleConsistentValue(r.affordabilityRatio, m.affordabilityRatio!, (v) => v < t.minAffordabilityRatio);
      findings.push(
        risk({
          code: "STR_UNAFFORDABLE",
          title: "Not enough cash for the investment",
          summary: gapSummary(),
          sourceMetric: "affordabilityRatio",
          sourceValue: shown,
          threshold: t.minAffordabilityRatio,
          severity: "high",
          confidence: conf,
          impactScore: 55,
          evidence: [`affordabilityRatio = ${shown} < ${t.minAffordabilityRatio}`],
          verificationMetric: "affordabilityRatio",
        })
      );
    }
  }

  // Investment covered but little or no cash left in reserve (< lowReserveRatio of the investment).
  // Only when the economics work (adds profit, earns back within the critical limit, ROI not below
  // the critical ROI) — the same predicate as the decision's LOW_CASH_RESERVE condition.
  const investmentForReserve = num(input.investmentRequired);
  const economicsWork =
    r.baseMonthlyProfitDelta !== null &&
    r.baseMonthlyProfitDelta > 0 &&
    (r.roiAnnualPct === null || r.roiAnnualPct >= t.criticalRoiPct) &&
    (r.paybackMonths === null || r.paybackMonths <= t.criticalPaybackMonths);
  if (
    shortfall !== null &&
    shortfall <= 0 &&
    investmentForReserve !== null &&
    -shortfall < investmentForReserve * t.lowReserveRatio &&
    economicsWork
  ) {
    const left = -shortfall || 0;
    findings.push(
      risk({
        code: "STR_LOW_CASH_RESERVE",
        title: left === 0 ? "No cash left in reserve" : "Little cash left in reserve",
        summary:
          left === 0
            ? "The investment uses all the cash available for it — one bad month could leave you short."
            : `After the investment only ${formatStrategyMoney(left, input.currency)} of the cash is left in reserve — one bad month could leave you short.`,
        sourceMetric: "affordabilityRatio",
        sourceValue: r.affordabilityRatio,
        threshold: t.minAffordabilityRatio,
        severity: "medium",
        confidence: conf,
        impactScore: 40,
        evidence: [`cash left after investment = ${left} < ${t.lowReserveRatio} × investmentRequired`],
        verificationMetric: "affordabilityRatio",
      })
    );
  }

  // High qualitative execution risk (owner-flagged)
  if (input.riskLevel === "high") {
    findings.push(
      risk({
        code: "STR_HIGH_EXECUTION_RISK",
        title: "Execution risk is high",
        summary:
          "You rated this option as high-risk to carry out.",
        sourceMetric: "strategyRiskScore",
        sourceValue: m.strategyRiskScore,
        threshold: null,
        severity: "medium",
        confidence: conf,
        impactScore: 45,
        evidence: ["riskLevel = high"],
        verificationMetric: "strategyRiskScore",
      })
    );
  }

  return findings;
}
