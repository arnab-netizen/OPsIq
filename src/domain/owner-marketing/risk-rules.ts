/**
 * Owner Marketing & Growth (Module 6 Slice 2) — deterministic RISK findings.
 *
 * Pure: maps Slice 1 marketing metrics → `OwnerFinding[]` (findingType "risk")
 * using the Owner Intelligence Spine contract. A rule emits ONLY when its metric
 * is computable and crosses its threshold (or, for data findings, when data is
 * missing/invalid). Nothing is invented: `sourceValue` is set only from a real
 * metric; missing inputs surface as `missingData` + a missing-data finding.
 */
import {
  clampScore,
  clampConfidence,
  type OwnerFinding,
  type OwnerSeverity,
} from "@/domain/owner-spine/contracts";
import type { MarketingSnapshotInput, MarketingDerivedMetrics } from "./types";
import type { MarketingThresholds } from "./thresholds";
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
    urgencyScore: clampScore(args.urgencyScore ?? SEVERITY_URGENCY[args.severity]),
    findingType: "risk",
    evidence: args.evidence,
    missingData: args.missingData ?? [],
    verificationMetric: args.verificationMetric,
  };
}

const pct = (v: number) => `${v}%`;

/**
 * Build all triggered marketing risk findings for one snapshot. Metric-derived
 * findings carry the data-confidence as their confidence; data/currency findings
 * are themselves certain.
 */
