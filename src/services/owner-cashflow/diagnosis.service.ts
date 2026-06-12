/* eslint-disable @typescript-eslint/no-explicit-any -- Prisma `db` proxy returns untyped rows; explicit any is pragmatic here */
/**
 * Owner Cashflow (Module 5) — diagnosis service.
 *
 * Runs the deterministic cashflow diagnosis + action plan from a persisted
 * snapshot and persists an OwnerCashflowCycle + findings + actions atomically.
 * Workspace ownership is enforced; nothing is invented.
 */
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { NotFoundError } from "@/infra/errors";
import { getBusiness } from "@/services/founder-recovery/business.service";
import { diagnoseCashflowSnapshot } from "@/domain/owner-cashflow/diagnosis";
import { planCashflowActionsFromDiagnosis } from "@/domain/owner-cashflow/actions";
import { getCashflowSnapshot, rowToCashflowInput } from "./snapshot.service";

export async function runCashflowDiagnosis(
  businessId: string,
  snapshotId: string,
  actorId: string,
  workspaceId: string
) {
  await getBusiness(businessId, workspaceId);
  const snapshotRow = await getCashflowSnapshot(snapshotId, workspaceId);
  if (snapshotRow.businessId !== businessId) {
    throw new NotFoundError("OwnerCashflowSnapshot", snapshotId);
  }

  const input = rowToCashflowInput(snapshotRow);
  const diagnosis = diagnoseCashflowSnapshot(input);
  const plan = planCashflowActionsFromDiagnosis(diagnosis);

  const previousCycle = await db.ownerCashflowCycle.findFirst({
    where: { businessId, workspaceId },
    orderBy: { sequenceNumber: "desc" },
    select: { sequenceNumber: true },
  });
  const sequenceNumber = (previousCycle?.sequenceNumber ?? 0) + 1;
  const cycleId = randomUUID();

  const recByFinding: Record<string, string> = {};
  for (const r of plan.recommendations) recByFinding[r.findingCode] = r.recommendationCode;

  await db.$transaction(async (tx: any) => {
    await tx.ownerCashflowCycle.create({
      data: {
        id: cycleId,
        workspaceId,
        businessId,
        snapshotId,
        sequenceNumber,
        status: "open",
        healthScore: diagnosis.domainScore.healthScore,
        dangerScore: diagnosis.domainScore.riskScore,
        opportunityScore: diagnosis.domainScore.opportunityScore,
        dataConfidenceScore: diagnosis.domainScore.dataConfidenceScore,
        cashflowState: diagnosis.metrics.cashflowState,
        generatedAt: diagnosis.generatedAt,
      },
    });

    const findingIdByCode: Record<string, string> = {};
    for (const f of diagnosis.findings) {
      const id = randomUUID();
      findingIdByCode[f.code] = id;
      await tx.ownerCashflowFinding.create({
        data: {
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
        },
      });
    }

    for (const a of plan.actions) {
      await tx.ownerCashflowAction.create({
        data: {
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
        },
      });
    }
  });

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.OWNER_CASHFLOW_DIAGNOSIS_RUN,
    actorId,
    workspaceId,
    entityType: "OwnerCashflowCycle",
    entityId: cycleId,
    payload: {
      businessId,
      sequenceNumber,
      findingCount: diagnosis.findings.length,
      actionCount: plan.actions.length,
      cashflowState: diagnosis.metrics.cashflowState,
    },
  });

  return getCashflowDiagnosis(cycleId, workspaceId);
}

export async function getCashflowDiagnosis(cycleId: string, workspaceId: string) {
  const cycle = await db.ownerCashflowCycle.findFirst({
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
  if (!cycle) throw new NotFoundError("OwnerCashflowCycle", cycleId);
  return cycle;
}

export async function listCashflowCycleFindings(cycleId: string, workspaceId: string) {
  const cycle = await db.ownerCashflowCycle.findFirst({
    where: { id: cycleId, workspaceId },
    select: { id: true },
  });
  if (!cycle) throw new NotFoundError("OwnerCashflowCycle", cycleId);
  return db.ownerCashflowFinding.findMany({
    where: { cycleId, workspaceId },
    orderBy: [{ severity: "asc" }, { impactScore: "desc" }],
  });
}

export async function listCashflowCycleActions(cycleId: string, workspaceId: string) {
  const cycle = await db.ownerCashflowCycle.findFirst({
    where: { id: cycleId, workspaceId },
    select: { id: true },
  });
  if (!cycle) throw new NotFoundError("OwnerCashflowCycle", cycleId);
  return db.ownerCashflowAction.findMany({
    where: { cycleId, workspaceId },
    orderBy: { priorityScore: "desc" },
    include: { verifications: { orderBy: { createdAt: "desc" } } },
  });
}
