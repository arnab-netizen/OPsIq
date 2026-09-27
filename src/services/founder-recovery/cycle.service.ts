/* eslint-disable @typescript-eslint/no-explicit-any -- Prisma `db` proxy returns untyped rows; explicit any is pragmatic here */
/**
 * Founder Recovery — recovery cycle service.
 *
 * Runs one recovery cycle from a persisted snapshot: calculate metrics (using
 * the prior cycle's snapshot for trend), generate evidence-backed findings,
 * build recovery actions, and persist cycle + findings + actions atomically.
 * Cycles are linked (previousCycleId) so the loop is repeatable and comparable.
 */
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { rankOwnerFindingsBySeverity } from "@/domain/owner-spine/contracts";
import { ENGAGED_ACTION_STATUSES, periodEndOf, planWithContinuity } from "@/domain/founder-recovery/action-continuity";
import { CURRENT_RECOVERY_CYCLE_ORDER } from "@/services/owner-spine/current-diagnosis-cycle";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { NotFoundError } from "@/infra/errors";
import { calculateMetrics } from "@/domain/founder-recovery/metrics";
import { generateFindings } from "@/domain/founder-recovery/diagnosis";
import { buildActionsFromFindings } from "@/domain/founder-recovery/recovery-actions";
import type { DerivedMetrics, Finding, Severity } from "@/domain/founder-recovery/types";
import { getBusiness } from "./business.service";
import { getSnapshot, toMetricInput } from "./snapshot.service";

function healthFromFindings(findings: Finding[]): { status: string; score: number } {
  const weight: Record<Severity, number> = { critical: 40, high: 20, medium: 8, low: 3 };
  const penalty = findings.reduce((sum, f) => sum + (weight[f.severity] ?? 0), 0);
  const score = Math.max(0, 100 - penalty);
  const hasCritical = findings.some((f) => f.severity === "critical");
  const hasHigh = findings.some((f) => f.severity === "high");
  const status = hasCritical ? "critical" : hasHigh || score < 70 ? "at_risk" : "healthy";
  return { status, score };
}