export function buildMarketingRiskFindings(
  input: MarketingSnapshotInput,
  m: MarketingDerivedMetrics,
  t: MarketingThresholds
): OwnerFinding[] {
  const findings: OwnerFinding[] = [];
  const conf = clampConfidence(m.dataConfidenceScore / 100);

  // Invalid currency (certain)
  if (!isValidCurrency(input.currency)) {
    findings.push(
      risk({
        code: "MKT_INVALID_CURRENCY",
        title: "Reporting currency is invalid",
        summary:
          "The snapshot currency is missing or not a valid 3–8 letter code; fix it so spend/ROI context is trustworthy.",
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
        code: "MKT_MISSING_CRITICAL_DATA",
        title: "Critical marketing inputs are missing",
        summary:
          "Key inputs needed for a trustworthy marketing diagnosis are missing; provide them to raise confidence.",
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

  // Wasted spend (ROI bands)
  if (m.campaignRoiPct !== null) {
    if (m.campaignRoiPct < t.criticalRoiPct) {
      findings.push(
        risk({
          code: "MKT_WASTED_SPEND",
          title: "Marketing spend is losing money",
          summary:
            "Campaign ROI is negative — spend is returning less than it costs. Pause the worst channel and reallocate before more cash is burned.",
          sourceMetric: "campaignRoiPct",
          sourceValue: m.campaignRoiPct,
          threshold: t.criticalRoiPct,
          severity: "critical",
          confidence: conf,
          impactScore: 85,
          evidence: [`campaignRoiPct = ${pct(m.campaignRoiPct)} < ${pct(t.criticalRoiPct)}`],
          verificationMetric: "campaignRoiPct",
        })
      );
    } else if (m.campaignRoiPct < t.lowRoiPct) {
      findings.push(
        risk({
          code: "MKT_WASTED_SPEND",
          title: "Marketing ROI is below target",
          summary:
            "Spend is returning little; tighten targeting/offer or shift budget to the best-performing channel.",
          sourceMetric: "campaignRoiPct",
          sourceValue: m.campaignRoiPct,
          threshold: t.lowRoiPct,
          severity: "high",
          confidence: conf,
          impactScore: 55,
          evidence: [`campaignRoiPct = ${pct(m.campaignRoiPct)} < ${pct(t.lowRoiPct)}`],
          verificationMetric: "campaignRoiPct",
        })
      );
    }
  }

  // Poor conversion (lead → order bands)
  if (m.leadConversionPct !== null) {
    if (m.leadConversionPct < t.criticalLeadConversionPct) {
      findings.push(
        risk({
          code: "MKT_POOR_CONVERSION",
          title: "Leads are barely converting to orders",
          summary:
            "Almost no leads become customers — the leak is in qualification or follow-up, not traffic. Fix the close before spending more on leads.",
          sourceMetric: "leadConversionPct",
          sourceValue: m.leadConversionPct,
          threshold: t.criticalLeadConversionPct,
          severity: "critical",
          confidence: conf,
          impactScore: 80,
          evidence: [`leadConversionPct = ${pct(m.leadConversionPct)} < ${pct(t.criticalLeadConversionPct)}`],
          verificationMetric: "leadConversionPct",
        })
      );
    } else if (m.leadConversionPct < t.lowLeadConversionPct) {
      findings.push(
        risk({
          code: "MKT_POOR_CONVERSION",
          title: "Lead-to-order conversion is below target",
          summary:
            "Too few leads convert; improve follow-up speed and qualification to lift conversion without more spend.",
          sourceMetric: "leadConversionPct",
          sourceValue: m.leadConversionPct,
          threshold: t.lowLeadConversionPct,
          severity: "high",
          confidence: conf,
          impactScore: 55,
          evidence: [`leadConversionPct = ${pct(m.leadConversionPct)} < ${pct(t.lowLeadConversionPct)}`],
          verificationMetric: "leadConversionPct",
        })
      );
    }
  }

  // Weak offer (inquiry → order conversion)
  if (m.inquiryConversionPct !== null && m.inquiryConversionPct < t.lowInquiryConversionPct) {
    findings.push(
      risk({
        code: "MKT_WEAK_OFFER",
        title: "Inquiries are not turning into orders",
        summary:
          "People ask but do not buy — the offer or pricing is not compelling. Test a stronger offer or clearer guarantee.",
        sourceMetric: "inquiryConversionPct",
        sourceValue: m.inquiryConversionPct,
        threshold: t.lowInquiryConversionPct,
        severity: "medium",
        confidence: conf,
        impactScore: 45,
        evidence: [`inquiryConversionPct = ${pct(m.inquiryConversionPct)} < ${pct(t.lowInquiryConversionPct)}`],
        verificationMetric: "inquiryConversionPct",
      })
    );
  }

  // Wrong channel mix (over-reliant on paid)
  if (m.organicSharePct !== null && m.organicSharePct < t.lowOrganicSharePct) {
    findings.push(
      risk({
        code: "MKT_WRONG_CHANNEL_MIX",
        title: "Growth is over-dependent on paid leads",
        summary:
          "Most leads are paid; when budget stops, leads stop. Build an organic/referral channel so growth is not rented.",
        sourceMetric: "organicSharePct",
        sourceValue: m.organicSharePct,
        threshold: t.lowOrganicSharePct,
        severity: "medium",
        confidence: conf,
        impactScore: 45,
        evidence: [`organicSharePct = ${pct(m.organicSharePct)} < ${pct(t.lowOrganicSharePct)}`],
        verificationMetric: "organicSharePct",
      })
    );
  }

  // Low referral activity
  if (m.referralRatePct !== null && m.referralRatePct < t.lowReferralRatePct) {
    findings.push(
      risk({
        code: "MKT_LOW_REFERRAL",
        title: "Referral activity is low",
        summary:
          "Few new customers come from referrals — the cheapest growth is being left on the table. Add a simple ask/incentive at the happy moment.",
        sourceMetric: "referralRatePct",
        sourceValue: m.referralRatePct,
        threshold: t.lowReferralRatePct,
        severity: "medium",
        confidence: conf,
        impactScore: 40,
        evidence: [`referralRatePct = ${pct(m.referralRatePct)} < ${pct(t.lowReferralRatePct)}`],
        verificationMetric: "referralRatePct",
      })
    );
  }

  // Campaign without follow-up (bands)
  if (m.campaignFollowupRatePct !== null) {
    if (m.campaignFollowupRatePct < t.criticalCampaignFollowupRatePct) {
      findings.push(
        risk({
          code: "MKT_NO_FOLLOWUP",
          title: "Most campaigns have no follow-up",
          summary:
            "Campaigns generate interest that is never followed up — the spend creates demand the business does not capture. Add a follow-up step to every campaign.",
          sourceMetric: "campaignFollowupRatePct",
          sourceValue: m.campaignFollowupRatePct,
          threshold: t.criticalCampaignFollowupRatePct,
          severity: "high",
          confidence: conf,
          impactScore: 60,
          evidence: [`campaignFollowupRatePct = ${pct(m.campaignFollowupRatePct)} < ${pct(t.criticalCampaignFollowupRatePct)}`],
          verificationMetric: "campaignFollowupRatePct",
        })
      );
    } else if (m.campaignFollowupRatePct < t.lowCampaignFollowupRatePct) {
      findings.push(
        risk({
          code: "MKT_NO_FOLLOWUP",
          title: "Campaign follow-up is below target",
          summary: "Some campaigns lack follow-up; add a standard follow-up to capture the demand already paid for.",
          sourceMetric: "campaignFollowupRatePct",
          sourceValue: m.campaignFollowupRatePct,
          threshold: t.lowCampaignFollowupRatePct,
          severity: "medium",
          confidence: conf,
          impactScore: 40,
          evidence: [`campaignFollowupRatePct = ${pct(m.campaignFollowupRatePct)} < ${pct(t.lowCampaignFollowupRatePct)}`],
          verificationMetric: "campaignFollowupRatePct",
        })
      );
    }
  }

  return findings;
}
