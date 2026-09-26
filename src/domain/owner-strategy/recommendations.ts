/**
 * Owner Strategy & Scenario Planning (Module 8 Slice 3) — deterministic
 * recommendations.
 *
 * Pure: maps Slice 2 scenario `OwnerFinding`s → traceable
 * `StrategyRecommendation`s. Every recommendation carries its source
 * metric/value/threshold, severity, expected impact, confidence, the required
 * owner action, and how to verify it. A finding with no template produces no
 * recommendation (reported as a missing action input by the planner) — nothing is
 * invented.
 */
import type { OwnerFinding, OwnerSeverity } from "@/domain/owner-spine/contracts";
import { clampScore, clampConfidence } from "@/domain/owner-spine/contracts";

export interface StrategyRecommendation {
  recommendationCode: string;
  findingCode: string;
  category: string;
  sourceMetric: string;
  sourceValue: number | null;
  threshold: number | null;
  severity: OwnerSeverity;
  expectedDecisionImpactScore: number; // 0..100
  urgencyScore: number; // 0..100 (carried from the finding)
  confidence: number; // 0..1
  requiredOwnerAction: string;
  verificationMetric: string;
  verificationMethod: string;
  expectedTimeframeDays: number;
  effortScore: number; // 0..100
  ownerRole: string;
  title: string;
  evidence: string[];
}

interface StrategyRecTemplate {
  recommendationCode: string;
  category: string;
  title: string;
  requiredOwnerAction: string;
  verificationMethod: string;
  expectedTimeframeDays: number;
  effortScore: number;
  ownerRole: string;
}

/**
 * Finding code → recommendation template. Categories cover the strategy decision
 * set: drop/re-scope a value-destroying option, compare a better use of capital,
 * cap the downside, stage the payback, secure funding, de-risk execution, and
 * pursue/scale a strong option.
 */
