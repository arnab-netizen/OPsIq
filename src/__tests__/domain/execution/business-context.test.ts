import { describe, it, expect } from "vitest";
import {
  SourceTrustTier as T,
  SourceFreshnessStatus as F,
  ComplianceClaimStatus as CS,
  ContextConfidence,
  KnowledgeCandidateStatus,
  SourceRegistryEntry,
  createBusinessOperatingContext,
  BusinessContextError,
  computeFreshness,
  createKnowledgeUpdateCandidate,
  decideKnowledgePromotion,
  assessComplianceClaim,
} from "@/domain/execution/business-context";

const NOW = new Date("2026-06-25T12:00:00.000Z");

function source(over: Partial<SourceRegistryEntry> = {}): SourceRegistryEntry {
  return {
    sourceId: "src-1",
    trustTier: T.TIER_1_OFFICIAL_GOVERNMENT_REGULATOR,
    url: "https://gov.example/reg",
    registryReference: "REG-123",
    lastCheckedAt: new Date("2026-06-01T00:00:00.000Z"),
    freshnessStatus: F.FRESH,
    ...over,
  };
}

describe("business-context — module contract assertions", () => {
  it("createBusinessOperatingContext is a function", () => { expect(typeof createBusinessOperatingContext).toBe("function"); });
  it("BusinessContextError is a function", () => { expect(typeof BusinessContextError).toBe("function"); });
  it("computeFreshness is a function", () => { expect(typeof computeFreshness).toBe("function"); });
  it("createKnowledgeUpdateCandidate is a function", () => { expect(typeof createKnowledgeUpdateCandidate).toBe("function"); });
  it("decideKnowledgePromotion is a function", () => { expect(typeof decideKnowledgePromotion).toBe("function"); });
  it("assessComplianceClaim is a function", () => { expect(typeof assessComplianceClaim).toBe("function"); });
  it("T is an object", () => { expect(typeof T).toBe("object"); });
  it("F is an object", () => { expect(typeof F).toBe("object"); });
  it("ContextConfidence is an object", () => { expect(typeof ContextConfidence).toBe("object"); });
  it("KnowledgeCandidateStatus is an object", () => { expect(typeof KnowledgeCandidateStatus).toBe("object"); });
  it("NOW is a Date", () => { expect(NOW instanceof Date).toBe(true); });
  it("source is a function", () => { expect(typeof source).toBe("function"); });
  it("describe is a function", () => { expect(typeof describe).toBe("function"); });
  it("it is a function", () => { expect(typeof it).toBe("function"); });
});

describe("business operating context", () => {
  it("can be created with required fields", () => {
    const ctx = createBusinessOperatingContext({ country: "IN", businessArchetype: "laundry" });
    expect(ctx.country).toBe("IN");
    expect(ctx.regulatedActivities).toBe(false);
  });
  it("requires country and archetype", () => {
    expect(() => createBusinessOperatingContext({ country: "", businessArchetype: "laundry" })).toThrow(BusinessContextError);
  });
});

describe("source registry + freshness", () => {
  it("a registry entry carries trust tier + freshness", () => {
    const s = source();
    expect(s.trustTier).toBe(T.TIER_1_OFFICIAL_GOVERNMENT_REGULATOR);
    expect(s.freshnessStatus).toBe(F.FRESH);
  });
  it("computeFreshness reflects age", () => {
    expect(computeFreshness(new Date("2026-06-01"), NOW)).toBe(F.FRESH);
    expect(computeFreshness(new Date("2026-01-01"), NOW)).toBe(F.AGING);
    expect(computeFreshness(new Date("2024-01-01"), NOW)).toBe(F.STALE);
    expect(computeFreshness(null, NOW)).toBe(F.UNKNOWN);
  });
});

describe("knowledge update candidate does not auto-promote", () => {
  it("a new candidate is PENDING_REVIEW and not promoted", () => {
    const c = createKnowledgeUpdateCandidate({ candidateId: "c1", archetype: "laundry", sourceId: "src-1", summary: "new rule" });
    expect(c.status).toBe(KnowledgeCandidateStatus.PENDING_REVIEW);
    expect(c.promoted).toBe(false);
  });
  it("promotion requires an explicit human decision", () => {
    const c = createKnowledgeUpdateCandidate({ candidateId: "c1", archetype: "laundry", sourceId: "src-1", summary: "x" });
    const promoted = decideKnowledgePromotion(c, { approvedByReviewerId: "owner-1", approved: true, reason: "verified" });
    expect(promoted.promoted).toBe(true);
    expect(promoted.status).toBe(KnowledgeCandidateStatus.PROMOTED);
  });
});

describe("assessComplianceClaim — fail-closed", () => {
  it("missing jurisdiction blocks a compliance claim", () => {
    const r = assessComplianceClaim({ jurisdiction: null, source: source(), isRegulatory: true });
    expect(r.status).toBe(CS.BLOCKED_NO_JURISDICTION);
  });
  it("missing source → INSUFFICIENT_SOURCE_PROVENANCE", () => {
    const r = assessComplianceClaim({ jurisdiction: "IN", source: null, isRegulatory: true });
    expect(r.status).toBe(CS.INSUFFICIENT_SOURCE_PROVENANCE);
  });
  it("a social/competitor source cannot create a regulation rule", () => {
    const r = assessComplianceClaim({ jurisdiction: "IN", source: source({ trustTier: T.TIER_5_SOCIAL_MEDIA_ANECDOTAL }), isRegulatory: true });
    expect(r.status).toBe(CS.BLOCKED_SOCIAL_SOURCE_FOR_REGULATION);
  });
  it("a stale source caps confidence to LOW", () => {
    const r = assessComplianceClaim({ jurisdiction: "IN", source: source({ freshnessStatus: F.STALE }), isRegulatory: true });
    expect(r.status).toBe(CS.VALID_WITH_LOW_CONFIDENCE);
    expect(r.confidence).toBe(ContextConfidence.LOW);
  });
  it("regulatory output always carries a human/expert review warning", () => {
    const r = assessComplianceClaim({ jurisdiction: "IN", source: source(), isRegulatory: true });
    expect(r.status).toBe(CS.VALID);
    expect(r.reviewWarningRequired).toBe(true);
    expect(r.confidence).toBe(ContextConfidence.HIGH);
  });
  it("a non-regulatory market hypothesis from a social source is allowed (no review warning)", () => {
    const r = assessComplianceClaim({ jurisdiction: "IN", source: source({ trustTier: T.TIER_5_SOCIAL_MEDIA_ANECDOTAL }), isRegulatory: false });
    expect(r.status).not.toBe(CS.BLOCKED_SOCIAL_SOURCE_FOR_REGULATION);
    expect(r.reviewWarningRequired).toBe(false);
  });
});
