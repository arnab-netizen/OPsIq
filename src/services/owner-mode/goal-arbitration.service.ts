/**
 * Phase 4 — Goal Arbitration service.
 *
 * Fetches active BusinessObjectives for a workspace, invokes the pure
 * `arbitrateObjectives()` domain function, persists the GoalArbitrationRecord,
 * and builds + persists an ExplainabilityRecord.
 *
 * Workspace isolation enforced. Audit event emitted atomically.
 */

import { db } from "@/lib/db";
import { resolveAlignedObjectiveLinks } from "@/services/owner-strategy/goal.service";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { Prisma } from "@/generated/prisma/client";
import {
  arbitrateObjectives,
  type ObjectiveCandidate,
  type TimeHorizon,
  type ObjectiveType,
} from "@/domain/owner-mode/objective-arbitration";
import { explainGoalArbitration } from "@/domain/owner-mode/explainability";
import { persistExplainabilityRecord } from "./explainability.service";

function deadlineDaysRemaining(deadline: Date | null): number | null {
  if (!deadline) return null;
  const ms = deadline.getTime() - Date.now();
  return Math.round(ms / 86_400_000);
}

function timeHorizonFromDays(days: number | null): TimeHorizon {
  if (days === null) return "LONG_TERM";
  if (days <= 14) return "IMMEDIATE";
  if (days <= 60) return "SHORT_TERM";
  if (days <= 180) return "MEDIUM_TERM";
  return "LONG_TERM";
}

export type CandidateType = "INTERNAL_OBJECTIVE" | "EXTERNAL_OPPORTUNITY";

export interface RunGoalArbitrationResult {
  arbitrationRecordId: string;
  winnerObjectiveId: string | null;
  dominantConstraint: string | null;
  resourceConflict: { objectiveId: string; reason: string }[] | null;
  totalCandidates: number;
  portfolioDecisions: { objectiveId: string; decision: string; rationale: string; candidateType: CandidateType }[];
}

function sourceQualityToConfidence(q: string): number {
  if (q === "HIGH" || q === "VERIFIED") return 0.85;
  if (q === "MODERATE") return 0.65;
  if (q === "LOW") return 0.4;
  return 0.2; // UNKNOWN
}

function ownerWorkloadToAvailability(band: string): number {
  if (band === "LOW") return 0.85;
  if (band === "MODERATE") return 0.6;
  if (band === "HIGH") return 0.3;
  if (band === "VERY_HIGH") return 0.1;
  return 0.5;
}

function rawSignalTypeToObjectiveType(rawType: string): ObjectiveType {
  const upper = rawType.toUpperCase();
  if (upper.includes("TENDER") || upper.includes("PROCUREMENT") || upper.includes("REVENUE")) return "REVENUE";
  if (upper.includes("COMPLIANCE") || upper.includes("REGULATORY")) return "COMPLIANCE";
  if (upper.includes("GROWTH") || upper.includes("EXPANSION")) return "GROWTH";
  if (upper.includes("COST") || upper.includes("SAVING")) return "COST_REDUCTION";
  return "STRATEGIC";
}

