/**
 * Business Context Intelligence Layer foundation (Slice 21, pure logic).
 *
 * OpsIQ must not claim a regulatory/legal/tax rule applies without a jurisdiction
 * AND adequate source provenance. Social/anecdotal sources can inform market
 * hypotheses but can never establish a regulation. New external context becomes a
 * KnowledgeUpdateCandidate (PENDING_REVIEW) first — never auto-promoted into
 * recommendations. Regulatory outputs always carry a human/expert review warning.
 */

export enum SourceTrustTier {
  TIER_1_OFFICIAL_GOVERNMENT_REGULATOR = 1,
  TIER_2_INDUSTRY_BODY_OR_OFFICIAL_PLATFORM = 2,
  TIER_3_ESTABLISHED_NEWS_OR_MARKET_REPORT = 3,
  TIER_4_COMPETITOR_PUBLIC_WEB = 4,
  TIER_5_SOCIAL_MEDIA_ANECDOTAL = 5,
}

export enum SourceFreshnessStatus {
  FRESH = "FRESH",
  AGING = "AGING",
  STALE = "STALE",
  UNKNOWN = "UNKNOWN",
}

export interface BusinessOperatingContext {
  country: string;
  stateOrProvince: string | null;
  cityOrLocalArea: string | null;
  businessArchetype: string;
  businessSize: string | null;
  businessModel: string | null;
  b2cB2bMix: string | null;
  staffCount: number | null;
  legalEntityType?: string | null;
  taxRegistrationStatus?: string | null;
  physicalPremises: boolean;
  deliveryOrServiceArea: string | null;
  regulatedActivities: boolean;
}

export class BusinessContextError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BusinessContextError";
  }
}

/** Create a business operating context; country + archetype are mandatory. */
export function createBusinessOperatingContext(
  input: Partial<BusinessOperatingContext> & { country: string; businessArchetype: string }
): BusinessOperatingContext {
  if (!input.country) throw new BusinessContextError("country is required");
  if (!input.businessArchetype) throw new BusinessContextError("businessArchetype is required");
  return {
    country: input.country,
    stateOrProvince: input.stateOrProvince ?? null,
    cityOrLocalArea: input.cityOrLocalArea ?? null,
    businessArchetype: input.businessArchetype,
    businessSize: input.businessSize ?? null,
    businessModel: input.businessModel ?? null,
    b2cB2bMix: input.b2cB2bMix ?? null,
    staffCount: input.staffCount ?? null,
    legalEntityType: input.legalEntityType ?? null,
    taxRegistrationStatus: input.taxRegistrationStatus ?? null,
    physicalPremises: input.physicalPremises ?? false,
    deliveryOrServiceArea: input.deliveryOrServiceArea ?? null,
    regulatedActivities: input.regulatedActivities ?? false,
  };
}

export interface SourceRegistryEntry {
  sourceId: string;
  trustTier: SourceTrustTier;
  url: string | null;
  registryReference: string | null;
  lastCheckedAt: Date | null;
  freshnessStatus: SourceFreshnessStatus;
}

/** Compute freshness from the last-checked date. */
export function computeFreshness(
  lastCheckedAt: Date | null,
  now: Date,
  opts: { freshDays?: number; staleDays?: number } = {}
): SourceFreshnessStatus {
  if (!lastCheckedAt) return SourceFreshnessStatus.UNKNOWN;
  const freshDays = opts.freshDays ?? 90;
  const staleDays = opts.staleDays ?? 365;
  const ageDays = (now.getTime() - lastCheckedAt.getTime()) / 86_400_000;
  if (ageDays <= freshDays) return SourceFreshnessStatus.FRESH;
  if (ageDays <= staleDays) return SourceFreshnessStatus.AGING;
  return SourceFreshnessStatus.STALE;
}

export enum KnowledgeCandidateStatus {
  PENDING_REVIEW = "PENDING_REVIEW",
  PROMOTED = "PROMOTED",
  REJECTED = "REJECTED",
}

export interface KnowledgeUpdateCandidate {
  candidateId: string;
  archetype: string;
  jurisdiction: string | null;
  sourceId: string;
  summary: string;
  status: KnowledgeCandidateStatus;
  promoted: boolean;
}

