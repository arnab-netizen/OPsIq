/**
 * Phase 4 — Explainability service.
 *
 * Persists ExplainabilityRecord rows created by the pure
 * `buildExplainabilityRecord()` domain function.
 *
 * Workspace isolation enforced. Audit event emitted atomically.
 */

import { db } from "@/lib/db";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import type { Prisma } from "@/generated/prisma/client";
import type { ExplainabilityRecord } from "@/domain/owner-mode/explainability";

export async function persistExplainabilityRecord(
  workspaceId: string,
  actorId: string,
  record: ExplainabilityRecord,
) {
  return db.$transaction(async (tx: Prisma.TransactionClient) => {
    const persisted = await tx.explainabilityRecord.create({
      data: {
        workspaceId,
        decisionRef: record.decisionRef,
        decisionType: record.decisionType,
        explanationText: record.explanationText,
        factorsUsed: record.factorsUsed as unknown as Prisma.InputJsonValue,
        dataPoints: record.dataPoints as unknown as Prisma.InputJsonValue,
        confidence: record.confidence,
        confidenceLevel: record.confidenceLevel,
      },
    });

    await emitAuditEvent(
      {
        eventName: AUDIT_EVENTS.OWNER_EXPLAINABILITY_RECORD_CREATED,
        workspaceId,
        actorId,
        entityType: "ExplainabilityRecord",
        entityId: persisted.id,
        payload: { decisionRef: record.decisionRef, decisionType: record.decisionType },
      },
      tx,
    );

    return persisted;
  });
}

export async function getExplainabilityRecords(
  workspaceId: string,
  decisionRef: string,
) {
  return db.explainabilityRecord.findMany({
    where: { workspaceId, decisionRef },
    orderBy: { createdAt: "desc" },
    take: 10,
  });
}

export async function getLatestExplainabilityRecord(
  workspaceId: string,
  decisionType: string,
) {
  return db.explainabilityRecord.findFirst({
    where: { workspaceId, decisionType },
    orderBy: { createdAt: "desc" },
  });
}
