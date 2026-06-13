/**
 * Owner Marketing & Growth Intelligence (Module 6) — deterministic marketing
 * calculation engine.
 *
 * Pure functions only (no DB/I/O/LLM). Ratio/per-unit metrics return `null` when
 * not computable from the provided inputs; nothing is invented. Composite scores
 * are bounded 0..100. Marketing is the GROWTH lens (spend efficiency, channel mix,
 * conversion, referral, campaign discipline), distinct from survival/execution.
 */
import { clampScore } from "@/domain/owner-spine/contracts";
import type {
  MarketingSnapshotInput,
  MarketingDerivedMetrics,
  MarketingState,
  MarketingTier,
} from "./types";
import { resolveMarketingThresholds, type MarketingThresholds } from "./thresholds";
import { calculateDataConfidence, isValidCurrency } from "./data-confidence";

// --- safe numeric helpers ----------------------------------------------------

/** Present finite number, else null (fail closed on NaN/Infinity/missing). */
export function num(x: number | undefined | null): number | null {
  if (x === undefined || x === null || !Number.isFinite(x)) return null;
  return x;
}

function round1(x: number): number {
  return Math.round(x * 10) / 10;
}

// --- spend efficiency --------------------------------------------------------

export function costPerLead(input: MarketingSnapshotInput): number | null {
  const spend = num(input.marketingSpend);
  const leads = num(input.leads);
  if (spend === null || leads === null || leads <= 0) return null;
  return round1(spend / leads);
}

export function costPerOrder(input: MarketingSnapshotInput): number | null {
  const spend = num(input.marketingSpend);
  const orders = num(input.orders);
  if (spend === null || orders === null || orders <= 0) return null;
  return round1(spend / orders);
}

export function campaignRoiPct(input: MarketingSnapshotInput): number | null {
  const spend = num(input.marketingSpend);
  const revenue = num(input.revenue);
  if (spend === null || revenue === null || spend <= 0) return null;
  return round1(((revenue - spend) / spend) * 100); // can be negative
}

// --- conversion --------------------------------------------------------------

export function leadConversionPct(input: MarketingSnapshotInput): number | null {
  const leads = num(input.leads);
  const orders = num(input.orders);
  if (leads === null || orders === null || leads <= 0) return null;
  return clampScore(round1((orders / leads) * 100));
}

export function inquiryConversionPct(input: MarketingSnapshotInput): number | null {
  const inquiries = num(input.inquiries);
  const orders = num(input.orders);
  if (inquiries === null || orders === null || inquiries <= 0) return null;
  return clampScore(round1((orders / inquiries) * 100));
}

// --- advocacy + channel mix + discipline -------------------------------------

export function referralRatePct(input: MarketingSnapshotInput): number | null {
  const referrals = num(input.referrals);
  const newCustomers = num(input.newCustomers);
  if (referrals === null || newCustomers === null || newCustomers <= 0) return null;
  return clampScore(round1((referrals / newCustomers) * 100));
}

export function organicSharePct(input: MarketingSnapshotInput): number | null {
  const paid = num(input.paidLeads);
  const organic = num(input.organicLeads);
  if (paid === null || organic === null) return null;
  const total = paid + organic;
  if (total <= 0) return null;
  return clampScore(round1((organic / total) * 100));
}

export function campaignFollowupRatePct(input: MarketingSnapshotInput): number | null {
  const run = num(input.campaignsRun);
  const followed = num(input.campaignsWithFollowup);
  if (run === null || followed === null || run <= 0) return null;
  return clampScore(round1((followed / run) * 100));
}

// --- risk signals ------------------------------------------------------------

interface MarketingRiskSignals {
  lowRoi: boolean;
  criticalRoi: boolean;
  lowLeadConversion: boolean;
  criticalLeadConversion: boolean;
  lowInquiryConversion: boolean;
  lowReferral: boolean;
  lowFollowup: boolean;
  criticalFollowup: boolean;
  paidReliant: boolean;
}

function deriveRiskSignals(
  input: MarketingSnapshotInput,
  t: MarketingThresholds
): MarketingRiskSignals {
  const roi = campaignRoiPct(input);
  const leadConv = leadConversionPct(input);
  const inqConv = inquiryConversionPct(input);
  const referral = referralRatePct(input);
  const followup = campaignFollowupRatePct(input);
  const organic = organicSharePct(input);
  return {
    lowRoi: roi !== null && roi < t.lowRoiPct,
    criticalRoi: roi !== null && roi < t.criticalRoiPct,
    lowLeadConversion: leadConv !== null && leadConv < t.lowLeadConversionPct,
    criticalLeadConversion: leadConv !== null && leadConv < t.criticalLeadConversionPct,
    lowInquiryConversion: inqConv !== null && inqConv < t.lowInquiryConversionPct,
    lowReferral: referral !== null && referral < t.lowReferralRatePct,
    lowFollowup: followup !== null && followup < t.lowCampaignFollowupRatePct,
    criticalFollowup: followup !== null && followup < t.criticalCampaignFollowupRatePct,
    paidReliant: organic !== null && organic < t.lowOrganicSharePct,
  };
}

