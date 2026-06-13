/**
 * Owner Marketing & Growth (Module 6 Slice 3) — deterministic recommendations.
 *
 * Pure: maps Slice 2 marketing `OwnerFinding`s → traceable
 * `MarketingRecommendation`s. Every recommendation carries its source
 * metric/value/threshold, severity, expected impact, confidence, the required
 * owner action, and how to verify it. A finding with no template produces no
 * recommendation (reported as a missing action input by the planner) — nothing is
 * invented.
 */
import type { OwnerFinding, OwnerSeverity } from "@/domain/owner-spine/contracts";
import { clampScore, clampConfidence } from "@/domain/owner-spine/contracts";

export interface MarketingRecommendation {
  recommendationCode: string;
  findingCode: string;
  category: string;
  sourceMetric: string;
  sourceValue: number | null;
  threshold: number | null;
  severity: OwnerSeverity;
  expectedGrowthImpactScore: number; // 0..100
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

interface MarketingRecTemplate {
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
 * Finding code → recommendation template. Categories cover the marketing action
 * set: stop wasted spend, raise conversion, strengthen offer, rebalance channels,
 * activate referrals, add campaign follow-up, scale the winner, and improve data
 * quality.
 */
export const MARKETING_REC_TEMPLATES: Record<string, MarketingRecTemplate> = {
  MKT_WASTED_SPEND: {
    recommendationCode: "MKTREC_STOP_WASTE",
    category: "stop_waste",
    title: "Stop the loss-making spend",
    requiredOwnerAction:
      "Pause the worst-ROI channel/campaign now and reallocate that budget to the best-performing one (or hold it) until ROI is positive.",
    verificationMethod: "Re-measure campaignRoiPct next period; target above break-even, then above target.",
    expectedTimeframeDays: 14,
    effortScore: 35,
    ownerRole: "owner",
  },
  MKT_POOR_CONVERSION: {
    recommendationCode: "MKTREC_RAISE_CONVERSION",
    category: "raise_conversion",
    title: "Fix the lead-to-order leak",
    requiredOwnerAction:
      "Tighten lead follow-up (speed + a defined script/steps) and qualification before buying more leads, so more existing leads convert.",
    verificationMethod: "Re-measure leadConversionPct next period; target above the low bar.",
    expectedTimeframeDays: 21,
    effortScore: 45,
    ownerRole: "owner",
  },
  MKT_WEAK_OFFER: {
    recommendationCode: "MKTREC_STRENGTHEN_OFFER",
    category: "strengthen_offer",
    title: "Strengthen the offer",
    requiredOwnerAction:
      "Test one stronger offer (clearer value, guarantee, or bundle) on inquiries to lift inquiry→order conversion.",
    verificationMethod: "Re-measure inquiryConversionPct next period; target above threshold.",
    expectedTimeframeDays: 21,
    effortScore: 40,
    ownerRole: "owner",
  },
  MKT_WRONG_CHANNEL_MIX: {
    recommendationCode: "MKTREC_REBALANCE_CHANNELS",
    category: "rebalance_channels",
    title: "Reduce paid dependence",
    requiredOwnerAction:
      "Start one organic/referral channel (content, listing, or referral ask) so leads are not 100% rented from paid.",
    verificationMethod: "Re-measure organicSharePct next period; target above threshold.",
    expectedTimeframeDays: 30,
    effortScore: 45,
    ownerRole: "owner",
  },
  MKT_LOW_REFERRAL: {
    recommendationCode: "MKTREC_ACTIVATE_REFERRALS",
    category: "activate_referrals",
    title: "Activate referrals",
    requiredOwnerAction:
      "Add a simple referral ask + small incentive at the moment of customer happiness (post-delivery / positive review).",
    verificationMethod: "Re-measure referralRatePct next period; target above threshold.",
    expectedTimeframeDays: 21,
    effortScore: 30,
    ownerRole: "owner",
  },
  MKT_NO_FOLLOWUP: {
    recommendationCode: "MKTREC_ADD_FOLLOWUP",
    category: "add_followup",
    title: "Add follow-up to every campaign",
    requiredOwnerAction:
      "Define one standard follow-up step (call/message/offer) that runs after every campaign, so created demand is captured.",
    verificationMethod: "Re-measure campaignFollowupRatePct next period; target above threshold.",
    expectedTimeframeDays: 14,
    effortScore: 30,
    ownerRole: "owner",
  },
  MKT_INVALID_CURRENCY: {
    recommendationCode: "MKTREC_FIX_CURRENCY",
    category: "improve_data_quality",
    title: "Set a valid reporting currency",
    requiredOwnerAction: "Set a valid 3–8 letter currency code on the snapshot.",
    verificationMethod: "Confirm currencyValid is true on the next snapshot.",
    expectedTimeframeDays: 3,
    effortScore: 10,
    ownerRole: "owner",
  },
  MKT_MISSING_CRITICAL_DATA: {
    recommendationCode: "MKTREC_IMPROVE_DATA_QUALITY",
    category: "improve_data_quality",
    title: "Provide missing marketing inputs",
    requiredOwnerAction: "Enter the listed missing inputs (spend, leads, orders) to raise diagnosis confidence.",
    verificationMethod: "Re-measure dataConfidenceScore next snapshot; target higher.",
    expectedTimeframeDays: 7,
    effortScore: 20,
    ownerRole: "owner",
  },
  MKT_OPP_SCALE_WINNER: {
    recommendationCode: "MKTREC_SCALE_WINNER",
    category: "scale_winner",
    title: "Scale the profitable spend",
    requiredOwnerAction:
      "Increase budget on the best-ROI channel in measured steps while ROI stays above target; stop scaling if ROI drops.",
    verificationMethod: "Re-measure campaignRoiPct + orders next period; ROI stays above target.",
    expectedTimeframeDays: 30,
    effortScore: 35,
    ownerRole: "owner",
  },
  MKT_OPP_LIFT_CONVERSION: {
    recommendationCode: "MKTREC_RAISE_CONVERSION",
    category: "raise_conversion",
    title: "Lift conversion on existing leads",
    requiredOwnerAction: "Improve follow-up speed/scripting to convert more of the leads already paid for.",
    verificationMethod: "Re-measure leadConversionPct next period; target higher.",
    expectedTimeframeDays: 21,
    effortScore: 40,
    ownerRole: "owner",
  },
  MKT_OPP_ACTIVATE_REFERRALS: {
    recommendationCode: "MKTREC_ACTIVATE_REFERRALS",
    category: "activate_referrals",
    title: "Grow via referrals",
    requiredOwnerAction: "Add a referral ask + incentive to raise the share of new customers from referrals.",
    verificationMethod: "Re-measure referralRatePct next period; target higher.",
    expectedTimeframeDays: 21,
    effortScore: 30,
    ownerRole: "owner",
  },
  MKT_OPP_BUILD_ORGANIC: {
    recommendationCode: "MKTREC_REBALANCE_CHANNELS",
    category: "rebalance_channels",
    title: "Build an organic channel",
    requiredOwnerAction: "Start a low-cost organic channel to reduce cost-per-lead and de-risk the funnel over time.",
    verificationMethod: "Re-measure organicSharePct next period; target higher.",
    expectedTimeframeDays: 30,
    effortScore: 45,
    ownerRole: "owner",
  },
  MKT_OPP_ADD_FOLLOWUP: {
    recommendationCode: "MKTREC_ADD_FOLLOWUP",
    category: "add_followup",
    title: "Capture demand with follow-up",
    requiredOwnerAction: "Add a standard follow-up step after each campaign to capture demand already paid for.",
    verificationMethod: "Re-measure campaignFollowupRatePct next period; target higher.",
    expectedTimeframeDays: 14,
    effortScore: 30,
    ownerRole: "owner",
  },
  MKT_OPP_DATA_QUALITY: {
    recommendationCode: "MKTREC_IMPROVE_DATA_QUALITY",
    category: "improve_data_quality",
    title: "Improve data completeness",
    requiredOwnerAction: "Supply the missing/stale inputs to sharpen the marketing diagnosis.",
    verificationMethod: "Re-measure dataConfidenceScore next snapshot; target higher.",
    expectedTimeframeDays: 7,
    effortScore: 20,
    ownerRole: "owner",
  },
};

/** Build a traceable recommendation from a finding, or null if no template. */
export function buildMarketingRecommendation(finding: OwnerFinding): MarketingRecommendation | null {
  const tpl = MARKETING_REC_TEMPLATES[finding.code];
  if (!tpl) return null;
  return {
    recommendationCode: tpl.recommendationCode,
    findingCode: finding.code,
    category: tpl.category,
    sourceMetric: finding.sourceMetric,
    sourceValue: finding.sourceValue ?? null, // never invented
    threshold: finding.threshold ?? null,
    severity: finding.severity,
    expectedGrowthImpactScore: clampScore(finding.impactScore),
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
export function buildMarketingRecommendations(findings: OwnerFinding[]): MarketingRecommendation[] {
  const recs: MarketingRecommendation[] = [];
  for (const f of findings) {
    const r = buildMarketingRecommendation(f);
    if (r) recs.push(r);
  }
  return recs;
}
