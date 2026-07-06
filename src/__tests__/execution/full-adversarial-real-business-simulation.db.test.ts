/**
 * Full Adversarial Real-Business Simulations (PASS 15) — laundry/dry-cleaning, real Postgres.
 *
 * A consolidated, hostile, multi-scenario proof that OpsIQ Owner Mode survives realistic bad-business
 * pressure across proof integrity, opportunities, tenders, validation, portfolio, cash/profit, execution
 * delegation, multi-actor boundaries, owner overload, workspace isolation, and unsafe-autonomy attempts —
 * composing the ALREADY-GOVERNED services end to end (no fixtures that bypass the real write paths).
 *
 * Scenario families (A–I of the governing prompt) are grouped into describe blocks. Every hostile path is
 * asserted to FAIL CLOSED: fake completion cannot complete, weak proof holds risk, tenders never auto-submit,
 * validation cannot pass without evidence, scale is blocked before validation, duplicates collapse, a clean
 * workspace fabricates nothing, and no cross-workspace contamination occurs.
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
const wsL = randomUUID();   // dirty adversarial workspace
const wsClean = randomUUID(); // clean control workspace
const bizL = randomUUID();
const proofWeak = randomUUID();
const taskWeak = randomUUID();
const HASH = "a".repeat(64);
const NOW = Date.now();
const H = 3_600_000;
const NO_FRAUD = /\b(fraud|fraudster|theft|thief|negligence|negligent|firing|payroll|discipline)\b/i;
const NO_FAKE_MONEY = /guaranteed|profit guarantee|win probability|hidden score|roi\b/i;

const intakeDeps: IntakeDeps = { db: db as unknown as IntakeDb, uuid: () => randomUUID(), now: () => new Date() };
const execDeps: ExecutionDeps = { db: db as unknown as ExecutionDb, uuid: () => randomUUID(), now: () => new Date() };
const outcomeDeps: OutcomeDeps = { db: db as unknown as OutcomeDb, uuid: () => randomUUID(), now: () => new Date() };

async function nowView(ws: string = wsL, biz: string | undefined = bizL) { return getOwnerNowView(ws, biz); }
async function execTasks(): Promise<OpportunityExecutionTask[]> { return (await nowView()).opportunityExecution?.tasks ?? []; }
function find(tasks: OpportunityExecutionTask[], t: ExecutionTaskType) { return tasks.find((x) => x.taskType === t); }
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

async function submit(dedupeKey: string, over: Record<string, unknown>) {
  return submitExternalOpportunitySignal({
    workspaceId: wsL, actorId: owner, actorRole: "owner",
    submission: {
      rawSignalType: "B2B_DEMAND_SIGNAL", rawDescription: "signal", extractedBusinessNeed: "need",
      targetCustomerSegment: "seg", locationContext: "local", sourceQuality: "OWNER_OBSERVED",
      evidenceRefs: [], hasUnitEconomics: false, relevanceBand: "STRONG", cashExposureBand: "LOW",
      ownerWorkloadBand: "MEDIUM", dedupeKey, ...over,
    } as never,
  }, intakeDeps);
}

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] Full Adversarial Real-Business Simulations (laundry)", () => {
  beforeAll(async () => {
    for (const [id, nm] of [[owner, "Owner"], [manager, "Manager"], [opStaff, "OpStaff"]] as const) {
      await db.user.create({ data: { id, email: `adv-${id}@laundry.test`, name: nm, isActive: true, updatedAt: new Date(NOW) } });
    }
    for (const id of [wsL, wsClean]) {
      await db.workspace.create({ data: { id, name: `WS ${id.slice(0, 8)}`, slug: `adv-${id.slice(0, 8)}`, createdBy: owner } });
    }
    await db.clientAccount.create({ data: { id: wsL, workspaceId: wsL, name: "Sparkle Laundry Client", updatedAt: new Date(NOW) } });
    await db.ownerBusiness.create({ data: { id: bizL, workspaceId: wsL, name: "Sparkle Laundry", businessType: "laundry", updatedAt: new Date(NOW) } });

    // A weak staff proof (to be disputed + adjudicated).
    await db.proof.create({ data: { id: proofWeak, workspaceId: wsL, businessId: bizL, taskId: taskWeak, proofType: "photo", status: "ACCEPTED", submittedByUserId: opStaff, fileHash: HASH, duplicateFlagged: false, createdAt: new Date(NOW - 6 * H), updatedAt: new Date(NOW - 6 * H) } });

    // Opportunity pressure: a B2B (no unit economics), a HIGH cash-exposure B2B, a tender (missing docs), and a duplicate.
    await submit("adv-gym", { rawDescription: "Gym chain wants weekly towel laundering", extractedBusinessNeed: "weekly gym towel contract", targetCustomerSegment: "gyms" });
    await submit("adv-hospital", { rawDescription: "Hospital wants a large weekly linen contract with upfront stock", extractedBusinessNeed: "hospital linen contract", targetCustomerSegment: "hospitals", hasUnitEconomics: true, evidenceRefs: ["signed intent"], cashExposureBand: "HIGH", ownerWorkloadBand: "HIGH" });
    await submit("adv-tender", { rawSignalType: "GOVERNMENT_TENDER", rawDescription: "Council tender for linen across 3 sites", extractedBusinessNeed: "council linen tender", targetCustomerSegment: "council", sourceQuality: "PUBLIC_SOURCE_UNVERIFIED", missingDocuments: ["insurance certificate", "H&S policy"], cashExposureBand: "MEDIUM", ownerWorkloadBand: "HIGH" });
  });

  afterAll(async () => {
    for (const t of ["opportunityExecutionTask", "opportunityValidationOutcome", "externalOpportunitySignal", "proofRiskAdjudication", "ownerReassessmentEvent", "proof", "ownerGuidanceSnapshot", "auditEvent"] as const) {
      // @ts-expect-error dynamic model access for teardown
      await db[t].deleteMany({ where: { workspaceId: { in: [wsL, wsClean] } } }).catch(() => {});
    }
    await db.ownerBusiness.deleteMany({ where: { id: bizL } });
    await db.clientAccount.deleteMany({ where: { id: wsL } });
    await db.workspace.deleteMany({ where: { id: { in: [wsL, wsClean] } } });
    await db.user.deleteMany({ where: { id: { in: [owner, manager, opStaff] } } });
  });

  // ── A. Staff fake completion / weak proof ──────────────────────────────────────────────────────────
  describe("A — staff fake completion & weak proof", () => {
    it("[db] a fake completion with NO evidence does not close an evidence-required task", async () => {
      const cost = find(await execTasks(), "COLLECT_COST_DATA")!;
      const r = await completeFrom(cost, opStaff, "staff", [], "done");
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.status).toBe("IN_PROGRESS");
      expect((await getPersistedExecutionTasks(wsL)).get(cost.taskKey)?.status).toBe("IN_PROGRESS");
    });

    it("[db] a manager dispute + owner adjudication keeps weak-proof risk confirmed", async () => {
      const disp = await disputeAcceptedProof({
        workspaceId: wsL, proofId: proofWeak, actorId: manager, actorRole: TaskActorRole.MANAGER,
        category: ProofDisputeCategory.SUSPECTED_FAKE_OR_REUSED_PROOF, reason: "photo does not match the job",
      });
      expect(disp.ok).toBe(true);
      const adj = await adjudicateProofRiskFinding({
        workspaceId: wsL, actorId: owner, actorRole: "owner",
        sourceType: AdjudicationSourceType.PROOF_DISPUTE, sourceRef: `PROOF_DISPUTE:${proofWeak}`,
        outcome: AdjudicationOutcome.CONFIRM_SUSPICIOUS_PATTERN, reason: "confirmed after review",
      });
      expect(adj.ok).toBe(true);
      if (adj.ok) expect(adj.status).toBe("CONFIRMED");
    });
  });

  // ── B. Owner overload / anti-spam ──────────────────────────────────────────────────────────────────
  describe("B — owner overload & anti-spam", () => {
    it("[db] a duplicate opportunity signal collapses at intake (no cockpit flood)", async () => {
      const first = await submit("adv-dup-probe", { rawSignalType: "B2B_DEMAND_SIGNAL", rawDescription: "cafe aprons", extractedBusinessNeed: "cafe apron", targetCustomerSegment: "cafes", idempotencyKey: "adv-dup-probe" } as never);
      const second = await submit("adv-dup-probe", { rawSignalType: "B2B_DEMAND_SIGNAL", rawDescription: "cafe aprons", extractedBusinessNeed: "cafe apron", targetCustomerSegment: "cafes", idempotencyKey: "adv-dup-probe" } as never);
      expect(first.ok && second.ok).toBe(true);
      if (second.ok) expect(second.deduped).toBe(true);
      expect(await db.externalOpportunitySignal.findMany({ where: { workspaceId: wsL, idempotencyKey: "adv-dup-probe" } })).toHaveLength(1);
    });

    it("[db] under many simultaneous opportunities the cockpit still surfaces ONE top execution action", async () => {
      const out = await nowView();
      const top = out.opportunityExecution!.topTask;
      expect(top).not.toBeNull();
      expect(["COMPLETED", "CANCELLED", "REJECTED"]).not.toContain(top!.status);
      // Grouped counts exist rather than a raw dump: total tasks are summarised.
      expect(out.opportunityExecution!.summary.totalTasks).toBeGreaterThan(1);
    });
  });

  // ── C. Cash/profit underpricing ────────────────────────────────────────────────────────────────────
  describe("C — cash/profit underpricing", () => {
    it("[db] a B2B without unit economics yields a COLLECT_COST_DATA task (measure before scaling)", async () => {
      const cost = find(await execTasks(), "COLLECT_COST_DATA")!;
      expect(cost).toBeDefined();
      expect(cost.nextActionOwner).toBe("MANAGER");
      expect(cost.requiredEvidence.join(" ")).toMatch(/cost|margin/i);
    });

    it("[db] a HIGH cash-exposure opportunity routes an owner-approval task (owner-controlled)", async () => {
      const review = find(await execTasks(), "OWNER_APPROVAL_REVIEW")!;
      expect(review).toBeDefined();
      expect(review.approvalLevel).toBe("OWNER");
      expect(review.nextActionOwner).toBe("OWNER");
    });
  });

  // ── D. Tender / procurement ────────────────────────────────────────────────────────────────────────
  describe("D — tender/procurement", () => {
    it("[db] a tender with missing documents yields COLLECT_DOCUMENTS (never an auto-submit task)", async () => {
      const tasks = await execTasks();
      expect(find(tasks, "COLLECT_DOCUMENTS")).toBeDefined();
      // There is NO tender-submit task type in the whole model — OpsIQ can only draft/prepare.
      const types = tasks.map((t) => t.taskType);
      expect(types.some((t) => /submit/i.test(t))).toBe(false);
      expect(JSON.stringify(tasks).toLowerCase()).not.toMatch(/auto-?submit|submit the tender|submitted automatically/);
    });

    it("[db] a tender with unknown compliance routes an EXTERNAL_ADVISOR_REVIEW (advisory only)", async () => {
      expect(find(await execTasks(), "EXTERNAL_ADVISOR_REVIEW")).toBeDefined();
    });
  });

  // ── E. Validation → portfolio ──────────────────────────────────────────────────────────────────────
  describe("E — validation outcome & portfolio", () => {
    it("[db] an INCONCLUSIVE outcome cannot scale", async () => {
      const r = await record({ experimentKey: "adv-inc", opportunityKey: "SERVICE_GAP:NEW_SERVICE", status: "COMPLETED", result: "INCONCLUSIVE" });
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.nextRecommendedDecision).not.toBe("SCALE_CANDIDATE");
    });

    it("[db] a FAILED / stop-loss outcome kills the opportunity", async () => {
      const r = await record({ experimentKey: "adv-fail", opportunityKey: "PRICING_GAP:PRICING_TEST", status: "COMPLETED", result: "PASSED", stopLossTriggered: true, actualCost: 20, marginEvidence: "n/a" });
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.result).toBe("FAILED");
    });

    it("[db] a fake PASS with NO evidence is rejected (cannot persist PASSED)", async () => {
      const r = await record({ experimentKey: "adv-fakepass", opportunityKey: "COMPETITOR_REVIEW_GAP:NEW_SERVICE", status: "COMPLETED", result: "PASSED" });
      if (r.ok) expect(r.result).not.toBe("PASSED");
    });

    it("[db] a PASSED outcome WITH cost+margin evidence becomes the only scale path (owner approval)", async () => {
      const r = await record({ experimentKey: "adv-pass", opportunityKey: "B2B_DEMAND_SIGNAL:B2B_OFFER", status: "COMPLETED", result: "PASSED", actualCost: 40, marginEvidence: "healthy gross margin on the trial", conversions: 2, successMetricResult: "2 gyms agreed" });
      expect(r.ok).toBe(true);
      const out = await nowView();
      expect(out.opportunityValidationOutcomes!.some((o) => o.validationStatus === "PASSED")).toBe(true);
    });
  });

  // ── F. Multi-actor boundaries ──────────────────────────────────────────────────────────────────────
  describe("F — multi-actor authority boundaries", () => {
    it("[db] a manager cannot complete an owner-approval task (fail closed, no write)", async () => {
      const review = find(await execTasks(), "OWNER_APPROVAL_REVIEW")!;
      const r = await recordExecutionTaskUpdate({
        workspaceId: wsL, actorId: manager, actorRole: "manager",
        submission: { taskKey: review.taskKey, opportunityKey: review.opportunityKey, taskType: review.taskType, action: "COMPLETE", sourceType: review.sourceType, sourceKey: review.sourceKey, nextActionOwner: review.nextActionOwner, approvalLevel: review.approvalLevel, outcomeSummary: "approved" },
      }, execDeps);
      expect(r.ok).toBe(false);
      expect(await db.opportunityExecutionTask.findFirst({ where: { workspaceId: wsL, taskKey: review.taskKey } })).toBeNull();
    });

    it("[db] a manager completes a delegated data task WITH evidence (safe delegation)", async () => {
      const cost = find(await execTasks(), "COLLECT_COST_DATA")!;
      const r = await completeFrom(cost, manager, "manager", ["per-unit cost", "expected margin"], "unit economics captured");
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.status).toBe("COMPLETED");
    });
  });

  // ── G/H. Clean workspace + isolation ───────────────────────────────────────────────────────────────
  describe("G/H — clean workspace & isolation", () => {
    it("[db] a clean workspace fabricates nothing (no opportunities, tasks, outcomes, proofs)", async () => {
      const out = await nowView(wsClean, undefined);
      expect(out.opportunityExecution).toBeNull();
      expect(out.opportunityValidationOutcomes).toBeNull();
      expect(await db.opportunityExecutionTask.findMany({ where: { workspaceId: wsClean } })).toHaveLength(0);
      expect(await db.externalOpportunitySignal.findMany({ where: { workspaceId: wsClean } })).toHaveLength(0);
      expect(await db.proof.findMany({ where: { workspaceId: wsClean } })).toHaveLength(0);
    });

    it("[db] the dirty workspace's risk never contaminates the clean workspace", async () => {
      const clean = await nowView(wsClean, undefined);
      expect(clean.opportunityOperating).toBeNull();
      // Dirty workspace still has its own tasks (proving scoping, not global state).
      expect((await execTasks()).length).toBeGreaterThan(0);
    });
  });

  // ── I. Unsafe-autonomy attempts ────────────────────────────────────────────────────────────────────
  describe("I — unsafe autonomy is impossible", () => {
    it("[db] OpsIQ never exposes a task type that submits tenders, contacts customers, or spends", async () => {
      const tasks = await execTasks();
      const json = JSON.stringify(tasks).toLowerCase();
      // The only customer-facing task is a MANUAL lead-contact — explicitly no automated outreach.
      expect(json).not.toMatch(/automated outreach|auto-?contact|auto-?email|auto-?spend|auto-?pay|sign the contract/);
      // Every derived task's owner is a human/OpsIQ-draft — nothing executes an external action autonomously.
      for (const t of tasks) expect(["OWNER", "MANAGER", "STAFF", "OPSIQ_DRAFT", "EXTERNAL_ADVISOR", "NO_ACTION"]).toContain(t.nextActionOwner);
    });

    it("[db] the cockpit carries no fabricated money/profit/win-probability, no hidden score, no fraud/HR labels", async () => {
      const out = await nowView();
      const json = JSON.stringify(out.opportunityExecution).toLowerCase() + JSON.stringify(out.opportunityValidationOutcomes).toLowerCase() + JSON.stringify(out.opportunityOperating).toLowerCase();
      expect(json).not.toMatch(NO_FRAUD);
      expect(json).not.toMatch(NO_FAKE_MONEY);
      expect(json).not.toMatch(/[$£€]\s?\d/);
    });
  });
});
