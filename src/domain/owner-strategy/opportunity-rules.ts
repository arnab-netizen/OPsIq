/**
 * Owner Strategy & Scenario Planning (Module 8 Slice 2) — deterministic
 * OPPORTUNITY findings.
 *
 * Pure: maps Slice 1 scenario metrics → `OwnerFinding[]` (findingType
 * "opportunity"). Opportunities are emitted ONLY when supporting inputs exist (a
 * real, computed metric). When the data isn't there, no opportunity is fabricated.
 */
import {
  clampScore,
  clampConfidence,
  type OwnerFinding,
  type OwnerSeverity,
} from "@/domain/owner-spine/contracts";
import type { StrategySnapshotInput, StrategyDerivedMetrics } from "./types";
import type { StrategyThresholds } from "./thresholds";

interface OppArgs {
  code: string;
  title: string;
  summary: string;
  sourceMetric: string;
  sourceValue?: number | null;
  threshold?: number | null;
  severity: OwnerSeverity;
  confidence: number;
  impactScore: number;
  urgencyScore: number;
  evidence: string[];
  verificationMetric: string;
}

function opportunity(args: OppArgs): OwnerFinding {
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
    urgencyScore: clampScore(args.urgencyScore),
    findingType: "opportunity",
    evidence: args.evidence,
    missingData: [],
    verificationMetric: args.verificationMetric,
  };
}

export function buildStrategyOpportunityFindings(
  input: StrategySnapshotInput,
  m: StrategyDerivedMetrics,
  t: StrategyThresholds
): OwnerFinding[] {
  const findings: OwnerFinding[] = [];
  const conf = clampConfidence(m.dataConfidenceScore / 100);
  void input;

  // Strong-ROI option worth pursuing/scaling (only when ROI computable + strong)
  if (m.roiAnnualPct !== null && m.roiAnnualPct >= t.strongRoiPct) {
    findings.push(
      opportunity({
        code: "STR_OPP_STRONG_RETURN",
        title: "High-return option — pursue it",
        summary:
          "The return on capital is strong; this is a high-ROI use of cash. Commit (staged) while the numbers hold.",
        sourceMetric: "roiAnnualPct",
        sourceValue: m.roiAnnualPct,
        threshold: t.strongRoiPct,
        severity: "low",
        confidence: conf,
        impactScore: clampScore(Math.min(m.roiAnnualPct / 8, 60)),
        urgencyScore: 40,
        evidence: [`roiAnnualPct = ${m.roiAnnualPct}% ≥ ${t.strongRoiPct}%`],
        verificationMetric: "roiAnnualPct",
      })
    );
  }

  // Fast payback (only when payback computable and within the long-payback bar)
  if (m.paybackMonths !== null && m.paybackMonths <= t.longPaybackMonths && m.baseMonthlyProfitDelta !== null && m.baseMonthlyProfitDelta > 0) {
    findings.push(
      opportunity({
        code: "STR_OPP_FAST_PAYBACK",
        title: "Capital comes back quickly",
        summary:
          "Payback is within the comfortable window, so the cash is not tied up long — a low-regret bet if the downside is survivable.",
        sourceMetric: "paybackMonths",
        sourceValue: m.paybackMonths,
        threshold: t.longPaybackMonths,
        severity: "low",
        confidence: conf,
        impactScore: clampScore(Math.min((t.longPaybackMonths - m.paybackMonths) * 2 + 20, 50)),
        urgencyScore: 35,
        evidence: [`paybackMonths = ${m.paybackMonths} ≤ ${t.longPaybackMonths}`],
        verificationMetric: "paybackMonths",
      })
    );
  }

  // Safe upside (worst case still profitable) — a robust option
  if (m.worstMonthlyProfitDelta !== null && m.worstMonthlyProfitDelta > 0) {
    findings.push(
      opportunity({
        code: "STR_OPP_SAFE_UPSIDE",
        title: "Even the downside is profitable",
        summary:
          "The worst case still adds monthly profit — this is a high-safety option; it can be sized up with confidence.",
        sourceMetric: "worstMonthlyProfitDelta",
        sourceValue: m.worstMonthlyProfitDelta,
        threshold: 0,
        severity: "low",
        confidence: conf,
        impactScore: clampScore(Math.min(m.worstMonthlyProfitDelta / 1000, 50)),
        urgencyScore: 30,
        evidence: [`worstMonthlyProfitDelta = ${m.worstMonthlyProfitDelta} > 0`],
        verificationMetric: "worstMonthlyProfitDelta",
      })
    );
  }

  // Data quality improvement opportunity (confidence below 100)
  if (m.dataConfidenceScore < 100) {
    findings.push(
      opportunity({
        code: "STR_OPP_DATA_QUALITY",
        title: "Improve data completeness for a sharper decision",
        summary:
          "Some inputs are missing or stale; supplying them increases the confidence of the recommendation for this option.",
        sourceMetric: "dataConfidenceScore",
        sourceValue: m.dataConfidenceScore,
        threshold: 100,
        severity: "low",
        confidence: 1,
        impactScore: clampScore(100 - m.dataConfidenceScore),
        urgencyScore: 20,
        evidence: [
          `dataConfidenceScore = ${m.dataConfidenceScore} < 100`,
          m.missingRequiredInputs.length > 0
            ? `missing: ${m.missingRequiredInputs.join(", ")}`
            : "some non-critical fields missing",
        ],
        verificationMetric: "dataConfidenceScore",
      })
    );
  }

  return findings;
}
