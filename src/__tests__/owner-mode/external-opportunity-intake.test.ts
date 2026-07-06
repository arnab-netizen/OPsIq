/**
 * Structured External Opportunity Intake + Opportunity Operating Layer — unit tests (pure).
 *
 * Proves the intake is a real opportunity OPERATING layer, not an enum/data shell: submission validation,
 * signal→engine mapping, source-quality-capped evidence strength, the current-business-fit gate, the
 * tender bid/no-bid gate, win-readiness + proof-pack, prep checklists, freshness/expiry, clustering/anti-
 * spam, negative reasons, next-action ownership, transparent quality bands, repeated-blocker learning —
 * and the hard guarantees (no hidden score, no win %, no profit guarantee, no tender auto-submit, no
 * scale-before-validation).
 */
import { describe, it, expect } from "vitest";
import {
  planExternalOpportunitySignal,
  mapPersistedSignalToRaw,
  type PersistedIntakeRow,
  type ExternalOpportunitySignalSubmission,
} from "@/domain/owner-mode/external-opportunity-intake";
import {
  buildOpportunityOperatingLayer,
  type BusinessStateContext,
} from "@/domain/owner-mode/opportunity-operating-layer";

const WS = "ws-intake-000000000000000000000001";
const AT = "2026-07-06T00:00:00.000Z";
const NOW = Date.parse(AT);
const DAY = 86_400_000;

const CLEAN_BUSINESS: BusinessStateContext = {
  hasCriticalQualityBottleneck: false, hasCashProfitRisk: false, staffCapacity: "MODERATE",
  equipmentCapacity: "MODERATE", deliveryCapacity: "MODERATE", ownerWorkloadHigh: false,
  unresolvedTrainingOrSopGap: false, activeHighRiskApproval: false, capabilityGapPresent: false, topConstraintType: null,
};

let seq = 0;
const row = (over: Partial<PersistedIntakeRow> = {}): PersistedIntakeRow => ({
  id: `id-${(seq += 1)}`, workspaceId: WS, idempotencyKey: `k${seq}`, dedupeKey: `d${seq}`,
  rawSignalType: "SERVICE_GAP", sourceName: "owner note", sourceChannel: "manual", sourceRef: "ref-1",
  rawDescription: "Customers keep asking for a same-day option", extractedBusinessNeed: "same-day turnaround",
  targetCustomerSegment: "busy professionals", locationContext: "local", deadlineAt: null,
  tenderOrProcurementValue: null, eligibilityRequirements: null, complianceRequirements: null,
  estimatedCashExposure: null, cashExposureBand: "LOW", relevanceBand: "MODERATE", ownerWorkloadBand: "LOW",
  ownerWorkloadNotes: null, hasUnitEconomics: true, sourceQuality: "OWNER_OBSERVED",
  requiredDocuments: [], missingDocuments: [], discoveredAt: new Date(NOW - DAY), lastVerifiedAt: new Date(NOW - DAY),
  staleAfterDays: 30, evidenceRefs: ["ev-1"], missingData: [],
  ...over,
});
const build = (rows: PersistedIntakeRow[], business = CLEAN_BUSINESS) => buildOpportunityOperatingLayer(rows, business, WS, AT);

