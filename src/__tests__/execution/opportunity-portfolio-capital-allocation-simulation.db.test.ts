/**
 * Opportunity Portfolio / Capital Allocation Engine — real-business DB simulation (laundry) + scaling-gate proof.
 *
 * DB-backed: Sparkle Laundry (workspace `wsP`) with a recurring complaint pattern → getOwnerNowView derives a
 * retention candidate whose validation has NOT run, so the portfolio withholds capital and routes it to
 * validate/collect-first (never scale); a clean workspace allocates nothing.
 *
 * Scaling-gate proof: the same file drives the pure allocator over candidates with injected validation
 * statuses — proving that only a PASSED validation (with a clear cash/capacity/legal picture) can reach
 * DO_NOW / SCALE_CANDIDATE, that a FAILED validation is KILLed, that a passed-but-cash-blocked candidate is
 * held for owner review, and that capital-at-risk is a band (never fabricated money). Requires TEST_WITH_DB=true.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { getOwnerNowView } from "@/services/owner-guidance/owner-now-view.service";
import { buildOpportunityPortfolio } from "@/domain/owner-mode/opportunity-portfolio-capital-allocation";
import type { ExternalOpportunityCandidate } from "@/domain/owner-mode/external-opportunity-intelligence";
import type { OpportunityValidationAnalysis, ValidationStatus, ValidationExperiment } from "@/domain/owner-mode/opportunity-validation-experiment-engine";

const owner = randomUUID();
const mgr = randomUUID();
const staff = randomUUID();
const wsP = randomUUID();
const wsClean = randomUUID();
const bizP = randomUUID();
const NOW = Date.now();
const H = 3_600_000;
const NO_FRAUD = /\b(fraud|theft|thief|negligent|negligence|lazy|dishonest)\b/i;
const NO_HR = /\b(fire|fired|firing|terminate|termination|payroll|salary|docking|discipline|disciplinary|punish)\b/i;

const acceptedProof = async (id: string, ago: number) => {
  await db.proof.create({ data: {
    id, workspaceId: wsP, businessId: bizP, taskId: randomUUID(), proofType: "wash", status: "ACCEPTED",
    submittedByUserId: staff, reviewedByUserId: mgr, reviewedAt: new Date(NOW - ago * H),
    submittedAt: new Date(NOW - (ago + 1) * H), createdAt: new Date(NOW - (ago + 2) * H), updatedAt: new Date(NOW - ago * H),
  } });
};
const opEvent = async (eventType: string, category: string, proofId: string, ago: number, severity = "MEDIUM") => {
  await db.operationalEvent.create({ data: {
    id: randomUUID(), workspaceId: wsP, businessId: bizP, eventType, category, severity, status: "OPEN",
    source: "customer_reported", description: `${category} ${eventType}`, relatedProofId: proofId,
    occurredAt: new Date(NOW - ago * H), createdAt: new Date(NOW - ago * H), updatedAt: new Date(NOW - ago * H),
  } });
};

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] Opportunity Portfolio / Capital Allocation (laundry)", () => {
  const p1 = randomUUID(), p2 = randomUUID(), p3 = randomUUID();

  beforeAll(async () => {
    for (const [id, nm] of [[owner, "Owner"], [mgr, "Mgr"], [staff, "Staff"]] as const) {
      await db.user.create({ data: { id, email: `opc-${id}@laundry.test`, name: nm, isActive: true, updatedAt: new Date(NOW) } });
    }
    for (const id of [wsP, wsClean]) {
      await db.workspace.create({ data: { id, name: `WS ${id.slice(0, 8)}`, slug: `opc-${id.slice(0, 8)}`, createdBy: owner } });
    }
    await db.clientAccount.create({ data: { id: wsP, workspaceId: wsP, name: "Sparkle Laundry Client", updatedAt: new Date(NOW) } });
    await db.ownerBusiness.create({ data: { id: bizP, workspaceId: wsP, name: "Sparkle Laundry", businessType: "laundry", updatedAt: new Date(NOW) } });

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
    await db.ownerGuidanceSnapshot.deleteMany({ where: { workspaceId: { in: [wsP, wsClean] } } });
    await db.operationalEvent.deleteMany({ where: { workspaceId: { in: [wsP, wsClean] } } });
    await db.auditEvent.deleteMany({ where: { workspaceId: wsP } });
    await db.proof.deleteMany({ where: { workspaceId: { in: [wsP, wsClean] } } });
    await db.ownerBusiness.deleteMany({ where: { id: bizP } });
    await db.clientAccount.deleteMany({ where: { id: wsP } });
    await db.workspace.deleteMany({ where: { id: { in: [wsP, wsClean] } } });
    await db.user.deleteMany({ where: { id: { in: [owner, mgr, staff] } } });
  });

  it("[db] withholds capital from an unvalidated candidate; scaling is blocked until validation passes", async () => {
    const out = await getOwnerNowView(wsP, bizP);
    const port = out.opportunityPortfolio;
    expect(port).not.toBeNull();
    expect(port!.topItem).not.toBeNull();
    const top = port!.topItem!;
    expect(top.workspaceId).toBe(wsP);
    // Nothing is validated in a live derivation → no scaling, capital held for validate/collect.
    expect(["NEEDS_DATA", "VALIDATE_CHEAPLY", "OWNER_REVIEW_REQUIRED"]).toContain(top.portfolioDecision);
    expect(top.scaleBlockedReason).not.toBeNull();
    expect(port!.summary.scaleCandidates).toBe(0);
    expect(port!.summary.doNow).toBe(0);
    const json = JSON.stringify(port).toLowerCase();
    expect(json).not.toMatch(NO_FRAUD);
    expect(json).not.toMatch(NO_HR);
    expect(json).not.toMatch(/hidden\s*score/);
    expect(json).not.toMatch(/guaranteed|profit guarantee|scale now/);
    expect(json).not.toMatch(/[$£€]\s?\d/);
  });

  it("[db] a clean workspace allocates no capital and leaks no evidence", async () => {
    const out = await getOwnerNowView(wsClean);
    const port = out.opportunityPortfolio;
    if (port) { expect(port.items).toHaveLength(0); expect(port.topItem).toBeNull(); }
    expect(JSON.stringify(port)).not.toContain(p1);
  });

  it("[db] the scaling gate: only a PASSED validation can scale; FAILED is killed; cash blocks a passed item", () => {
    const cand = (over: Partial<ExternalOpportunityCandidate>): ExternalOpportunityCandidate => ({
      workspaceId: wsP, opportunityType: "NEW_SERVICE", signalSourceType: "SERVICE_GAP", sourceEvidenceSummary: "e",
      sourceRefs: ["r1"], customerPainPoint: "p", targetCustomerSegment: "seg", expectedValueHypothesis: "h",
      confidence: "MEDIUM", missingData: [], cashRisk: "LOW", ownerWorkloadRisk: "LOW", operationalFit: "STRONG",
      capabilityFit: "MODERATE", localFeasibility: "STRONG", legalOrComplianceRisk: "LOW", validationCostEstimate: null,
      validationRequired: true, recommendedNextStep: "VALIDATE_CHEAPLY", approvalLevel: "MANAGER",
      relatedCashProfitSignal: null, relatedCapabilityGap: null, systemCapabilityRecommendation: null,
      relatedConstraint: null, relatedSLO: null, riskIfIgnored: "r", evaluatedAt: new Date(NOW).toISOString(), ...over,
    });
    const exp = (status: ValidationStatus, over: Partial<ValidationExperiment>): ValidationExperiment => ({
      experimentId: "exp", workspaceId: wsP, opportunityType: "NEW_SERVICE", signalSourceType: "SERVICE_GAP",
      experimentType: "CUSTOMER_INTEREST_TEST", hypothesis: "h", riskiestAssumption: "a", method: "m", successMetric: "s",
      successThreshold: "st", failureMetric: "f", failureThreshold: "ft", stopLossRule: "abort", costCap: null,
      ownerTimeCapMinutes: 90, durationDays: 5, sampleSizeTarget: 10, dataToCollect: [], requiresOwnerApproval: false,
      approvalLevel: "MANAGER", validationStatus: status, cheaperAlternativeConsidered: "c", doNotScaleNote: "n",
      confidence: "MEDIUM", ...over,
    });
    const passed = cand({ signalSourceType: "SERVICE_GAP", opportunityType: "NEW_SERVICE", cashRisk: "LOW", ownerWorkloadRisk: "LOW" });
    const failed = cand({ signalSourceType: "COMPETITOR_REVIEW_GAP", opportunityType: "MARKETING_CHANNEL" });
    const passedButCash = cand({ signalSourceType: "B2B_DEMAND_SIGNAL", opportunityType: "B2B_OFFER", cashRisk: "HIGH" });
    const analysis: OpportunityValidationAnalysis = {
      workspaceId: wsP,
      experiments: [
        exp("PASSED", { signalSourceType: "SERVICE_GAP", opportunityType: "NEW_SERVICE" }),
        exp("FAILED", { signalSourceType: "COMPETITOR_REVIEW_GAP", opportunityType: "MARKETING_CHANNEL" }),
        exp("PASSED", { signalSourceType: "B2B_DEMAND_SIGNAL", opportunityType: "B2B_OFFER" }),
      ],
      topExperiment: null, deferred: [],
      summary: { candidatesConsidered: 3, experimentsDesigned: 3, deferred: 0, dataCollectionOnly: 0, ownerApprovalRequired: 0 },
      evaluatedAt: new Date(NOW).toISOString(),
    };
    const port = buildOpportunityPortfolio([passed, failed, passedButCash], analysis, { cashProfitRiskActive: false, capabilityGapPresent: false }, wsP, new Date(NOW).toISOString());
    const byType = (t: string) => port.items.find((i) => i.opportunityType === t)!;
    expect(byType("NEW_SERVICE").portfolioDecision).toBe("DO_NOW"); // passed + low risk → act now
    expect(byType("NEW_SERVICE").scaleBlockedReason).toBeNull();
    expect(byType("MARKETING_CHANNEL").portfolioDecision).toBe("KILL"); // failed → stop
    expect(byType("B2B_OFFER").portfolioDecision).toBe("OWNER_REVIEW_REQUIRED"); // passed but cash blocks scaling
    expect(byType("B2B_OFFER").scaleBlockedReason).toMatch(/cash/i);
    // Capital is always a band, never a fabricated figure.
    expect(port.items.every((i) => ["NONE", "LOW", "MEDIUM", "HIGH", "UNKNOWN"].includes(i.capitalAtRiskBand))).toBe(true);
    expect(port.summary.doNow).toBe(1);
    expect(port.summary.killed).toBe(1);
  });
});
