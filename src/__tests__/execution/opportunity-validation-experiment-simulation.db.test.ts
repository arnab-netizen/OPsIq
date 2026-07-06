/**
 * Opportunity Validation Experiment Engine — real-business DB simulation (laundry) + multi-shape plan proof.
 *
 * DB-backed: Sparkle Laundry (workspace `wsV`) with a recurring complaint pattern → getOwnerNowView derives a
 * retention opportunity candidate whose economics are unknown, and the validation engine designs a bounded,
 * falsifiable experiment for it (never ready-to-scale, no fabricated money, owner-approval where material);
 * a clean workspace designs nothing.
 *
 * Multi-shape plan: the same file drives the pure planner over several promoted candidates (a cheap B2B
 * outreach, a data-first candidate with unknown economics, a parked candidate) proving experiment-type
 * selection, hard cost/time/sample caps + stop-loss on every experiment, data-first-before-spend, deferral of
 * parked candidates, and the cockpit-only-top-experiment rule. Requires TEST_WITH_DB=true.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { getOwnerNowView } from "@/services/owner-guidance/owner-now-view.service";
import { buildOpportunityValidationPlan } from "@/domain/owner-mode/opportunity-validation-experiment-engine";
import type { ExternalOpportunityCandidate } from "@/domain/owner-mode/external-opportunity-intelligence";

const owner = randomUUID();
const mgr = randomUUID();
const staff = randomUUID();
const wsV = randomUUID();
const wsClean = randomUUID();
const bizV = randomUUID();
const NOW = Date.now();
const H = 3_600_000;
const NO_FRAUD = /\b(fraud|theft|thief|negligent|negligence|lazy|dishonest)\b/i;
const NO_HR = /\b(fire|fired|firing|terminate|termination|payroll|salary|docking|discipline|disciplinary|punish)\b/i;

const acceptedProof = async (id: string, ago: number) => {
  await db.proof.create({ data: {
    id, workspaceId: wsV, businessId: bizV, taskId: randomUUID(), proofType: "wash", status: "ACCEPTED",
    submittedByUserId: staff, reviewedByUserId: mgr, reviewedAt: new Date(NOW - ago * H),
    submittedAt: new Date(NOW - (ago + 1) * H), createdAt: new Date(NOW - (ago + 2) * H), updatedAt: new Date(NOW - ago * H),
  } });
};
const opEvent = async (eventType: string, category: string, proofId: string, ago: number, severity = "MEDIUM") => {
  await db.operationalEvent.create({ data: {
    id: randomUUID(), workspaceId: wsV, businessId: bizV, eventType, category, severity, status: "OPEN",
    source: "customer_reported", description: `${category} ${eventType}`, relatedProofId: proofId,
    occurredAt: new Date(NOW - ago * H), createdAt: new Date(NOW - ago * H), updatedAt: new Date(NOW - ago * H),
  } });
};

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] Opportunity Validation Experiment Engine (laundry)", () => {
  const p1 = randomUUID(), p2 = randomUUID(), p3 = randomUUID();

  beforeAll(async () => {
    for (const [id, nm] of [[owner, "Owner"], [mgr, "Mgr"], [staff, "Staff"]] as const) {
      await db.user.create({ data: { id, email: `ove-${id}@laundry.test`, name: nm, isActive: true, updatedAt: new Date(NOW) } });
    }
    for (const id of [wsV, wsClean]) {
      await db.workspace.create({ data: { id, name: `WS ${id.slice(0, 8)}`, slug: `ove-${id.slice(0, 8)}`, createdBy: owner } });
    }
    await db.clientAccount.create({ data: { id: wsV, workspaceId: wsV, name: "Sparkle Laundry Client", updatedAt: new Date(NOW) } });
    await db.ownerBusiness.create({ data: { id: bizV, workspaceId: wsV, name: "Sparkle Laundry", businessType: "laundry", updatedAt: new Date(NOW) } });

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
    await db.ownerGuidanceSnapshot.deleteMany({ where: { workspaceId: { in: [wsV, wsClean] } } });
    await db.operationalEvent.deleteMany({ where: { workspaceId: { in: [wsV, wsClean] } } });
    await db.auditEvent.deleteMany({ where: { workspaceId: wsV } });
    await db.proof.deleteMany({ where: { workspaceId: { in: [wsV, wsClean] } } });
    await db.ownerBusiness.deleteMany({ where: { id: bizV } });
    await db.clientAccount.deleteMany({ where: { id: wsV } });
    await db.workspace.deleteMany({ where: { id: { in: [wsV, wsClean] } } });
    await db.user.deleteMany({ where: { id: { in: [owner, mgr, staff] } } });
  });

  it("[db] designs a bounded, falsifiable experiment for the retention candidate; never ready-to-scale", async () => {
    const out = await getOwnerNowView(wsV, bizV);
    const val = out.opportunityValidation;
    expect(val).not.toBeNull();
    expect(val!.topExperiment).not.toBeNull();
    const e = val!.topExperiment!;
    expect(e.workspaceId).toBe(wsV);
    // Unknown per-customer economics on the derived candidate → collect data first, no spend.
    expect(e.experimentType).toBe("DATA_COLLECTION_ONLY");
    expect(e.costCap).toBe(0);
    // Falsifiable + bounded + no-scale.
    expect(e.successThreshold.length).toBeGreaterThan(0);
    expect(e.failureThreshold.length).toBeGreaterThan(0);
    expect(e.stopLossRule.length).toBeGreaterThan(0);
    expect(e.ownerTimeCapMinutes).toBeGreaterThan(0);
    expect(e.validationStatus).toBe("NOT_STARTED");
    const json = JSON.stringify(val).toLowerCase();
    expect(json).not.toMatch(NO_FRAUD);
    expect(json).not.toMatch(NO_HR);
    expect(json).not.toMatch(/hidden\s*score/);
    expect(json).not.toMatch(/guaranteed|profit guarantee|ready to scale/);
    expect(json).not.toMatch(/[$£€]\s?\d/);
  });

  it("[db] a clean workspace designs no experiment and leaks no evidence", async () => {
    const out = await getOwnerNowView(wsClean);
    const val = out.opportunityValidation;
    if (val) { expect(val.experiments).toHaveLength(0); expect(val.topExperiment).toBeNull(); }
    expect(JSON.stringify(val)).not.toContain(p1);
  });

  it("[db] the full multi-shape plan: type selection, caps, data-first, deferral over several candidates", () => {
    const candidate = (over: Partial<ExternalOpportunityCandidate>): ExternalOpportunityCandidate => ({
      workspaceId: wsV, opportunityType: "NEW_SERVICE", signalSourceType: "SERVICE_GAP",
      sourceEvidenceSummary: "e", sourceRefs: ["r1"], customerPainPoint: "p", targetCustomerSegment: "seg",
      expectedValueHypothesis: "h", confidence: "MEDIUM", missingData: [], cashRisk: "LOW", ownerWorkloadRisk: "LOW",
      operationalFit: "MODERATE", capabilityFit: "MODERATE", localFeasibility: "STRONG", legalOrComplianceRisk: "LOW",
      validationCostEstimate: null, validationRequired: true, recommendedNextStep: "VALIDATE_CHEAPLY",
      approvalLevel: "MANAGER", relatedCashProfitSignal: null, relatedCapabilityGap: null,
      systemCapabilityRecommendation: null, relatedConstraint: null, relatedSLO: null, riskIfIgnored: "r",
      evaluatedAt: new Date(NOW).toISOString(), ...over,
    });
    const plan = buildOpportunityValidationPlan(
      [
        candidate({ opportunityType: "B2B_OFFER", recommendedNextStep: "VALIDATE_CHEAPLY" }),
        candidate({ opportunityType: "NEW_SERVICE", recommendedNextStep: "COLLECT_COST_DATA", missingData: ["unit economics"] }),
        candidate({ opportunityType: "MARKETING_CHANNEL", recommendedNextStep: "PARK" }),
      ],
      { cashProfitRiskActive: false, capabilityGapPresent: false },
      wsV,
      new Date(NOW).toISOString(),
    );
    // 3 candidates → 2 experiments (one deferred as PARKED).
    expect(plan.summary.candidatesConsidered).toBe(3);
    expect(plan.summary.experimentsDesigned).toBe(2);
    expect(plan.summary.deferred).toBe(1);
    expect(plan.summary.dataCollectionOnly).toBe(1);
    // Every experiment is bounded + falsifiable + no-scale.
    expect(plan.experiments.every((e) => e.ownerTimeCapMinutes > 0 && e.durationDays > 0 && e.sampleSizeTarget > 0)).toBe(true);
    expect(plan.experiments.every((e) => e.successThreshold.length > 0 && e.failureThreshold.length > 0 && e.stopLossRule.length > 0)).toBe(true);
    expect(plan.experiments.every((e) => e.doNotScaleNote.length > 0)).toBe(true);
    // The B2B outreach is a real runnable probe; the data-first candidate collects data before any spend.
    const types = plan.experiments.map((e) => e.experimentType);
    expect(types).toContain("B2B_OUTREACH_TEST");
    expect(types).toContain("DATA_COLLECTION_ONLY");
    expect(plan.experiments.find((e) => e.experimentType === "DATA_COLLECTION_ONLY")!.costCap).toBe(0);
    // Cockpit exposes one top experiment; the full list is retained.
    expect(plan.topExperiment).not.toBeNull();
    expect(plan.experiments.length).toBe(2);
  });
});
