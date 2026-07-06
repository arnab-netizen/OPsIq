/**
 * Multi-Actor Throughput Proof — real-business DB simulation (laundry).
 *
 * Proves that owner, manager, staff/operator, the OpsIQ system, and an external-advisor placeholder interact
 * across a realistic laundry workload WITHOUT bypassing governance, corrupting workspace boundaries, flooding
 * the owner, or allowing fake completion. It composes the already-governed write paths (proof + dispute +
 * proof-risk adjudication + opportunity intake + execution delegation + validation outcome + portfolio) and
 * checks role boundaries + hostile cases end to end against real Postgres.
 *
 * Actors: owner, manager, staff (opStaff), OpsIQ (SYSTEM), external-advisor placeholder (via the derived
 * EXTERNAL_ADVISOR_REVIEW task on compliance uncertainty).
 *
 * Requires TEST_WITH_DB=true.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { getOwnerNowView } from "@/services/owner-guidance/owner-now-view.service";
import { submitExternalOpportunitySignal, type IntakeDb, type IntakeDeps } from "@/services/owner-mode/external-opportunity-intake.service";
import { recordExecutionTaskUpdate, getPersistedExecutionTasks, type ExecutionDb, type ExecutionDeps } from "@/services/owner-mode/opportunity-execution.service";
import { recordValidationOutcome, type OutcomeDb, type OutcomeDeps } from "@/services/owner-mode/validation-outcome.service";
import { disputeAcceptedProof } from "@/services/execution/proof-dispute.service";
import { ProofDisputeCategory } from "@/domain/execution/proof-dispute";
import { TaskActorRole } from "@/domain/execution/delegated-task";
import { adjudicateProofRiskFinding } from "@/services/execution/proof-risk-adjudication.service";
import { AdjudicationOutcome, AdjudicationSourceType } from "@/domain/execution/proof-risk-adjudication";
import type { OpportunityExecutionTask, ExecutionTaskType } from "@/domain/owner-mode/opportunity-execution";
import type { ValidationOutcomeSubmission } from "@/domain/owner-mode/validation-outcome";

const owner = randomUUID();
const manager = randomUUID();
const opStaff = randomUUID();
const wsL = randomUUID();
const wsClean = randomUUID();
const bizL = randomUUID();
const proofA = randomUUID();
const taskA = randomUUID();
const HASH = "f".repeat(64);
const NOW = Date.now();
const H = 3_600_000;
const NO_FRAUD = /\b(fraud|fraudster|theft|thief|negligence|firing|payroll)\b/i;

const intakeDeps: IntakeDeps = { db: db as unknown as IntakeDb, uuid: () => randomUUID(), now: () => new Date() };
const execDeps: ExecutionDeps = { db: db as unknown as ExecutionDb, uuid: () => randomUUID(), now: () => new Date() };
const outcomeDeps: OutcomeDeps = { db: db as unknown as OutcomeDb, uuid: () => randomUUID(), now: () => new Date() };

async function execTasks(): Promise<OpportunityExecutionTask[]> {
  const out = await getOwnerNowView(wsL, bizL);
  return out.opportunityExecution?.tasks ?? [];
}
function find(tasks: OpportunityExecutionTask[], t: ExecutionTaskType): OpportunityExecutionTask | undefined {
  return tasks.find((x) => x.taskType === t);
}
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
const record = (submission: ValidationOutcomeSubmission) =>
  recordValidationOutcome({ workspaceId: wsL, actorId: owner, actorRole: "owner", submission }, outcomeDeps);

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] Multi-Actor Throughput Proof (laundry)", () => {
  beforeAll(async () => {
    for (const [id, nm] of [[owner, "Owner"], [manager, "Manager"], [opStaff, "OpStaff"]] as const) {
      await db.user.create({ data: { id, email: `mat-${id}@laundry.test`, name: nm, isActive: true, updatedAt: new Date(NOW) } });
    }
    for (const id of [wsL, wsClean]) {
      await db.workspace.create({ data: { id, name: `WS ${id.slice(0, 8)}`, slug: `mat-${id.slice(0, 8)}`, createdBy: owner } });
    }
    await db.clientAccount.create({ data: { id: wsL, workspaceId: wsL, name: "Sparkle Laundry Client", updatedAt: new Date(NOW) } });
    await db.ownerBusiness.create({ data: { id: bizL, workspaceId: wsL, name: "Sparkle Laundry", businessType: "laundry", updatedAt: new Date(NOW) } });
    // Staff/operator submits a proof (accepted) that will later be disputed by the manager + adjudicated by the owner.
    await db.proof.create({ data: { id: proofA, workspaceId: wsL, businessId: bizL, taskId: taskA, proofType: "photo", status: "ACCEPTED", submittedByUserId: opStaff, fileHash: HASH, duplicateFlagged: false, createdAt: new Date(NOW - 6 * H), updatedAt: new Date(NOW - 6 * H) } });

    // Owner submits two opportunities: a B2B (no unit economics) and a tender (missing docs, unknown compliance).
    await submitExternalOpportunitySignal({
      workspaceId: wsL, actorId: owner, actorRole: "owner",
      submission: {
        rawSignalType: "B2B_DEMAND_SIGNAL", rawDescription: "A gym chain wants weekly towel laundering",
        extractedBusinessNeed: "weekly gym towel contract", targetCustomerSegment: "gyms", locationContext: "local",
        sourceQuality: "OWNER_OBSERVED", evidenceRefs: [], hasUnitEconomics: false,
        relevanceBand: "STRONG", cashExposureBand: "LOW", ownerWorkloadBand: "MEDIUM", dedupeKey: "mat-gym-towels",
      },
    }, intakeDeps);
    // A high cash-exposure B2B → an OWNER_APPROVAL_REVIEW task (owner-only).
    await submitExternalOpportunitySignal({
      workspaceId: wsL, actorId: owner, actorRole: "owner",
      submission: {
        rawSignalType: "B2B_DEMAND_SIGNAL", rawDescription: "A hospital wants a large weekly linen contract, upfront stock required",
        extractedBusinessNeed: "hospital linen contract with upfront working capital", targetCustomerSegment: "hospitals", locationContext: "local",
        sourceQuality: "OWNER_OBSERVED", evidenceRefs: ["signed intent letter"], hasUnitEconomics: true,
        relevanceBand: "STRONG", cashExposureBand: "HIGH", ownerWorkloadBand: "HIGH", dedupeKey: "mat-hospital-linen",
      },
    }, intakeDeps);
    // A government tender with missing documents (compliance unknown) → COLLECT_DOCUMENTS + external-advisor review.
    await submitExternalOpportunitySignal({
      workspaceId: wsL, actorId: owner, actorRole: "owner",
      submission: {
        rawSignalType: "GOVERNMENT_TENDER", rawDescription: "Council tender for linen laundering across 3 sites",
        extractedBusinessNeed: "council linen tender", targetCustomerSegment: "council", locationContext: "local",
        sourceQuality: "PUBLIC_SOURCE_UNVERIFIED", missingDocuments: ["insurance certificate", "health & safety policy"],
        hasUnitEconomics: false, relevanceBand: "MODERATE", cashExposureBand: "MEDIUM", ownerWorkloadBand: "HIGH", dedupeKey: "mat-council-tender",
      },
    }, intakeDeps);
    // A DUPLICATE B2B signal (same dedupe key) — must collapse, not flood the cockpit.
    await submitExternalOpportunitySignal({
      workspaceId: wsL, actorId: owner, actorRole: "owner",
      submission: {
        rawSignalType: "B2B_DEMAND_SIGNAL", rawDescription: "Gym chain towel laundering (repeat)",
        extractedBusinessNeed: "weekly gym towel contract", targetCustomerSegment: "gyms", locationContext: "local",
        sourceQuality: "OWNER_OBSERVED", evidenceRefs: [], hasUnitEconomics: false,
        relevanceBand: "STRONG", cashExposureBand: "LOW", ownerWorkloadBand: "MEDIUM", dedupeKey: "mat-gym-towels",
      },
    }, intakeDeps);
  });

  afterAll(async () => {
    await db.opportunityExecutionTask.deleteMany({ where: { workspaceId: { in: [wsL, wsClean] } } });
    await db.opportunityValidationOutcome.deleteMany({ where: { workspaceId: { in: [wsL, wsClean] } } });
    await db.externalOpportunitySignal.deleteMany({ where: { workspaceId: { in: [wsL, wsClean] } } });
    await db.proofRiskAdjudication.deleteMany({ where: { workspaceId: { in: [wsL, wsClean] } } }).catch(() => {});
    await db.ownerReassessmentEvent.deleteMany({ where: { workspaceId: { in: [wsL, wsClean] } } }).catch(() => {});
    await db.proof.deleteMany({ where: { workspaceId: { in: [wsL, wsClean] } } });
    await db.ownerGuidanceSnapshot.deleteMany({ where: { workspaceId: { in: [wsL, wsClean] } } });
    await db.auditEvent.deleteMany({ where: { workspaceId: { in: [wsL, wsClean] } } });
    await db.ownerBusiness.deleteMany({ where: { id: bizL } });
    await db.clientAccount.deleteMany({ where: { id: wsL } });
    await db.workspace.deleteMany({ where: { id: { in: [wsL, wsClean] } } });
    await db.user.deleteMany({ where: { id: { in: [owner, manager, opStaff] } } });
  });

  it("[db] OpsIQ derives execution tasks with correct action owners (manager/staff/OpsIQ/owner/advisor)", async () => {
    const tasks = await execTasks();
    expect(tasks.length).toBeGreaterThan(0);
    expect(find(tasks, "COLLECT_COST_DATA")?.nextActionOwner).toBe("MANAGER");
    expect(find(tasks, "PREPARE_PROOF_PACK")?.nextActionOwner).toBe("OPSIQ_DRAFT");
    expect(find(tasks, "OWNER_APPROVAL_REVIEW")?.nextActionOwner).toBe("OWNER");
    // A tender with unknown compliance routes an external-advisor review (advisory placeholder only).
    expect(find(tasks, "EXTERNAL_ADVISOR_REVIEW")).toBeDefined();
  });

  it("[db] hostile: a duplicate opportunity signal collapses at intake (no cockpit flood)", async () => {
    // Two identical submissions (same idempotency key) must persist ONE row — spam cannot flood the cockpit.
    const body = {
      rawSignalType: "B2B_DEMAND_SIGNAL" as const, rawDescription: "A cafe wants weekly apron laundering",
      extractedBusinessNeed: "weekly cafe apron contract", targetCustomerSegment: "cafes", locationContext: "local",
      sourceQuality: "OWNER_OBSERVED" as const, evidenceRefs: [], hasUnitEconomics: false,
      relevanceBand: "STRONG" as const, cashExposureBand: "LOW" as const, ownerWorkloadBand: "MEDIUM" as const,
      idempotencyKey: "mat-cafe-apron-probe", dedupeKey: "mat-cafe-apron-probe",
    };
    const first = await submitExternalOpportunitySignal({ workspaceId: wsL, actorId: owner, actorRole: "owner", submission: body }, intakeDeps);
    const second = await submitExternalOpportunitySignal({ workspaceId: wsL, actorId: owner, actorRole: "owner", submission: body }, intakeDeps);
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (second.ok) expect(second.deduped).toBe(true);
    const rows = await db.externalOpportunitySignal.findMany({ where: { workspaceId: wsL, idempotencyKey: "mat-cafe-apron-probe" } });
    expect(rows).toHaveLength(1);
  });

  it("[db] a manager completes the cost-data task WITH evidence (delegated, governed)", async () => {
    const cost = find(await execTasks(), "COLLECT_COST_DATA")!;
    const r = await completeFrom(cost, manager, "manager", ["per-unit cost captured", "expected margin computed"], "unit economics captured");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.status).toBe("COMPLETED");
    expect((await getPersistedExecutionTasks(wsL)).get(cost.taskKey)?.status).toBe("COMPLETED");
  });

  it("[db] hostile: staff fake completion with NO evidence does not complete (stays IN_PROGRESS)", async () => {
    // The tender's own COLLECT_DOCUMENTS is evidence-required; a no-evidence completion must not pass.
    const docs = find(await execTasks(), "COLLECT_DOCUMENTS")!;
    const r = await completeFrom(docs, opStaff, "staff", [], "done");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.status).toBe("IN_PROGRESS");
    expect((await getPersistedExecutionTasks(wsL)).get(docs.taskKey)?.status).toBe("IN_PROGRESS");
  });

  it("[db] hostile: a manager cannot complete an OWNER_APPROVAL_REVIEW task (fail closed, no write)", async () => {
    const review = find(await execTasks(), "OWNER_APPROVAL_REVIEW")!;
    const r = await recordExecutionTaskUpdate({
      workspaceId: wsL, actorId: manager, actorRole: "manager",
      submission: {
        taskKey: review.taskKey, opportunityKey: review.opportunityKey, taskType: review.taskType, action: "COMPLETE",
        sourceType: review.sourceType, sourceKey: review.sourceKey, nextActionOwner: review.nextActionOwner, approvalLevel: review.approvalLevel,
        outcomeSummary: "approved",
      },
    }, execDeps);
    expect(r.ok).toBe(false);
    expect(await db.opportunityExecutionTask.findFirst({ where: { workspaceId: wsL, taskKey: review.taskKey } })).toBeNull();
  });

  it("[db] the owner completes the OWNER_APPROVAL_REVIEW task with a decision note", async () => {
    const review = find(await execTasks(), "OWNER_APPROVAL_REVIEW")!;
    const r = await recordExecutionTaskUpdate({
      workspaceId: wsL, actorId: owner, actorRole: "owner",
      submission: {
        taskKey: review.taskKey, opportunityKey: review.opportunityKey, taskType: review.taskType, action: "COMPLETE",
        sourceType: review.sourceType, sourceKey: review.sourceKey, nextActionOwner: review.nextActionOwner, approvalLevel: review.approvalLevel,
        outcomeSummary: "Owner accepts the cash exposure and approves preparation.",
      },
    }, execDeps);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.status).toBe("COMPLETED");
  });

  it("[db] staff→manager→owner proof integrity: a disputed proof + owner adjudication holds risk", async () => {
    // Manager disputes the staff proof (server-resolved role), then the owner adjudicates the anti-gaming finding.
    const disp = await disputeAcceptedProof({
      workspaceId: wsL, proofId: proofA, actorId: manager, actorRole: TaskActorRole.MANAGER,
      category: ProofDisputeCategory.SUSPECTED_FAKE_OR_REUSED_PROOF, reason: "photo does not match the job on file",
    });
    expect(disp.ok).toBe(true);
    const adj = await adjudicateProofRiskFinding({
      workspaceId: wsL, actorId: owner, actorRole: "owner",
      sourceType: AdjudicationSourceType.PROOF_DISPUTE, sourceRef: `PROOF_DISPUTE:${proofA}`,
      outcome: AdjudicationOutcome.CONFIRM_SUSPICIOUS_PATTERN, reason: "confirmed after review with the operator",
    });
    expect(adj.ok).toBe(true);
    if (adj.ok) expect(adj.status).toBe("CONFIRMED");
  });

  it("[db] validation-then-portfolio: PASSED + evidence unblocks a scale candidate (owner approval)", async () => {
    const r = await record({ experimentKey: "mat-exp", opportunityKey: "B2B_DEMAND_SIGNAL:B2B_OFFER", status: "COMPLETED", result: "PASSED", actualCost: 40, marginEvidence: "healthy gross margin on the trial batch", conversions: 2, successMetricResult: "2 gyms agreed to a trial" });
    expect(r.ok).toBe(true);
    const out = await getOwnerNowView(wsL, bizL);
    expect(out.opportunityValidationOutcomes).not.toBeNull();
    expect(out.opportunityValidationOutcomes![0].validationStatus).toBe("PASSED");
  });

  it("[db] hostile: validation cannot PASS without evidence (fake pass rejected)", async () => {
    const r = await record({ experimentKey: "mat-exp-2", opportunityKey: "SERVICE_GAP:NEW_SERVICE", status: "COMPLETED", result: "PASSED" });
    // No cost/margin evidence attached → the governed path must not persist a PASSED result.
    if (r.ok) expect(r.result).not.toBe("PASSED");
  });

  it("[db] the owner cockpit surfaces exactly one top execution action (anti-overload) with no prohibited labels", async () => {
    const out = await getOwnerNowView(wsL, bizL);
    const top = out.opportunityExecution!.topTask;
    expect(top).not.toBeNull();
    expect(["COMPLETED", "CANCELLED", "REJECTED"]).not.toContain(top!.status);
    const json = JSON.stringify(out.opportunityExecution).toLowerCase();
    expect(json).not.toMatch(NO_FRAUD);
    expect(json).not.toMatch(/guaranteed|profit guarantee|win probability|hidden score/);
    expect(json).not.toMatch(/[$£€]\s?\d/);
  });

  it("[db] workspace isolation: a clean workspace fabricates nothing across every subsystem", async () => {
    const out = await getOwnerNowView(wsClean);
    expect(out.opportunityExecution).toBeNull();
    expect(out.opportunityValidationOutcomes).toBeNull();
    expect(await db.opportunityExecutionTask.findMany({ where: { workspaceId: wsClean } })).toHaveLength(0);
    expect(await db.proof.findMany({ where: { workspaceId: wsClean } })).toHaveLength(0);
  });
});
