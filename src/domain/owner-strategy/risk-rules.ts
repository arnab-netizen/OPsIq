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

  // Invalid currency (certain)
  if (!isValidCurrency(input.currency)) {
    findings.push(
      risk({
        code: "STR_INVALID_CURRENCY",
        title: "Reporting currency is invalid",
        summary:
          "The snapshot currency is missing or not a valid 3–8 letter code; fix it so the money figures are trustworthy.",
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
          "Key inputs needed to evaluate this option are missing; provide them so the recommendation is trustworthy, not a guess.",
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
          "Without an execution risk level the downside (what happens if sales come in lower) cannot be calculated — it is unknown, not safe.",
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
        title: "The expected case loses money",
        summary:
          "On the expected numbers this option reduces monthly profit — it should not be pursued as framed. Re-scope it or drop it.",
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
        title: "Return on the investment is negative",
        summary:
          "The capital required is not recovered by the profit gain — the option destroys value as framed.",
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
        title: "Return on the investment is weak",
        summary:
          "The option returns little on the capital; a higher-ROI use of the same cash likely exists — compare before committing.",
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
        title: "The downside case loses money",
        summary:
          "If revenue lands at the low end, this option turns into a monthly loss — size the bet so a bad month is survivable, or de-risk it.",
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
          title: "Payback takes too long",
          summary:
            "The capital takes a very long time to come back, tying up cash and raising the risk that conditions change first.",
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
          title: "Payback is slower than target",
          summary: "The capital comes back slowly; confirm cash can be spared that long before committing.",
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
  if (r.affordabilityRatio !== null) {
    if (r.affordabilityRatio < t.criticalAffordabilityRatio) {
      const shown = ruleConsistentValue(r.affordabilityRatio, m.affordabilityRatio!, (v) => v < t.criticalAffordabilityRatio);
      findings.push(
        risk({
          code: "STR_UNAFFORDABLE",
          title: "Cash cannot fund this investment",
          summary:
            "Available cash covers only a fraction of the required investment — pursuing it would create a liquidity risk. Stage it or secure funding first.",
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
    } else if (r.affordabilityRatio < t.minAffordabilityRatio) {
      const shown = ruleConsistentValue(r.affordabilityRatio, m.affordabilityRatio!, (v) => v < t.minAffordabilityRatio);
      findings.push(
        risk({
          code: "STR_UNAFFORDABLE",
          title: "Investment stretches available cash",
          summary:
            "The investment uses most/all available cash, leaving little buffer; stage the spend or keep a reserve.",
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

  // Investment uses exactly all the cash available for it (covered, but nothing left in reserve).
  // Only when the option is otherwise worth doing — a loss-making option is not "short of reserve".
  if (rawFundingShortfall(input) === 0 && r.baseMonthlyProfitDelta !== null && r.baseMonthlyProfitDelta > 0) {
    findings.push(
      risk({
        code: "STR_NO_CASH_RESERVE",
        title: "No cash left in reserve",
        summary:
          "The investment uses all the cash available for it — one bad month could leave you short. Stage the spend or line up a buffer.",
        sourceMetric: "affordabilityRatio",
        sourceValue: r.affordabilityRatio,
        threshold: t.minAffordabilityRatio,
        severity: "medium",
        confidence: conf,
        impactScore: 40,
        evidence: [`cashAvailable = investmentRequired = ${num(input.investmentRequired)}`],
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
          "You flagged this option as high-risk to execute; pair it with a concrete de-risking step (pilot, staged rollout, exit trigger) before committing fully.",
        sourceMetric: "riskLevel",
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
