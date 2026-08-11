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

  const snapshotEnd = snapshotRow.periodEnd instanceof Date
    ? snapshotRow.periodEnd
    : new Date(snapshotRow.periodEnd as string);

  // DEFECT 1: Enrich engine input with bank balance from a compatible cashflow snapshot.
  // At-or-before semantics: only a cashflow snapshot whose periodEnd ≤ finance snapshot periodEnd
  // may enrich it (future cashflow must never influence a past diagnosis).
  // Freshness window: ≤ 45 days before the finance snapshot periodEnd.
  // Fail-closed: absent/stale/future cashflow → bankBalance stays undefined (not zero).
  const cashflowRow = await db.ownerCashflowSnapshot.findFirst({
    where: { workspaceId, businessId, periodEnd: { lte: snapshotEnd } },
    orderBy: { periodEnd: "desc" },
    select: { bankBalance: true, periodEnd: true },
  });

  const input = rowToFinanceInput(snapshotRow);

  if (cashflowRow?.bankBalance != null && Number.isFinite(cashflowRow.bankBalance)) {
    const cfEnd = cashflowRow.periodEnd instanceof Date
      ? cashflowRow.periodEnd
      : new Date(cashflowRow.periodEnd as string);
    // ageDays is always ≥ 0 here because cfEnd ≤ snapshotEnd (enforced by the query filter)
    const ageDays = (snapshotEnd.getTime() - cfEnd.getTime()) / 86_400_000;
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

  // DEFECT 4 — enrichment gap: when the finance snapshot has no totalDebtOutstanding
  // (e.g. column was added after the snapshot was recorded), fall back to the most recent
  // owner-confirmed cash_debt intake for this workspace+business.
  // Precedence: snapshot.totalDebtOutstanding (when present) > confirmed intake > absent.
  // Only confirmed intakes with a finite non-negative value are accepted.
  if (input.totalDebtOutstanding == null) {
    const intakeRow = await db.ownerDataIntake.findFirst({
      where: { workspaceId, businessId, ownerConfirmed: true, targetDomain: "cash_debt" },
      orderBy: [{ confirmedAt: "desc" }, { createdAt: "desc" }],
      select: { records: true },
    });
    if (intakeRow) {
      const records = intakeRow.records as unknown[];
      const first = Array.isArray(records) && records.length > 0 && typeof records[0] === "object" && records[0] !== null
        ? (records[0] as Record<string, unknown>)
        : null;
      if (first) {
        const v = first["totalOutstandingDebt"];
        if (typeof v === "number" && Number.isFinite(v) && v >= 0) {
          input.totalDebtOutstanding = v;
        }
      }
    }
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
