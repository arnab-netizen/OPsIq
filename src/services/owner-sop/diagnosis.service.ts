/* eslint-disable @typescript-eslint/no-explicit-any -- Prisma `db` proxy returns untyped rows; explicit any is pragmatic here */
/**
 * Owner SOP & Execution Accountability (Module 7) — diagnosis service.
 *
 * Runs the deterministic execution diagnosis + action plan from a persisted
 * snapshot and persists an OwnerSopCycle + findings + actions atomically.
 * Workspace ownership is enforced; nothing is invented.
 *
 * Persists findings/actions with `createMany` (findings before actions, so the
 * action→finding FK holds) inside a single transaction with an explicit timeout —
 * the breakdown path emits many rows and per-row creates inside an interactive
 * transaction can exceed the pooled-connection limit (the Prisma P2028 the
 * cashflow runtime proof caught). This keeps the governed write atomic and fast.
 */
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { ENGAGED_ACTION_STATUSES, planWithContinuity } from "@/domain/founder-recovery/action-continuity";

/** Engaged prior action row read for cross-cycle continuity (see action-continuity.ts). */
interface EngagedPriorAction {
  id: string;
  cycleId: string;
  findingCode: string;
  recommendationCode: string;
  priorityScore: number;
}
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { NotFoundError } from "@/infra/errors";
import { getBusiness } from "@/services/founder-recovery/business.service";
import { diagnoseSopSnapshot } from "@/domain/owner-sop/diagnosis";
import { planSopActionsFromDiagnosis } from "@/domain/owner-sop/actions";
import { getSopSnapshot, rowToSopInput } from "./snapshot.service";

export async function runSopDiagnosis(
  businessId: string,
  snapshotId: string,
  actorId: string,
  workspaceId: string
) {
  await getBusiness(businessId, workspaceId);
  const snapshotRow = await getSopSnapshot(snapshotId, workspaceId);
  if (snapshotRow.businessId !== businessId) {
    throw new NotFoundError("OwnerSopSnapshot", snapshotId);
  }

  const input = rowToSopInput(snapshotRow);
  const diagnosis = diagnoseSopSnapshot(input);
  const plan = planSopActionsFromDiagnosis(diagnosis);

  const previousCycle = await db.ownerSopCycle.findFirst({
    where: { businessId, workspaceId },
    orderBy: { sequenceNumber: "desc" },
    select: { sequenceNumber: true },
  });
  const sequenceNumber = (previousCycle?.sequenceNumber ?? 0) + 1;
  const cycleId = randomUUID();

  const recByFinding: Record<string, string> = {};
  for (const r of plan.recommendations) recByFinding[r.findingCode] = r.recommendationCode;

  const findingIdByCode: Record<string, string> = {};
  const findingRows = diagnosis.findings.map((f) => {
    const id = randomUUID();
    findingIdByCode[f.code] = id;
    return {
      id,
      workspaceId,
      businessId,
      cycleId,
      findingType: f.findingType,
      code: f.code,
      title: f.title,
      summary: f.summary,
      sourceMetric: f.sourceMetric,
      sourceValue: f.sourceValue ?? null,
      threshold: f.threshold ?? null,
      severity: f.severity,
      confidence: f.confidence,
      impactScore: f.impactScore,
      urgencyScore: f.urgencyScore,
      evidence: f.evidence,
      missingData: f.missingData,
      verificationMetric: f.verificationMetric ?? null,
    };
  });
  const actionRows = plan.actions.map((a) => ({
    id: randomUUID(),
    workspaceId,
    businessId,
    cycleId,
    findingId: findingIdByCode[a.findingCode] ?? null,
    recommendationCode: recByFinding[a.findingCode] ?? a.findingCode,
    findingCode: a.findingCode,
    title: a.title,
    description: a.description,
    ownerRole: a.ownerRole,
    status: "proposed",
    priorityScore: a.priorityScore,
    effortScore: a.effortScore,
    expectedImpactScore: a.expectedImpactScore,
    confidence: a.confidence,
    verificationMetric: a.verificationMetric,
    verificationMethod: a.verificationMethod,
    expectedTimeframeDays: a.expectedTimeframeDays,
  }));

  let carriedForwardIds: string[] = [];
  await db.$transaction(
    async (tx: any) => {
      await tx.ownerSopCycle.create({
        data: {
          id: cycleId,
          workspaceId,
          businessId,
          snapshotId,
          sequenceNumber,
          status: "open",
          healthScore: diagnosis.domainScore.healthScore,
          riskScore: diagnosis.domainScore.riskScore,
          opportunityScore: diagnosis.domainScore.opportunityScore,
          dataConfidenceScore: diagnosis.domainScore.dataConfidenceScore,
          executionState: diagnosis.metrics.executionState,
          generatedAt: diagnosis.generatedAt,
        },
      });
      if (findingRows.length > 0) await tx.ownerSopFinding.createMany({ data: findingRows });
      // Continuity: an action the owner has taken on for the same finding/recommendation is
      // carried forward (re-prioritised), not duplicated (see action-continuity.ts).
      const engagedPrior: EngagedPriorAction[] = await tx.ownerSopAction.findMany({
        where: { businessId, workspaceId, status: { in: [...ENGAGED_ACTION_STATUSES] } },
        select: { id: true, cycleId: true, findingCode: true, recommendationCode: true, priorityScore: true },
      });
      const continuity = planWithContinuity(actionRows, engagedPrior);
      carriedForwardIds = [];
      // Re-attach each carried action to this cycle (ranking and wording re-evaluated) so every reader
      // of the latest cycle sees the owner's in-flight work; audited in the same transaction. The
      // original findingId is kept: it holds the baseline measured before the work started.
      // Guarded by status: an action finished/cancelled meanwhile is not moved; a fresh proposal
      // is created for it instead.
      const recreate: typeof continuity.toCreate = [];
      const movedPlanned = new Set<(typeof continuity.toCreate)[number]>();
      for (const c of continuity.carried) {
        const moved = await tx.ownerSopAction.updateMany({
          where: { id: c.prior.id, status: { in: [...ENGAGED_ACTION_STATUSES] } },
          data: {
            cycleId,
            description: c.planned.description,
            verificationMethod: c.planned.verificationMethod,
            expectedTimeframeDays: c.planned.expectedTimeframeDays,
            priorityScore: c.planned.priorityScore,
            expectedImpactScore: c.planned.expectedImpactScore,
            effortScore: c.planned.effortScore,
            confidence: c.planned.confidence,
          },
        });
        if (moved.count === 0) continue;
        movedPlanned.add(c.planned);
        await emitAuditEvent(
          {
            eventName: AUDIT_EVENTS.OWNER_SOP_ACTION_UPDATED,
            actorId,
            workspaceId,
            entityType: "OwnerSopAction",
            entityId: c.prior.id,
            payload: {
              reason: "carried_forward_by_diagnosis",
              fromCycleId: c.prior.cycleId,
              toCycleId: cycleId,
              priorityScore: { from: c.prior.priorityScore, to: c.planned.priorityScore },
            },
          },
          tx
        );
        carriedForwardIds.push(c.prior.id);
      }
      for (const c of continuity.carried) {
        if (!movedPlanned.has(c.planned) && !recreate.includes(c.planned)) recreate.push(c.planned);
      }
      const toCreate = [...continuity.toCreate, ...recreate];
      if (toCreate.length > 0) await tx.ownerSopAction.createMany({ data: toCreate });
    },
    { maxWait: 10000, timeout: 20000 }
  );

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.OWNER_SOP_DIAGNOSIS_RUN,
    actorId,
    workspaceId,
    entityType: "OwnerSopCycle",
    entityId: cycleId,
    payload: {
      businessId,
      sequenceNumber,
      findingCount: diagnosis.findings.length,
      actionCount: plan.actions.length - carriedForwardIds.length,
      carriedForwardActionIds: carriedForwardIds,
      executionState: diagnosis.metrics.executionState,
    },
  });

  return getSopDiagnosis(cycleId, workspaceId);
}

