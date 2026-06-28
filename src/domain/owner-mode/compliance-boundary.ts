/**
 * Jarvis 360 Slice 14 — compliance / professional-review boundary (pure).
 *
 * Audit finding: compliance routing was aspirational with no boundary behind it.
 * This classifies a decision/topic into informational / caution / professional
 * review required / blocked-until-review WITHOUT giving definitive legal or tax
 * advice — every output carries a not-a-professional disclaimer. No DB/I-O.
 */

export type ComplianceClassification = "informational" | "caution" | "professional_review_required" | "blocked_until_review";

export const COMPLIANCE_DISCLAIMER =
  "OpsIQ is not a lawyer or accountant; this is a risk flag, not definitive legal/tax advice. Confirm with a qualified professional.";

export interface ComplianceTopicSignals {
  /** A licence/permit/document with a passed expiry. */
  expiryPassed?: boolean;
  /** A licence/permit/document expiring soon (within the warning window). */
  expiringSoon?: boolean;
  contractOrLegalRisk?: boolean;
  taxImpact?: boolean;
  staffSensitive?: boolean; // hiring/firing/warnings
  advertisingClaim?: boolean;
  dataPrivacy?: boolean;
}

export interface ComplianceBoundaryResult {
  classification: ComplianceClassification;
  professionalReviewRequired: boolean;
  blocked: boolean;
  reasons: string[];
  disclaimer: string;
}

const ORDER: Record<ComplianceClassification, number> = {
  informational: 0,
  caution: 1,
  professional_review_required: 2,
  blocked_until_review: 3,
};

/** Classify compliance risk into a boundary. Never asserts definitive advice. */
export function classifyComplianceRisk(s: ComplianceTopicSignals): ComplianceBoundaryResult {
  const reasons: string[] = [];
  let classification: ComplianceClassification = "informational";
  const raise = (c: ComplianceClassification, reason: string) => {
    reasons.push(reason);
    if (ORDER[c] > ORDER[classification]) classification = c;
  };

  if (s.expiryPassed) raise("blocked_until_review", "A licence/permit/document has expired.");
  if (s.contractOrLegalRisk) raise("professional_review_required", "Contract/legal exposure — professional review needed.");
  if (s.taxImpact) raise("professional_review_required", "Tax-sensitive decision — confirm with an accountant.");
  if (s.staffSensitive) raise("professional_review_required", "Staff-sensitive decision (hiring/firing/warning) — review labour obligations.");
  if (s.expiringSoon) raise("caution", "A licence/permit/document is expiring soon.");
  if (s.advertisingClaim) raise("caution", "Advertising-claim risk — verify substantiation.");
  if (s.dataPrivacy) raise("caution", "Customer-data/privacy risk — check handling.");

  if (reasons.length === 0) reasons.push("No compliance flags detected.");

  return {
    classification,
    professionalReviewRequired: ORDER[classification] >= ORDER.professional_review_required,
    blocked: classification === "blocked_until_review",
    reasons,
    disclaimer: COMPLIANCE_DISCLAIMER,
  };
}

/** A compliance item is expiring soon when its expiry is within `windowDays` of now. */
export function isExpiringSoon(expiresAt: Date | null, now: Date, windowDays = 30): boolean {
  if (!expiresAt) return false;
  const ms = expiresAt.getTime() - now.getTime();
  return ms > 0 && ms <= windowDays * 24 * 60 * 60 * 1000;
}

export function isExpired(expiresAt: Date | null, now: Date): boolean {
  return !!expiresAt && expiresAt.getTime() <= now.getTime();
}