describe("planExternalOpportunitySignal — validation & normalisation", () => {
  const base: ExternalOpportunitySignalSubmission = { rawSignalType: "B2B_DEMAND_SIGNAL", rawDescription: "A hotel wants weekly linen service" };

  it("1. accepts a valid submission and derives idempotency + dedupe keys", () => {
    const p = planExternalOpportunitySignal(base);
    expect(p.ok).toBe(true);
    if (p.ok) { expect(p.row.idempotencyKey.length).toBeGreaterThan(0); expect(p.row.dedupeKey.length).toBeGreaterThan(0); }
  });
  it("2. rejects an unknown signal type", () => {
    const p = planExternalOpportunitySignal({ ...base, rawSignalType: "NONSENSE" as ExternalOpportunitySignalSubmission["rawSignalType"] });
    expect(p.ok).toBe(false);
  });
  it("3. rejects an empty description", () => {
    expect(planExternalOpportunitySignal({ ...base, rawDescription: "  " }).ok).toBe(false);
  });
  it("4. rejects fraud/HR-discipline language (fail closed)", () => {
    expect(planExternalOpportunitySignal({ ...base, rawDescription: "the staff committed fraud, we should fire them" }).ok).toBe(false);
  });
  it("5. a tender with no eligibility supplied records an honest missing-eligibility gap", () => {
    const p = planExternalOpportunitySignal({ rawSignalType: "GOVERNMENT_TENDER", rawDescription: "Municipal linen tender" });
    expect(p.ok).toBe(true);
    if (p.ok) expect(p.row.missingData.some((m) => /eligibilit/i.test(m))).toBe(true);
  });
});

describe("mapPersistedSignalToRaw — engine mapping", () => {
  it("6. maps a tender intake to a tender-screened raw signal (carries tender fields)", () => {
    const raw = mapPersistedSignalToRaw(row({ rawSignalType: "GOVERNMENT_TENDER", eligibilityRequirements: null }), NOW);
    expect(raw.opportunityType).toBe("TENDER_BID");
    expect(raw.tender).toBeDefined();
    expect(raw.tender!.eligibility).toBe("UNKNOWN");
  });
  it("7. missing business need / missing data lowers confidence to NEEDS_DATA (never fabricated)", () => {
    const raw = mapPersistedSignalToRaw(row({ extractedBusinessNeed: null, missingData: ["need"] }), NOW);
    expect(raw.rawConfidence).toBe("NEEDS_DATA");
    expect(raw.validationCostEstimate).toBeNull();
  });
});

describe("Opportunity Operating Layer — evidence, fit & tender gates", () => {
  it("8. weak evidence can never produce HIGH opportunity quality", () => {
    const r = build([row({ sourceQuality: "THIRD_PARTY_UNVERIFIED", evidenceRefs: [], extractedBusinessNeed: null, missingData: ["need", "value"] })]);
    expect(r.topOpportunity!.opportunityQuality).not.toBe("HIGH");
    expect(["WEAK", "INSUFFICIENT"]).toContain(r.topOpportunity!.evidenceStrength);
  });
  it("9. unknown eligibility routes a tender to COLLECT_ELIGIBILITY_DATA, never PREPARE_BID_DRAFT", () => {
    const r = build([row({ rawSignalType: "GOVERNMENT_TENDER", eligibilityRequirements: null, deadlineAt: new Date(NOW + 30 * DAY) })]);
    expect(r.topOpportunity!.tenderReadiness!.bidDecision).toBe("COLLECT_ELIGIBILITY_DATA");
    expect(r.topOpportunity!.tenderReadiness!.submissionAllowed).toBe(false);
  });
  it("10. missing tender documents route to COLLECT_DOCUMENTS", () => {
    const r = build([row({ rawSignalType: "PUBLIC_PROCUREMENT_NOTICE", eligibilityRequirements: "GST + 3yr turnover", requiredDocuments: [], missingDocuments: ["GST cert"], deadlineAt: new Date(NOW + 20 * DAY) })]);
    expect(r.topOpportunity!.tenderReadiness!.bidDecision).toBe("COLLECT_DOCUMENTS");
  });
  it("11. an expired tender is blocked (DO_NOT_BID + freshness EXPIRED, never active)", () => {
    const r = build([row({ rawSignalType: "GOVERNMENT_TENDER", eligibilityRequirements: "known", deadlineAt: new Date(NOW - DAY) })]);
    const top = r.topOpportunity!;
    expect(top.freshness).toBe("EXPIRED");
    expect(top.tenderReadiness!.bidDecision).toBe("DO_NOT_BID");
    expect(top.recommendedNextStep).toBe("DO_NOT_BID"); // tender's next step IS its bid decision
    expect(top.executionReadiness).toBe("REJECT_UNFIT"); // and it can never be an active candidate
  });
  it("12. high cash/EMD exposure on a tender requires owner review", () => {
    const r = build([row({ rawSignalType: "CORPORATE_VENDOR_OPPORTUNITY", eligibilityRequirements: "known", requiredDocuments: ["a"], hasUnitEconomics: true, tenderOrProcurementValue: 100, complianceRequirements: "known", cashExposureBand: "HIGH", deadlineAt: new Date(NOW + 30 * DAY) })]);
    expect(r.topOpportunity!.tenderReadiness!.bidDecision).toBe("OWNER_REVIEW_REQUIRED");
    expect(r.topOpportunity!.nextActionOwner).toBe("OWNER");
  });
});

