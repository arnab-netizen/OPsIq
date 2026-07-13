/**
 * Workflow 4 Integration: Tender Screen → Application Pack Generator
 *
 * Proves that:
 * 1. `generateBidApplicationPack` produces a well-formed pack from a screened candidate.
 * 2. `submissionAllowed` is always false (governance invariant).
 * 3. `ownerApprovalRequired` is always true (governance invariant).
 * 4. All risk bands from the candidate are faithfully reproduced — no risk is suppressed.
 * 5. Missing data is surfaced as owner action items.
 * 6. `PREPARE_BID_DRAFT` decision produces preparation steps without submission language.
 * 7. Urgent-deadline cases (≤ 7 days) surface an urgency action.
 * 8. High-risk candidates produce a non-empty overallRiskSummary listing all high factors.
 * 9. No-risk candidates produce a "no high-risk factors" summary.
 * 10. workspaceId in the pack always matches the candidate (workspace isolation).
 */
import { describe, it, expect } from "vitest";
import {
  generateBidApplicationPack,
  type BidApplicationPack,
} from "@/domain/owner-mode/bid-application-pack";
import type { TenderProcurementCandidate } from "@/domain/owner-mode/external-opportunity-intelligence";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const GENERATED_AT = "2024-01-15T10:00:00.000Z";

