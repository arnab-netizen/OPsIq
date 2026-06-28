/**
 * Jarvis 360 Slice 6 — staff training + skills-matrix service (DI).
 *
 * Records observed-gap training recommendations (rejecting generic ones), tracks
 * skill proof, and authorizes equipment only when the relevant skill is proven.
 * Reuses the pure rules (no duplicate engine). Mutations are audited.
 */

import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import {
  evaluateTrainingNeed,
  canAuthorizeEquipment,
  type ObservedEvidence,
  type ObservedGapCode,
} from "@/domain/owner-mode/staff-training";

interface SkillRow {
  id: string;
  proven: boolean;
}

interface TrainingDb {
  ownerTrainingRecommendation: {
    create(args: { data: Record<string, unknown> }): Promise<{ id: string }>;
    update(args: { where: { id: string }; data: Record<string, unknown> }): Promise<unknown>;
  };
  ownerStaffSkill: {
    upsert(args: { where: Record<string, unknown>; create: Record<string, unknown>; update: Record<string, unknown> }): Promise<SkillRow>;
    findFirst(args: { where: { workspaceId: string; staffRef: string; skill: string } }): Promise<SkillRow | null>;
    update(args: { where: { id: string }; data: Record<string, unknown> }): Promise<unknown>;
  };
}

export interface TrainingDeps {
  db: TrainingDb;
  now?: () => Date;
}

async function resolveDefaultDeps(): Promise<TrainingDeps> {
  const { db } = await import("@/lib/db");
  return { db: db as unknown as TrainingDb };
}

export class GenericTrainingRejectedError extends Error {
  readonly code = "GENERIC_TRAINING_REJECTED";
  constructor(reason: string) {
    super(reason);
    this.name = "GenericTrainingRejectedError";
  }
}
export class EquipmentAuthorizationDeniedError extends Error {
  readonly code = "EQUIPMENT_AUTH_DENIED";
  constructor() {
    super("Equipment cannot be authorized until the required skill is proven.");
    this.name = "EquipmentAuthorizationDeniedError";
  }
}

export interface RecordTrainingInput {
  workspaceId: string;
  staffRef: string;
  evidence: ObservedEvidence[];
  processAffected: string;
  metric: string;
  expectedImprovement: string;
  recheckDate?: Date;
  actorId: string;
}

/** Record an observed-gap training recommendation. Throws if there is no evidence. */
export async function recordObservedTrainingNeed(input: RecordTrainingInput, injected?: TrainingDeps): Promise<string> {
  const need = evaluateTrainingNeed(input.evidence);
  if (!need.needed) throw new GenericTrainingRejectedError(need.rejectionReason ?? "No observed evidence.");
  const deps = injected ?? (await resolveDefaultDeps());
  const now = (deps.now ?? (() => new Date()))();
  const created = await deps.db.ownerTrainingRecommendation.create({
    data: {
      workspaceId: input.workspaceId,
      staffRef: input.staffRef,
      reasonCode: need.reason as ObservedGapCode,
      evidenceRef: input.evidence.map((e) => e.evidenceRef).filter(Boolean).join(",") || null,
      processAffected: input.processAffected,
      metric: input.metric,
      expectedImprovement: input.expectedImprovement,
      status: "recommended",
      recheckDate: input.recheckDate ?? null,
      updatedAt: now,
    },
  });
  await emitAuditEvent({
    workspaceId: input.workspaceId,
    eventName: AUDIT_EVENTS.OWNER_TRAINING_RECOMMENDED,
    actorId: input.actorId,
    actorType: "user",
    entityType: "owner_training_recommendation",
    entityId: created.id,
    payload: { staffRef: input.staffRef, reason: need.reason, confidence: need.confidence },
  });
  return created.id;
}

/** Mark training complete with proof and schedule an effectiveness recheck. */
export async function completeTraining(
  id: string,
  input: { workspaceId: string; proofOfCompletion: string; recheckDate: Date },
  injected?: TrainingDeps
): Promise<void> {
  const deps = injected ?? (await resolveDefaultDeps());
  await deps.db.ownerTrainingRecommendation.update({
    where: { id },
    data: { status: "completed", proofOfCompletion: input.proofOfCompletion, recheckDate: input.recheckDate, updatedAt: (deps.now ?? (() => new Date()))() },
  });
}

/** Record a proven skill (e.g. after verified post-training performance). */
export async function markSkillProven(
  input: { workspaceId: string; staffRef: string; skill: string; role?: string | null; sopId?: string | null },
  injected?: TrainingDeps
): Promise<void> {
  const deps = injected ?? (await resolveDefaultDeps());
  const now = (deps.now ?? (() => new Date()))();
  await deps.db.ownerStaffSkill.upsert({
    where: { workspaceId_staffRef_skill: { workspaceId: input.workspaceId, staffRef: input.staffRef, skill: input.skill } },
    create: { workspaceId: input.workspaceId, staffRef: input.staffRef, skill: input.skill, role: input.role ?? null, sopId: input.sopId ?? null, proven: true, lastProvenAt: now, updatedAt: now },
    update: { proven: true, lastProvenAt: now, role: input.role ?? undefined, sopId: input.sopId ?? undefined, updatedAt: now },
  });
}

/** Authorize equipment use — only when the required skill is proven. */
export async function authorizeEquipmentForSkill(
  input: { workspaceId: string; staffRef: string; skill: string },
  injected?: TrainingDeps
): Promise<void> {
  const deps = injected ?? (await resolveDefaultDeps());
  const skill = await deps.db.ownerStaffSkill.findFirst({ where: input });
  if (!canAuthorizeEquipment(skill)) throw new EquipmentAuthorizationDeniedError();
  await deps.db.ownerStaffSkill.update({ where: { id: skill!.id }, data: { equipmentAuthorized: true, updatedAt: (deps.now ?? (() => new Date()))() } });
}
