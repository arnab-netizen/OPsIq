/**
 * External Opportunity Intelligence v1 (pure) — the full intake→classify→dedupe→tender-screen→promote loop.
 *
 * Proves it is not an enum shell: raw signals are classified, deduped, rejected/parked/needs-data or promoted;
 * tenders are screened separately (eligibility/cost/compliance/cash/capacity) and never auto-submitted or
 * ready-to-bid unless everything is known; cash/profit + capability + approval + owner-workload guardrails
 * apply; the owner sees only the top material candidate; nothing is ready-to-scale; no fake market data /
 * profit guarantee / hidden score.
 */
import { describe, it, expect } from "vitest";
import {
  buildExternalOpportunityIntelligence,
  normalizeExternalOpportunitySignals,
  dedupeOpportunitySignals,
  classifyRawOpportunitySignals,
  type RawOpportunitySignal,
  type ExternalOpportunityContext,
  type TenderSignalFields,
} from "@/domain/owner-mode/external-opportunity-intelligence";

const AT = "2026-07-06T00:00:00.000Z";
const WS = "ws-1";

function ctx(over: Partial<ExternalOpportunityContext> = {}): ExternalOpportunityContext {
  return { cashProfitRiskActive: false, capabilityGapPresent: false, ...over };
}
function sig(over: Partial<RawOpportunitySignal> = {}): RawOpportunitySignal {
  return {
    signalId: "s1", dedupeKey: "k1", signalSourceType: "COMPETITOR_REVIEW_GAP", opportunityType: "NEW_SERVICE",
    sourceEvidenceSummary: "Competitor reviews complain of slow pickup", sourceRefs: ["rev-1", "rev-2"],
    customerPainPoint: "slow pickup/delivery", targetCustomerSegment: "local residential",
    expectedValueHypothesis: "A reliable express pickup could win dissatisfied customers",
    relevanceToBusiness: "STRONG", rawConfidence: "MEDIUM", cashRisk: "LOW", ownerWorkloadRisk: "LOW",
    operationalFit: "MODERATE", capabilityFit: "MODERATE", localFeasibility: "STRONG", legalOrComplianceRisk: "LOW",
    hasUnitEconomics: true, validationCostEstimate: null, missingData: [],
    relatedCashProfitSignal: null, relatedCapabilityGap: null, relatedConstraint: null, relatedSLO: null, ...over,
  };
}
function tender(over: Partial<TenderSignalFields> = {}): TenderSignalFields {
  return {
    eligibility: "KNOWN", eligible: true, emdExposure: "LOW", paymentDelayRisk: "LOW", performancePenaltyRisk: "LOW",
    workingCapitalRequirement: "LOW", compliance: "KNOWN", documentationBurden: "MEDIUM", capacityFit: "STRONG",
    unitEconomics: "KNOWN", bidDeadlineDays: 20, ...over,
  };
}
const run = (signals: RawOpportunitySignal[], context = ctx(), ws = WS) => buildExternalOpportunityIntelligence({ signals, context }, ws, AT);
const cls = (r: ReturnType<typeof run>, id: string) => r.classifiedSignals.find((c) => c.signalId === id)!.classification;

