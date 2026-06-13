/**
 * Owner Sales (Module 3 Slice 3) — deterministic recommendations.
 *
 * Pure: maps Slice 2 sales `OwnerFinding`s → traceable `SalesRecommendation`s.
 * Every recommendation carries its source metric/value/threshold, severity,
 * expected impact, confidence, the required owner action, and how to verify it.
 * A finding with no template produces no recommendation (reported as a missing
 * action input by the planner) — nothing is invented.
 */
import type { OwnerFinding, OwnerSeverity } from "@/domain/owner-spine/contracts";
import { clampScore, clampConfidence } from "@/domain/owner-spine/contracts";

export interface SalesRecommendation {
  recommendationCode: string;
  findingCode: string;
  category: string;
  sourceMetric: string;
  sourceValue: number | null;
  threshold: number | null;
  severity: OwnerSeverity;
  expectedSalesImpactScore: number; // 0..100
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

interface SalesRecTemplate {
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
 * Finding code → recommendation template. Categories cover the sales action set:
 * improve conversion, follow-up discipline, retention, win-back, reduce
 * complaints, control discounting, reduce refunds, build the B2B pipeline, and
 * improve data quality.
 */
export const SALES_REC_TEMPLATES: Record<string, SalesRecTemplate> = {
  SALES_LOW_CONVERSION: {
    recommendationCode: "SALESREC_IMPROVE_CONVERSION",
    category: "improve_conversion",
    title: "Raise lead-to-sale conversion",
    requiredOwnerAction:
      "Tighten lead qualification and add a structured follow-up + close step so more leads become orders.",
    verificationMethod: "Re-measure leadToSaleConversionPct next period; target above the low bar.",
    expectedTimeframeDays: 30,
    effortScore: 50,
    ownerRole: "owner",
  },
  SALES_POOR_FOLLOW_UP: {
    recommendationCode: "SALESREC_FOLLOW_UP_CADENCE",
    category: "improve_follow_up",
    title: "Install a follow-up cadence for qualified leads",
    requiredOwnerAction:
      "Define a fixed follow-up cadence (e.g. call/message at day 0/2/5) and assign an owner so qualified leads are not dropped.",
    verificationMethod: "Re-measure qualifiedConversionPct next period; target above the bar.",
    expectedTimeframeDays: 21,
    effortScore: 35,
    ownerRole: "owner",
  },
  SALES_WEAK_REPEAT: {
    recommendationCode: "SALESREC_IMPROVE_RETENTION",
    category: "improve_retention",
    title: "Lift repeat purchase",
    requiredOwnerAction:
      "Add a repeat-purchase nudge (reminder/loyalty/quality follow-up) for recent customers.",
    verificationMethod: "Re-measure repeatRatePct next period; target above the weak bar.",
    expectedTimeframeDays: 45,
    effortScore: 45,
    ownerRole: "owner",
  },
  SALES_LOST_CUSTOMER_LEAKAGE: {
    recommendationCode: "SALESREC_WINBACK",
    category: "win_back",
    title: "Win back lost customers",
    requiredOwnerAction:
      "Build a list of recently lost customers and run a focused win-back outreach with a reason to return.",
    verificationMethod: "Re-measure lostCustomerRatePct next period; target below threshold.",
    expectedTimeframeDays: 30,
    effortScore: 40,
    ownerRole: "owner",
  },
  SALES_HIGH_COMPLAINT_RATIO: {
    recommendationCode: "SALESREC_REDUCE_COMPLAINTS",
    category: "reduce_complaints",
    title: "Fix the top complaint driver",
    requiredOwnerAction:
      "Identify the single most common complaint and fix its root cause to protect repeat purchase.",
    verificationMethod: "Re-measure complaintToSaleRatioPct next period; target below threshold.",
    expectedTimeframeDays: 30,
    effortScore: 45,
    ownerRole: "owner",
  },
  SALES_DISCOUNT_DEPENDENCE: {
    recommendationCode: "SALESREC_CONTROL_DISCOUNT",
    category: "control_discount",
    title: "Control discounting",
    requiredOwnerAction:
      "Cap discounts and require approval above a threshold; target discounts to where they actually win the sale.",
    verificationMethod: "Re-measure discountDependencePct next period; target below threshold.",
    expectedTimeframeDays: 21,
    effortScore: 30,
    ownerRole: "owner",
  },
  SALES_HIGH_REFUND_RATE: {
    recommendationCode: "SALESREC_REDUCE_REFUNDS",
    category: "reduce_refunds",
    title: "Cut the refund root cause",
    requiredOwnerAction:
      "Find the main refund reason and fix it (expectation-setting, quality, or fulfilment).",
    verificationMethod: "Re-measure refundRatePct next period; target lower.",
    expectedTimeframeDays: 30,
    effortScore: 40,
    ownerRole: "owner",
  },
  SALES_WEAK_B2B_PIPELINE: {
    recommendationCode: "SALESREC_BUILD_B2B_PIPELINE",
    category: "build_b2b_pipeline",
    title: "Build the B2B pipeline",
    requiredOwnerAction:
      "Add qualified B2B prospects and progress the best ones with a defined next step each week.",
    verificationMethod: "Re-measure b2bPipelineCoveragePct next period; target above the weak bar.",
    expectedTimeframeDays: 45,
    effortScore: 50,
    ownerRole: "owner",
  },
  SALES_INVALID_CURRENCY: {
    recommendationCode: "SALESREC_FIX_CURRENCY",
    category: "improve_data_quality",
    title: "Set a valid reporting currency",
    requiredOwnerAction: "Set a valid 3–8 letter currency code on the snapshot.",
    verificationMethod: "Confirm currencyValid is true on the next snapshot.",
    expectedTimeframeDays: 3,
    effortScore: 10,
    ownerRole: "owner",
  },
  SALES_MISSING_CRITICAL_DATA: {
    recommendationCode: "SALESREC_IMPROVE_DATA_QUALITY",
    category: "improve_data_quality",
    title: "Provide missing sales inputs",
    requiredOwnerAction: "Enter the listed missing inputs to raise diagnosis confidence.",
    verificationMethod: "Re-measure dataConfidenceScore next snapshot; target higher.",
    expectedTimeframeDays: 7,
    effortScore: 20,
    ownerRole: "owner",
  },
  SALES_OPP_RAISE_CONVERSION: {
    recommendationCode: "SALESREC_IMPROVE_CONVERSION",
    category: "improve_conversion",
    title: "Lift conversion toward the healthy bar",
    requiredOwnerAction:
      "Apply a tighter qualification + follow-up process to convert more of the existing lead flow.",
    verificationMethod: "Re-measure leadToSaleConversionPct next period; target the healthy bar.",
    expectedTimeframeDays: 30,
    effortScore: 45,
    ownerRole: "owner",
  },
  SALES_OPP_IMPROVE_RETENTION: {
    recommendationCode: "SALESREC_IMPROVE_RETENTION",
    category: "improve_retention",
    title: "Improve repeat purchase",
    requiredOwnerAction: "Run a repeat-purchase nudge for recent customers (reminder/loyalty/quality).",
    verificationMethod: "Re-measure repeatRatePct next period; target the healthy bar.",
    expectedTimeframeDays: 45,
    effortScore: 45,
    ownerRole: "owner",
  },
  SALES_OPP_WINBACK: {
    recommendationCode: "SALESREC_WINBACK",
    category: "win_back",
    title: "Win back lost customers",
    requiredOwnerAction: "Run a focused win-back outreach to recently lost customers.",
    verificationMethod: "Re-measure lostCustomerRatePct next period; target lower.",
    expectedTimeframeDays: 30,
    effortScore: 40,
    ownerRole: "owner",
  },
  SALES_OPP_TIGHTEN_DISCOUNT: {
    recommendationCode: "SALESREC_CONTROL_DISCOUNT",
    category: "control_discount",
    title: "Tighten discounting to protect margin",
    requiredOwnerAction: "Cap/target discounts so margin is recovered without losing most sales.",
    verificationMethod: "Re-measure discountDependencePct next period; target lower.",
    expectedTimeframeDays: 21,
    effortScore: 30,
    ownerRole: "owner",
  },
  SALES_OPP_CONVERT_PIPELINE: {
    recommendationCode: "SALESREC_BUILD_B2B_PIPELINE",
    category: "build_b2b_pipeline",
    title: "Convert the B2B pipeline",
    requiredOwnerAction: "Progress the best B2B accounts with a defined next step to book revenue.",
    verificationMethod: "Re-measure b2bPipelineCoveragePct / booked B2B revenue next period.",
    expectedTimeframeDays: 45,
    effortScore: 45,
    ownerRole: "owner",
  },
  SALES_OPP_DATA_QUALITY: {
    recommendationCode: "SALESREC_IMPROVE_DATA_QUALITY",
    category: "improve_data_quality",
    title: "Improve data completeness",
    requiredOwnerAction: "Supply the missing/stale inputs to sharpen the sales diagnosis.",
    verificationMethod: "Re-measure dataConfidenceScore next snapshot; target higher.",
    expectedTimeframeDays: 7,
    effortScore: 20,
    ownerRole: "owner",
  },
};

/** Build a traceable recommendation from a finding, or null if no template. */
export function buildSalesRecommendation(finding: OwnerFinding): SalesRecommendation | null {
  const tpl = SALES_REC_TEMPLATES[finding.code];
  if (!tpl) return null;
  return {
    recommendationCode: tpl.recommendationCode,
    findingCode: finding.code,
    category: tpl.category,
    sourceMetric: finding.sourceMetric,
    sourceValue: finding.sourceValue ?? null, // never invented
    threshold: finding.threshold ?? null,
    severity: finding.severity,
    expectedSalesImpactScore: clampScore(finding.impactScore),
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
export function buildSalesRecommendations(findings: OwnerFinding[]): SalesRecommendation[] {
  const recs: SalesRecommendation[] = [];
  for (const f of findings) {
    const r = buildSalesRecommendation(f);
    if (r) recs.push(r);
  }
  return recs;
}
