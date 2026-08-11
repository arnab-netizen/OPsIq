/* eslint-disable @typescript-eslint/no-explicit-any -- Prisma `db` proxy returns untyped rows; explicit any is pragmatic here */
/**
 * Owner Finance (Module 2) — diagnosis service.
 *
 * Runs the deterministic finance diagnosis + action plan from a persisted
 * snapshot and persists an OwnerFinanceCycle + findings + actions atomically.
 * Workspace ownership is enforced; nothing is invented.
 */
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { NotFoundError } from "@/infra/errors";
import { getBusiness } from "@/services/founder-recovery/business.service";
import { diagnoseFinanceSnapshot } from "@/domain/owner-finance/diagnosis";
import { planFinanceActionsFromDiagnosis } from "@/domain/owner-finance/actions";
import { calculateDataConfidence } from "@/domain/owner-finance/data-confidence";
import { mapBusinessTypeToFinanceIndustryTemplate } from "@/domain/owner-finance/thresholds";
import { getFinancialSnapshot, rowToFinanceInput } from "./snapshot.service";

export async function runFinanceDiagnosis(
  businessId: string,
  snapshotId: string,
  actorId: string,
  workspaceId: string
) {
  const business = await getBusiness(businessId, workspaceId);
  const snapshotRow = await getFinancialSnapshot(snapshotId, workspaceId);
  if (snapshotRow.businessId !== businessId) {
    throw new NotFoundError("OwnerFinancialSnapshot", snapshotId);
  }

  // Fetch latest cashflow snapshot (workspace+business scoped) for bank-balance enrichment.
  const cashflowRow = await db.ownerCashflowSnapshot.findFirst({
    where: { workspaceId, businessId },
    orderBy: { periodEnd: "desc" },
    select: { bankBalance: true, periodEnd: true },
  });

  const input = rowToFinanceInput(snapshotRow);

  // DEFECT 1: Enrich engine input with bank balance from a compatible cashflow snapshot.
  // Compatibility: cashflow periodEnd within 45 days of finance snapshot periodEnd.
  // Fail-closed: absent/stale/incompatible cashflow → bankBalance stays undefined (not zero).
  if (cashflowRow?.bankBalance != null && Number.isFinite(cashflowRow.bankBalance)) {
    const snapshotEnd = snapshotRow.periodEnd instanceof Date ? snapshotRow.periodEnd : new Date(snapshotRow.periodEnd as string);
    const cfEnd = cashflowRow.periodEnd instanceof Date ? cashflowRow.periodEnd : new Date(cashflowRow.periodEnd as string);
    const ageDays = Math.abs(snapshotEnd.getTime() - cfEnd.getTime()) / 86_400_000;
    if (ageDays <= 45) {
      input.bankBalance = cashflowRow.bankBalance;
    }
  }

  // DEFECT 2: When the snapshot has no industryTemplate, resolve one from the canonical
  // business profile (precedence: explicit snapshot override > business-type mapping > generic).
  if (!input.industryTemplate) {
    const mapped = mapBusinessTypeToFinanceIndustryTemplate(business.businessType);
    if (mapped) input.industryTemplate = mapped;
  }

  const diagnosis = diagnoseFinanceSnapshot(input);
  const plan = planFinanceActionsFromDiagnosis(diagnosis);
  const confidence = calculateDataConfidence(input);

  const previousCycle = await db.ownerFinanceCycle.findFirst({
    where: { businessId, workspaceId },
    orderBy: { sequenceNumber: "desc" },
    select: { sequenceNumber: true },
  });
  const sequenceNumber = (previousCycle?.sequenceNumber ?? 0) + 1;
  const cycleId = randomUUID();

  const recByFinding: Record<string, string> = {};
  for (const r of plan.recommendations) recByFinding[r.findingCode] = r.recommendationCode;

  await db.$transaction(async (tx: any) => {
    await tx.ownerFinanceCycle.create({
      data: {
        id: cycleId,
        workspaceId,
        businessId,
        snapshotId,
        sequenceNumber,
        status: "open",
        overallHealthScore: diagnosis.domainScore.healthScore,
        survivalRiskScore: diagnosis.domainScore.riskScore,
        growthOpportunityScore: diagnosis.domainScore.opportunityScore,
        dataConfidenceScore: diagnosis.domainScore.dataConfidenceScore,
        survivalState: diagnosis.metrics.survivalState,
        generatedAt: diagnosis.generatedAt,
      },
    });

    const findingIdByCode: Record<string, string> = {};
    for (const f of diagnosis.findings) {
      const id = randomUUID();
      findingIdByCode[f.code] = id;
      await tx.ownerFinanceFinding.create({
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
      await tx.ownerFinanceAction.create({
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

  const previousCycleForDrift = await db.ownerFinanceCycle.findFirst({
    where: { businessId, workspaceId, id: { not: cycleId } },
    orderBy: { sequenceNumber: "desc" },
    select: { dataConfidenceScore: true, sequenceNumber: true },
  });
  const confidenceDelta = previousCycleForDrift
    ? confidence.dataConfidenceScore - (previousCycleForDrift.dataConfidenceScore ?? 0)
    : null;

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.OWNER_FINANCE_DIAGNOSIS_RUN,
    actorId,
    workspaceId,
    entityType: "OwnerFinanceCycle",
    entityId: cycleId,
    payload: {
      businessId,
      sequenceNumber,
      findingCount: diagnosis.findings.length,
      actionCount: plan.actions.length,
      survivalState: diagnosis.metrics.survivalState,
      dataConfidenceScore: confidence.dataConfidenceScore,
      confidenceTier: confidence.confidenceTier,
      missingCritical: confidence.missingCritical,
      confidenceDelta,
    },
  });

  if (confidence.dataConfidenceScore < 30) {
    await emitAuditEvent({
      eventName: AUDIT_EVENTS.OWNER_FINANCE_DIAGNOSIS_LOW_CONFIDENCE,
      actorId,
      workspaceId,
      entityType: "OwnerFinanceCycle",
      entityId: cycleId,
      payload: {
        businessId,
        dataConfidenceScore: confidence.dataConfidenceScore,
        confidenceTier: confidence.confidenceTier,
        missingCritical: confidence.missingCritical,
      },
    });
  }

  return getFinanceDiagnosis(cycleId, workspaceId);
}

export async function getFinanceDiagnosis(cycleId: string, workspaceId: string) {
  const cycle = await db.ownerFinanceCycle.findFirst({
    where: { id: cycleId, workspaceId },
    include: {
      snapshot: true,
      findings: { orderBy: [{ impactScore: "desc" }, { urgencyScore: "desc" }] },
      actions: {
        include: { verifications: { orderBy: { createdAt: "desc" } } },
        orderBy: { priorityScore: "desc" },
      },
    },
  });
  if (!cycle) throw new NotFoundError("OwnerFinanceCycle", cycleId);
  return cycle;
}

export async function listFinanceCycleFindings(cycleId: string, workspaceId: string) {
  const cycle = await db.ownerFinanceCycle.findFirst({
    where: { id: cycleId, workspaceId },
    select: { id: true },
  });
  if (!cycle) throw new NotFoundError("OwnerFinanceCycle", cycleId);
  return db.ownerFinanceFinding.findMany({
    where: { cycleId, workspaceId },
    orderBy: [{ impactScore: "desc" }, { urgencyScore: "desc" }],
  });
}

export async function listFinanceCycleActions(cycleId: string, workspaceId: string) {
  const cycle = await db.ownerFinanceCycle.findFirst({
    where: { id: cycleId, workspaceId },
    select: { id: true },
  });
  if (!cycle) throw new NotFoundError("OwnerFinanceCycle", cycleId);
  return db.ownerFinanceAction.findMany({
    where: { cycleId, workspaceId },
    orderBy: { priorityScore: "desc" },
    include: { verifications: { orderBy: { createdAt: "desc" } } },
  });
}
