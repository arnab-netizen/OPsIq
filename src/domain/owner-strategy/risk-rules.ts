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

  // Negative base case (the option loses money in the expected case)
  if (m.baseMonthlyProfitDelta !== null && m.baseMonthlyProfitDelta <= 0) {
    findings.push(
      risk({
        code: "STR_NEGATIVE_BASE_CASE",
        title: "The expected case loses money",
        summary:
          "On the expected numbers this option reduces monthly profit — it should not be pursued as framed. Re-scope it or drop it.",
        sourceMetric: "baseMonthlyProfitDelta",
        sourceValue: m.baseMonthlyProfitDelta,
        threshold: 0,
        severity: "critical",
        confidence: conf,
        impactScore: 85,
        evidence: [`baseMonthlyProfitDelta = ${m.baseMonthlyProfitDelta} ≤ 0`],
        verificationMetric: "baseMonthlyProfitDelta",
      })
    );
  } else if (m.roiAnnualPct !== null && m.roiAnnualPct < t.criticalRoiPct) {
    // Negative ROI with a (barely) positive base is still value-destroying on capital.
    findings.push(
      risk({
        code: "STR_NEGATIVE_ROI",
        title: "Return on the investment is negative",
        summary:
          "The capital required is not recovered by the profit gain — the option destroys value as framed.",
        sourceMetric: "roiAnnualPct",
        sourceValue: m.roiAnnualPct,
        threshold: t.criticalRoiPct,
        severity: "critical",
        confidence: conf,
        impactScore: 80,
        evidence: [`roiAnnualPct = ${m.roiAnnualPct}% < ${t.criticalRoiPct}%`],
        verificationMetric: "roiAnnualPct",
      })
    );
  } else if (m.roiAnnualPct !== null && m.roiAnnualPct < t.lowRoiPct) {
    findings.push(
      risk({
        code: "STR_WEAK_ROI",
        title: "Return on the investment is weak",
        summary:
          "The option returns little on the capital; a higher-ROI use of the same cash likely exists — compare before committing.",
        sourceMetric: "roiAnnualPct",
        sourceValue: m.roiAnnualPct,
        threshold: t.lowRoiPct,
        severity: "high",
        confidence: conf,
        impactScore: 50,
        evidence: [`roiAnnualPct = ${m.roiAnnualPct}% < ${t.lowRoiPct}%`],
        verificationMetric: "roiAnnualPct",
      })
    );
  }

  // Negative worst case (downside loses money even though the base case is positive)
  if (
    m.worstMonthlyProfitDelta !== null &&
    m.worstMonthlyProfitDelta < 0 &&
    m.baseMonthlyProfitDelta !== null &&
    m.baseMonthlyProfitDelta > 0
  ) {
    findings.push(
      risk({
        code: "STR_NEGATIVE_WORST_CASE",
        title: "The downside case loses money",
        summary:
          "If revenue lands at the low end, this option turns into a monthly loss — size the bet so a bad month is survivable, or de-risk it.",
        sourceMetric: "worstMonthlyProfitDelta",
        sourceValue: m.worstMonthlyProfitDelta,
        threshold: 0,
        severity: "high",
        confidence: conf,
        impactScore: 55,
        evidence: [`worstMonthlyProfitDelta = ${m.worstMonthlyProfitDelta} < 0`],
        verificationMetric: "worstMonthlyProfitDelta",
      })
    );
  }

  // Payback bands (only meaningful when the base case is positive)
  if (m.baseMonthlyProfitDelta !== null && m.baseMonthlyProfitDelta > 0) {
    if (m.paybackMonths === null) {
      // positive base but payback not computable here only if investment missing — skip
    } else if (m.paybackMonths > t.criticalPaybackMonths) {
      findings.push(
        risk({
          code: "STR_LONG_PAYBACK",
          title: "Payback takes too long",
          summary:
            "The capital takes a very long time to come back, tying up cash and raising the risk that conditions change first.",
          sourceMetric: "paybackMonths",
          sourceValue: m.paybackMonths,
          threshold: t.criticalPaybackMonths,
          severity: "high",
          confidence: conf,
          impactScore: 55,
          evidence: [`paybackMonths = ${m.paybackMonths} > ${t.criticalPaybackMonths}`],
          verificationMetric: "paybackMonths",
        })
      );
    } else if (m.paybackMonths > t.longPaybackMonths) {
      findings.push(
        risk({
          code: "STR_LONG_PAYBACK",
          title: "Payback is slower than target",
          summary: "The capital comes back slowly; confirm cash can be spared that long before committing.",
          sourceMetric: "paybackMonths",
          sourceValue: m.paybackMonths,
          threshold: t.longPaybackMonths,
          severity: "medium",
          confidence: conf,
          impactScore: 40,
          evidence: [`paybackMonths = ${m.paybackMonths} > ${t.longPaybackMonths}`],
          verificationMetric: "paybackMonths",
        })
      );
    }
  }

  // Affordability bands (cash cannot fund the investment)
  if (m.affordabilityRatio !== null) {
    if (m.affordabilityRatio < t.criticalAffordabilityRatio) {
      findings.push(
        risk({
          code: "STR_UNAFFORDABLE",
          title: "Cash cannot fund this investment",
          summary:
            "Available cash covers only a fraction of the required investment — pursuing it would create a liquidity risk. Stage it or secure funding first.",
          sourceMetric: "affordabilityRatio",
          sourceValue: m.affordabilityRatio,
          threshold: t.criticalAffordabilityRatio,
          severity: "critical",
          confidence: conf,
          impactScore: 75,
          evidence: [`affordabilityRatio = ${m.affordabilityRatio} < ${t.criticalAffordabilityRatio}`],
          verificationMetric: "affordabilityRatio",
        })
      );
    } else if (m.affordabilityRatio < t.minAffordabilityRatio) {
      findings.push(
        risk({
          code: "STR_UNAFFORDABLE",
          title: "Investment stretches available cash",
          summary:
            "The investment uses most/all available cash, leaving little buffer; stage the spend or keep a reserve.",
          sourceMetric: "affordabilityRatio",
          sourceValue: m.affordabilityRatio,
          threshold: t.minAffordabilityRatio,
          severity: "high",
          confidence: conf,
          impactScore: 55,
          evidence: [`affordabilityRatio = ${m.affordabilityRatio} < ${t.minAffordabilityRatio}`],
          verificationMetric: "affordabilityRatio",
        })
      );
    }
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