export async function runGoalArbitration(
  workspaceId: string,
  actorId: string,
): Promise<RunGoalArbitrationResult> {
  // Fetch all ACTIVE objectives for this workspace with their allocation usage
  const objectives = await db.businessObjective.findMany({
    where: { workspaceId, status: "ACTIVE" },
    include: {
      blockedBy: { select: { id: true } },
      _count: { select: { children: true } },
    },
  });

  // Goal-link alignment re-evaluated at read time: a link to a replaced goal follows its successor,
  // and only an ACTIVE goal in the objective's own scope counts (goal.service.ts).
  const alignedObjectiveIds = await resolveAlignedObjectiveLinks(
    workspaceId,
    objectives.map((o: { id: string; businessId: string | null; linkedGoalId: string | null }) => ({
      objectiveId: o.id,
      objectiveBusinessId: o.businessId ?? null,
      linkedGoalId: o.linkedGoalId,
    })),
  );

  // Fetch active CANDIDATE opportunity signals for unified portfolio arbitration
  const dbAny = db as unknown as Record<string, { findMany: (opts: unknown) => Promise<unknown[]> }>;
  const opportunitySignals = await dbAny.externalOpportunitySignal.findMany({
    where: { workspaceId, status: "ACTIVE", initialStatus: "CANDIDATE" },
    select: {
      id: true, rawSignalType: true, tenderOrProcurementValue: true, deadlineAt: true,
      estimatedCashExposure: true, sourceQuality: true, ownerWorkloadBand: true,
      missingData: true, relevanceBand: true,
    },
  });

  // Fetch resource allocation totals per objective
  const allocations = await db.resourceAllocation.groupBy({
    by: ["objectiveId"],
    where: { workspaceId, status: "ALLOCATED" },
    _sum: { allocationAmount: true },
  });

  // Fetch resource pool totals
  const pools = await db.resourcePool.findMany({
    where: { workspaceId, isActive: true },
    select: { totalCapacity: true },
  });

  const totalCapacity = pools.reduce((s: number, p: (typeof pools)[number]) => s + p.totalCapacity, 0);
  const allocationByObjective = new Map(
    allocations.map((a: (typeof allocations)[number]): [string, number] => [a.objectiveId, a._sum.allocationAmount ?? 0]),
  );

  // Fetch risk scores for resource conflict detection
  // severity is a numeric 0-100 score (likelihood × impact / 100); ≥70 = critical, ≥50 = high
  const risks = await db.businessRiskEntry.findMany({
    where: {
      workspaceId,
      status: { in: ["IDENTIFIED", "ASSESSED", "MITIGATING"] },
      severity: { gte: 50 },
    },
    select: { linkedObjectiveId: true, severity: true },
  });

  const highRiskObjectiveIds = new Set(
    risks
      .filter((r: { linkedObjectiveId: string | null; severity: number }) => r.linkedObjectiveId !== null)
      .map((r: { linkedObjectiveId: string | null; severity: number }) => r.linkedObjectiveId as string),
  );

  // Build a set of internal objective candidate IDs for tagging portfolio decisions
  const internalObjectiveIds = new Set(objectives.map((o: { id: string }) => o.id));

  const candidates: ObjectiveCandidate[] = objectives.map((obj: (typeof objectives)[number]) => {
    const daysLeft = deadlineDaysRemaining(obj.deadline);
    const allocated: number = (allocationByObjective.get(obj.id) ?? 0) as number;
    const resourceBudgetUsedPct =
      totalCapacity > 0 ? Math.min(100, Math.round((allocated / totalCapacity) * 100)) : 0;

    // Progress from metric if available, else null (never measured — not evidence of 0% done;
    // UNKNOWN != BAD, see objective-arbitration.ts's ObjectiveCandidate.progressPct).
    const progressPct =
      obj.targetValue && obj.currentValue !== null
        ? Math.min(100, Math.round(((obj.currentValue ?? 0) / obj.targetValue) * 100))
        : null;

    // Resource availability: remaining pool fraction
    const resourceAvailabilityRatio = totalCapacity > 0
      ? Math.max(0, Math.min(1, (totalCapacity - allocated) / totalCapacity))
      : null;

    // Operational risk from risk entries (severity≥70=critical→0.9, severity≥50=high→0.6, absent→null→0.3 default)
    const hasHighRisk = highRiskObjectiveIds.has(obj.id);
    const severeRisk = risks.find(
      (r: { linkedObjectiveId: string | null; severity: number }) =>
        r.linkedObjectiveId === obj.id && r.severity >= 70,
    );
    const operationalRisk = severeRisk ? 0.9 : hasHighRisk ? 0.6 : null;

    // Estimated ROI: derived from objective type when not explicit
    // COMPLIANCE always high (0.9), REVENUE/COST_REDUCTION high (0.8), others neutral (null → 0.5)
    const estimatedROI =
      (obj.objectiveType as ObjectiveType) === "COMPLIANCE" ? 4.5
      : (obj.objectiveType as ObjectiveType) === "REVENUE" ? 4.0
      : (obj.objectiveType as ObjectiveType) === "COST_REDUCTION" ? 3.5
      : null;

    // Count children from _count
    const childCount = (obj as typeof obj & { _count: { children: number } })._count.children;

    return {
      objectiveId: obj.id,
      objectiveType: obj.objectiveType as ObjectiveType,
      status: "ACTIVE",
      priorityScore: obj.priorityScore,
      progressPct,
      resourceBudgetUsedPct,
      hasBlockingDependencies: obj.blockedBy.length > 0,
      linkedGoalAligned: alignedObjectiveIds.has(obj.id),
      timeHorizon: timeHorizonFromDays(daysLeft),
      deadlineDaysRemaining: daysLeft,
      confidence: 0.7, // default; enriched from DecisionConfidenceRecord when available
      reversible: obj.objectiveType !== "COMPLIANCE",
      estimatedROI,
      resourceAvailabilityRatio,
      operationalRisk,
      childCount,
    };
  });

  // Map opportunity signals to ObjectiveCandidate and append to unified pool
  type OpportunityRow = {
    id: string; rawSignalType: string; tenderOrProcurementValue: number | null;
    deadlineAt: Date | null; estimatedCashExposure: number | null;
    sourceQuality: string; ownerWorkloadBand: string; missingData: string[];
    relevanceBand: string;
  };
  for (const sig of opportunitySignals as OpportunityRow[]) {
    const daysLeft = deadlineDaysRemaining(sig.deadlineAt);
    const confidence = sourceQualityToConfidence(sig.sourceQuality);
    const resourceAvailabilityRatio = ownerWorkloadToAvailability(sig.ownerWorkloadBand);
    const estimatedROI = sig.tenderOrProcurementValue && sig.estimatedCashExposure && sig.estimatedCashExposure > 0
      ? Math.min(10, sig.tenderOrProcurementValue / sig.estimatedCashExposure)
      : sig.tenderOrProcurementValue ? 2.5 // moderate default when no cost benchmark
      : null;
    const operationalRisk = sig.missingData.length > 3 ? 0.7 : sig.missingData.length > 0 ? 0.4 : 0.2;

    candidates.push({
      objectiveId: sig.id,
      objectiveType: rawSignalTypeToObjectiveType(sig.rawSignalType),
      status: "ACTIVE",
      priorityScore: sig.relevanceBand === "HIGH" ? 75 : sig.relevanceBand === "LOW" ? 25 : 50,
      progressPct: 0,
      resourceBudgetUsedPct: 0,
      hasBlockingDependencies: false,
      linkedGoalAligned: false,
      timeHorizon: timeHorizonFromDays(daysLeft),
      deadlineDaysRemaining: daysLeft,
      confidence,
      reversible: true, // tender bid can be withdrawn before commitment
      estimatedROI,
      resourceAvailabilityRatio,
      operationalRisk,
      childCount: 0,
    });
  }

  const result = arbitrateObjectives(candidates);

  // Find the winner candidate to pass dimension scores to explainability
  const winnerCandidate = result.candidates.find(
    (c) => c.objectiveId === result.winnerObjectiveId,
  ) ?? null;

  const winnerPortfolioDecision = winnerCandidate?.portfolioDecision ?? null;
  const winnerPortfolioRationale = winnerCandidate?.portfolioRationale ?? null;

  const explanation = explainGoalArbitration({
    winnerObjectiveId: result.winnerObjectiveId,
    dominantConstraint: result.dominantConstraint,
    totalCandidates: candidates.length,
    confidence: result.winnerObjectiveId ? 0.75 : 0.4,
    winnerDimensions: winnerCandidate
      ? {
          urgencyScore: winnerCandidate.urgencyScore,
          typeWeight: winnerCandidate.typeWeight,
          dim_roi: winnerCandidate.dim_roi,
          ownerPriorityNorm: winnerCandidate.riskOfInaction,
          hasBlockingDependencies: winnerCandidate.blockedBy.length > 0,
          dim_resourceAvailability: winnerCandidate.dim_resourceAvailability,
          resourceBudgetUsedPct: candidates.find((c) => c.objectiveId === winnerCandidate.objectiveId)?.resourceBudgetUsedPct ?? null,
          dim_cashImpact: winnerCandidate.dim_cashImpact,
          dim_operationalRisk: winnerCandidate.dim_operationalRisk,
          dim_customerImpact: winnerCandidate.dim_customerImpact,
          dim_regulatoryWeight: winnerCandidate.dim_regulatoryWeight,
          reversible: winnerCandidate.reversible,
          confidence: winnerCandidate.confidence,
        }
      : null,
    portfolioDecision: winnerPortfolioDecision,
    portfolioRationale: winnerPortfolioRationale,
  });

  // Build portfolio decisions map for persistence (internal objectives + external opportunities unified)
  const portfolioDecisions = result.candidates.map((c) => ({
    objectiveId: c.objectiveId,
    decision: c.portfolioDecision,
    rationale: c.portfolioRationale,
    riskOfAction: c.riskOfAction,
    riskOfInaction: c.riskOfInaction,
    candidateType: (internalObjectiveIds.has(c.objectiveId) ? "INTERNAL_OBJECTIVE" : "EXTERNAL_OPPORTUNITY") as CandidateType,
  }));

  const record = await db.$transaction(async (tx: Prisma.TransactionClient) => {
    const arbitrationRecord = await tx.goalArbitrationRecord.create({
      data: {
        workspaceId,
        candidateIds: candidates.map((c) => c.objectiveId) as Prisma.InputJsonValue,
        winnerObjectiveId: result.winnerObjectiveId ?? null,
        arbitrationResult: result.arbitrationResult as unknown as Prisma.InputJsonValue,
        dominantConstraint: result.dominantConstraint ?? null,
        resourceConflict: result.resourceConflict !== null
            ? result.resourceConflict as unknown as Prisma.InputJsonValue
            : Prisma.JsonNull,
        portfolioDecisions: portfolioDecisions as unknown as Prisma.InputJsonValue,
        actorId,
      },
    });

    await emitAuditEvent(
      {
        eventName: AUDIT_EVENTS.OWNER_GOAL_ARBITRATION_RECORDED,
        workspaceId,
        actorId,
        entityType: "GoalArbitrationRecord",
        entityId: arbitrationRecord.id,
        payload: {
          winnerObjectiveId: result.winnerObjectiveId,
          candidateCount: candidates.length,
          dominantConstraint: result.dominantConstraint,
        },
      },
      tx,
    );

    return arbitrationRecord;
  });

  // Persist explainability record (best-effort after transaction)
  await persistExplainabilityRecord(
    workspaceId,
    actorId,
    explanation,
  ).catch(() => null);

  return {
    arbitrationRecordId: record.id,
    winnerObjectiveId: result.winnerObjectiveId,
    dominantConstraint: result.dominantConstraint,
    resourceConflict: result.resourceConflict,
    totalCandidates: candidates.length,
    portfolioDecisions: portfolioDecisions.map((pd) => ({
      objectiveId: pd.objectiveId,
      decision: pd.decision,
      rationale: pd.rationale,
      candidateType: pd.candidateType,
    })),
  };
}

export async function getLatestArbitrationRecord(workspaceId: string) {
  return db.goalArbitrationRecord.findFirst({
    where: { workspaceId },
    orderBy: { arbitratedAt: "desc" },
  });
}