export async function runCycle(
  businessId: string,
  snapshotId: string,
  actorId: string,
  workspaceId: string
) {
  await getBusiness(businessId, workspaceId);
  const snapshotRow = await getSnapshot(snapshotId, workspaceId);
  if (snapshotRow.businessId !== businessId) {
    throw new NotFoundError("OwnerMetricSnapshot", snapshotId);
  }

  // Numbering and linkage: the most recently run cycle (cycle numbers record run order).
  const previousCycle = await db.recoveryCycle.findFirst({
    where: { businessId, workspaceId },
    orderBy: { cycleNumber: "desc" },
    select: { id: true, cycleNumber: true },
  });
  // Trend baseline: the PREVIOUS VALID EVIDENCE PERIOD — the latest cycle whose snapshot period ended
  // before this snapshot's period (and has ended at all). Never the largest run number: a back-filled
  // older period, or a newer period entered first, must not be compared against the wrong side and
  // raise a false critical transition.
  const snapshotPeriodEnd = snapshotRow.periodEnd instanceof Date ? snapshotRow.periodEnd : new Date(snapshotRow.periodEnd as unknown as string);
  const baselineCycle = await db.recoveryCycle.findFirst({
    where: { businessId, workspaceId, snapshot: { periodEnd: { lte: new Date(), lt: snapshotPeriodEnd } } },
    orderBy: CURRENT_RECOVERY_CYCLE_ORDER,
    include: { snapshot: true },
  });

  const current = toMetricInput(snapshotRow);
  const prior = baselineCycle?.snapshot ? toMetricInput(baselineCycle.snapshot) : undefined;

  const derived: DerivedMetrics = calculateMetrics(current, prior);
  const priorDerived = prior ? calculateMetrics(prior) : undefined;
  const findings = generateFindings(current, derived, priorDerived);
  const actionSpecs = buildActionsFromFindings(findings);
  const health = healthFromFindings(findings);
  const cycleNumber = (previousCycle?.cycleNumber ?? 0) + 1;

  const cycleId = randomUUID();
  const summary =
    findings.length === 0
      ? `Cycle ${cycleNumber}: no threshold breaches detected from the latest snapshot.`
      : `Cycle ${cycleNumber}: ${findings.length} finding(s); top issue ${findings[0].title} (${findings[0].severity}).`;

  // Persist atomically.
  let carriedForwardIds: string[] = [];
  let createdActionCount = 0;
  await db.$transaction(async (tx: any) => {
    await tx.recoveryCycle.create({
      data: {
        id: cycleId,
        businessId,
        workspaceId,
        snapshotId,
        previousCycleId: previousCycle?.id ?? null,
        cycleNumber,
        status: "open",
        healthStatus: health.status,
        healthScore: health.score,
        summary,
        createdBy: actorId,
      },
    });

    const findingIdByCode: Record<string, string> = {};
    for (const f of findings) {
      const id = randomUUID();
      findingIdByCode[f.code] = id;
      await tx.recoveryFinding.create({
        data: {
          id,
          cycleId,
          businessId,
          workspaceId,
          code: f.code,
          title: f.title,
          sourceMetric: f.sourceMetric,
          currentValue: f.currentValue,
          comparisonValue: f.comparisonValue,
          threshold: f.threshold,
          severity: f.severity,
          evidence: f.evidence,
          whyItMatters: f.whyItMatters,
          impactEstimate: f.impactEstimate,
          impactCurrency: f.impactCurrency,
          confidence: f.confidence,
          recommendedAction: f.recommendedAction,
          verificationMetric: f.verificationMetric,
        },
      });
    }

    // Continuity: an action the owner has taken on for the same finding is carried forward
    // (re-attached to this cycle and re-prioritised, audited), not duplicated (see action-continuity.ts).
    const engagedPrior: Array<{ id: string; cycleId: string; priority: string; findingCode: string; periodEnd: Date | null }> = (
      await tx.recoveryAction.findMany({
        where: { businessId, workspaceId, status: { in: [...ENGAGED_ACTION_STATUSES] } },
        select: { id: true, cycleId: true, priority: true, finding: { select: { code: true } }, cycle: { select: { snapshot: { select: { periodEnd: true } } } } },
      })
    )
      .filter((r: { finding: { code: string } | null }) => r.finding !== null)
      .map((r: { id: string; cycleId: string; priority: string; finding: { code: string }; cycle: { snapshot: { periodEnd: Date } | null } | null }) => ({
        id: r.id,
        cycleId: r.cycleId,
        priority: r.priority,
        findingCode: r.finding.code,
        periodEnd: periodEndOf(r.cycle?.snapshot?.periodEnd),
      }));
    // Back-fill: a cycle for an older period never takes over in-flight work on a newer period's cycle.
    const continuity = planWithContinuity(actionSpecs, engagedPrior, { current: snapshotPeriodEnd, of: (p) => p.periodEnd });
    carriedForwardIds = [];
    // Re-attach (guarded by status; original findingId kept — its baseline predates the work).
    const movedPlanned = new Set<(typeof actionSpecs)[number]>();
    for (const c of continuity.carried) {
      const moved = await tx.recoveryAction.updateMany({
        where: { id: c.prior.id, status: { in: [...ENGAGED_ACTION_STATUSES] } },
        data: { cycleId, priority: c.planned.priority, version: { increment: 1 } },
      });
      if (moved.count === 0) continue;
      movedPlanned.add(c.planned);
      await emitAuditEvent(
        {
          eventName: AUDIT_EVENTS.RECOVERY_ACTION_UPDATED,
          actorId,
          workspaceId,
          entityType: "RecoveryAction",
          entityId: c.prior.id,
          payload: {
            reason: "carried_forward_by_diagnosis",
            fromCycleId: c.prior.cycleId,
            toCycleId: cycleId,
            priority: { from: c.prior.priority, to: c.planned.priority },
          },
        },
        tx
      );
      carriedForwardIds.push(c.prior.id);
    }
    const recreate = continuity.carried.map((c) => c.planned).filter((p, i, all) => !movedPlanned.has(p) && all.indexOf(p) === i);

    const now = Date.now();
    createdActionCount = continuity.toCreate.length + recreate.length;
    for (const a of [...continuity.toCreate, ...recreate]) {
      await tx.recoveryAction.create({
        data: {
          id: randomUUID(),
          cycleId,
          findingId: findingIdByCode[a.findingCode] ?? null,
          businessId,
          workspaceId,
          title: a.title,
          description: a.description,
          assignedToRole: a.assignedToRole,
          priority: a.priority,
          status: "proposed",
          dueAt: new Date(now + a.dueInDays * 24 * 60 * 60 * 1000),
          expectedOutcome: a.expectedOutcome,
          metricToMove: a.metricToMove,
          baselineValue: a.baselineValue,
          targetValue: a.targetValue,
          verificationWindowDays: a.verificationWindowDays,
          effort: a.effort,
          confidence: a.confidence,
          completionCriteria: a.completionCriteria,
          direction: a.direction,
        },
      });
    }

    // Audit inside transaction: a failed audit rolls back all cycle writes (CAT 2 fix).
    await emitAuditEvent(
      {
        eventName: AUDIT_EVENTS.RECOVERY_CYCLE_RUN,
        actorId,
        workspaceId,
        entityType: "RecoveryCycle",
        entityId: cycleId,
        payload: {
          businessId,
          cycleNumber,
          findingCount: findings.length,
          actionCount: createdActionCount,
          carriedForwardActionIds: carriedForwardIds,
          healthStatus: health.status,
        },
      },
      tx
    );
  });

  return getCycle(cycleId, workspaceId);
}

export async function getCycle(cycleId: string, workspaceId: string) {
  const cycle = await db.recoveryCycle.findFirst({
    where: { id: cycleId, workspaceId },
    include: {
      snapshot: true,
      // Ranked after read: severity is a plain string, so a DB orderBy sorts it
      // alphabetically (critical, high, low, medium). See rankOwnerFindingsBySeverity.
      findings: true,
      actions: {
        include: { verifications: { orderBy: { createdAt: "desc" } } },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!cycle) throw new NotFoundError("RecoveryCycle", cycleId);
  return { ...cycle, findings: rankOwnerFindingsBySeverity(cycle.findings) };
}

export async function listCycles(businessId: string, workspaceId: string) {
  await getBusiness(businessId, workspaceId);
  const cycles = await db.recoveryCycle.findMany({
    where: { businessId, workspaceId },
    orderBy: { cycleNumber: "desc" },
    include: {
      // confidence is RecoveryFinding's only ranking column besides severity/code.
      findings: { select: { id: true, code: true, severity: true, confidence: true } },
      actions: { select: { id: true, status: true } },
    },
  });
  return cycles.map(<C extends { findings: Array<{ code: string; severity: string; confidence: number }> }>(c: C) => ({
    ...c,
    findings: rankOwnerFindingsBySeverity(c.findings),
  }));
}