/** New external context ALWAYS enters as PENDING_REVIEW; never auto-promoted. */
export function createKnowledgeUpdateCandidate(input: {
  candidateId: string;
  archetype: string;
  jurisdiction?: string | null;
  sourceId: string;
  summary: string;
}): KnowledgeUpdateCandidate {
  return {
    candidateId: input.candidateId,
    archetype: input.archetype,
    jurisdiction: input.jurisdiction ?? null,
    sourceId: input.sourceId,
    summary: input.summary,
    status: KnowledgeCandidateStatus.PENDING_REVIEW,
    promoted: false,
  };
}

export interface KnowledgePromotionDecision {
  approvedByReviewerId: string;
  approved: boolean;
  reason: string;
}

/** Promote/reject a candidate — only via an explicit human decision. */
export function decideKnowledgePromotion(
  candidate: KnowledgeUpdateCandidate,
  decision: KnowledgePromotionDecision
): KnowledgeUpdateCandidate {
  return {
    ...candidate,
    status: decision.approved
      ? KnowledgeCandidateStatus.PROMOTED
      : KnowledgeCandidateStatus.REJECTED,
    promoted: decision.approved,
  };
}

export enum ComplianceClaimStatus {
  VALID = "VALID",
  VALID_WITH_LOW_CONFIDENCE = "VALID_WITH_LOW_CONFIDENCE",
  INSUFFICIENT_SOURCE_PROVENANCE = "INSUFFICIENT_SOURCE_PROVENANCE",
  BLOCKED_NO_JURISDICTION = "BLOCKED_NO_JURISDICTION",
  BLOCKED_SOCIAL_SOURCE_FOR_REGULATION = "BLOCKED_SOCIAL_SOURCE_FOR_REGULATION",
}

export enum ContextConfidence {
  HIGH = "HIGH",
  MEDIUM = "MEDIUM",
  LOW = "LOW",
}

export interface ComplianceAssessment {
  status: ComplianceClaimStatus;
  confidence: ContextConfidence;
  reviewWarningRequired: boolean;
  reason: string;
}

/**
 * Assess a (potentially regulatory) compliance claim. Fail-closed: missing
 * jurisdiction or source blocks the claim; social/anecdotal sources can never
 * establish a regulation; stale sources cap confidence; regulatory outputs always
 * require a human/expert review warning.
 */
export function assessComplianceClaim(input: {
  jurisdiction: string | null;
  source: SourceRegistryEntry | null;
  isRegulatory: boolean;
}): ComplianceAssessment {
  const reviewWarningRequired = input.isRegulatory;

  if (!input.jurisdiction) {
    return {
      status: ComplianceClaimStatus.BLOCKED_NO_JURISDICTION,
      confidence: ContextConfidence.LOW,
      reviewWarningRequired,
      reason: "No jurisdiction context — a rule cannot be claimed to apply.",
    };
  }
  if (!input.source) {
    return {
      status: ComplianceClaimStatus.INSUFFICIENT_SOURCE_PROVENANCE,
      confidence: ContextConfidence.LOW,
      reviewWarningRequired,
      reason: "No source provenance — compliance claim cannot be made.",
    };
  }
  if (
    input.isRegulatory &&
    input.source.trustTier >= SourceTrustTier.TIER_4_COMPETITOR_PUBLIC_WEB
  ) {
    return {
      status: ComplianceClaimStatus.BLOCKED_SOCIAL_SOURCE_FOR_REGULATION,
      confidence: ContextConfidence.LOW,
      reviewWarningRequired,
      reason: "Social/competitor sources cannot establish a regulatory rule.",
    };
  }

  const stale =
    input.source.freshnessStatus === SourceFreshnessStatus.STALE ||
    input.source.freshnessStatus === SourceFreshnessStatus.UNKNOWN;

  if (stale) {
    return {
      status: ComplianceClaimStatus.VALID_WITH_LOW_CONFIDENCE,
      confidence: ContextConfidence.LOW,
      reviewWarningRequired,
      reason: "Source is stale/unknown freshness — confidence capped to LOW.",
    };
  }

  const confidence =
    input.source.trustTier <= SourceTrustTier.TIER_2_INDUSTRY_BODY_OR_OFFICIAL_PLATFORM
      ? ContextConfidence.HIGH
      : ContextConfidence.MEDIUM;

  return {
    status: ComplianceClaimStatus.VALID,
    confidence,
    reviewWarningRequired,
    reason: "Jurisdiction + adequately-provenanced fresh source present.",
  };
}
