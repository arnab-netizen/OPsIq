/* eslint-disable @typescript-eslint/no-explicit-any -- Prisma `db` proxy returns untyped rows; explicit any is pragmatic here */
/**
 * Owner Sales (Module 3) — diagnosis service.
 *
 * Runs the deterministic sales diagnosis + action plan from a persisted snapshot
 * and persists an OwnerSalesCycle + findings + actions atomically. Workspace
 * ownership is enforced; nothing is invented.
 *
 * Persists findings/actions with `createMany` (findings before actions, so the
 * action→finding FK holds) inside a single transaction with an explicit timeout —
 * the distress path emits many rows and per-row creates inside an interactive
 * transaction can exceed the pooled-connection limit (the Prisma P2028 the
 * cashflow runtime proof caught). This keeps the governed write atomic and fast.
 */
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { NotFoundError } from "@/infra/errors";
import { getBusiness } from "@/services/founder-recovery/business.service";
import { diagnoseSalesSnapshot } from "@/domain/owner-sales/diagnosis";
import { planSalesActionsFromDiagnosis } from "@/domain/owner-sales/actions";
import { getSalesSnapshot, rowToSalesInput } from "./snapshot.service";

export async function runSalesDiagnosis(
  businessId: string,
  snapshotId: string,
  actorId: string,
  workspaceId: string
) {
  await getBusiness(businessId, workspaceId);
  const snapshotRow = await getSalesSnapshot(snapshotId, workspaceId);
  if (snapshotRow.businessId !== businessId) {
    throw new NotFoundError("OwnerSalesSnapshot", snapshotId);
  }

  const input = rowToSalesInput(snapshotRow);
  const diagnosis = diagnoseSalesSnapshot(input);
  const plan = planSalesActionsFromDiagnosis(diagnosis);

  const previousCycle = await db.ownerSalesCycle.findFirst({
    where: { businessId, workspaceId },
    orderBy: { sequenceNumber: "desc" },
    select: { sequenceNumber: true },
  });
  const sequenceNumber = (previousCycle?.sequenceNumber ?? 0) + 1;
  const cycleId = randomUUID();

  const recByFinding: Record<string, string> = {};
  for (const r of plan.recommendations) recByFinding[r.findingCode] = r.recommendationCode;

  // Pre-build rows (with stable pre-generated IDs) OUTSIDE the transaction.
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
      await tx.ownerSalesCycle.create({
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
          salesState: diagnosis.metrics.salesState,
          generatedAt: diagnosis.generatedAt,
        },
      });
      if (findingRows.length > 0) await tx.ownerSalesFinding.createMany({ data: findingRows });
      if (actionRows.length > 0) await tx.ownerSalesAction.createMany({ data: actionRows });
    },
    { maxWait: 10000, timeout: 20000 }
  );

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.OWNER_SALES_DIAGNOSIS_RUN,
    actorId,
    workspaceId,
    entityType: "OwnerSalesCycle",
    entityId: cycleId,
    payload: {
      businessId,
      sequenceNumber,
      findingCount: diagnosis.findings.length,
      actionCount: plan.actions.length,
      salesState: diagnosis.metrics.salesState,
    },
  });

  return getSalesDiagnosis(cycleId, workspaceId);
}

export async function getSalesDiagnosis(cycleId: string, workspaceId: string) {
  const cycle = await db.ownerSalesCycle.findFirst({
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
  if (!cycle) throw new NotFoundError("OwnerSalesCycle", cycleId);
  return cycle;
}

export async function listSalesCycleFindings(cycleId: string, workspaceId: string) {
  const cycle = await db.ownerSalesCycle.findFirst({
    where: { id: cycleId, workspaceId },
    select: { id: true },
  });
  if (!cycle) throw new NotFoundError("OwnerSalesCycle", cycleId);
  return db.ownerSalesFinding.findMany({
    where: { cycleId, workspaceId },
    orderBy: [{ severity: "asc" }, { impactScore: "desc" }],
  });
}

export async function listSalesCycleActions(cycleId: string, workspaceId: string) {
  const cycle = await db.ownerSalesCycle.findFirst({
    where: { id: cycleId, workspaceId },
    select: { id: true },
  });
  if (!cycle) throw new NotFoundError("OwnerSalesCycle", cycleId);
  return db.ownerSalesAction.findMany({
    where: { cycleId, workspaceId },
    orderBy: { priorityScore: "desc" },
    include: { verifications: { orderBy: { createdAt: "desc" } } },
  });
}