export async function getSopDiagnosis(cycleId: string, workspaceId: string) {
  const cycle = await db.ownerSopCycle.findFirst({
    where: { id: cycleId, workspaceId },
    include: {
      snapshot: true,
      findings: { orderBy: { severity: "asc" } },
      actions: {
        include: { verifications: { orderBy: { createdAt: "desc" } } },
        // Deterministic total order: priorityScore is clamped to [0,100], so
        // ties at the ceiling are a real, expected occurrence -- a single-key
        // orderBy has no guaranteed return order for tied rows across
        // repeated SELECTs. Same fix/rationale as dashboard.service.ts (PR #361).
        orderBy: [
          { priorityScore: "desc" },
          { expectedImpactScore: "desc" },
          { confidence: "desc" },
          { findingCode: "asc" },
          { title: "asc" },
          { id: "asc" },
        ],
      },
    },
  });
  if (!cycle) throw new NotFoundError("OwnerSopCycle", cycleId);
  return cycle;
}

export async function listSopCycleFindings(cycleId: string, workspaceId: string) {
  const cycle = await db.ownerSopCycle.findFirst({
    where: { id: cycleId, workspaceId },
    select: { id: true },
  });
  if (!cycle) throw new NotFoundError("OwnerSopCycle", cycleId);
  return db.ownerSopFinding.findMany({
    where: { cycleId, workspaceId },
    orderBy: [{ severity: "asc" }, { impactScore: "desc" }],
  });
}

export async function listSopCycleActions(cycleId: string, workspaceId: string) {
  const cycle = await db.ownerSopCycle.findFirst({
    where: { id: cycleId, workspaceId },
    select: { id: true },
  });
  if (!cycle) throw new NotFoundError("OwnerSopCycle", cycleId);
  return db.ownerSopAction.findMany({
    where: { cycleId, workspaceId },
    orderBy: [
      { priorityScore: "desc" },
      { expectedImpactScore: "desc" },
      { confidence: "desc" },
      { findingCode: "asc" },
      { title: "asc" },
      { id: "asc" },
    ],
    include: { verifications: { orderBy: { createdAt: "desc" } } },
  });
}
