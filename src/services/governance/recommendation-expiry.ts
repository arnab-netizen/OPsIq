/**
 * PHASE G-9: RECOMMENDATION EXPIRY + REVALIDATION
 *
 * Track and enforce expiry of stale recommendations.
 * Expired recommendations cannot remain as DO_NOW priority.
 */

export interface ExpiryAssessment {
  recommendation_id: string;
  days_since_active: number;
  is_stale: boolean;
  is_expired: boolean;
  confidence_adjustment: number;
  requires_revalidation: boolean;
  revalidation_deadline: Date | null;
  force_downgrade_priority: boolean;
  blocking: boolean;
}

/**
 * Assess recommendation expiry status
 */
export function assessExpiry(
  recommendation_id: string,
  activated_date: Date,
  last_evidence_date: Date,
  current_date: Date = new Date()
): ExpiryAssessment {
  const days_since_active = Math.ceil(
    (current_date.getTime() - activated_date.getTime()) / (1000 * 60 * 60 * 24)
  );

  const days_since_evidence = Math.ceil(
    (current_date.getTime() - last_evidence_date.getTime()) / (1000 * 60 * 60 * 24)
  );

  let is_stale = false;
  let is_expired = false;
  let confidence_adjustment = 0;
  let requires_revalidation = false;
  let revalidation_deadline: Date | null = null;
  let force_downgrade_priority = false;
  let blocking = false;

  // Check staleness (90+ days active)
  if (days_since_active >= 90) {
    is_stale = true;
    confidence_adjustment -= 30;
    requires_revalidation = true;
    revalidation_deadline = new Date(current_date.getTime() + 7 * 24 * 60 * 60 * 1000);
    force_downgrade_priority = true;
  }

  // Check expiry (180+ days active or 120+ days without evidence)
  if (days_since_active >= 180 || days_since_evidence >= 120) {
    is_expired = true;
    confidence_adjustment -= 60;
    requires_revalidation = true;
    revalidation_deadline = new Date(current_date.getTime() + 3 * 24 * 60 * 60 * 1000);
    force_downgrade_priority = true;
    blocking = true;
  }

  return {
    recommendation_id,
    days_since_active,
    is_stale,
    is_expired,
    confidence_adjustment,
    requires_revalidation,
    revalidation_deadline,
    force_downgrade_priority,
    blocking,
  };
}

/**
 * Check if recommendation is still valid for DO_NOW priority
 */
export function canRemainDoNow(assessment: ExpiryAssessment): boolean {
  return !assessment.is_stale && !assessment.is_expired && !assessment.force_downgrade_priority;
}

/**
 * Get expiry summary
 */
export function getExpirySummary(assessment: ExpiryAssessment): string {
  if (assessment.is_expired) {
    return `Recommendation expired (${assessment.days_since_active} days active) - must be revalidated immediately`;
  } else if (assessment.is_stale) {
    return `Recommendation stale (${assessment.days_since_active} days active) - requires revalidation soon`;
  } else if (assessment.requires_revalidation) {
    return `Recommendation requires periodic revalidation - ${assessment.days_since_active} days active`;
  } else {
    return `Recommendation fresh - ${assessment.days_since_active} days active`;
  }
}
