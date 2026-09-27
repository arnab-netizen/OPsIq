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
import { rankOwnerFindingsBySeverity } from "@/domain/owner-spine/contracts";
import { ENGAGED_ACTION_STATUSES, periodEndOf, planWithContinuity } from "@/domain/founder-recovery/action-continuity";

import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { NotFoundError } from "@/infra/errors";
import { getBusiness } from "@/services/founder-recovery/business.service";
import { diagnoseFinanceSnapshot } from "@/domain/owner-finance/diagnosis";
import { planFinanceActionsFromDiagnosis } from "@/domain/owner-finance/actions";
import { calculateDataConfidence } from "@/domain/owner-finance/data-confidence";
import { mapBusinessTypeToFinanceIndustryTemplate } from "@/domain/owner-finance/thresholds";
import { getFinancialSnapshot, rowToFinanceInput } from "./snapshot.service";
import { getFinanceEffectivenessMap } from "./effectiveness.service";

/** Engaged prior action row read for cross-cycle continuity (see action-continuity.ts). */
interface EngagedPriorAction {
  id: string;
  cycleId: string;
  findingCode: string;
  recommendationCode: string;
  priorityScore: number;
  /** The period of the cycle the action is attached to now (back-fill protection). */
  cycle: { snapshot: { periodEnd: Date | string } | null } | null;
}

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

  // Enrich from confirmed cash_debt intake when the snapshot is missing either
  // the principal or the monthly repayment amount.
  // Precedence: snapshot field (when present) > confirmed intake > absent.
  // loanEmiDebtPayments=0 (confirmed zero repayment) is a valid answer and must
  // not be overwritten; only null/undefined triggers enrichment.
  if (input.totalDebtOutstanding == null || input.loanEmiDebtPayments == null) {
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
        if (input.totalDebtOutstanding == null) {
          const v = first["totalOutstandingDebt"];
          if (typeof v === "number" && Number.isFinite(v) && v >= 0) {
            input.totalDebtOutstanding = v;
          }
        }
        // Map confirmed monthlyRepayment → loanEmiDebtPayments so the debt-service
        // pressure metric is computed correctly (0 = confirmed no fixed schedule).
        if (input.loanEmiDebtPayments == null) {
          const m = first["monthlyRepayment"];
          if (typeof m === "number" && Number.isFinite(m) && m >= 0) {
            input.loanEmiDebtPayments = m;
          }
        }
      }
    }
  }

  const diagnosis = diagnoseFinanceSnapshot(input);

  // Query historical effectiveness signals for all finding codes in this diagnosis.
  // Best-effort: a query failure falls back to an empty map (no modifier applied).
  let effectivenessMap;
  try {
    const findingCodes = diagnosis.findings.map((f) => f.code);
    effectivenessMap = await getFinanceEffectivenessMap(workspaceId, findingCodes);
  } catch {
    // Non-fatal: diagnosis proceeds without effectiveness adjustment
  }

  const plan = planFinanceActionsFromDiagnosis(diagnosis, effectivenessMap);
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

  let carriedForwardIds: string[] = [];
  let createdActionCount = 0;
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

    // Continuity: an action the owner has taken on for the same finding/recommendation is
    // carried forward (re-prioritised), not duplicated (see action-continuity.ts).
    const engagedPrior: EngagedPriorAction[] = await tx.ownerFinanceAction.findMany({
      where: { businessId, workspaceId, status: { in: [...ENGAGED_ACTION_STATUSES] } },
      select: { id: true, cycleId: true, findingCode: true, recommendationCode: true, priorityScore: true, cycle: { select: { snapshot: { select: { periodEnd: true } } } } },
    });
    const plannedWithCodes = plan.actions.map((a) => ({ ...a, recommendationCode: recByFinding[a.findingCode] ?? a.findingCode }));
    // Back-fill: a diagnosis of an older period never takes over in-flight work attached to a newer
      // period's cycle (action-continuity.ts "held").
      const continuity = planWithContinuity(plannedWithCodes, engagedPrior, {
        current: periodEndOf(snapshotRow.periodEnd),
        of: (p) => periodEndOf(p.cycle?.snapshot?.periodEnd),
      });
    carriedForwardIds = [];
    // Re-attach each carried action to this cycle (ranking and wording re-evaluated) so every reader
    // of the latest cycle sees the owner's in-flight work; audited in the same transaction. The
    // original findingId is kept: it holds the baseline measured before the work started.
    // Guarded by status: an action finished/cancelled meanwhile is not moved; a fresh proposal
    // is created for it instead.
    const recreate: typeof continuity.toCreate = [];
    const movedPlanned = new Set<(typeof continuity.toCreate)[number]>();
    for (const c of continuity.carried) {
      const moved = await tx.ownerFinanceAction.updateMany({
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
          eventName: AUDIT_EVENTS.OWNER_FINANCE_ACTION_UPDATED,
          actorId,
          workspaceId,
          entityType: "OwnerFinanceAction",
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
    createdActionCount = continuity.toCreate.length + recreate.length;
    for (const a of [...continuity.toCreate, ...recreate]) {
      await tx.ownerFinanceAction.create({
        data: {
          id: randomUUID(),
          workspaceId,
          businessId,
          cycleId,
          findingId: findingIdByCode[a.findingCode] ?? null,
          recommendationCode: a.recommendationCode,
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
      actionCount: createdActionCount,
      carriedForwardActionIds: carriedForwardIds,
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
      // Ranked after read (severity first, then impact/urgency). Severity is a plain
      // string, so it cannot be ordered correctly in the DB. See rankOwnerFindingsBySeverity.
      findings: true,
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
  if (!cycle) throw new NotFoundError("OwnerFinanceCycle", cycleId);
  return { ...cycle, findings: rankOwnerFindingsBySeverity(cycle.findings) };
}

export async function listFinanceCycleFindings(cycleId: string, workspaceId: string) {
  const cycle = await db.ownerFinanceCycle.findFirst({
    where: { id: cycleId, workspaceId },
    select: { id: true },
  });
  if (!cycle) throw new NotFoundError("OwnerFinanceCycle", cycleId);
  return rankOwnerFindingsBySeverity(await db.ownerFinanceFinding.findMany({ where: { cycleId, workspaceId } }));
}

export async function listFinanceCycleActions(cycleId: string, workspaceId: string) {
  const cycle = await db.ownerFinanceCycle.findFirst({
    where: { id: cycleId, workspaceId },
    select: { id: true },
  });
  if (!cycle) throw new NotFoundError("OwnerFinanceCycle", cycleId);
  return db.ownerFinanceAction.findMany({
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
