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
import { OPEN_ACTION_STATUSES, withoutOpenDuplicates } from "@/domain/founder-recovery/action-continuity";
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

  // Pre-build all rows (with stable pre-generated IDs) OUTSIDE the transaction so
  // the governed write is a few bulk statements, not one network round-trip per
  // row. The cashflow crisis path emits ~10+ findings + ~10+ actions; doing that
  // as sequential per-row creates inside an interactive transaction exceeds the
  // default 5s limit on the pooled Neon connection and fails with Prisma P2028.
  // `createMany` (findings before actions, so the action→finding FK is satisfied)
  // plus an explicit timeout keeps cycle+findings+actions atomic and fast.
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

  let carriedForward = 0;
  await db.$transaction(
    async (tx: any) => {
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
      if (findingRows.length > 0) {
        await tx.ownerCashflowFinding.createMany({ data: findingRows });
      }
      // Continuity: an action still open for the same finding/recommendation is carried
      // forward, not duplicated (see action-continuity.ts).
      const openPrior = await tx.ownerCashflowAction.findMany({
        where: { businessId, workspaceId, status: { in: [...OPEN_ACTION_STATUSES] } },
        select: { findingCode: true, recommendationCode: true },
      });
      const continuity = withoutOpenDuplicates(actionRows, openPrior);
      carriedForward = continuity.carriedForward;
      if (continuity.toCreate.length > 0) await tx.ownerCashflowAction.createMany({ data: continuity.toCreate });
    },
    { maxWait: 10000, timeout: 20000 }
  );

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
      actionCount: plan.actions.length - carriedForward,
      carriedForwardCount: carriedForward,
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
