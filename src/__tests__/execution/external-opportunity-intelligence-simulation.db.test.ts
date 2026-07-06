/**
 * External Opportunity Intelligence v1 — real-business DB simulation (laundry) + multi-family flow proof.
 *
 * DB-backed: Sparkle Laundry (workspace `wsL`) with a recurring complaint pattern → getOwnerNowView surfaces
 * an evidence-backed retention opportunity candidate (owner-visible), gated by the capability gap (missing
 * unit economics) and never ready-to-scale; a clean workspace fabricates nothing.
 *
 * Multi-family flow: the same file drives the pure loop over FOUR external signal families — competitor
 * review gap, B2B/institutional demand, a government tender, and a grant/manual observation — proving raw
 * intake, dedupe, classification, tender eligibility/cost/compliance/cash screening (never auto-submit,
 * never ready-to-bid unless everything is known), cash/profit + capability + approval guardrails, and the
 * cockpit-only-top-candidate rule. Requires TEST_WITH_DB=true.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { getOwnerNowView } from "@/services/owner-guidance/owner-now-view.service";
import {
  buildExternalOpportunityIntelligence,
  type RawOpportunitySignal,
} from "@/domain/owner-mode/external-opportunity-intelligence";

const owner = randomUUID();
const mgr = randomUUID();
const staff = randomUUID();
const wsL = randomUUID();
const wsClean = randomUUID();
const bizL = randomUUID();
const NOW = Date.now();
const H = 3_600_000;
const NO_FRAUD = /\b(fraud|theft|thief|negligent|negligence|lazy|dishonest)\b/i;
const NO_HR = /\b(fire|fired|firing|terminate|termination|payroll|salary|docking|discipline|disciplinary|punish)\b/i;

const acceptedProof = async (id: string, ago: number) => {
  await db.proof.create({ data: {
    id, workspaceId: wsL, businessId: bizL, taskId: randomUUID(), proofType: "wash", status: "ACCEPTED",
    submittedByUserId: staff, reviewedByUserId: mgr, reviewedAt: new Date(NOW - ago * H),
    submittedAt: new Date(NOW - (ago + 1) * H), createdAt: new Date(NOW - (ago + 2) * H), updatedAt: new Date(NOW - ago * H),
  } });
};
const opEvent = async (eventType: string, category: string, proofId: string, ago: number, severity = "MEDIUM") => {
  await db.operationalEvent.create({ data: {
    id: randomUUID(), workspaceId: wsL, businessId: bizL, eventType, category, severity, status: "OPEN",
    source: "customer_reported", description: `${category} ${eventType}`, relatedProofId: proofId,
    occurredAt: new Date(NOW - ago * H), createdAt: new Date(NOW - ago * H), updatedAt: new Date(NOW - ago * H),
  } });
};

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] External Opportunity Intelligence v1 (laundry)", () => {
  const p1 = randomUUID(), p2 = randomUUID(), p3 = randomUUID();

  beforeAll(async () => {
    for (const [id, nm] of [[owner, "Owner"], [mgr, "Mgr"], [staff, "Staff"]] as const) {
      await db.user.create({ data: { id, email: `eoi-${id}@laundry.test`, name: nm, isActive: true, updatedAt: new Date(NOW) } });
    }
    for (const id of [wsL, wsClean]) {
      await db.workspace.create({ data: { id, name: `WS ${id.slice(0, 8)}`, slug: `eoi-${id.slice(0, 8)}`, createdBy: owner } });
    }
    await db.clientAccount.create({ data: { id: wsL, workspaceId: wsL, name: "Sparkle Laundry Client", updatedAt: new Date(NOW) } });
    await db.ownerBusiness.create({ data: { id: bizL, workspaceId: wsL, name: "Sparkle Laundry", businessType: "laundry", updatedAt: new Date(NOW) } });

    await acceptedProof(p1, 8);
    await acceptedProof(p2, 7);
    await acceptedProof(p3, 6);
    await opEvent("COMPLAINT", "quality", p1, 5, "HIGH");
    await opEvent("COMPLAINT", "quality", p2, 4);
    await opEvent("REWORK", "quality", p1, 5);
    await opEvent("REWORK", "quality", p2, 4);
    await opEvent("REWORK", "quality", p3, 3);
  });

  afterAll(async () => {
    await db.ownerGuidanceSnapshot.deleteMany({ where: { workspaceId: { in: [wsL, wsClean] } } });
    await db.operationalEvent.deleteMany({ where: { workspaceId: { in: [wsL, wsClean] } } });
    await db.auditEvent.deleteMany({ where: { workspaceId: wsL } });
    await db.proof.deleteMany({ where: { workspaceId: { in: [wsL, wsClean] } } });
    await db.ownerBusiness.deleteMany({ where: { id: bizL } });
    await db.clientAccount.deleteMany({ where: { id: wsL } });
    await db.workspace.deleteMany({ where: { id: { in: [wsL, wsClean] } } });
    await db.user.deleteMany({ where: { id: { in: [owner, mgr, staff] } } });
  });

  it("[db] surfaces an owner-visible retention opportunity, gated by the capability gap; never ready-to-scale", async () => {
    const out = await getOwnerNowView(wsL, bizL);
    const eoi = out.externalOpportunityIntelligence;
    expect(eoi).not.toBeNull();
    expect(eoi!.topCandidate).not.toBeNull();
    const c = eoi!.topCandidate!;
    expect(c.workspaceId).toBe(wsL);
    expect(c.validationRequired).toBe(true); // never ready-to-scale
    // Missing per-customer unit economics + an open capability gap → measured before scaling.
    expect(["NEEDS_CAPABILITY", "COLLECT_COST_DATA", "OWNER_REVIEW"]).toContain(c.recommendedNextStep);
    const json = JSON.stringify(eoi).toLowerCase();
    expect(json).not.toMatch(NO_FRAUD);
    expect(json).not.toMatch(NO_HR);
    expect(json).not.toMatch(/hidden\s*score/);
    expect(json).not.toMatch(/guaranteed|profit guarantee|ready to scale/);
    expect(json).not.toMatch(/[$£€]\s?\d/);
  });

  it("[db] a clean workspace fabricates no opportunity and leaks no evidence", async () => {
    const out = await getOwnerNowView(wsClean);
    const eoi = out.externalOpportunityIntelligence;
    if (eoi) { expect(eoi.candidates).toHaveLength(0); expect(eoi.topCandidate).toBeNull(); }
    expect(JSON.stringify(eoi)).not.toContain(p1);
  });

  it("[db] the full multi-family loop: intake, dedupe, tender screen, guardrails over 4 external families", () => {
    const base = (over: Partial<RawOpportunitySignal>): RawOpportunitySignal => ({
      signalId: "x", dedupeKey: "x", signalSourceType: "COMPETITOR_REVIEW_GAP", opportunityType: "NEW_SERVICE",
      sourceEvidenceSummary: "e", sourceRefs: ["r1"], customerPainPoint: "p", targetCustomerSegment: "seg",
      expectedValueHypothesis: "h", relevanceToBusiness: "STRONG", rawConfidence: "MEDIUM", cashRisk: "LOW",
      ownerWorkloadRisk: "LOW", operationalFit: "MODERATE", capabilityFit: "MODERATE", localFeasibility: "STRONG",
      legalOrComplianceRisk: "LOW", hasUnitEconomics: true, validationCostEstimate: null, missingData: [],
      relatedCashProfitSignal: null, relatedCapabilityGap: null, relatedConstraint: null, relatedSLO: null, ...over,
    });
    const signals: RawOpportunitySignal[] = [
      base({ signalId: "comp-1", dedupeKey: "comp", signalSourceType: "COMPETITOR_REVIEW_GAP" }),
      base({ signalId: "comp-2", dedupeKey: "comp", signalSourceType: "COMPETITOR_REVIEW_GAP" }), // duplicate
      base({ signalId: "b2b-1", dedupeKey: "b2b", signalSourceType: "B2B_DEMAND_SIGNAL", opportunityType: "B2B_OFFER", hasUnitEconomics: false }),
      base({ signalId: "tender-1", dedupeKey: "tender", signalSourceType: "GOVERNMENT_TENDER", opportunityType: "TENDER_BID",
        tender: { eligibility: "UNKNOWN", eligible: null, emdExposure: "UNKNOWN", paymentDelayRisk: "HIGH", performancePenaltyRisk: "MEDIUM",
          workingCapitalRequirement: "HIGH", compliance: "UNKNOWN", documentationBurden: "HIGH", capacityFit: "UNKNOWN", unitEconomics: "UNKNOWN", bidDeadlineDays: 15 } }),
      base({ signalId: "grant-1", dedupeKey: "grant", signalSourceType: "GRANT_OR_SCHEME", opportunityType: "OTHER", hasUnitEconomics: false, missingData: ["scheme eligibility"] }),
    ];
    const r = buildExternalOpportunityIntelligence({ signals, context: { cashProfitRiskActive: false, capabilityGapPresent: true } }, wsL, new Date(NOW).toISOString());

    // Dedupe: 5 raw → 1 duplicate collapsed.
    expect(r.summary.rawSignals).toBe(5);
    expect(r.summary.duplicatesCollapsed).toBe(1);
    // Tender screened separately, never auto-submitted, not ready-to-bid, owner approval required.
    expect(r.topTenderCandidate).not.toBeNull();
    expect(r.topTenderCandidate!.ownerApprovalRequired).toBe(true);
    expect(r.topTenderCandidate!.readyToBid).toBe(false);
    expect(["COLLECT_ELIGIBILITY_DATA", "OWNER_REVIEW_REQUIRED", "NEEDS_CAPABILITY"]).toContain(r.topTenderCandidate!.tenderDecision);
    // B2B with missing unit economics → capability gap surfaced; never ready-to-scale.
    expect(r.capabilityRecommendations.length).toBeGreaterThan(0);
    expect(r.candidates.every((c) => c.validationRequired === true)).toBe(true);
    // Cockpit only exposes the tops; the full classified list is retained for audit.
    expect(r.classifiedSignals.length).toBe(5);
    expect(r.topCandidate).not.toBeNull();
  });
});