// --- composite scores --------------------------------------------------------

export function marketingRiskScore(input: MarketingSnapshotInput, t: MarketingThresholds): number {
  const s = deriveRiskSignals(input, t);
  let score = 0;
  if (s.criticalRoi) score += 25;
  else if (s.lowRoi) score += 12;
  if (s.criticalLeadConversion) score += 18;
  else if (s.lowLeadConversion) score += 9;
  if (s.criticalFollowup) score += 15;
  else if (s.lowFollowup) score += 8;
  if (s.lowInquiryConversion) score += 8;
  if (s.lowReferral) score += 8;
  if (s.paidReliant) score += 8;
  return clampScore(score);
}

export function marketingHealthScore(
  input: MarketingSnapshotInput,
  t: MarketingThresholds
): number {
  const risk = marketingRiskScore(input, t);
  const leadConv = leadConversionPct(input);
  // Conversion health maps the lead→order rate directly onto 0..100 throughput.
  let throughput = 50;
  if (leadConv !== null) throughput = clampScore(leadConv);
  return clampScore(Math.round(0.6 * (100 - risk) + 0.4 * throughput));
}

export function marketingOpportunityScore(
  input: MarketingSnapshotInput,
  t: MarketingThresholds
): number {
  let score = 0;
  const leadConv = leadConversionPct(input);
  if (leadConv !== null && leadConv < 100) score += Math.min((100 - leadConv) / 4, 25); // conversion headroom
  const referral = referralRatePct(input);
  if (referral !== null && referral < 100) score += Math.min((100 - referral) / 4, 20); // referral upside
  const followup = campaignFollowupRatePct(input);
  if (followup !== null && followup < 100) score += Math.min((100 - followup) / 5, 15); // follow-up upside
  const organic = organicSharePct(input);
  if (organic !== null && organic < t.lowOrganicSharePct) {
    score += Math.min((t.lowOrganicSharePct - organic) / 2, 15); // organic-growth upside
  }
  const inqConv = inquiryConversionPct(input);
  if (inqConv !== null && inqConv < 100) score += Math.min((100 - inqConv) / 8, 10); // offer/closing upside
  return clampScore(score);
}

// --- marketing state ---------------------------------------------------------

export function marketingState(
  input: MarketingSnapshotInput,
  t: MarketingThresholds,
  dataConfidenceScore: number
): MarketingState {
  const s = deriveRiskSignals(input, t);

  if (s.criticalRoi && (s.criticalLeadConversion || s.criticalFollowup)) return "WASTING";
  if (s.criticalRoi || s.criticalLeadConversion || s.criticalFollowup) return "LEAKING";
  // Not enough trustworthy data to assert compounding growth → caution.
  if (dataConfidenceScore < 50) return "FLAT";
  if (
    s.lowRoi ||
    s.lowLeadConversion ||
    s.lowInquiryConversion ||
    s.lowReferral ||
    s.lowFollowup ||
    s.paidReliant
  ) {
    return "FLAT";
  }
  const roi = campaignRoiPct(input);
  return roi === null || roi >= t.healthyRoiPct ? "COMPOUNDING" : "GROWING";
}

export function marketingTier(state: MarketingState): MarketingTier {
  switch (state) {
    case "WASTING":
      return "rescue";
    case "LEAKING":
      return "recovery";
    case "FLAT":
    case "GROWING":
      return "growth";
    case "COMPOUNDING":
      return "optimization";
  }
}

// --- orchestrator ------------------------------------------------------------

/**
 * Compute the full deterministic marketing metric set for one snapshot. Does not
 * mutate `input`. Missing/invalid inputs yield `null` metrics + a missing-input
 * list; composite scores stay 0..100 with confidence reflecting completeness.
 */
export function computeMarketingMetrics(
  input: MarketingSnapshotInput,
  opts: { now?: Date } = {}
): MarketingDerivedMetrics {
  const t = resolveMarketingThresholds(input.industryTemplate);
  const confidence = calculateDataConfidence(input, {
    now: opts.now,
    staleDays: t.staleSnapshotDays,
  });
  const state = marketingState(input, t, confidence.dataConfidenceScore);

  return {
    currency: input.currency,
    currencyValid: isValidCurrency(input.currency),

    costPerLead: costPerLead(input),
    costPerOrder: costPerOrder(input),
    campaignRoiPct: campaignRoiPct(input),
    leadConversionPct: leadConversionPct(input),
    inquiryConversionPct: inquiryConversionPct(input),
    referralRatePct: referralRatePct(input),
    organicSharePct: organicSharePct(input),
    campaignFollowupRatePct: campaignFollowupRatePct(input),

    marketingHealthScore: marketingHealthScore(input, t),
    marketingRiskScore: marketingRiskScore(input, t),
    marketingOpportunityScore: marketingOpportunityScore(input, t),
    dataConfidenceScore: confidence.dataConfidenceScore,

    marketingState: state,
    marketingTier: marketingTier(state),

    missingRequiredInputs: confidence.missingCritical,
  };
}
