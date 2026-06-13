/**
 * Owner Marketing & Growth Intelligence (Module 6) — deterministic thresholds.
 *
 * Generic defaults that work for any owner-operated business, with optional
 * per-industry-TEMPLATE overrides. Templates are generic business CATEGORIES
 * (e.g. "laundry_local_service"), never a specific named business. Unknown
 * templates fall back to the generic defaults.
 */

export interface MarketingThresholds {
  // Campaign ROI (% return on marketing spend)
  healthyRoiPct: number;
  lowRoiPct: number;
  criticalRoiPct: number;
  // Lead → order conversion (%)
  lowLeadConversionPct: number;
  criticalLeadConversionPct: number;
  // Inquiry → order conversion (% — offer/closing strength proxy)
  lowInquiryConversionPct: number;
  // Referral rate (% of new customers from referrals)
  lowReferralRatePct: number;
  // Campaign follow-up (% of campaigns with a follow-up)
  lowCampaignFollowupRatePct: number;
  criticalCampaignFollowupRatePct: number;
  // Organic share (% of leads that are organic — too paid-reliant below this)
  lowOrganicSharePct: number;
  // Data freshness
  staleSnapshotDays: number;
}

export const GENERIC_MARKETING_THRESHOLDS: MarketingThresholds = {
  healthyRoiPct: 200,
  lowRoiPct: 50,
  criticalRoiPct: 0,
  lowLeadConversionPct: 10,
  criticalLeadConversionPct: 3,
  lowInquiryConversionPct: 20,
  lowReferralRatePct: 10,
  lowCampaignFollowupRatePct: 70,
  criticalCampaignFollowupRatePct: 40,
  lowOrganicSharePct: 30,
  staleSnapshotDays: 45,
};

/**
 * Per-industry-template overrides (generic categories). Local same-day service
 * businesses (e.g. laundry) grow heavily on referrals + repeat walk-ins, so the
 * referral bar is higher and a stronger ROI is expected from local spend.
 */
export const INDUSTRY_MARKETING_THRESHOLDS: Record<string, Partial<MarketingThresholds>> = {
  laundry_local_service: {
    lowReferralRatePct: 15,
    healthyRoiPct: 250,
  },
  generic_local_service: {
    lowReferralRatePct: 12,
  },
  retail_service_hybrid: {
    lowLeadConversionPct: 8,
  },
};

/** Resolve thresholds for an industry template, falling back to generic defaults. */
export function resolveMarketingThresholds(industryTemplate?: string): MarketingThresholds {
  const overrides = industryTemplate ? INDUSTRY_MARKETING_THRESHOLDS[industryTemplate] : undefined;
  return { ...GENERIC_MARKETING_THRESHOLDS, ...(overrides ?? {}) };
}
