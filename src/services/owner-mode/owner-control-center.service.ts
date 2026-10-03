/**
 * Jarvis 360 Slice 9 — owner control-center service (DI).
 *
 * Aggregates the Slice 0–8 control signals for a workspace and composes the owner
 * control center. Reuses the pure composer + fleet capacity + attention summarizer.
 */

import type { OwnerAdvicePolicy } from "@/domain/owner-spine/owner-advice-policy";
import { buildOwnerControlCenter, type ControlCenterMainTarget, type OwnerControlCenter } from "@/domain/owner-mode/owner-control-center";
import { assessFleetCapacity, type EquipmentRecord } from "@/domain/owner-mode/equipment-capacity";
import { summarizeOwnerAttention, type AttentionEventRecord } from "@/domain/owner-mode/owner-load";

interface ControlCenterDb {
  ownerEquipment: { findMany(args: { where: { workspaceId: string }; select: Record<string, boolean> }): Promise<Array<EquipmentRecord & { name: string }>> };
  ownerAttentionEvent: { findMany(args: { where: { workspaceId: string }; select: Record<string, boolean> }): Promise<AttentionEventRecord[]> };
  ownerSopDocument: { count(args: { where: Record<string, unknown> }): Promise<number> };
  ownerTrainingRecommendation: { count(args: { where: Record<string, unknown> }): Promise<number> };
  ownerProcess: { count(args: { where: Record<string, unknown> }): Promise<number> };
  ownerSelfEvaluation: { count(args: { where: Record<string, unknown> }): Promise<number> };
}

export interface ControlCenterDeps {
  db: ControlCenterDb;
  now?: () => Date;
}

async function resolveDefaultDeps(): Promise<ControlCenterDeps> {
  const { db } = await import("@/lib/db");
  return { db: db as unknown as ControlCenterDb };
}

export interface ControlCenterContext {
  dataSufficiencyStatus: "sufficient" | "caution" | "insufficient";
  lowConfidenceDomains: string[];
  blockedRecommendations: number;
  proofBlocked: number;
  financeBlocked: number;
  ownerApprovalsRequired: number;
  approvalsAvoided?: number;
  nextBestAction?: string | null;
  /** The canonical owner decision's main target (never vetoed by the panel; see buildOwnerControlCenter). */
  mainTarget?: ControlCenterMainTarget | null;
  supportingSteps?: ControlCenterMainTarget[];
  /** The canonical decision's advice policy (read, never overridden, by the panel). */
  advicePolicy?: OwnerAdvicePolicy | null;
}

/**
 * Build the owner control center. The cross-domain profile signals (data sufficiency,
 * blocked counts, next action) are passed in by the command-center route; this
 * service adds the equipment/SOP/training/process/attention aggregates.
 */
export async function getOwnerControlCenter(
  workspaceId: string,
  ctx: ControlCenterContext,
  injected?: ControlCenterDeps
): Promise<OwnerControlCenter> {
  const deps = injected ?? (await resolveDefaultDeps());
  const now = (deps.now ?? (() => new Date()))();

  const [fleet, attentionEvents, sopsNeedingReview, trainingRecommendations, processReviewsDue, reassessmentsDue] = await Promise.all([
    deps.db.ownerEquipment.findMany({ where: { workspaceId }, select: { name: true, utilization: true, downtimeState: true, maintenanceDueAt: true, status: true } }),
    deps.db.ownerAttentionEvent.findMany({ where: { workspaceId }, select: { disposition: true, ownerDecisionRequired: true, handledByOpsIQ: true } }),
    deps.db.ownerSopDocument.count({ where: { workspaceId, status: "draft" } }),
    deps.db.ownerTrainingRecommendation.count({ where: { workspaceId, status: "recommended" } }),
    deps.db.ownerProcess.count({ where: { workspaceId, status: "active", nextReviewAt: { lte: now } } }),
    // EH-21 — failed self-evaluations whose reassessment is now due.
    deps.db.ownerSelfEvaluation.count({ where: { workspaceId, reassessmentRequired: true, nextReassessmentAt: { lte: now } } }),
  ]);

  const capacity = assessFleetCapacity(fleet, now);
  const attention = summarizeOwnerAttention(attentionEvents);

  return buildOwnerControlCenter({
    dataSufficiencyStatus: ctx.dataSufficiencyStatus,
    lowConfidenceDomains: ctx.lowConfidenceDomains,
    attention,
    blockedRecommendations: ctx.blockedRecommendations,
    proofBlocked: ctx.proofBlocked,
    financeBlocked: ctx.financeBlocked,
    sopsNeedingReview,
    trainingRecommendations,
    equipmentBottlenecks: capacity.bottlenecks,
    processReviewsDue,
    ownerApprovalsRequired: ctx.ownerApprovalsRequired,
    reassessmentsDue,
    approvalsAvoided: ctx.approvalsAvoided ?? 0,
    nextBestAction: ctx.nextBestAction ?? null,
    mainTarget: ctx.mainTarget ?? null,
    supportingSteps: ctx.supportingSteps ?? [],
    advicePolicy: ctx.advicePolicy ?? null,
  });
}
