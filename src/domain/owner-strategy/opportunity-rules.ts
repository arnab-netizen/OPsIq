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
import { num, ruleConsistentValue } from "./metrics";
import { downsideWhen } from "./decision-format";
import { RISK_LEVEL_SPREAD } from "./thresholds";

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
  // Thresholds are compared on FULL-PRECISION values only (see risk-rules.ts).
  const r = m.raw;

  // Strong ROI (only when ROI computable + strong) — a reason, not a command
  if (r.roiAnnualPct !== null && r.roiAnnualPct >= t.strongRoiPct) {
    const shown = ruleConsistentValue(r.roiAnnualPct, m.roiAnnualPct!, (v) => v >= t.strongRoiPct);
    findings.push(
      opportunity({
        code: "STR_OPP_STRONG_RETURN",
        title: "Strong return on the investment",
        summary:
          "The profit it adds is a strong annual return on the money put in.",
        sourceMetric: "roiAnnualPct",
        sourceValue: shown,
        threshold: t.strongRoiPct,
        severity: "low",
        confidence: conf,
        impactScore: clampScore(Math.min(r.roiAnnualPct / 8, 60)),
        urgencyScore: 40,
        evidence: [`roiAnnualPct = ${shown}% ≥ ${t.strongRoiPct}%`],
        verificationMetric: "roiAnnualPct",
      })
    );
  }

  // Fast payback (only when capital is actually at risk, payback is computable and within the
  // long-payback bar). With zero investment nothing is "paid back": payback 0 is not a finding.
  const investment = num(input.investmentRequired);
  if (
    investment !== null &&
    investment > 0 &&
    r.paybackMonths !== null &&
    r.paybackMonths <= t.longPaybackMonths &&
    r.baseMonthlyProfitDelta !== null &&
    r.baseMonthlyProfitDelta > 0
  ) {
    const shown = ruleConsistentValue(r.paybackMonths, m.paybackMonths!, (v) => v <= t.longPaybackMonths);
    findings.push(
      opportunity({
        code: "STR_OPP_FAST_PAYBACK",
        title: "Capital comes back quickly",
        summary:
          "It earns back the investment within the target time, so the cash is not tied up for long.",
        sourceMetric: "paybackMonths",
        sourceValue: shown,
        threshold: t.longPaybackMonths,
        severity: "low",
        confidence: conf,
        impactScore: clampScore(Math.min((t.longPaybackMonths - r.paybackMonths) * 2 + 20, 50)),
        urgencyScore: 35,
        evidence: [`paybackMonths = ${shown} ≤ ${t.longPaybackMonths}`],
        verificationMetric: "paybackMonths",
      })
    );
  }

  // Safe upside (worst case still profitable) — a robust option
  if (r.worstMonthlyProfitDelta !== null && r.worstMonthlyProfitDelta > 0) {
    const shown = ruleConsistentValue(r.worstMonthlyProfitDelta, m.worstMonthlyProfitDelta!, (v) => v > 0);
    findings.push(
      opportunity({
        code: "STR_OPP_SAFE_UPSIDE",
        title: "Even the downside is profitable",
        summary: (() => {
          const when = input.riskLevel ? downsideWhen(num(input.expectedRevenueChange), RISK_LEVEL_SPREAD[input.riskLevel]) : null;
          return when
            ? `${when}, the option still adds monthly profit.`
            : "No revenue change is expected, so the result doesn't depend on sales — it adds monthly profit either way.";
        })(),
        sourceMetric: "worstMonthlyProfitDelta",
        sourceValue: shown,
        threshold: 0,
        severity: "low",
        confidence: conf,
        impactScore: clampScore(Math.min(r.worstMonthlyProfitDelta / 1000, 50)),
        urgencyScore: 30,
        evidence: [`worstMonthlyProfitDelta = ${shown} > 0`],
        verificationMetric: "worstMonthlyProfitDelta",
      })
    );
  }

  // Missing or stale inputs are NOT an opportunity: evidence completeness is reported as its own
  // decision dimension and missing inputs as explicit risk findings (STR_MISSING_*).

  return findings;
}
