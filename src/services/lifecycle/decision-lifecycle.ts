/**
 * Decision Lifecycle Tracking Service
 * Records all stages of decision processing for observability
 */

import { db } from "@/lib/db";

export type LifecycleStage =
  | "RECEIVED"
  | "VALIDATED"
  | "NORMALIZED"
  | "GATED"
  | "GUARDRAIL_CHECKED"
  | "APPROVED"
  | "BLOCKED"
  | "ERRORED";

export type LifecycleStatus = "success" | "blocked" | "error";

export interface RecordStageOptions {
  workspaceId: string;
  decisionId?: string | null;
  actorId?: string | null;
  stage: LifecycleStage;
  status: LifecycleStatus;
  reason?: string | null;
  durationMs?: number | null;
  occurredAt?: Date;
}

/**
 * Record a decision lifecycle stage
 * No sensitive payloads - only metadata about the stage and outcome
 */
export async function recordLifecycleStage(
  options: RecordStageOptions
): Promise<void> {
  const {
    workspaceId,
    decisionId,
    actorId,
    stage,
    status,
    reason,
    durationMs,
    occurredAt = new Date(),
  } = options;

  try {
    await db.decisionLifecycle.create({
      data: {
        workspaceId,
        decisionId: decisionId || null,
        actorId: actorId || null,
        stage,
        status,
        reason: reason || null,
        durationMs: durationMs || null,
        occurredAt,
      },
    });
  } catch (error) {
    // Log but don't throw - lifecycle tracking is observability only
    console.error(`Failed to record lifecycle stage ${stage}: ${error}`);
  }
}

/**
 * Get decision lifecycle trail
 */
export async function getDecisionLifecycle(
  workspaceId: string,
  decisionId: string
) {
  return db.decisionLifecycle.findMany({
    where: {
      workspaceId,
      decisionId,
    },
    orderBy: {
      occurredAt: "asc",
    },
  });
}

/**
 * Get all lifecycle events for a workspace in a time range
 */
export async function getWorkspaceLifecycleTrail(
  workspaceId: string,
  options?: {
    since?: Date;
    until?: Date;
    stage?: LifecycleStage;
    status?: LifecycleStatus;
  }
) {
  const occurredAtFilter: Record<string, Date> = {};
  if (options?.since) occurredAtFilter.gte = options.since;
  if (options?.until) occurredAtFilter.lte = options.until;

  return db.decisionLifecycle.findMany({
    where: {
      workspaceId,
      ...(Object.keys(occurredAtFilter).length > 0 && {
        occurredAt: occurredAtFilter,
      }),
      ...(options?.stage && { stage: options.stage }),
      ...(options?.status && { status: options.status }),
    },
    orderBy: {
      occurredAt: "desc",
    },
  });
}
