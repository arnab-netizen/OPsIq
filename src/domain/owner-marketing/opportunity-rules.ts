/**
 * Owner Marketing & Growth (Module 6 Slice 2) — deterministic OPPORTUNITY findings.
 *
 * Pure: maps Slice 1 marketing metrics → `OwnerFinding[]` (findingType
 * "opportunity"). Opportunities are emitted ONLY when supporting inputs exist (a
 * real, computed metric). When the data isn't there, no opportunity is fabricated.
 */
import {
  clampScore,
  clampConfidence,
  type OwnerFinding,
  type OwnerSeverity,
} from "@/domain/owner-spine/contracts";
import type { MarketingSnapshotInput, MarketingDerivedMetrics } from "./types";
import type { MarketingThresholds } from "./thresholds";

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
    domain: "marketing",
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

const pct = (v: number) => `${v}%`;

export function buildMarketingOpportunityFindings(
  input: MarketingSnapshotInput,
  m: MarketingDerivedMetrics,
  t: MarketingThresholds
): OwnerFinding[] {
  const findings: OwnerFinding[] = [];
  const conf = clampConfidence(m.dataConfidenceScore / 100);
  void input;

  // Scale the winning channel (only when ROI is computable and healthy)
  if (m.campaignRoiPct !== null && m.campaignRoiPct >= t.healthyRoiPct) {
    findings.push(
      opportunity({
        code: "MKT_OPP_SCALE_WINNER",
        title: "Scale the profitable spend",
        summary:
          "ROI is strong — there is room to increase budget on what is already working while it stays above target.",
        sourceMetric: "campaignRoiPct",
        sourceValue: m.campaignRoiPct,
        threshold: t.healthyRoiPct,
        severity: "low",
        confidence: conf,
        impactScore: clampScore(Math.min(m.campaignRoiPct / 10, 60)),
        urgencyScore: 35,
        evidence: [`campaignRoiPct = ${pct(m.campaignRoiPct)} ≥ ${pct(t.healthyRoiPct)}`],
        verificationMetric: "campaignRoiPct",
      })
    );
  }

  // Lift conversion (only when conversion is computable and below 100)
  if (m.leadConversionPct !== null && m.leadConversionPct < 100) {
    findings.push(
      opportunity({
        code: "MKT_OPP_LIFT_CONVERSION",
        title: "Lift lead-to-order conversion",
        summary:
          "Existing leads already cost money; converting more of them is cheaper growth than buying new leads.",
        sourceMetric: "leadConversionPct",
        sourceValue: m.leadConversionPct,
        threshold: t.lowLeadConversionPct,
        severity: m.leadConversionPct < t.lowLeadConversionPct ? "medium" : "low",
        confidence: conf,
        // Upside play (capped at 50) — must not outrank a paired critical risk.
        impactScore: clampScore((100 - m.leadConversionPct) / 2),
        urgencyScore: 40,
        evidence: [`leadConversionPct = ${pct(m.leadConversionPct)}`],
        verificationMetric: "leadConversionPct",
      })
    );
  }

  // Activate referrals (only when referral rate is computable and below 100)
  if (m.referralRatePct !== null && m.referralRatePct < 100) {
    findings.push(
      opportunity({
        code: "MKT_OPP_ACTIVATE_REFERRALS",
        title: "Activate referrals for cheap growth",
        summary:
          "Referred customers are the lowest-cost, highest-trust channel; a simple ask + incentive raises the referral rate.",
        sourceMetric: "referralRatePct",
        sourceValue: m.referralRatePct,
        threshold: t.lowReferralRatePct,
        severity: m.referralRatePct < t.lowReferralRatePct ? "medium" : "low",
        confidence: conf,
        impactScore: clampScore((100 - m.referralRatePct) / 2),
        urgencyScore: 35,
        evidence: [`referralRatePct = ${pct(m.referralRatePct)}`],
        verificationMetric: "referralRatePct",
      })
    );
  }

  // Build organic channel (only when organic share is below the strain bar)
  if (m.organicSharePct !== null && m.organicSharePct < t.lowOrganicSharePct) {
    findings.push(
      opportunity({
        code: "MKT_OPP_BUILD_ORGANIC",
        title: "Build an organic channel to reduce paid dependence",
        summary:
          "Growth is mostly rented from paid; building organic/content reduces cost-per-lead over time and de-risks the funnel.",
        sourceMetric: "organicSharePct",
        sourceValue: m.organicSharePct,
        threshold: t.lowOrganicSharePct,
        severity: "low",
        confidence: conf,
        impactScore: clampScore(t.lowOrganicSharePct - m.organicSharePct),
        urgencyScore: 25,
        evidence: [`organicSharePct = ${pct(m.organicSharePct)} < ${pct(t.lowOrganicSharePct)}`],
        verificationMetric: "organicSharePct",
      })
    );
  }

  // Add campaign follow-up (only when follow-up is below 100)
  if (m.campaignFollowupRatePct !== null && m.campaignFollowupRatePct < 100) {
    findings.push(
      opportunity({
        code: "MKT_OPP_ADD_FOLLOWUP",
        title: "Capture demand with campaign follow-up",
        summary:
          "Campaigns already create interest; adding a follow-up step converts demand that is otherwise paid for and lost.",
        sourceMetric: "campaignFollowupRatePct",
        sourceValue: m.campaignFollowupRatePct,
        threshold: t.lowCampaignFollowupRatePct,
        severity: m.campaignFollowupRatePct < t.lowCampaignFollowupRatePct ? "medium" : "low",
        confidence: conf,
        impactScore: clampScore((100 - m.campaignFollowupRatePct) / 2),
        urgencyScore: 35,
        evidence: [`campaignFollowupRatePct = ${pct(m.campaignFollowupRatePct)}`],
        verificationMetric: "campaignFollowupRatePct",
      })
    );
  }

  // Data quality improvement opportunity (confidence below 100)
  if (m.dataConfidenceScore < 100) {
    findings.push(
      opportunity({
        code: "MKT_OPP_DATA_QUALITY",
        title: "Improve data completeness for a sharper marketing diagnosis",
        summary:
          "Some inputs are missing or stale; supplying them increases the confidence of every marketing recommendation.",
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