describe("Opportunity Operating Layer — business-fit gate", () => {
  it("13. an unrelated growth opportunity is downgraded/parked when a critical bottleneck is unresolved", () => {
    const business: BusinessStateContext = { ...CLEAN_BUSINESS, hasCriticalQualityBottleneck: true };
    const r = build([row({ rawSignalType: "B2B_DEMAND_SIGNAL", extractedBusinessNeed: "expand to hotels" })], business);
    expect(r.topOpportunity!.businessFit).toBe("WEAK");
    expect(["PARK", "REJECT"]).toContain(r.topOpportunity!.recommendedNextStep);
    expect(r.topOpportunity!.negativeReasons).toContain("STRATEGIC_DISTRACTION");
  });
  it("14. an opportunity that addresses the bottleneck stays active but still requires validation", () => {
    const business: BusinessStateContext = { ...CLEAN_BUSINESS, hasCriticalQualityBottleneck: true, topConstraintType: "QUALITY" };
    const r = build([row({ rawSignalType: "SERVICE_GAP", extractedBusinessNeed: "fix the recurring quality miss" })], business);
    expect(r.topOpportunity!.recommendedNextStep).not.toBe("PARK");
    expect(r.topOpportunity!.validationRequired).toBe(true);
  });
  it("15. unknown staff/equipment/delivery capacity prevents a STRONG business fit", () => {
    const business: BusinessStateContext = { ...CLEAN_BUSINESS, staffCapacity: "UNKNOWN", equipmentCapacity: "UNKNOWN", deliveryCapacity: "UNKNOWN" };
    const r = build([row()], business);
    expect(r.topOpportunity!.businessFit).not.toBe("STRONG");
    expect(r.topOpportunity!.capacityFit).toBe("UNKNOWN");
  });
});