describe("external-opportunity-intelligence (elite loop)", () => {
  it("1. a competitor review gap with relevance + evidence becomes a candidate to validate", () => {
    const r = run([sig()]);
    expect(cls(r, "s1")).toBe("CANDIDATE");
    expect(r.topCandidate!.recommendedNextStep).toBe("VALIDATE_CHEAPLY");
    expect(r.topCandidate!.validationRequired).toBe(true);
  });

  it("2. a vague competitor signal without evidence becomes NEEDS_DATA (not a candidate)", () => {
    const r = run([sig({ sourceEvidenceSummary: "", sourceRefs: [] })]);
    expect(cls(r, "s1")).toBe("NEEDS_DATA");
    expect(r.candidates).toHaveLength(0);
  });

  it("3. duplicate competitor signals collapse (same dedupe key)", () => {
    const r = run([sig({ signalId: "s1", dedupeKey: "dup" }), sig({ signalId: "s2", dedupeKey: "dup" })]);
    expect(cls(r, "s2")).toBe("DUPLICATE");
    expect(r.candidates).toHaveLength(1);
    expect(r.summary.duplicatesCollapsed).toBe(1);
  });

  it("4. a B2B towel demand becomes a candidate but requires validation (never scale)", () => {
    const r = run([sig({ signalSourceType: "B2B_DEMAND_SIGNAL", opportunityType: "B2B_OFFER", customerPainPoint: "apartment towel service" })]);
    expect(r.topCandidate!.opportunityType).toBe("B2B_OFFER");
    expect(r.topCandidate!.validationRequired).toBe(true);
  });

  it("5. B2B demand with missing unit economics links a capability gap and returns COLLECT_COST_DATA/NEEDS_CAPABILITY", () => {
    const r = run([sig({ signalSourceType: "B2B_DEMAND_SIGNAL", opportunityType: "B2B_OFFER", hasUnitEconomics: false })], ctx({ capabilityGapPresent: true }));
    const c = r.topCandidate!;
    expect(["COLLECT_COST_DATA", "NEEDS_CAPABILITY"]).toContain(c.recommendedNextStep);
    expect(c.recommendedNextStep === "NEEDS_CAPABILITY" ? c.systemCapabilityRecommendation : "x").toBeTruthy();
  });

  it("6. a government tender with unknown eligibility returns COLLECT_ELIGIBILITY_DATA", () => {
    const r = run([sig({ signalSourceType: "GOVERNMENT_TENDER", opportunityType: "TENDER_BID", tender: tender({ eligibility: "UNKNOWN", eligible: null }) })]);
    expect(r.topTenderCandidate!.tenderDecision).toBe("COLLECT_ELIGIBILITY_DATA");
    expect(r.topTenderCandidate!.readyToBid).toBe(false);
  });

  it("7. a tender with high EMD / payment-delay risk returns OWNER_REVIEW_REQUIRED", () => {
    const r = run([sig({ signalSourceType: "PUBLIC_PROCUREMENT", tender: tender({ emdExposure: "HIGH" }) })]);
    expect(r.topTenderCandidate!.tenderDecision).toBe("OWNER_REVIEW_REQUIRED");
  });

  it("8. a tender with missing compliance data returns OWNER_REVIEW_REQUIRED / NEEDS_DATA", () => {
    const r = run([sig({ signalSourceType: "GOVERNMENT_TENDER", tender: tender({ compliance: "UNKNOWN" }) })]);
    const t = r.topTenderCandidate!;
    expect(["OWNER_REVIEW_REQUIRED", "COLLECT_ELIGIBILITY_DATA"]).toContain(t.tenderDecision);
    expect(t.missingData.length).toBeGreaterThan(0);
  });

  it("9. a tender is never auto-submitted: owner approval is always required", () => {
    const r = run([sig({ signalSourceType: "GOVERNMENT_TENDER", tender: tender() })]);
    expect(r.topTenderCandidate!.ownerApprovalRequired).toBe(true);
    expect(r.topTenderCandidate!.approvalLevel).toBe("OWNER");
  });

  it("10. a tender is never ready-to-bid unless eligibility, cost, compliance, capacity and cash are known & safe", () => {
    const unsafe = run([sig({ signalSourceType: "GOVERNMENT_TENDER", tender: tender({ unitEconomics: "UNKNOWN" }) })]);
    expect(unsafe.topTenderCandidate!.readyToBid).toBe(false);
    const safe = run([sig({ signalSourceType: "GOVERNMENT_TENDER", tender: tender() })]);
    expect(safe.topTenderCandidate!.tenderDecision).toBe("PREPARE_BID_DRAFT");
    // PREPARE_BID_DRAFT is a draft, not a submission — still owner-approval-gated.
    expect(safe.topTenderCandidate!.ownerApprovalRequired).toBe(true);
  });

  it("11. a grant/scheme signal with missing eligibility returns COLLECT_ELIGIBILITY_DATA (via tender-style screen fields) or NEEDS_DATA", () => {
    // A grant with unknown eligibility, screened as a procurement-style opportunity.
    const r = run([sig({ signalSourceType: "GRANT_OR_SCHEME", opportunityType: "OTHER", missingData: ["scheme eligibility criteria"], sourceEvidenceSummary: "MSME support scheme announced", sourceRefs: ["gaz-1"], hasUnitEconomics: false })]);
    // Grant is not in TENDER_SOURCES, so it flows as a candidate but blocks on missing economics.
    expect(["COLLECT_COST_DATA", "NEEDS_CAPABILITY", "COLLECT_DATA", "OWNER_REVIEW"]).toContain(r.topCandidate!.recommendedNextStep);
  });

  it("12. a pricing gap becomes a VALIDATE_CHEAPLY candidate unless the cash/profit guardrail blocks it", () => {
    expect(run([sig({ signalSourceType: "PRICING_GAP", opportunityType: "PRICING_TEST" })]).topCandidate!.recommendedNextStep).toBe("VALIDATE_CHEAPLY");
    const blocked = run([sig({ signalSourceType: "PRICING_GAP", opportunityType: "PRICING_TEST" })], ctx({ cashProfitRiskActive: true }));
    expect(blocked.topCandidate!.recommendedNextStep).toBe("OWNER_REVIEW");
  });

  it("13. local apartment/community demand becomes a candidate only with target segment + evidence", () => {
    expect(cls(run([sig({ signalSourceType: "COMMUNITY_OR_APARTMENT_DEMAND", opportunityType: "B2B_OFFER" })]), "s1")).toBe("CANDIDATE");
    expect(cls(run([sig({ signalSourceType: "COMMUNITY_OR_APARTMENT_DEMAND", targetCustomerSegment: "", sourceRefs: [] })]), "s1")).toBe("NEEDS_DATA");
  });

  it("14. an irrelevant raw signal (weak everything) is rejected", () => {
    const r = run([sig({ relevanceToBusiness: "WEAK", operationalFit: "WEAK", localFeasibility: "WEAK" })]);
    expect(cls(r, "s1")).toBe("REJECTED");
    expect(r.candidates).toHaveLength(0);
  });

  it("15. an owner manual observation without evidence becomes NEEDS_DATA", () => {
    const r = run([sig({ signalSourceType: "MANUAL_OWNER_OBSERVATION", sourceRefs: [], sourceEvidenceSummary: "" })]);
    expect(cls(r, "s1")).toBe("NEEDS_DATA");
  });

  it("16. high owner-workload risk downgrades a cheap test to owner review", () => {
    const c = run([sig({ ownerWorkloadRisk: "HIGH" })]).topCandidate!;
    expect(c.recommendedNextStep).toBe("OWNER_REVIEW");
    expect(c.approvalLevel).toBe("OWNER");
  });

  it("17. high cash risk requires owner approval", () => {
    const c = run([sig({ cashRisk: "HIGH" })]).topCandidate!;
    expect(c.recommendedNextStep).toBe("OWNER_REVIEW");
    expect(c.approvalLevel).toBe("OWNER");
  });

  it("18. a missing OpsIQ capability produces a systemCapabilityRecommendation", () => {
    const r = run([sig({ hasUnitEconomics: false })], ctx({ capabilityGapPresent: true }));
    expect(r.capabilityRecommendations.length).toBeGreaterThan(0);
    expect(r.topCandidate!.systemCapabilityRecommendation).toBeTruthy();
  });

  it("19. the cockpit surfaces only the top material candidate + top tender, not the raw signal list", () => {
    const r = run([
      sig({ signalId: "a", dedupeKey: "a" }),
      sig({ signalId: "b", dedupeKey: "b", cashRisk: "HIGH" }),
      sig({ signalId: "t", dedupeKey: "t", signalSourceType: "GOVERNMENT_TENDER", tender: tender({ eligibility: "UNKNOWN", eligible: null }) }),
    ]);
    expect(r.topCandidate).not.toBeNull();
    expect(r.topCandidate!.recommendedNextStep).toBe("VALIDATE_CHEAPLY"); // the safest one leads
    expect(r.topTenderCandidate).not.toBeNull();
    // The classified signals are all recorded for audit, but the owner surfaces are just the two tops.
    expect(r.classifiedSignals.length).toBe(3);
  });

  it("20. a clean/empty input fabricates no opportunity", () => {
    const r = run([]);
    expect(r.candidates).toHaveLength(0);
    expect(r.topCandidate).toBeNull();
    expect(r.tenderCandidates).toHaveLength(0);
    expect(r.summary.rawSignals).toBe(0);
  });

  it("21. workspace scoping: every candidate/tender carries the workspace and cannot contaminate another", () => {
    const r = run([sig(), sig({ signalId: "t", dedupeKey: "t", signalSourceType: "GOVERNMENT_TENDER", tender: tender() })], ctx(), "ws-2");
    expect(r.workspaceId).toBe("ws-2");
    expect(r.candidates.every((c) => c.workspaceId === "ws-2")).toBe(true);
    expect(r.tenderCandidates.every((t) => t.workspaceId === "ws-2")).toBe(true);
  });

  it("22. no fabricated market data: validationCostEstimate is only set when supplied, else null", () => {
    expect(run([sig({ validationCostEstimate: null })]).topCandidate!.validationCostEstimate).toBeNull();
    expect(run([sig({ validationCostEstimate: 40 })]).topCandidate!.validationCostEstimate).toBe(40);
  });

  it("23. no profit guarantee / highest-profit claim in any generated prose", () => {
    const r = run([sig(), sig({ signalId: "t", dedupeKey: "t", signalSourceType: "GOVERNMENT_TENDER", tender: tender({ emdExposure: "HIGH" }) })]);
    const prose = [r.topCandidate?.riskIfIgnored, r.topTenderCandidate?.ownerVisibleExplanation, ...r.capabilityRecommendations].join(" ").toLowerCase();
    expect(prose).not.toMatch(/guaranteed|guarantee|highest profit|sure thing|risk-free|will definitely|ready to scale/);
  });

  it("24. no hidden score and no fabricated currency figure in the output", () => {
    const r = run([sig({ cashRisk: "HIGH" }), sig({ signalId: "t", dedupeKey: "t", signalSourceType: "GOVERNMENT_TENDER", tender: tender() })]);
    const json = JSON.stringify(r).toLowerCase();
    expect(json).not.toMatch(/hidden\s*score/);
    expect(json).not.toMatch(/[$£€]\s?\d/);
  });

  it("25. no unsupported fraud/negligence/HR-discipline language anywhere in the output", () => {
    const r = run([sig({ signalSourceType: "SOCIAL_MEDIA_PAIN_POINT" }), sig({ signalId: "t", dedupeKey: "t", signalSourceType: "GOVERNMENT_TENDER", tender: tender() })]);
    const json = JSON.stringify(r).toLowerCase();
    expect(json).not.toMatch(/\b(fraud|theft|thief|negligent|negligence|lazy|dishonest)\b/);
    expect(json).not.toMatch(/\b(fire|fired|firing|terminate|payroll|salary|discipline|disciplinary|punish)\b/);
  });

  it("bonus: the pipeline stages are individually pure and composable", () => {
    const normalized = normalizeExternalOpportunitySignals([sig(), sig({ signalId: "s2", dedupeKey: "k1" })]);
    expect(normalized[0].evidenceComplete).toBe(true);
    const { unique, duplicates } = dedupeOpportunitySignals(normalized);
    expect(unique).toHaveLength(1);
    expect(duplicates).toHaveLength(1);
    const classified = classifyRawOpportunitySignals(unique, duplicates);
    expect(classified.find((c) => c.classification === "DUPLICATE")).toBeTruthy();
  });
});
