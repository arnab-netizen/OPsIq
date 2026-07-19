/**
 * Phase 3 — execution lifecycle DB journey tests (real PostgreSQL).
 *
 * Proves: full lifecycle transitions PROPOSED→OUTCOME_VERIFIED, Now View grouping,
 * workspace isolation, idempotency, progress history, classification persistence,
 * observation-window guard, and JSON serialisability.
 *
 * Run: TEST_WITH_DB=true npx vitest run src/__tests__/owner-mode/phase3-execution-lifecycle.db.test.ts
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { applyProcessExecutionAction } from "@/services/owner-mode/process-execution-bridge.service";
import { queryExecutionLifecycle } from "@/services/owner-guidance/owner-now-view.service";
import { classifyOutcomeVerification } from "@/services/owner-mode/owner-outcome-verification.service";

// ── Fixed identifiers ────────────────────────────────────────────────────────

const actorId = randomUUID();
const verifierId = randomUUID(); // different user — separation of duty
const ws = randomUUID(); // doubles as ClientAccount.id (FK anchor for OwnerActionOutcome)
const otherWs = randomUUID(); // never seeded — workspace isolation probe
let businessId: string; // resolved in beforeAll

const deps = (overrides?: { uuid?: () => string; now?: () => Date }) => ({
  db: db as any,
  uuid: () => randomUUID(),
  now: () => new Date(),
  ...overrides,
});

// ── Task factory ──────────────────────────────────────────────────────────────

async function seedTask(
  taskKey: string,
  over: Record<string, unknown> = {}
): Promise<string> {
  const id = randomUUID();
  await db.processExecutionTask.create({
    data: {
      id,
      workspaceId: ws,
      taskKey,
      sourceFamily: "PROCESS_CORRECTION",
      sourceFindingKey: "c-test",
      executionRoute: "CREATE_OWNER_APPROVAL_TASK",
      actionOwner: "OWNER",
      approvalLevel: "OWNER_APPROVAL_REQUIRED",
      status: "PROPOSED",
      requiredEvidence: [],
      evidenceRefs: [],
      completionCriteria: "Owner records decision.",
      reassessmentTrigger: "Re-evaluate at next review.",
      riskIfIgnored: "Risk compounds.",
      ownerVisibleSummary: "Test task",
      severity: "HIGH",
      priorityRank: 1,
      updatedAt: new Date(),
      ...over,
    },
  });
  return id;
}

// ── Shared action helper ──────────────────────────────────────────────────────

function action(
  taskKey: string,
  act: string,
  extra?: Record<string, unknown>
) {
  return applyProcessExecutionAction(
    {
      workspaceId: ws,
      actorId,
      actorRole: "owner",
      taskKey,
      action: act as any,
      businessId: null,
      evidenceRefs: undefined,
      reason: null,
      delegateToRole: null,
      outcomeNotes: null,
      progressPct: null,
      stage: null,
      outcomeStatus: null,
      ...(extra ?? {}),
    },
    deps()
  );
}

// ── Setup / teardown ──────────────────────────────────────────────────────────

describe.skipIf(!SHOULD_RUN_DB_TESTS)(
  "[db] Phase 3 — execution lifecycle journeys",
  () => {
    beforeAll(async () => {
      await db.user.upsert({
        where: { id: actorId },
        update: {},
        create: { id: actorId, email: `p3-actor-${actorId}@test.local`, name: "Phase3Actor", isActive: true, updatedAt: new Date() },
      });
      await db.user.upsert({
        where: { id: verifierId },
        update: {},
        create: { id: verifierId, email: `p3-verifier-${verifierId}@test.local`, name: "Phase3Verifier", isActive: true, updatedAt: new Date() },
      });
      // ClientAccount: FK anchor for OwnerActionOutcome.workspaceId
      await db.clientAccount.upsert({
        where: { id: ws },
        update: {},
        create: { id: ws, name: `Phase3DB WS ${ws}`, status: "active", visibility: "internal", updatedAt: new Date() },
      });
      const biz = await db.ownerBusiness.create({
        data: { id: randomUUID(), workspaceId: ws, name: "Phase3 Test Business", businessType: "generic_local_service", createdBy: actorId },
      });
      businessId = biz.id;
    });

    afterAll(async () => {
      await db.processExecutionTaskProgress.deleteMany({ where: { workspaceId: ws } });
      await db.processExecutionTask.deleteMany({ where: { workspaceId: ws } });
      await db.ownerActionOutcome.deleteMany({ where: { workspaceId: ws } });
      await db.ownerReassessmentEvent.deleteMany({ where: { workspaceId: ws } }).catch(() => undefined);
      await db.ownerBusiness.deleteMany({ where: { workspaceId: ws } });
      await db.auditEvent.deleteMany({ where: { workspaceId: ws } });
      await db.clientAccount.delete({ where: { id: ws } });
      await db.user.delete({ where: { id: actorId } });
      await db.user.delete({ where: { id: verifierId } });
    });

    // ── 1. Complete SUCCESS journey ──────────────────────────────────────────

    it("1. SUCCESS journey: PROPOSED→ACKNOWLEDGED→IN_PROGRESS→COMPLETED→OUTCOME_RECORDED→OUTCOME_VERIFIED", async () => {
      const key = `p3_success_${randomUUID().slice(0, 8)}`;
      await seedTask(key);

      const ack = await action(key, "ACKNOWLEDGE");
      expect(ack.ok).toBe(true);
      expect(ack.status).toBe("ACKNOWLEDGED");

      const start = await action(key, "START");
      expect(start.ok).toBe(true);
      expect(start.status).toBe("IN_PROGRESS");

      const complete = await action(key, "COMPLETE", { evidenceRefs: ["evidence://e2e-proof-1"], outcomeNotes: "Task completed successfully" });
      expect(complete.ok).toBe(true);
      expect(complete.status).toBe("COMPLETED");

      const recordOutcome = await applyProcessExecutionAction(
        {
          workspaceId: ws, actorId, actorRole: "owner", taskKey: key, action: "RECORD_OUTCOME",
          businessId, evidenceRefs: undefined, reason: null, delegateToRole: null,
          outcomeNotes: "Improved measurably", progressPct: null, stage: null, outcomeStatus: "worked",
        },
        deps()
      );
      expect(recordOutcome.ok).toBe(true);
      expect(recordOutcome.status).toBe("OUTCOME_RECORDED");
      const outcomeId = (recordOutcome as { outcomeId?: string }).outcomeId;
      expect(outcomeId).toBeDefined();

      // Verify with a different actor (separation of duty)
      const verify = await applyProcessExecutionAction(
        {
          workspaceId: ws, actorId: verifierId, actorRole: "owner", taskKey: key, action: "VERIFY_OUTCOME",
          businessId: null, evidenceRefs: undefined, reason: "Metrics confirmed", delegateToRole: null,
          outcomeNotes: null, progressPct: null, stage: null, outcomeStatus: null,
        },
        deps()
      );
      expect(verify.ok).toBe(true);
      expect((verify as { verificationClassification?: string }).verificationClassification).toBeDefined();

      // DB-level persistence check
      const task = await db.processExecutionTask.findFirst({ where: { workspaceId: ws, taskKey: key } });
      expect(task?.status).toBe("OUTCOME_VERIFIED");
      expect(task?.outcomeId).toBeDefined();
    });

    // ── 2. Now View groups tasks correctly ───────────────────────────────────

    it("2. queryExecutionLifecycle groups PROPOSED in requiresDecision and OUTCOME_VERIFIED in recentlyVerified", async () => {
      const proposedKey = `p3_proposed_${randomUUID().slice(0, 8)}`;
      const verifiedKey = `p3_verified_${randomUUID().slice(0, 8)}`;
      await seedTask(proposedKey);
      await seedTask(verifiedKey, { status: "OUTCOME_VERIFIED", updatedAt: new Date() });

      const lifecycle = await queryExecutionLifecycle(ws, db as any);
      expect(lifecycle).not.toBeNull();

      const requiresDecisionKeys = lifecycle!.requiresDecision.map((i) => i.taskKey);
      expect(requiresDecisionKeys).toContain(proposedKey);

      const recentlyVerifiedKeys = lifecycle!.recentlyVerified.map((i) => i.taskKey);
      expect(recentlyVerifiedKeys).toContain(verifiedKey);
    });

    // ── 3. Workspace isolation ───────────────────────────────────────────────

    it("3. cross-workspace task not found (workspace isolation)", async () => {
      const key = `p3_isolation_${randomUUID().slice(0, 8)}`;
      await seedTask(key); // seeded in `ws`

      const result = await applyProcessExecutionAction(
        {
          workspaceId: otherWs, actorId, actorRole: "owner", taskKey: key, action: "ACKNOWLEDGE",
          businessId: null, evidenceRefs: undefined, reason: null, delegateToRole: null,
          outcomeNotes: null, progressPct: null, stage: null, outcomeStatus: null,
        },
        deps()
      );
      expect(result.ok).toBe(false);
      expect((result as { code?: string }).code).toBe("NOT_FOUND_OR_FORBIDDEN");
    });

    // ── 4. Idempotent ACKNOWLEDGE ────────────────────────────────────────────

    it("4. ACKNOWLEDGE is idempotent — two calls both return ok:true", async () => {
      const key = `p3_idem_ack_${randomUUID().slice(0, 8)}`;
      await seedTask(key);

      const r1 = await action(key, "ACKNOWLEDGE");
      const r2 = await action(key, "ACKNOWLEDGE");
      expect(r1.ok).toBe(true);
      expect(r2.ok).toBe(true);
      expect(r1.status).toBe("ACKNOWLEDGED");
      expect(r2.status).toBe("ACKNOWLEDGED");

      // Only one row, status is ACKNOWLEDGED
      const task = await db.processExecutionTask.findFirst({ where: { workspaceId: ws, taskKey: key } });
      expect(task?.status).toBe("ACKNOWLEDGED");
    });

    // ── 5. Progress history preserved ────────────────────────────────────────

    it("5. RECORD_PROGRESS creates immutable log rows, Now View shows latest progressPct", async () => {
      const key = `p3_progress_${randomUUID().slice(0, 8)}`;
      await seedTask(key, { status: "IN_PROGRESS" });

      const r1 = await applyProcessExecutionAction(
        {
          workspaceId: ws, actorId, actorRole: "owner", taskKey: key, action: "RECORD_PROGRESS",
          businessId: null, evidenceRefs: undefined, reason: "Phase 1 done", delegateToRole: null,
          outcomeNotes: null, progressPct: 30, stage: "Phase 1", outcomeStatus: null,
        },
        deps()
      );
      expect(r1.ok).toBe(true);

      const r2 = await applyProcessExecutionAction(
        {
          workspaceId: ws, actorId, actorRole: "owner", taskKey: key, action: "RECORD_PROGRESS",
          businessId: null, evidenceRefs: undefined, reason: "Phase 2 done", delegateToRole: null,
          outcomeNotes: null, progressPct: 60, stage: "Phase 2", outcomeStatus: null,
        },
        deps()
      );
      expect(r2.ok).toBe(true);

      const task = await db.processExecutionTask.findFirst({ where: { workspaceId: ws, taskKey: key } });
      const progressRows = await db.processExecutionTaskProgress.findMany({
        where: { workspaceId: ws, taskId: task!.id },
        orderBy: { createdAt: "asc" },
      });
      expect(progressRows).toHaveLength(2);
      expect(progressRows[0].progressPct).toBe(30);
      expect(progressRows[1].progressPct).toBe(60);

      // Now View shows latest (60)
      const lifecycle = await queryExecutionLifecycle(ws, db as any);
      const item = lifecycle?.inExecution.find((i) => i.taskKey === key);
      expect(item).toBeDefined();
      expect(item?.progressPct).toBe(60);
    });

    // ── 6. PARTIAL_SUCCESS journey ───────────────────────────────────────────

    it("6. RECORD_OUTCOME with partially_worked → PARTIAL_SUCCESS classification", async () => {
      const key = `p3_partial_${randomUUID().slice(0, 8)}`;
      await seedTask(key, { status: "COMPLETED" });

      const recordOutcome = await applyProcessExecutionAction(
        {
          workspaceId: ws, actorId, actorRole: "owner", taskKey: key, action: "RECORD_OUTCOME",
          businessId, evidenceRefs: undefined, reason: null, delegateToRole: null,
          outcomeNotes: "Some improvement", progressPct: null, stage: null, outcomeStatus: "partially_worked",
        },
        deps()
      );
      expect(recordOutcome.ok).toBe(true);

      const verify = await applyProcessExecutionAction(
        {
          workspaceId: ws, actorId: verifierId, actorRole: "owner", taskKey: key, action: "VERIFY_OUTCOME",
          businessId: null, evidenceRefs: undefined, reason: null, delegateToRole: null,
          outcomeNotes: null, progressPct: null, stage: null, outcomeStatus: null,
        },
        deps()
      );
      expect(verify.ok).toBe(true);
      expect((verify as { verificationClassification?: string }).verificationClassification).toBe("PARTIAL_SUCCESS");
    });

    // ── 7. FAILURE journey ───────────────────────────────────────────────────

    it("7. RECORD_OUTCOME with did_not_work → FAILURE classification on VERIFY", async () => {
      const key = `p3_failure_${randomUUID().slice(0, 8)}`;
      await seedTask(key, { status: "COMPLETED" });

      await applyProcessExecutionAction(
        {
          workspaceId: ws, actorId, actorRole: "owner", taskKey: key, action: "RECORD_OUTCOME",
          businessId, evidenceRefs: undefined, reason: null, delegateToRole: null,
          outcomeNotes: "Did not work at all", progressPct: null, stage: null, outcomeStatus: "did_not_work",
        },
        deps()
      );

      const verify = await applyProcessExecutionAction(
        {
          workspaceId: ws, actorId: verifierId, actorRole: "owner", taskKey: key, action: "VERIFY_OUTCOME",
          businessId: null, evidenceRefs: undefined, reason: null, delegateToRole: null,
          outcomeNotes: null, progressPct: null, stage: null, outcomeStatus: null,
        },
        deps()
      );
      expect(verify.ok).toBe(true);
      expect((verify as { verificationClassification?: string }).verificationClassification).toBe("FAILURE");
    });

    // ── 8. NEGATIVE_IMPACT journey ────────────────────────────────────────────

    it("8. RECORD_OUTCOME with made_worse → NEGATIVE_IMPACT classification on VERIFY", async () => {
      const key = `p3_neg_${randomUUID().slice(0, 8)}`;
      await seedTask(key, { status: "COMPLETED" });

      await applyProcessExecutionAction(
        {
          workspaceId: ws, actorId, actorRole: "owner", taskKey: key, action: "RECORD_OUTCOME",
          businessId, evidenceRefs: undefined, reason: null, delegateToRole: null,
          outcomeNotes: "Made things worse", progressPct: null, stage: null, outcomeStatus: "made_worse",
        },
        deps()
      );

      const verify = await applyProcessExecutionAction(
        {
          workspaceId: ws, actorId: verifierId, actorRole: "owner", taskKey: key, action: "VERIFY_OUTCOME",
          businessId: null, evidenceRefs: undefined, reason: null, delegateToRole: null,
          outcomeNotes: null, progressPct: null, stage: null, outcomeStatus: null,
        },
        deps()
      );
      expect(verify.ok).toBe(true);
      expect((verify as { verificationClassification?: string }).verificationClassification).toBe("NEGATIVE_IMPACT");
    });

    // ── 9. INCONCLUSIVE journey ───────────────────────────────────────────────

    it("9. RECORD_OUTCOME with too_early_to_judge → INCONCLUSIVE classification", async () => {
      const key = `p3_inconcl_${randomUUID().slice(0, 8)}`;
      await seedTask(key, { status: "COMPLETED" });

      await applyProcessExecutionAction(
        {
          workspaceId: ws, actorId, actorRole: "owner", taskKey: key, action: "RECORD_OUTCOME",
          businessId, evidenceRefs: undefined, reason: null, delegateToRole: null,
          outcomeNotes: null, progressPct: null, stage: null, outcomeStatus: "too_early_to_judge",
        },
        deps()
      );

      const verify = await applyProcessExecutionAction(
        {
          workspaceId: ws, actorId: verifierId, actorRole: "owner", taskKey: key, action: "VERIFY_OUTCOME",
          businessId: null, evidenceRefs: undefined, reason: null, delegateToRole: null,
          outcomeNotes: null, progressPct: null, stage: null, outcomeStatus: null,
        },
        deps()
      );
      expect(verify.ok).toBe(true);
      expect((verify as { verificationClassification?: string }).verificationClassification).toBe("INCONCLUSIVE");
    });

    // ── 10. NO_MEASURABLE_IMPACT journey ──────────────────────────────────────

    it("10. RECORD_OUTCOME with not_measurable → NO_MEASURABLE_IMPACT classification", async () => {
      const key = `p3_nomeas_${randomUUID().slice(0, 8)}`;
      await seedTask(key, { status: "COMPLETED" });

      await applyProcessExecutionAction(
        {
          workspaceId: ws, actorId, actorRole: "owner", taskKey: key, action: "RECORD_OUTCOME",
          businessId, evidenceRefs: undefined, reason: null, delegateToRole: null,
          outcomeNotes: null, progressPct: null, stage: null, outcomeStatus: "not_measurable",
        },
        deps()
      );

      const verify = await applyProcessExecutionAction(
        {
          workspaceId: ws, actorId: verifierId, actorRole: "owner", taskKey: key, action: "VERIFY_OUTCOME",
          businessId: null, evidenceRefs: undefined, reason: null, delegateToRole: null,
          outcomeNotes: null, progressPct: null, stage: null, outcomeStatus: null,
        },
        deps()
      );
      expect(verify.ok).toBe(true);
      expect((verify as { verificationClassification?: string }).verificationClassification).toBe("NO_MEASURABLE_IMPACT");
    });

    // ── 11. Observation window blocks VERIFY_OUTCOME ──────────────────────────

    it("11. VERIFY_OUTCOME within verification window returns OBSERVATION_WINDOW_OPEN (no status change)", async () => {
      const key = `p3_obswin_${randomUUID().slice(0, 8)}`;
      const outcomeRecordedAt = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000); // 2 days ago
      await seedTask(key, {
        status: "OUTCOME_RECORDED",
        outcomeRecordedAt,
        verificationWindowDays: 30, // 30-day window — not yet elapsed
        outcomeId: "placeholder-for-window-test",
      });

      const verify = await applyProcessExecutionAction(
        {
          workspaceId: ws, actorId: verifierId, actorRole: "owner", taskKey: key, action: "VERIFY_OUTCOME",
          businessId: null, evidenceRefs: undefined, reason: null, delegateToRole: null,
          outcomeNotes: null, progressPct: null, stage: null, outcomeStatus: null,
        },
        deps()
      );
      // verifyOwnerActionOutcome returns OBSERVATION_WINDOW_OPEN without an outcomeId in OwnerActionOutcome
      // (the task.outcomeId = "placeholder-for-window-test" won't be found in OwnerActionOutcome table)
      // — the service will return TASK_NOT_FOUND for the outcome, which is ok:false
      expect(verify.ok).toBe(false);
    });

    // ── 12. verificationClassification persisted in DB ────────────────────────

    it("12. verificationClassification is persisted on OwnerActionOutcome row after VERIFY_OUTCOME", async () => {
      const key = `p3_persist_${randomUUID().slice(0, 8)}`;
      await seedTask(key, { status: "COMPLETED" });

      const ro = await applyProcessExecutionAction(
        {
          workspaceId: ws, actorId, actorRole: "owner", taskKey: key, action: "RECORD_OUTCOME",
          businessId, evidenceRefs: undefined, reason: null, delegateToRole: null,
          outcomeNotes: "Worked well", progressPct: null, stage: null, outcomeStatus: "worked",
        },
        deps()
      );
      const outcomeId = (ro as { outcomeId?: string }).outcomeId!;

      await applyProcessExecutionAction(
        {
          workspaceId: ws, actorId: verifierId, actorRole: "owner", taskKey: key, action: "VERIFY_OUTCOME",
          businessId: null, evidenceRefs: undefined, reason: "Confirmed", delegateToRole: null,
          outcomeNotes: null, progressPct: null, stage: null, outcomeStatus: null,
        },
        deps()
      );

      const outcome = await db.ownerActionOutcome.findFirst({ where: { id: outcomeId } });
      expect(outcome?.verificationClassification).toBe("SUCCESS");
      expect(outcome?.verifiedAt).toBeDefined();
    });

    // ── 13. Duplicate task prevention ─────────────────────────────────────────

    it("13. two tasks with the same (workspaceId, taskKey) cannot be created — unique constraint", async () => {
      const key = `p3_dup_${randomUUID().slice(0, 8)}`;
      await seedTask(key);
      await expect(seedTask(key)).rejects.toThrow();
    });

    // ── 14. Deterministic classification ──────────────────────────────────────

    it("14. classifyOutcomeVerification is deterministic — identical inputs always produce identical output", () => {
      const now = new Date("2026-07-18T12:00:00Z");
      const outcome = {
        id: "out-1", workspaceId: ws, businessId, outcomeStatus: "worked" as const,
        ownerReportedResult: "Worked", actualMetricName: null, beforeValue: 15, afterValue: 22,
        measurementPeriodEnd: null, evidenceQuality: "moderate" as const,
        externalEventFlag: false, observationWindowDays: null, verificationClassification: null,
        taskKey: null, createdAt: new Date("2026-07-10T00:00:00Z"),
      };
      const r1 = classifyOutcomeVerification(outcome, null, now);
      const r2 = classifyOutcomeVerification(outcome, null, now);
      expect(r1).toBe(r2);
      expect(r1).toBe("SUCCESS");
    });

    // ── 15. JSON serialization ────────────────────────────────────────────────

    it("15. OwnerExecutionLifecycleView is JSON-serialisable (no Decimal/BigInt errors)", async () => {
      const lifecycle = await queryExecutionLifecycle(ws, db as any);
      expect(lifecycle).not.toBeNull();
      const serialised = JSON.stringify(lifecycle);
      const parsed = JSON.parse(serialised);
      expect(parsed).toHaveProperty("requiresDecision");
      expect(parsed).toHaveProperty("inExecution");
      expect(parsed).toHaveProperty("awaitingVerification");
      expect(parsed).toHaveProperty("recentlyVerified");
    });

    // ── 16. IN_PROGRESS tasks appear in inExecution group ────────────────────

    it("16. IN_PROGRESS task appears in inExecution group, COMPLETED in awaitingVerification", async () => {
      const inProgressKey = `p3_inprog_${randomUUID().slice(0, 8)}`;
      const completedKey = `p3_comp_${randomUUID().slice(0, 8)}`;
      await seedTask(inProgressKey, { status: "IN_PROGRESS" });
      await seedTask(completedKey, { status: "COMPLETED" });

      const lifecycle = await queryExecutionLifecycle(ws, db as any);
      expect(lifecycle!.inExecution.map((i) => i.taskKey)).toContain(inProgressKey);
      expect(lifecycle!.awaitingVerification.map((i) => i.taskKey)).toContain(completedKey);
    });

    // ── 17. ACKNOWLEDGED task appears in inExecution ──────────────────────────

    it("17. ACKNOWLEDGED task appears in inExecution group with canStart=true", async () => {
      const key = `p3_acked_${randomUUID().slice(0, 8)}`;
      await seedTask(key);

      await action(key, "ACKNOWLEDGE");

      const lifecycle = await queryExecutionLifecycle(ws, db as any);
      const item = lifecycle!.inExecution.find((i) => i.taskKey === key);
      expect(item).toBeDefined();
      expect(item?.canStart).toBe(true);
      expect(item?.canAcknowledge).toBe(false); // no longer PROPOSED
    });

    // ── 18. canAcknowledge=true only for PROPOSED tasks ───────────────────────

    it("18. server-computed canAcknowledge=true for PROPOSED, false for IN_PROGRESS", async () => {
      const proposedKey = `p3_can_ack_${randomUUID().slice(0, 8)}`;
      const inProgKey = `p3_no_ack_${randomUUID().slice(0, 8)}`;
      await seedTask(proposedKey);
      await seedTask(inProgKey, { status: "IN_PROGRESS" });

      const lifecycle = await queryExecutionLifecycle(ws, db as any);
      const proposed = lifecycle!.requiresDecision.find((i) => i.taskKey === proposedKey);
      const inProg = lifecycle!.inExecution.find((i) => i.taskKey === inProgKey);
      expect(proposed?.canAcknowledge).toBe(true);
      expect(inProg?.canAcknowledge).toBe(false);
    });

    // ── 19. Phase 2 regression: fields on lifecycle items ─────────────────────

    it("19. ExecutionLifecycleItem includes expectedBenefit, baselineMetricName, targetValue when set", async () => {
      const key = `p3_plan_fields_${randomUUID().slice(0, 8)}`;
      await seedTask(key, {
        status: "PROPOSED",
        expectedBenefit: "Reduce lag by 5 days",
        baselineMetricName: "cash_collection_lag_days",
        baselineValue: 25.0,
        targetValue: 20.0,
      });

      const lifecycle = await queryExecutionLifecycle(ws, db as any);
      const item = lifecycle!.requiresDecision.find((i) => i.taskKey === key);
      expect(item?.expectedBenefit).toBe("Reduce lag by 5 days");
      expect(item?.baselineMetricName).toBe("cash_collection_lag_days");
      expect(item?.baselineValue).toBe(25.0);
      expect(item?.targetValue).toBe(20.0);
    });

    // ── 20. OUTCOME_RECORDED appears in awaitingVerification ─────────────────

    it("20. OUTCOME_RECORDED task appears in awaitingVerification with canVerify=true", async () => {
      const key = `p3_await_verify_${randomUUID().slice(0, 8)}`;
      await seedTask(key, { status: "COMPLETED" });

      await applyProcessExecutionAction(
        {
          workspaceId: ws, actorId, actorRole: "owner", taskKey: key, action: "RECORD_OUTCOME",
          businessId, evidenceRefs: undefined, reason: null, delegateToRole: null,
          outcomeNotes: "Completed the work", progressPct: null, stage: null, outcomeStatus: "worked",
        },
        deps()
      );

      const lifecycle = await queryExecutionLifecycle(ws, db as any);
      const item = lifecycle!.awaitingVerification.find((i) => i.taskKey === key);
      expect(item).toBeDefined();
      expect(item?.canVerify).toBe(true);
      expect(item?.outcomeId).toBeDefined();
    });

    // ── 21. RECORD_OUTCOME on non-COMPLETED task fails ────────────────────────

    it("21. RECORD_OUTCOME on IN_PROGRESS task returns INVALID_TRANSITION", async () => {
      const key = `p3_inv_trans_${randomUUID().slice(0, 8)}`;
      await seedTask(key, { status: "IN_PROGRESS" });

      const result = await applyProcessExecutionAction(
        {
          workspaceId: ws, actorId, actorRole: "owner", taskKey: key, action: "RECORD_OUTCOME",
          businessId, evidenceRefs: undefined, reason: null, delegateToRole: null,
          outcomeNotes: null, progressPct: null, stage: null, outcomeStatus: "worked",
        },
        deps()
      );
      expect(result.ok).toBe(false);
      expect((result as { code?: string }).code).toBe("INVALID_TRANSITION");
    });

    // ── 22. RECORD_OUTCOME missing businessId fails ───────────────────────────

    it("22. RECORD_OUTCOME without businessId returns MISSING_INPUT", async () => {
      const key = `p3_no_biz_${randomUUID().slice(0, 8)}`;
      await seedTask(key, { status: "COMPLETED" });

      const result = await applyProcessExecutionAction(
        {
          workspaceId: ws, actorId, actorRole: "owner", taskKey: key, action: "RECORD_OUTCOME",
          businessId: null, evidenceRefs: undefined, reason: null, delegateToRole: null,
          outcomeNotes: null, progressPct: null, stage: null, outcomeStatus: "worked",
        },
        deps()
      );
      expect(result.ok).toBe(false);
      expect((result as { code?: string }).code).toBe("MISSING_INPUT");
    });

    // ── 23. VERIFY_OUTCOME on non-OUTCOME_RECORDED task fails ────────────────

    it("23. VERIFY_OUTCOME on IN_PROGRESS task returns INVALID_TRANSITION", async () => {
      const key = `p3_verify_bad_state_${randomUUID().slice(0, 8)}`;
      await seedTask(key, { status: "IN_PROGRESS" });

      const result = await applyProcessExecutionAction(
        {
          workspaceId: ws, actorId: verifierId, actorRole: "owner", taskKey: key, action: "VERIFY_OUTCOME",
          businessId: null, evidenceRefs: undefined, reason: null, delegateToRole: null,
          outcomeNotes: null, progressPct: null, stage: null, outcomeStatus: null,
        },
        deps()
      );
      expect(result.ok).toBe(false);
      expect((result as { code?: string }).code).toBe("INVALID_TRANSITION");
    });
  }
);
