/**
 * R20 — Owner decision queue + daily briefing + trend escalation + weekly review
 * (§72, §75, §76, §77). Pure.
 *
 * The owner manages by exception: a capped, evidence-ranked decision queue, a daily briefing
 * that answers the operating questions and shows missing data, trend-deterioration alerts
 * (slow decline, not just critical events), and a weekly review with no vanity metrics and
 * no unverified-success claims.
 */

import type { OwnerDecisionSeverity } from "@/domain/remote-operations/owner-decisions";
import { ownerDigest, OWNER_DIGEST_MAX } from "@/domain/remote-operations/owner-decisions";

export interface OwnerDecisionItem {
  decisionType: string;
  locationId: string;
  severity: OwnerDecisionSeverity;
  deadlineMs: number;
  context: string;
  evidence: string[];
  missingData: string[];
  recommendedOption: string;
  alternatives: string[];
  risk: string;
  whatIfNoDecision: string;
  safeFallback?: string;
  proofRequiredAfter: string;
  verificationPlan: string;
  ownerModeConflicts: string[];
}

function blank(s: string | undefined | null): boolean { return typeof s !== "string" || s.trim().length === 0; }

/** Every owner decision item must carry the §72 governed fields. */
export function validateOwnerDecisionItem(i: OwnerDecisionItem): string[] {
  const v: string[] = [];
  if (blank(i.decisionType)) v.push("missing_decision_type");
  if (blank(i.recommendedOption)) v.push("missing_recommended_option");
  if (blank(i.whatIfNoDecision)) v.push("missing_what_if_no_decision");
  if (blank(i.proofRequiredAfter)) v.push("missing_proof_required_after");
  if (blank(i.verificationPlan)) v.push("missing_verification_plan");
  return v;
}

const SEV_RANK: Record<OwnerDecisionSeverity, number> = { EMERGENCY: 4, CRITICAL: 3, HIGH: 2, MEDIUM: 1, LOW: 0 };

export interface TrendMetric {
  name: string;
  direction: "rising" | "falling" | "flat";
  /** Whether the current direction is bad for the business. */
  worsening: boolean;
}

export function detectTrendDeterioration(metrics: readonly TrendMetric[]): TrendMetric[] {
  return metrics.filter((m) => m.worsening && m.direction !== "flat");
}

export interface DailyBriefing {
  decisions: OwnerDecisionItem[];
  overflow: number;
  criticalNow: OwnerDecisionItem[];
  greyNoDataLocations: string[];
  worseningTrends: TrendMetric[];
  activeOwnerModeVetoes: string[];
}

/**
 * Build the owner daily briefing: decision-grade items ranked by severity then deadline,
 * capped to the mobile digest size; critical items surfaced; GREY/no-data locations and
 * worsening trends shown (unknown risk is not hidden).
 */
export function buildDailyBriefing(
  items: readonly OwnerDecisionItem[],
  trends: readonly TrendMetric[],
  greyNoDataLocations: readonly string[],
  activeOwnerModeVetoes: readonly string[],
  max: number = OWNER_DIGEST_MAX,
): DailyBriefing {
  const ranked = [...items].sort((a, b) => (SEV_RANK[b.severity] - SEV_RANK[a.severity]) || (a.deadlineMs - b.deadlineMs));
  const { shown, overflow } = ownerDigest(ranked, max);
  return {
    decisions: shown,
    overflow,
    criticalNow: ranked.filter((i) => i.severity === "EMERGENCY" || i.severity === "CRITICAL"),
    greyNoDataLocations: [...greyNoDataLocations],
    worseningTrends: detectTrendDeterioration(trends),
    activeOwnerModeVetoes: [...activeOwnerModeVetoes],
  };
}

/** §77 weekly review must reject vanity metrics and unverified-success claims. */
const VANITY_METRICS = ["likes", "impressions", "followers", "page views", "raw revenue without margin"];
export function weeklyReviewRejectsVanity(metricName: string): boolean {
  return VANITY_METRICS.some((v) => metricName.toLowerCase().includes(v));
}
export function weeklyReviewAllowsSuccessClaim(outcomeVerified: boolean, disputed: boolean): boolean {
  return outcomeVerified && !disputed;
}
