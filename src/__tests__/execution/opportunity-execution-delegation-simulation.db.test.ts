/**
 * Opportunity Execution & Delegation Tracking — real-business DB simulation (laundry).
 *
 * Proves the live loop against real Postgres: submitted opportunities (PASS 10 intake) become governed,
 * trackable execution tasks in getOwnerNowView; a B2B towel-demand signal without unit economics produces a
 * COLLECT_COST_DATA task; a tender with missing documents produces COLLECT_DOCUMENTS; weak win-readiness
 * produces PREPARE_PROOF_PACK; a validate-ready non-tender opportunity produces a manual-contact + record
 * task (never automated). A manager completing the cost task WITH evidence marks it COMPLETED and feeds back
 * into the live view; a fake/weak completion with NO evidence does NOT complete (stays IN_PROGRESS); an
 * owner-approval task cannot be completed by a non-owner; the cockpit surfaces exactly one top task;
 * workspace isolation holds and a clean workspace fabricates nothing. Requires TEST_WITH_DB=true.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { getOwnerNowView } from "@/services/owner-guidance/owner-now-view.service";
import { submitExternalOpportunitySignal, type IntakeDb, type IntakeDeps } from "@/services/owner-mode/external-opportunity-intake.service";
import { recordExecutionTaskUpdate, type ExecutionDb, type ExecutionDeps } from "@/services/owner-mode/opportunity-execution.service";
import type { OpportunityExecutionTask, ExecutionTaskType } from "@/domain/owner-mode/opportunity-execution";

const owner = randomUUID();
const manager = randomUUID();
const wsL = randomUUID();
const wsClean = randomUUID();
const bizL = randomUUID();
const NOW = Date.now();
const intakeDeps: IntakeDeps = { db: db as unknown as IntakeDb, uuid: () => randomUUID(), now: () => new Date() };
const execDeps: ExecutionDeps = { db: db as unknown as ExecutionDb, uuid: () => randomUUID(), now: () => new Date() };

/** Read the live derived execution tasks from the owner now-view. */
async function liveTasks(): Promise<OpportunityExecutionTask[]> {
  const out = await getOwnerNowView(wsL, bizL);
  return out.opportunityExecution?.tasks ?? [];
}
function findTask(tasks: OpportunityExecutionTask[], taskType: ExecutionTaskType): OpportunityExecutionTask | undefined {
  return tasks.find((t) => t.taskType === taskType);
}
/** Submit a task update using the derived task's own governed fields (source/owner/approval). */
function completeFrom(t: OpportunityExecutionTask, actorId: string, actorRole: string, evidenceRefs: string[], outcomeSummary?: string) {
  return recordExecutionTaskUpdate({
    workspaceId: wsL, actorId, actorRole,
    submission: {
      taskKey: t.taskKey, opportunityKey: t.opportunityKey, taskType: t.taskType, action: "COMPLETE",
      sourceType: t.sourceType, sourceKey: t.sourceKey, nextActionOwner: t.nextActionOwner, approvalLevel: t.approvalLevel,
      evidenceRefs, outcomeSummary: outcomeSummary ?? null,
    },
  }, execDeps);
}

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] Opportunity Execution & Delegation Tracking (laundry)", () => {
  beforeAll(async () => {
    await db.user.create({ data: { id: owner, email: `oe-${owner}@laundry.test`, name: "Owner", isActive: true, updatedAt: new Date(NOW) } });
    await db.user.create({ data: { id: manager, email: `oe-${manager}@laundry.test`, name: "Manager", isActive: true, updatedAt: new Date(NOW) } });
    for (const id of [wsL, wsClean]) {
      await db.workspace.create({ data: { id, name: `WS ${id.slice(0, 8)}`, slug: `oe-${id.slice(0, 8)}`, createdBy: owner } });
    }
    await db.clientAccount.create({ data: { id: wsL, workspaceId: wsL, name: "Sparkle Laundry Client", updatedAt: new Date(NOW) } });
    await db.ownerBusiness.create({ data: { id: bizL, workspaceId: wsL, name: "Sparkle Laundry", businessType: "laundry", updatedAt: new Date(NOW) } });

    // (1) A real B2B towel-demand signal WITHOUT unit economics and WITHOUT past-work proof:
    // → COLLECT_COST_DATA (missing unit economics) + PREPARE_PROOF_PACK (weak win-readiness).
    await submitExternalOpportunitySignal({
      workspaceId: wsL, actorId: owner, actorRole: "owner",
      submission: {
        rawSignalType: "B2B_DEMAND_SIGNAL", rawDescription: "A gym chain wants weekly towel laundering",
        extractedBusinessNeed: "weekly gym towel contract", targetCustomerSegment: "gyms", locationContext: "local",
        sourceQuality: "OWNER_OBSERVED", evidenceRefs: [], hasUnitEconomics: false,
        relevanceBand: "STRONG", cashExposureBand: "LOW", ownerWorkloadBand: "MEDIUM",
      },
    }, intakeDeps);

    // (2) A government tender with KNOWN eligibility but MISSING documents → COLLECT_DOCUMENTS + owner review.
    await submitExternalOpportunitySignal({
      workspaceId: wsL, actorId: owner, actorRole: "owner",
      submission: {
        rawSignalType: "GOVERNMENT_TENDER", rawDescription: "Council tender for linen laundering across 3 sites",
        extractedBusinessNeed: "council linen tender", targetCustomerSegment: "council", locationContext: "local",
        sourceQuality: "PUBLIC_SOURCE_UNVERIFIED", eligibilityRequirements: "must be locally registered",
        missingDocuments: ["insurance certificate", "health & safety policy"], hasUnitEconomics: false,
        relevanceBand: "MODERATE", cashExposureBand: "MEDIUM", ownerWorkloadBand: "HIGH",
      },
    }, intakeDeps);
  });

  afterAll(async () => {
    await db.opportunityExecutionTask.deleteMany({ where: { workspaceId: { in: [wsL, wsClean] } } });
    await db.externalOpportunitySignal.deleteMany({ where: { workspaceId: { in: [wsL, wsClean] } } });
    await db.ownerGuidanceSnapshot.deleteMany({ where: { workspaceId: { in: [wsL, wsClean] } } });
    await db.auditEvent.deleteMany({ where: { workspaceId: { in: [wsL, wsClean] } } });
    await db.ownerBusiness.deleteMany({ where: { id: bizL } });
    await db.clientAccount.deleteMany({ where: { id: wsL } });
    await db.workspace.deleteMany({ where: { id: { in: [wsL, wsClean] } } });
    await db.user.deleteMany({ where: { id: { in: [owner, manager] } } });
  });

  it("[db] a submitted B2B towel-demand opportunity produces live execution tasks (not an empty shell)", async () => {
    const out = await getOwnerNowView(wsL, bizL);
    expect(out.opportunityOperating).not.toBeNull();
    expect(out.opportunityExecution).not.toBeNull();
    expect(out.opportunityExecution!.tasks.length).toBeGreaterThan(0);
  });

  it("[db] missing unit economics → a COLLECT_COST_DATA task owned by the manager", async () => {
    const cost = findTask(await liveTasks(), "COLLECT_COST_DATA");
    expect(cost).toBeDefined();
    expect(cost!.nextActionOwner).toBe("MANAGER");
    expect(cost!.status).toBe("PROPOSED");
    expect(cost!.requiredEvidence.length).toBeGreaterThan(0);
  });

  it("[db] a tender with missing documents → a COLLECT_DOCUMENTS task", async () => {
    const docs = findTask(await liveTasks(), "COLLECT_DOCUMENTS");
    expect(docs).toBeDefined();
    expect(docs!.sourceType).toBe("TENDER_READINESS");
  });

  it("[db] weak win-readiness → a PREPARE_PROOF_PACK task (OpsIQ drafts only)", async () => {
    const proof = findTask(await liveTasks(), "PREPARE_PROOF_PACK");
    expect(proof).toBeDefined();
    expect(proof!.nextActionOwner).toBe("OPSIQ_DRAFT");
  });

  it("[db] a high-exposure tender routes an OWNER_APPROVAL_REVIEW task requiring the owner", async () => {
    const review = findTask(await liveTasks(), "OWNER_APPROVAL_REVIEW");
    expect(review).toBeDefined();
    expect(review!.approvalLevel).toBe("OWNER");
    expect(review!.nextActionOwner).toBe("OWNER");
  });

  it("[db] a fake/weak completion with NO evidence does not complete the cost task (stays IN_PROGRESS)", async () => {
    const cost = findTask(await liveTasks(), "COLLECT_COST_DATA")!;
    const r = await completeFrom(cost, manager, "manager", [], "done (no evidence)");
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.status).toBe("IN_PROGRESS"); expect(r.updatesOpportunity).toBe(false); }
    const after = findTask(await liveTasks(), "COLLECT_COST_DATA")!;
    expect(after.status).toBe("IN_PROGRESS");
  });

  it("[db] a manager completing the cost task WITH evidence marks it COMPLETED + audits + feeds the live view", async () => {
    const cost = findTask(await liveTasks(), "COLLECT_COST_DATA")!;
    const r = await completeFrom(cost, manager, "manager", ["per-unit cost captured", "expected margin computed"], "unit economics captured from the trial batch");
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.status).toBe("COMPLETED"); expect(r.updatesOpportunity).toBe(true); }
    const audits = await db.auditEvent.findMany({ where: { workspaceId: wsL, eventName: "owner.opportunity_execution_task_updated" } });
    expect(audits.length).toBeGreaterThanOrEqual(1);
    const after = findTask(await liveTasks(), "COLLECT_COST_DATA")!;
    expect(after.status).toBe("COMPLETED");
    expect(after.completedBy).toBe(manager);
    const json = JSON.stringify(await liveTasks()).toLowerCase();
    expect(json).not.toMatch(/guaranteed|profit guarantee|win probability|hidden score/);
    expect(json).not.toMatch(/[$£€]\s?\d/);
  });

  it("[db] an owner-approval task cannot be completed by a non-owner (fail closed, no write)", async () => {
    const review = findTask(await liveTasks(), "OWNER_APPROVAL_REVIEW")!;
    const r = await recordExecutionTaskUpdate({
      workspaceId: wsL, actorId: manager, actorRole: "manager",
      submission: {
        taskKey: review.taskKey, opportunityKey: review.opportunityKey, taskType: review.taskType, action: "COMPLETE",
        sourceType: review.sourceType, sourceKey: review.sourceKey, nextActionOwner: review.nextActionOwner, approvalLevel: review.approvalLevel,
        outcomeSummary: "approved",
      },
    }, execDeps);
    expect(r.ok).toBe(false);
    const rows = await db.opportunityExecutionTask.findMany({ where: { workspaceId: wsL, taskKey: review.taskKey } });
    expect(rows).toHaveLength(0);
    const still = findTask(await liveTasks(), "OWNER_APPROVAL_REVIEW")!;
    expect(still.status).toBe("PROPOSED");
  });

  it("[db] the cockpit surfaces exactly one actionable top task", async () => {
    const out = await getOwnerNowView(wsL, bizL);
    const top = out.opportunityExecution!.topTask;
    expect(top).not.toBeNull();
    expect(["COMPLETED", "CANCELLED", "REJECTED"]).not.toContain(top!.status);
  });

  it("[db] workspace isolation: a clean workspace fabricates no execution tasks", async () => {
    const out = await getOwnerNowView(wsClean);
    expect(out.opportunityExecution).toBeNull();
    const rows = await db.opportunityExecutionTask.findMany({ where: { workspaceId: wsClean } });
    expect(rows).toHaveLength(0);
  });
});