export const STRATEGY_REC_TEMPLATES: Record<string, StrategyRecTemplate> = {
  STR_NEGATIVE_BASE_CASE: {
    recommendationCode: "STRREC_DROP_OR_RESCOPE",
    category: "drop_or_rescope",
    title: "Drop or re-scope this option",
    requiredOwnerAction:
      "As framed, the expected case loses money — do not pursue it. Re-scope it (lower cost / higher price / smaller scale) until the base case is positive, or drop it.",
    verificationMethod: "Re-run the scenario with revised inputs; target baseMonthlyProfitDelta > 0.",
    expectedTimeframeDays: 7,
    effortScore: 25,
    ownerRole: "owner",
  },
  STR_NEGATIVE_ROI: {
    recommendationCode: "STRREC_DROP_OR_RESCOPE",
    category: "drop_or_rescope",
    title: "Do not commit capital at a negative return",
    requiredOwnerAction:
      "The investment is not recovered — re-scope to cut the upfront cost or raise the profit gain, or redirect the cash to a positive-ROI option.",
    verificationMethod: "Re-run the scenario; target roiAnnualPct above break-even, then above target.",
    expectedTimeframeDays: 7,
    effortScore: 25,
    ownerRole: "owner",
  },
  STR_WEAK_ROI: {
    recommendationCode: "STRREC_COMPARE_ALTERNATIVES",
    category: "compare_alternatives",
    title: "Compare a higher-ROI use of the cash",
    requiredOwnerAction:
      "The return is weak — list 1–2 alternative uses of the same capital and compare ROI/payback before committing to this one.",
    verificationMethod: "Document the comparison; commit only if this option's roiAnnualPct is the best safe choice.",
    expectedTimeframeDays: 14,
    effortScore: 30,
    ownerRole: "owner",
  },
  STR_NEGATIVE_WORST_CASE: {
    recommendationCode: "STRREC_CAP_DOWNSIDE",
    category: "cap_downside",
    title: "Cap the downside before committing",
    requiredOwnerAction:
      "Size the bet so a bad month is survivable: stage the spend, add an exit trigger, or shrink the commitment until the worst case is not a loss.",
    verificationMethod: "Re-run with the staged/smaller scope; target worstMonthlyProfitDelta ≥ 0.",
    expectedTimeframeDays: 14,
    effortScore: 35,
    ownerRole: "owner",
  },
  STR_LONG_PAYBACK: {
    recommendationCode: "STRREC_STAGE_PAYBACK",
    category: "stage_payback",
    title: "Shorten or stage the payback",
    requiredOwnerAction:
      "Capital is tied up too long — phase the investment, negotiate vendor terms, or start smaller so cash returns sooner and the risk window shrinks.",
    verificationMethod: "Re-run with the staged plan; target paybackMonths within the comfortable window.",
    expectedTimeframeDays: 14,
    effortScore: 35,
    ownerRole: "owner",
  },
  STR_UNAFFORDABLE: {
    recommendationCode: "STRREC_SECURE_FUNDING",
    category: "secure_funding",
    title: "Secure funding or stage the spend",
    requiredOwnerAction:
      "Available cash cannot safely fund this — stage the investment to fit cash, keep a reserve, or secure financing before committing.",
    verificationMethod: "Re-run with the staged amount / new cash position; target affordabilityRatio ≥ 1.",
    expectedTimeframeDays: 21,
    effortScore: 40,
    ownerRole: "owner",
  },
  STR_HIGH_EXECUTION_RISK: {
    recommendationCode: "STRREC_DE_RISK",
    category: "de_risk",
    title: "De-risk execution with a pilot",
    requiredOwnerAction:
      "Run a small pilot / staged rollout with a clear success metric and an exit trigger before committing fully to the high-risk option.",
    verificationMethod: "Define the pilot's success metric up front; proceed only if the pilot hits it.",
    expectedTimeframeDays: 30,
    effortScore: 40,
    ownerRole: "owner",
  },
  STR_INVALID_CURRENCY: {
    recommendationCode: "STRREC_FIX_CURRENCY",
    category: "improve_data_quality",
    title: "Set a valid reporting currency",
    requiredOwnerAction: "Set a valid 3–8 letter currency code on the scenario.",
    verificationMethod: "Confirm currencyValid is true on the next scenario.",
    expectedTimeframeDays: 3,
    effortScore: 10,
    ownerRole: "owner",
  },
  STR_MISSING_CRITICAL_DATA: {
    recommendationCode: "STRREC_IMPROVE_DATA_QUALITY",
    category: "improve_data_quality",
    title: "Provide missing scenario inputs",
    requiredOwnerAction: "Enter the listed missing inputs (revenue change, cost change, investment) so the recommendation is trustworthy.",
    verificationMethod: "Re-run the scenario; target dataConfidenceScore higher.",
    expectedTimeframeDays: 7,
    effortScore: 20,
    ownerRole: "owner",
  },
  STR_MISSING_CASH: {
    recommendationCode: "STRREC_PROVIDE_CASH",
    category: "improve_data_quality",
    title: "Enter the cash you can put into this",
    requiredOwnerAction:
      "Enter how much cash you can put into this option so affordability and any funding gap can be calculated.",
    verificationMethod: "Re-run the scenario with the cash figure; affordability is then calculated.",
    expectedTimeframeDays: 3,
    effortScore: 10,
    ownerRole: "owner",
  },
  STR_MISSING_RISK_LEVEL: {
    recommendationCode: "STRREC_SET_RISK_LEVEL",
    category: "improve_data_quality",
    title: "Choose an execution risk level",
    requiredOwnerAction:
      "Choose low, medium or high execution risk so the downside (lower sales than expected) can be calculated.",
    verificationMethod: "Re-run the scenario with a risk level; the downside is then calculated.",
    expectedTimeframeDays: 3,
    effortScore: 10,
    ownerRole: "owner",
  },
  STR_OPP_STRONG_RETURN: {
    recommendationCode: "STRREC_PURSUE",
    category: "pursue",
    title: "Pursue this high-return option",
    requiredOwnerAction:
      "The return is strong — commit in a staged way (start partial, scale as results confirm) while keeping a cash reserve.",
    verificationMethod: "After execution, re-measure actual roiAnnualPct vs the projection.",
    expectedTimeframeDays: 30,
    effortScore: 45,
    ownerRole: "owner",
  },
  STR_OPP_FAST_PAYBACK: {
    recommendationCode: "STRREC_PURSUE",
    category: "pursue",
    title: "Low-regret bet — proceed",
    requiredOwnerAction:
      "Capital returns quickly, so the risk window is short — proceed (staged) provided the downside is survivable.",
    verificationMethod: "After execution, re-measure actual paybackMonths vs the projection.",
    expectedTimeframeDays: 21,
    effortScore: 40,
    ownerRole: "owner",
  },
  STR_OPP_SAFE_UPSIDE: {
    recommendationCode: "STRREC_SCALE",
    category: "scale",
    title: "Size up a high-safety option",
    requiredOwnerAction:
      "Even the worst case adds profit — this is high-safety. Size it up to capture more of the upside while the numbers hold.",
    verificationMethod: "After scaling, re-measure actual worstMonthlyProfitDelta vs the projection.",
    expectedTimeframeDays: 30,
    effortScore: 40,
    ownerRole: "owner",
  },
  STR_OPP_DATA_QUALITY: {
    recommendationCode: "STRREC_IMPROVE_DATA_QUALITY",
    category: "improve_data_quality",
    title: "Improve data completeness",
    requiredOwnerAction: "Supply the missing/stale inputs to sharpen the decision for this option.",
    verificationMethod: "Re-run the scenario; target dataConfidenceScore higher.",
    expectedTimeframeDays: 7,
    effortScore: 20,
    ownerRole: "owner",
  },
};

/** Build a traceable recommendation from a finding, or null if no template. */
export function buildStrategyRecommendation(finding: OwnerFinding): StrategyRecommendation | null {
  const tpl = STRATEGY_REC_TEMPLATES[finding.code];
  if (!tpl) return null;
  return {
    recommendationCode: tpl.recommendationCode,
    findingCode: finding.code,
    category: tpl.category,
    sourceMetric: finding.sourceMetric,
    sourceValue: finding.sourceValue ?? null, // never invented
    threshold: finding.threshold ?? null,
    severity: finding.severity,
    expectedDecisionImpactScore: clampScore(finding.impactScore),
    urgencyScore: clampScore(finding.urgencyScore),
    confidence: clampConfidence(finding.confidence),
    requiredOwnerAction: tpl.requiredOwnerAction,
    verificationMetric: finding.verificationMetric ?? finding.sourceMetric,
    verificationMethod: tpl.verificationMethod,
    expectedTimeframeDays: tpl.expectedTimeframeDays,
    effortScore: clampScore(tpl.effortScore),
    ownerRole: tpl.ownerRole,
    title: tpl.title,
    evidence: finding.evidence,
  };
}

/** Build recommendations for every finding that has a template (in input order). */
export function buildStrategyRecommendations(findings: OwnerFinding[]): StrategyRecommendation[] {
  const recs: StrategyRecommendation[] = [];
  for (const f of findings) {
    const r = buildStrategyRecommendation(f);
    if (r) recs.push(r);
  }
  return recs;
}
