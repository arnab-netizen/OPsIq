/**
 * Validation Outcome Persistence — real-business DB simulation (laundry).
 *
 * Proves the live loop against real Postgres: a real B2B opportunity is submitted (PASS 10 intake) and
 * promoted to a portfolio candidate; with NO recorded outcome the live portfolio cannot scale; recording a
 * PASSED outcome with cost + margin evidence makes getOwnerNowView's portfolio a SCALE_CANDIDATE (owner
 * approval); re-recording a stop-loss result flips it to KILL; workspace isolation holds and a clean
 * workspace fabricates nothing; re-recording is idempotent. Requires TEST_WITH_DB=true.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { getOwnerNowView } from "@/services/owner-guidance/owner-now-view.service";
import { submitExternalOpportunitySignal, type IntakeDb, type IntakeDeps } from "@/services/owner-mode/external-opportunity-intake.service";
import { recordValidationOutcome, type OutcomeDb, type OutcomeDeps } from "@/services/owner-mode/validation-outcome.service";
import type { ValidationOutcomeSubmission } from "@/domain/owner-mode/validation-outcome";

const owner = randomUUID();
const wsL = randomUUID();
const wsClean = randomUUID();
const bizL = randomUUID();
const NOW = Date.now();
const OPP_KEY = "B2B_DEMAND_SIGNAL:B2B_OFFER";
const intakeDeps: IntakeDeps = { db: db as unknown as IntakeDb, uuid: () => randomUUID(), now: () => new Date() };
const outcomeDeps: OutcomeDeps = { db: db as unknown as OutcomeDb, uuid: () => randomUUID(), now: () => new Date() };
const record = (submission: ValidationOutcomeSubmission) => recordValidationOutcome({ workspaceId: wsL, actorId: owner, actorRole: "owner", submission }, outcomeDeps);

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] Validation Outcome Persistence (laundry)", () => {
  beforeAll(async () => {
    await db.user.create({ data: { id: owner, email: `vo-${owner}@laundry.test`, name: "Owner", isActive: true, updatedAt: new Date(NOW) } });
    for (const id of [wsL, wsClean]) {
      await db.workspace.create({ data: { id, name: `WS ${id.slice(0, 8)}`, slug: `vo-${id.slice(0, 8)}`, createdBy: owner } });
    }
    await db.clientAccount.create({ data: { id: wsL, workspaceId: wsL, name: "Sparkle Laundry Client", updatedAt: new Date(NOW) } });
    await db.ownerBusiness.create({ data: { id: bizL, workspaceId: wsL, name: "Sparkle Laundry", businessType: "laundry", updatedAt: new Date(NOW) } });
    // Submit a B2B opportunity that promotes to a portfolio candidate (evidence + need + unit economics),
    // with HIGH owner-workload so a PASSED validation routes to SCALE_CANDIDATE (owner approval), not DO_NOW.
    await submitExternalOpportunitySignal({
      workspaceId: wsL, actorId: owner, actorRole: "owner",
      submission: {
        rawSignalType: "B2B_DEMAND_SIGNAL", rawDescription: "A hotel chain wants weekly linen laundering",
        extractedBusinessNeed: "weekly hotel linen contract", targetCustomerSegment: "hotels", locationContext: "local",
        sourceQuality: "OWNER_OBSERVED", evidenceRefs: ["email-thread"], hasUnitEconomics: true,
        relevanceBand: "STRONG", cashExposureBand: "LOW", ownerWorkloadBand: "HIGH",
      },
    }, intakeDeps);
  });

  afterAll(async () => {
    await db.opportunityValidationOutcome.deleteMany({ where: { workspaceId: { in: [wsL, wsClean] } } });
    await db.externalOpportunitySignal.deleteMany({ where: { workspaceId: { in: [wsL, wsClean] } } });
    await db.ownerGuidanceSnapshot.deleteMany({ where: { workspaceId: { in: [wsL, wsClean] } } });
    await db.auditEvent.deleteMany({ where: { workspaceId: { in: [wsL, wsClean] } } });
    await db.ownerBusiness.deleteMany({ where: { id: bizL } });
    await db.clientAccount.deleteMany({ where: { id: wsL } });
    await db.workspace.deleteMany({ where: { id: { in: [wsL, wsClean] } } });
    await db.user.deleteMany({ where: { id: owner } });
  });

  it("[db] with no recorded outcome the promoted candidate cannot scale (validation NOT_STARTED)", async () => {
    const out = await getOwnerNowView(wsL, bizL);
    expect(out.opportunityPortfolio).not.toBeNull();
    const top = out.opportunityPortfolio!.topItem!;
    expect(["VALIDATE_CHEAPLY", "NEEDS_DATA", "OWNER_REVIEW_REQUIRED"]).toContain(top.portfolioDecision);
    expect(out.opportunityPortfolio!.summary.scaleCandidates).toBe(0);
    expect(out.opportunityValidationOutcomes).toBeNull();
  });

  it("[db] a recorded PASSED outcome (cost + margin) makes the live portfolio a SCALE_CANDIDATE + audits", async () => {
    const r = await record({ experimentKey: "exp-b2b", opportunityKey: OPP_KEY, status: "COMPLETED", result: "PASSED", actualCost: 60, marginEvidence: "healthy gross margin measured on the trial batch", conversions: 2, successMetricResult: "2 of 6 hotels agreed to a trial" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.nextRecommendedDecision).toBe("SCALE_CANDIDATE");
    const audits = await db.auditEvent.findMany({ where: { workspaceId: wsL, eventName: "owner.opportunity_validation_outcome_recorded" } });
    expect(audits.length).toBeGreaterThanOrEqual(1);
    const out = await getOwnerNowView(wsL, bizL);
    expect(out.opportunityPortfolio!.topItem!.portfolioDecision).toBe("SCALE_CANDIDATE");
    expect(out.opportunityPortfolio!.topItem!.requiresOwnerApproval).toBe(true);
    expect(out.opportunityValidationOutcomes).not.toBeNull();
    expect(out.opportunityValidationOutcomes![0].validationStatus).toBe("PASSED");
    const json = JSON.stringify(out.opportunityValidationOutcomes).toLowerCase();
    expect(json).not.toMatch(/guaranteed|profit guarantee|win probability|ready to scale/);
    expect(json).not.toMatch(/[$£€]\s?\d/);
  });

  it("[db] re-recording a stop-loss result flips the live portfolio to KILL", async () => {
    const r = await record({ experimentKey: "exp-b2b", opportunityKey: OPP_KEY, status: "COMPLETED", result: "PASSED", conversions: 2, actualCost: 60, marginEvidence: "ok", stopLossTriggered: true });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.result).toBe("FAILED");
    const out = await getOwnerNowView(wsL, bizL);
    expect(out.opportunityPortfolio!.topItem!.portfolioDecision).toBe("KILL");
  });

  it("[db] an identical re-record is idempotent", async () => {
    const before = await db.opportunityValidationOutcome.count({ where: { workspaceId: wsL } });
    const r = await record({ experimentKey: "exp-b2b", opportunityKey: OPP_KEY, status: "COMPLETED", result: "PASSED", conversions: 2, actualCost: 60, marginEvidence: "ok", stopLossTriggered: true });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.deduped).toBe(true);
    const after = await db.opportunityValidationOutcome.count({ where: { workspaceId: wsL } });
    expect(after).toBe(before);
  });

  it("[db] workspace isolation: a clean workspace fabricates no outcomes", async () => {
    const out = await getOwnerNowView(wsClean);
    expect(out.opportunityValidationOutcomes).toBeNull();
    const rows = await db.opportunityValidationOutcome.findMany({ where: { workspaceId: wsClean } });
    expect(rows).toHaveLength(0);
  });
});
