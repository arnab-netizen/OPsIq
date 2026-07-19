/**
 * Phase 4 — Decision Confidence service.
 *
 * Persists time-series DecisionConfidenceRecord rows.
 * Extends the pure `generateDecisionConfidenceScore()` domain function
 * with workspace-scoped persistence.
 *
 * Workspace isolation enforced. Audit event emitted atomically.
 */

import { db } from "@/lib/db";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import type { Prisma } from "@/generated/prisma/client";
import {
  generateDecisionConfidenceScore,
  determineConfidenceLevel,
  type DataQualityFactor,
  type DecisionHistory,
  type ExecutionFactor,
  type ConfidenceSignal,
} from "@/domain/decision-confidence/confidence-engine";

export type DecisionType =
  | "OBJECTIVE_PRIORITY"
  | "RESOURCE_ALLOCATION"
  | "RISK_MITIGATION"
  | "OPPORTUNITY_PURSUIT"
  | "CONSTRAINT_RESOLUTION"
  | "KPI_TARGET"
  | "GOAL_ARBITRATION";

export interface RecordDecisionConfidenceInput {
  workspaceId: string;
  actorId: string;
  decisionRef: string;
  decisionType: DecisionType;
  dataQuality: DataQualityFactor;
  history: DecisionHistory;
  executionFactors: ExecutionFactor;
  signals?: ConfidenceSignal[];
}

export async function recordDecisionConfidence(input: RecordDecisionConfidenceInput) {
  const score = generateDecisionConfidenceScore(
    input.decisionRef,
    input.dataQuality,
    input.history,
    input.executionFactors,
    input.signals ?? [],
  );

  return db.$transaction(async (tx: Prisma.TransactionClient) => {
    const record = await tx.decisionConfidenceRecord.create({
      data: {
        workspaceId: input.workspaceId,
        decisionRef: input.decisionRef,
        decisionType: input.decisionType,
        confidenceScore: score.overallConfidence,
        confidenceLevel: score.confidenceLevel,
        evidenceCount: input.signals?.length ?? 0,
        confidenceBasis: {
          dataQualityConfidence: score.dataQualityConfidence,
          historicalAccuracyConfidence: score.historicalAccuracyConfidence,
          executionCertaintyScore: score.executionCertaintyScore,
          keyRisks: score.keyRisks,
          confidenceInterval: score.confidenceInterval,
        } as Prisma.InputJsonValue,
      },
    });

    await emitAuditEvent(
      {
        eventName: AUDIT_EVENTS.OWNER_DECISION_CONFIDENCE_RECORDED,
        workspaceId: input.workspaceId,
        actorId: input.actorId,
        entityType: "DecisionConfidenceRecord",
        entityId: record.id,
        payload: {
          decisionRef: input.decisionRef,
          decisionType: input.decisionType,
          confidenceScore: score.overallConfidence,
          confidenceLevel: score.confidenceLevel,
        },
      },
      tx,
    );

    return { record, score };
  });
}

export async function getConfidenceHistory(
  workspaceId: string,
  decisionRef: string,
  limit = 20,
) {
  return db.decisionConfidenceRecord.findMany({
    where: { workspaceId, decisionRef },
    orderBy: { recordedAt: "desc" },
    take: limit,
  });
}

export async function getLatestConfidenceScore(
  workspaceId: string,
  decisionType: DecisionType,
) {
  return db.decisionConfidenceRecord.findFirst({
    where: { workspaceId, decisionType },
    orderBy: { recordedAt: "desc" },
  });
}

/** Compute confidence level from a raw score without creating a DB record. */
export { determineConfidenceLevel };