describe("Opportunity Operating Layer — win-readiness, checklist, clustering, learning", () => {
  it("16. win-readiness is weak when the proof pack is missing, and proof-pack gaps become checklist items", () => {
    const r = build([row({ rawSignalType: "B2B_DEMAND_SIGNAL", evidenceRefs: [], hasUnitEconomics: false })]);
    const top = r.topOpportunity!;
    expect(top.winReadiness).toBe("WEAK");
    expect(top.proofPackRequirements.length).toBeGreaterThan(0);
    expect(top.prepChecklist!.requiredProofEvidence.length).toBeGreaterThan(0);
  });
  it("17. similar B2B signals cluster into ONE theme; duplicates do not inflate priority", () => {
    const r = build([
      row({ rawSignalType: "B2B_DEMAND_SIGNAL", dedupeKey: "b2b-hotel", sourceQuality: "LOW_CONFIDENCE", evidenceRefs: [] }),
      row({ rawSignalType: "B2B_DEMAND_SIGNAL", dedupeKey: "b2b-hotel", sourceQuality: "LOW_CONFIDENCE", evidenceRefs: [] }),
      row({ rawSignalType: "B2B_DEMAND_SIGNAL", dedupeKey: "b2b-hotel", sourceQuality: "LOW_CONFIDENCE", evidenceRefs: [] }),
    ]);
    expect(r.clusters.length).toBe(1);
    expect(r.topCluster!.sourceSignalCount).toBe(3);
    expect(r.topCluster!.duplicateCount).toBe(2);
    // Low-quality duplicates must not manufacture a high-quality opportunity.
    expect(r.topOpportunity!.opportunityQuality).not.toBe("HIGH");
  });
  it("18. every non-rejected candidate has a next-action owner and visible negative reasons", () => {
    const r = build([row({ hasUnitEconomics: false })]);
    const top = r.topOpportunity!;
    expect(["OWNER", "MANAGER", "STAFF", "OPSIQ_DRAFT", "EXTERNAL_ADVISOR", "NO_ACTION"]).toContain(top.nextActionOwner);
    expect(top.negativeReasons).toContain("MISSING_UNIT_ECONOMICS");
  });
  it("19. a repeated blocker across signals produces a capability recommendation", () => {
    const r = build([
      row({ rawSignalType: "B2B_DEMAND_SIGNAL", dedupeKey: "a", hasUnitEconomics: false }),
      row({ rawSignalType: "PRICING_GAP", dedupeKey: "b", hasUnitEconomics: false }),
    ]);
    expect(r.capabilityRecommendations.some((c) => /unit economics/i.test(c))).toBe(true);
  });
  it("20. the cockpit surfaces one top opportunity + one top cluster (no raw spam)", () => {
    const r = build([row({ dedupeKey: "x" }), row({ dedupeKey: "y" }), row({ dedupeKey: "z" })]);
    expect(r.topOpportunity).not.toBeNull();
    expect(r.topCluster).not.toBeNull();
    expect(r.summary.rawSignals).toBe(3);
  });
});

describe("Opportunity Operating Layer — hard governance guarantees", () => {
  it("21. no hidden numeric score, no win %, no profit guarantee, no fabricated money", () => {
    const r = build([
      row({ rawSignalType: "GOVERNMENT_TENDER", eligibilityRequirements: "known", deadlineAt: new Date(NOW + 15 * DAY) }),
      row({ rawSignalType: "B2B_DEMAND_SIGNAL", dedupeKey: "b2b" }),
    ]);
    const json = JSON.stringify(r).toLowerCase();
    expect(json).not.toMatch(/\bscore\b/);
    expect(json).not.toMatch(/\d\s?%/);
    expect(json).not.toMatch(/win probability|likely to win|guaranteed|profit guarantee|roi of|ready to scale/);
    expect(json).not.toMatch(/[$£€]\s?\d/);
    expect(json).not.toMatch(/\b(fraud|negligence|firing|payroll|discipline)\b/);
  });
  it("22. no tender is ever auto-submittable and every candidate requires validation before scale", () => {
    const r = build([row({ rawSignalType: "GOVERNMENT_TENDER", eligibilityRequirements: "known", requiredDocuments: ["a"], hasUnitEconomics: true, tenderOrProcurementValue: 10, complianceRequirements: "known", cashExposureBand: "LOW", deadlineAt: new Date(NOW + 30 * DAY) })]);
    expect(r.topOpportunity!.tenderReadiness!.submissionAllowed).toBe(false);
    expect(r.opportunities.every((o) => o.validationRequired === true)).toBe(true);
    // Even a fully-known tender only reaches PREPARE_BID_DRAFT (a draft, not a submission).
    expect(r.topOpportunity!.tenderReadiness!.bidDecision).toBe("PREPARE_BID_DRAFT");
  });
  it("23. an empty workspace fabricates nothing", () => {
    const r = build([]);
    expect(r.topOpportunity).toBeNull();
    expect(r.opportunities).toHaveLength(0);
    expect(r.summary.rawSignals).toBe(0);
  });
});
