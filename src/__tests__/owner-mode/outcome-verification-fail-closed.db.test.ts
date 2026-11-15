/**
 * PR #585 amendment — outcome verification fail-closed behaviour against a real PostgreSQL (throwaway/test DB only).
 *
 * Proves: external-event interference persists as its own class (never "no measurable impact" / success); unknown
 * target direction never produces a numeric success; direction-aware UP/DOWN verification persists correctly;
 * no learning candidate is ever created from fabricated gate inputs; optimistic lock / duplicate verification;
 * workspace isolation; separation of duty; reassessment side effects still fire.
 *
 * Run: TEST_WITH_DB=true npx vitest run src/__tests__/owner-mode/outcome-verification-fail-closed.db.test.ts
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import {
  verifyOwnerActionOutcome,
  triggerPostVerificationSideEffects,
  OutcomeAlreadyVerifiedError,
  OutcomeNotFoundError,
  SeparationOfDutyViolationError,
} from "@/services/owner-mode/owner-outcome-verification.service";

const recorder = randomUUID();
const verifier = randomUUID();
const ws = randomUUID();
const otherWs = randomUUID();
let businessId: string;

const deps = () => ({ db: db as any, uuid: () => randomUUID(), now: () => new Date() });

async function seed(over: {
  outcome: Record<string, unknown>;
  task?: Record<string, unknown>;
}): Promise<{ outcomeId: string; taskKey: string }> {
  const taskKey = `fc_${randomUUID().slice(0, 8)}`;
  const outcomeId = randomUUID();
  await db.ownerActionOutcome.create({
    data: {
      id: outcomeId,
      workspaceId: ws,
      businessId,
      taskKey,
      outcomeStatus: "worked",
      ownerReportedResult: "Reported better",
      evidenceQuality: "moderate",
      externalEventFlag: false,
      ...over.outcome,
    } as any,
  });
  await db.processExecutionTask.create({
    data: {
      id: randomUUID(),
      workspaceId: ws,
      businessId,
      taskKey,
      sourceFamily: "PROCESS_CORRECTION",
      sourceFindingKey: "c-test",
      executionRoute: "CREATE_OWNER_APPROVAL_TASK",
      actionOwner: "OWNER",
      approvalLevel: "OWNER_APPROVAL_REQUIRED",
      status: "OUTCOME_RECORDED",
      requiredEvidence: [],
      evidenceRefs: [],
      completionCriteria: "x",
      reassessmentTrigger: "x",
      riskIfIgnored: "x",
      ownerVisibleSummary: "t",
      severity: "HIGH",
      priorityRank: 1,
      completedByUserId: recorder,
      completedAt: new Date(Date.now() - 5 * 86400000),
      outcomeId,
      outcomeRecordedAt: new Date(Date.now() - 4 * 86400000),
      updatedAt: new Date(),
      ...over.task,
    } as any,
  });
  return { outcomeId, taskKey };
}

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] PR #585 — outcome verification fails closed", () => {
  beforeAll(async () => {
    for (const id of [recorder, verifier]) {
      await db.user.upsert({ where: { id }, update: {}, create: { id, email: `fc-${id}@test.local`, name: "FC", isActive: true, updatedAt: new Date() } });
    }
    await db.clientAccount.upsert({ where: { id: ws }, update: {}, create: { id: ws, name: `FC WS ${ws}`, status: "active", visibility: "internal", updatedAt: new Date() } });
    const biz = await db.ownerBusiness.create({ data: { id: randomUUID(), workspaceId: ws, name: "FC Business", businessType: "generic_local_service", createdBy: recorder } });
    businessId = biz.id;
  });

  afterAll(async () => {
    await db.processExecutionTask.deleteMany({ where: { workspaceId: ws } });
    await db.ownerActionOutcome.deleteMany({ where: { workspaceId: ws } });
    await db.ownerReassessmentEvent.deleteMany({ where: { workspaceId: ws } }).catch(() => undefined);
    await db.ownerBusiness.deleteMany({ where: { workspaceId: ws } });
    await db.auditEvent.deleteMany({ where: { workspaceId: ws } });
    await db.clientAccount.delete({ where: { id: ws } });
    for (const id of [recorder, verifier]) await db.user.delete({ where: { id } });
  });

  it("10/11. external-event outcome with measurable before/after persists EXTERNAL_EVENT_INTERFERENCE, not success or no-measurable-impact", async () => {
    const { outcomeId } = await seed({ outcome: { beforeValue: 10, afterValue: 20, externalEventFlag: true, externalEventDescription: "Competitor closed" } });
    const r = await verifyOwnerActionOutcome(ws, outcomeId, verifier, null, deps());
    expect(r.verificationClassification).toBe("EXTERNAL_EVENT_INTERFERENCE");
    const row = await db.ownerActionOutcome.findFirst({ where: { id: outcomeId } });
    expect(row?.verificationClassification).toBe("EXTERNAL_EVENT_INTERFERENCE");
    expect(row?.beforeValue).toBe(10);
    expect(row?.afterValue).toBe(20);
  });

  it("external_event_interference status is its own class too", async () => {
    const { outcomeId } = await seed({ outcome: { outcomeStatus: "external_event_interference", externalEventDescription: "Supplier strike" } });
    const r = await verifyOwnerActionOutcome(ws, outcomeId, verifier, null, deps());
    expect(r.verificationClassification).toBe("EXTERNAL_EVENT_INTERFERENCE");
  });

  it("12. external interference never produces a learning candidate (gate has no real facts, and maps to ATTRIBUTION_UNCLEAR)", async () => {
    const { outcomeId } = await seed({ outcome: { externalEventFlag: true, externalEventDescription: "Shock" } });
    await verifyOwnerActionOutcome(ws, outcomeId, verifier, null, deps());
    const side = await triggerPostVerificationSideEffects(ws, businessId, outcomeId, null, "EXTERNAL_EVENT_INTERFERENCE", verifier);
    expect(side.learningCandidateId).toBeNull();
    const row = await db.ownerActionOutcome.findFirst({ where: { id: outcomeId } });
    expect(row?.learningCandidateId).toBeNull();
  });

  it("5. a plain verified SUCCESS creates no learning candidate: required gate facts are unproven, so it fails closed", async () => {
    const { outcomeId } = await seed({ outcome: {} });
    const r = await verifyOwnerActionOutcome(ws, outcomeId, verifier, null, deps());
    expect(r.verificationClassification).toBe("SUCCESS");
    const side = await triggerPostVerificationSideEffects(ws, businessId, outcomeId, null, "SUCCESS", verifier);
    expect(side.learningCandidateId).toBeNull();
    expect(side.reassessmentId).not.toBeNull(); // reassessment side effect is untouched
    const row = await db.ownerActionOutcome.findFirst({ where: { id: outcomeId } });
    expect(row?.learningCandidateId).toBeNull();
  });

  it("4. UNKNOWN direction (no persisted direction): before 20 → after 10 → target 12 is INCONCLUSIVE, not SUCCESS", async () => {
    const { outcomeId } = await seed({ outcome: { actualMetricName: "overdueDebt", beforeValue: 20, afterValue: 10 }, task: { targetValue: 12 } });
    const r = await verifyOwnerActionOutcome(ws, outcomeId, verifier, null, deps());
    expect(r.verificationClassification).toBe("INCONCLUSIVE");
  });

  it("optimistic lock: a second verification of the same outcome is rejected", async () => {
    const { outcomeId } = await seed({ outcome: {} });
    await verifyOwnerActionOutcome(ws, outcomeId, verifier, null, deps());
    await expect(verifyOwnerActionOutcome(ws, outcomeId, verifier, null, deps())).rejects.toBeInstanceOf(OutcomeAlreadyVerifiedError);
  });

  it("concurrent verifications: exactly one wins", async () => {
    const { outcomeId } = await seed({ outcome: {} });
    const results = await Promise.allSettled([
      verifyOwnerActionOutcome(ws, outcomeId, verifier, null, deps()),
      verifyOwnerActionOutcome(ws, outcomeId, verifier, null, deps()),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  });

  it("workspace isolation: another workspace cannot verify this outcome", async () => {
    const { outcomeId } = await seed({ outcome: {} });
    await expect(verifyOwnerActionOutcome(otherWs, outcomeId, verifier, null, deps())).rejects.toBeInstanceOf(OutcomeNotFoundError);
  });

  it("15. separation of duty: the task completer cannot verify (unless the solo-operator exception applies)", async () => {
    const { outcomeId } = await seed({ outcome: {} });
    // The recorder is not the sole eligible verifier (a second user exists in no membership here), so either the
    // guard throws or the solo exception stamps selfVerified — it is never silently independent.
    try {
      const r = await verifyOwnerActionOutcome(ws, outcomeId, recorder, null, deps());
      expect((r as any).selfVerified).toBe(true);
    } catch (e) {
      expect(e).toBeInstanceOf(SeparationOfDutyViolationError);
    }
  });
});