function makeCandidate(overrides: Partial<TenderProcurementCandidate> = {}): TenderProcurementCandidate {
  return {
    workspaceId: "ws-1",
    signalSourceType: "GOVERNMENT_TENDER",
    opportunityTitle: "Municipal Road Resurfacing Tender 2024",
    sourceEvidenceSummary: "Published on local procurement portal with full specification.",
    sourceRefs: ["https://procurement.example.gov/tender/2024/road"],
    targetBuyer: "City Public Works Department",
    eligibility: "KNOWN",
    emdExposure: "LOW",
    paymentDelayRisk: "LOW",
    performancePenaltyRisk: "LOW",
    workingCapitalRequirement: "LOW",
    compliance: "KNOWN",
    documentationBurden: "LOW",
    capacityFit: "STRONG",
    unitEconomics: "KNOWN",
    bidDeadlineDays: 30,
    tenderDecision: "PREPARE_BID_DRAFT",
    readyToBid: false,
    ownerApprovalRequired: true,
    approvalLevel: "OWNER",
    missingData: [],
    systemCapabilityRecommendation: null,
    ownerVisibleExplanation: "All key factors are known and low-risk. Owner may proceed to draft a bid outline.",
    evaluatedAt: "2024-01-10T00:00:00.000Z",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Core structure tests
// ---------------------------------------------------------------------------

describe("Workflow 4 — generateBidApplicationPack (pure)", () => {
  it("returns a BidApplicationPack with all required sections", () => {
    const pack = generateBidApplicationPack(makeCandidate(), GENERATED_AT);
    expect(pack).toMatchObject<Partial<BidApplicationPack>>({
      workspaceId: "ws-1",
      submissionAllowed: false,
      ownerApprovalRequired: true,
      generatedAt: GENERATED_AT,
    });
    expect(pack.cover).toBeDefined();
    expect(pack.eligibility).toBeDefined();
    expect(pack.risk).toBeDefined();
    expect(pack.economics).toBeDefined();
    expect(pack.ownerActions).toBeDefined();
  });

  it("GOVERNANCE: submissionAllowed is ALWAYS false", () => {
    const pack = generateBidApplicationPack(makeCandidate({ tenderDecision: "PREPARE_BID_DRAFT", readyToBid: true }), GENERATED_AT);
    expect(pack.submissionAllowed).toBe(false);
  });

  it("GOVERNANCE: ownerApprovalRequired is ALWAYS true", () => {
    const pack = generateBidApplicationPack(makeCandidate(), GENERATED_AT);
    expect(pack.ownerApprovalRequired).toBe(true);
  });

  it("cover section contains all candidate header fields", () => {
    const candidate = makeCandidate({ bidDeadlineDays: 14, tenderDecision: "PREPARE_BID_DRAFT" });
    const pack = generateBidApplicationPack(candidate, GENERATED_AT);
    expect(pack.cover.opportunityTitle).toBe("Municipal Road Resurfacing Tender 2024");
    expect(pack.cover.targetBuyer).toBe("City Public Works Department");
    expect(pack.cover.bidDeadlineDays).toBe(14);
    expect(pack.cover.tenderDecision).toBe("PREPARE_BID_DRAFT");
    expect(pack.cover.sourceRefs).toEqual(["https://procurement.example.gov/tender/2024/road"]);
    expect(pack.cover.evaluatedAt).toBe("2024-01-10T00:00:00.000Z");
  });

  it("risk section reproduces all risk bands from the candidate", () => {
    const candidate = makeCandidate({
      emdExposure: "HIGH",
      paymentDelayRisk: "MEDIUM",
      performancePenaltyRisk: "HIGH",
      workingCapitalRequirement: "LOW",
      documentationBurden: "MEDIUM",
    });
    const pack = generateBidApplicationPack(candidate, GENERATED_AT);
    expect(pack.risk.emdExposure).toBe("HIGH");
    expect(pack.risk.paymentDelayRisk).toBe("MEDIUM");
    expect(pack.risk.performancePenaltyRisk).toBe("HIGH");
    expect(pack.risk.workingCapitalRequirement).toBe("LOW");
    expect(pack.risk.documentationBurden).toBe("MEDIUM");
  });

  it("workspaceId in the pack matches the candidate (workspace isolation)", () => {
    const pack = generateBidApplicationPack(makeCandidate({ workspaceId: "ws-tenant-99" }), GENERATED_AT);
    expect(pack.workspaceId).toBe("ws-tenant-99");
  });
});

// ---------------------------------------------------------------------------
// Risk summary tests
// ---------------------------------------------------------------------------

describe("Workflow 4 — risk summary", () => {
  it("no-risk candidate produces 'no high-risk factors' summary", () => {
    const pack = generateBidApplicationPack(makeCandidate(), GENERATED_AT);
    expect(pack.risk.overallRiskSummary).toMatch(/no high-risk factors/i);
  });

  it("single HIGH risk factor is named in the summary", () => {
    const pack = generateBidApplicationPack(makeCandidate({ emdExposure: "HIGH" }), GENERATED_AT);
    expect(pack.risk.overallRiskSummary).toMatch(/EMD/i);
    expect(pack.risk.overallRiskSummary).toMatch(/owner review required/i);
  });

  it("multiple HIGH risk factors are ALL listed in the summary", () => {
    const pack = generateBidApplicationPack(makeCandidate({
      emdExposure: "HIGH",
      paymentDelayRisk: "HIGH",
      performancePenaltyRisk: "HIGH",
    }), GENERATED_AT);
    expect(pack.risk.overallRiskSummary).toMatch(/EMD/i);
    expect(pack.risk.overallRiskSummary).toMatch(/payment-delay/i);
    expect(pack.risk.overallRiskSummary).toMatch(/performance-penalty/i);
  });
});

// ---------------------------------------------------------------------------
// Eligibility and compliance tests
// ---------------------------------------------------------------------------

describe("Workflow 4 — eligibility section", () => {
  it("UNKNOWN eligibility produces an owner action item", () => {
    const pack = generateBidApplicationPack(makeCandidate({ eligibility: "UNKNOWN" }), GENERATED_AT);
    expect(pack.eligibility.ownerActions.some((a) => /eligibility/i.test(a))).toBe(true);
    expect(pack.eligibility.missingEligibilityData).toContain("eligibility criteria");
  });

  it("UNKNOWN compliance produces an owner action item", () => {
    const pack = generateBidApplicationPack(makeCandidate({ compliance: "UNKNOWN" }), GENERATED_AT);
    expect(pack.eligibility.ownerActions.some((a) => /compliance/i.test(a))).toBe(true);
    expect(pack.eligibility.missingEligibilityData).toContain("compliance/documentation requirements");
  });

  it("WEAK capacity fit produces an owner action item", () => {
    const pack = generateBidApplicationPack(makeCandidate({ capacityFit: "WEAK" }), GENERATED_AT);
    expect(pack.eligibility.ownerActions.some((a) => /capacity/i.test(a))).toBe(true);
  });

  it("STRONG eligibility + KNOWN compliance + STRONG capacity produces no eligibility action items", () => {
    const pack = generateBidApplicationPack(makeCandidate({
      eligibility: "KNOWN",
      compliance: "KNOWN",
      capacityFit: "STRONG",
    }), GENERATED_AT);
    expect(pack.eligibility.ownerActions).toHaveLength(0);
    expect(pack.eligibility.missingEligibilityData).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Economics tests
// ---------------------------------------------------------------------------

describe("Workflow 4 — economics section", () => {
  it("UNKNOWN unit economics produces an owner action to calculate costs", () => {
    const pack = generateBidApplicationPack(makeCandidate({ unitEconomics: "UNKNOWN" }), GENERATED_AT);
    expect(pack.economics.ownerActions.some((a) => /cost|unit economics/i.test(a))).toBe(true);
  });

  it("KNOWN unit economics produces no economics action items", () => {
    const pack = generateBidApplicationPack(makeCandidate({ unitEconomics: "KNOWN" }), GENERATED_AT);
    expect(pack.economics.ownerActions).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Missing data + preparation steps tests
// ---------------------------------------------------------------------------

describe("Workflow 4 — owner actions section", () => {
  it("missing data from candidate is surfaced as owner action items", () => {
    const pack = generateBidApplicationPack(makeCandidate({
      missingData: ["EMD amount not confirmed", "Subcontractor requirement unknown"],
    }), GENERATED_AT);
    expect(pack.ownerActions.missingData).toHaveLength(2);
    expect(pack.ownerActions.missingData).toContain("EMD amount not confirmed");
    expect(pack.ownerActions.missingData).toContain("Subcontractor requirement unknown");
  });

  it("PREPARE_BID_DRAFT decision includes a draft-outline step (no auto-submit language)", () => {
    const pack = generateBidApplicationPack(makeCandidate({ tenderDecision: "PREPARE_BID_DRAFT" }), GENERATED_AT);
    const draftStep = pack.ownerActions.preparationSteps.find((s) => /draft/i.test(s));
    expect(draftStep).toBeDefined();
    // Step must not instruct submission — it may say "do not submit" (prohibitive is fine)
    expect(draftStep).not.toMatch(/auto.?submit|ready to submit|you may submit|proceed to submit/i);
  });

  it("approvalNote always states that submissionAllowed is false", () => {
    const pack = generateBidApplicationPack(makeCandidate(), GENERATED_AT);
    expect(pack.ownerActions.approvalNote).toMatch(/submissionAllowed is always false/i);
  });

  it("urgent deadline (≤ 7 days) surfaces an urgency warning in preparation steps", () => {
    const pack = generateBidApplicationPack(makeCandidate({ bidDeadlineDays: 3 }), GENERATED_AT);
    const urgentStep = pack.ownerActions.preparationSteps.find((s) => /urgent|3 day/i.test(s));
    expect(urgentStep).toBeDefined();
  });

  it("non-urgent deadline (> 7 days) does NOT produce an urgency warning", () => {
    const pack = generateBidApplicationPack(makeCandidate({ bidDeadlineDays: 30 }), GENERATED_AT);
    const urgentStep = pack.ownerActions.preparationSteps.find((s) => /urgent/i.test(s));
    expect(urgentStep).toBeUndefined();
  });

  it("null deadline does NOT produce an urgency warning", () => {
    const pack = generateBidApplicationPack(makeCandidate({ bidDeadlineDays: null }), GENERATED_AT);
    const urgentStep = pack.ownerActions.preparationSteps.find((s) => /urgent/i.test(s));
    expect(urgentStep).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Forwarded fields tests
// ---------------------------------------------------------------------------

describe("Workflow 4 — forwarded fields from candidate", () => {
  it("ownerVisibleExplanation is forwarded unchanged", () => {
    const explanation = "All key factors are known. Proceed to draft bid outline.";
    const pack = generateBidApplicationPack(makeCandidate({ ownerVisibleExplanation: explanation }), GENERATED_AT);
    expect(pack.ownerVisibleExplanation).toBe(explanation);
  });

  it("systemCapabilityRecommendation is forwarded unchanged when present", () => {
    const rec = "Consider partnering with a certified compliance specialist.";
    const pack = generateBidApplicationPack(makeCandidate({ systemCapabilityRecommendation: rec }), GENERATED_AT);
    expect(pack.systemCapabilityRecommendation).toBe(rec);
  });

  it("systemCapabilityRecommendation is null when not present", () => {
    const pack = generateBidApplicationPack(makeCandidate({ systemCapabilityRecommendation: null }), GENERATED_AT);
    expect(pack.systemCapabilityRecommendation).toBeNull();
  });

  it("generatedAt is set to the value passed in", () => {
    const pack = generateBidApplicationPack(makeCandidate(), "2024-06-01T12:00:00.000Z");
    expect(pack.generatedAt).toBe("2024-06-01T12:00:00.000Z");
  });
});

// ---------------------------------------------------------------------------
// DO_NOT_BID / REJECT_UNFIT decision tests
// ---------------------------------------------------------------------------

describe("Workflow 4 — non-bid decisions still produce a pack (with warnings)", () => {
  it("DO_NOT_BID decision still returns a valid pack", () => {
    const pack = generateBidApplicationPack(makeCandidate({ tenderDecision: "DO_NOT_BID" }), GENERATED_AT);
    expect(pack.submissionAllowed).toBe(false);
    expect(pack.cover.tenderDecision).toBe("DO_NOT_BID");
  });

  it("REJECT_UNFIT decision still returns a valid pack", () => {
    const pack = generateBidApplicationPack(makeCandidate({ tenderDecision: "REJECT_UNFIT" }), GENERATED_AT);
    expect(pack.submissionAllowed).toBe(false);
    expect(pack.cover.tenderDecision).toBe("REJECT_UNFIT");
  });

  it("COLLECT_ELIGIBILITY_DATA decision produces eligibility-collection prep steps", () => {
    const pack = generateBidApplicationPack(makeCandidate({
      tenderDecision: "COLLECT_ELIGIBILITY_DATA",
      eligibility: "UNKNOWN",
    }), GENERATED_AT);
    expect(pack.eligibility.ownerActions.some((a) => /eligibility/i.test(a))).toBe(true);
  });
});
