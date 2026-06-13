/* eslint-disable @typescript-eslint/no-explicit-any -- Prisma `db` proxy returns untyped rows; explicit any is pragmatic here */
/**
 * Owner Strategy & Scenario Planning (Module 8) — diagnosis service.
 *
 * Runs the deterministic scenario diagnosis + action plan from a persisted
 * snapshot and persists an OwnerStrategyCycle + findings + actions atomically.
 * Workspace ownership is enforced; nothing is invented.
 *
 * Persists findings/actions with `createMany` (findings before actions, so the
 * action→finding FK holds) inside a single transaction with an explicit timeout —
 * applying the cashflow P2028 lesson. Keeps the governed write atomic and fast.
 */
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { NotFoundError } from "@/infra/errors";
import { getBusiness } from "@/services/founder-recovery/business.service";
import { diagnoseStrategySnapshot } from "@/domain/owner-strategy/diagnosis";
import { planStrategyActionsFromDiagnosis } from "@/domain/owner-strategy/actions";
import { getStrategySnapshot, rowToStrategyInput } from "./snapshot.service";

export async function runStrategyDiagnosis(
  businessId: string,
  snapshotId: string,
  actorId: string,
  workspaceId: string
) {
  await getBusiness(businessId, workspaceId);
  const snapshotRow = await getStrategySnapshot(snapshotId, workspaceId);
  if (snapshotRow.businessId !== businessId) {
    throw new NotFoundError("OwnerStrategySnapshot", snapshotId);
  }

  const input = rowToStrategyInput(snapshotRow);
  const diagnosis = diagnoseStrategySnapshot(input);
  const plan = planStrategyActionsFromDiagnosis(diagnosis);

  const previousCycle = await db.ownerStrategyCycle.findFirst({
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

  await db.$transaction(
    async (tx: any) => {
      await tx.ownerStrategyCycle.create({
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
          strategyState: diagnosis.metrics.strategyState,
          generatedAt: diagnosis.generatedAt,
        },
      });
      if (findingRows.length > 0) await tx.ownerStrategyFinding.createMany({ data: findingRows });
      if (actionRows.length > 0) await tx.ownerStrategyAction.createMany({ data: actionRows });
    },
    { maxWait: 10000, timeout: 20000 }
  );

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.OWNER_STRATEGY_DIAGNOSIS_RUN,
    actorId,
    workspaceId,
    entityType: "OwnerStrategyCycle",
    entityId: cycleId,
    payload: {
      businessId,
      sequenceNumber,
      findingCount: diagnosis.findings.length,
      actionCount: plan.actions.length,
      strategyState: diagnosis.metrics.strategyState,
    },
  });

  return getStrategyDiagnosis(cycleId, workspaceId);
}

export async function getStrategyDiagnosis(cycleId: string, workspaceId: string) {
  const cycle = await db.ownerStrategyCycle.findFirst({
    where: { id: cycleId, workspaceId },
    include: {
      snapshot: true,
      findings: { orderBy: { severity: "asc" } },
      actions: {
        include: { verifications: { orderBy: { createdAt: "desc" } } },
        orderBy: { priorityScore: "desc" },
      },
    },
  });
  if (!cycle) throw new NotFoundError("OwnerStrategyCycle", cycleId);
  return cycle;
}

export async function listStrategyCycleFindings(cycleId: string, workspaceId: string) {
  const cycle = await db.ownerStrategyCycle.findFirst({
    where: { id: cycleId, workspaceId },
    select: { id: true },
  });
  if (!cycle) throw new NotFoundError("OwnerStrategyCycle", cycleId);
  return db.ownerStrategyFinding.findMany({
    where: { cycleId, workspaceId },
    orderBy: [{ severity: "asc" }, { impactScore: "desc" }],
  });
}

export async function listStrategyCycleActions(cycleId: string, workspaceId: string) {
  const cycle = await db.ownerStrategyCycle.findFirst({
    where: { id: cycleId, workspaceId },
    select: { id: true },
  });
  if (!cycle) throw new NotFoundError("OwnerStrategyCycle", cycleId);
  return db.ownerStrategyAction.findMany({
    where: { cycleId, workspaceId },
    orderBy: { priorityScore: "desc" },
    include: { verifications: { orderBy: { createdAt: "desc" } } },
  });
}
