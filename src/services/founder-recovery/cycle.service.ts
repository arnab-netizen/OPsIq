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
  const business = await getBusiness(businessId, workspaceId);
  const snapshotRow = await getSnapshot(snapshotId, workspaceId);
  if (snapshotRow.businessId !== businessId) {
    throw new NotFoundError("OwnerMetricSnapshot", snapshotId);
  }

  // Prior cycle (most recent) for trend context and linkage.
  const previousCycle = await db.recoveryCycle.findFirst({
    where: { businessId, workspaceId },
    orderBy: { cycleNumber: "desc" },
    include: { snapshot: true },
  });

  const current = toMetricInput(snapshotRow);
  const prior = previousCycle?.snapshot ? toMetricInput(previousCycle.snapshot) : undefined;

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

    const now = Date.now();
    for (const a of actionSpecs) {
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
  });

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.RECOVERY_CYCLE_RUN,
    actorId,
    workspaceId,
    entityType: "RecoveryCycle",
    entityId: cycleId,
    payload: {
      businessId,
      cycleNumber,
      findingCount: findings.length,
      actionCount: actionSpecs.length,
      healthStatus: health.status,
    },
  });

  return getCycle(cycleId, workspaceId);
}

export async function getCycle(cycleId: string, workspaceId: string) {
  const cycle = await db.recoveryCycle.findFirst({
    where: { id: cycleId, workspaceId },
    include: {
      snapshot: true,
      findings: { orderBy: { severity: "asc" } },
      actions: {
        include: { verifications: { orderBy: { createdAt: "desc" } } },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!cycle) throw new NotFoundError("RecoveryCycle", cycleId);
  return cycle;
}

export async function listCycles(businessId: string, workspaceId: string) {
  await getBusiness(businessId, workspaceId);
  return db.recoveryCycle.findMany({
    where: { businessId, workspaceId },
    orderBy: { cycleNumber: "desc" },
    include: {
      findings: { select: { id: true, code: true, severity: true } },
      actions: { select: { id: true, status: true } },
    },
  });
}
