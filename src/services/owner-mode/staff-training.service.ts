/**
 * Jarvis 360 Slice 6 — staff training + skills-matrix service (DI).
 *
 * Records observed-gap training recommendations (rejecting generic ones), tracks
 * skill proof, and authorizes equipment only when the relevant skill is proven.
 * Reuses the pure rules (no duplicate engine). Mutations are audited.
 */

import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { NotFoundError } from "@/infra/errors";
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
    updateMany(args: { where: { id: string; workspaceId: string }; data: Record<string, unknown> }): Promise<{ count: number }>;
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

/**
 * Runtime failure signals that justify evidence-backed training (G20). These come from
 * observed events (a rejected/duplicate proof, a customer complaint, a checklist miss,
 * equipment misuse, rework) — never a generic "train everyone" request.
 */
export type RuntimeFailureSignal =
  | "proof_failure"
  | "duplicate_proof"
  | "customer_complaint"
  | "rework"
  | "missed_checklist"
  | "equipment_misuse"
  | "quality_issue";

const SIGNAL_TO_GAP: Record<RuntimeFailureSignal, ObservedGapCode> = {
  proof_failure: "poor_proof_compliance",
  duplicate_proof: "poor_proof_compliance",
  customer_complaint: "customer_complaint",
  rework: "rework",
  missed_checklist: "missed_checklist",
  equipment_misuse: "equipment_misuse",
  quality_issue: "quality_issue",
};

export interface DeriveTrainingInput {
  workspaceId: string;
  staffRef: string;
  signal: RuntimeFailureSignal;
  /** How many times the failure was observed (must be ≥ 1 to trigger). */
  occurrences: number;
  evidenceRef?: string;
  processAffected: string;
  metric: string;
  expectedImprovement: string;
  recheckDate?: Date;
  actorId: string;
}

/**
 * Auto-derive an evidence-backed training recommendation from an OBSERVED runtime failure
 * (proof failure, complaint, checklist miss, equipment misuse, rework). Returns the created
 * recommendation id, or null when the signal carries no occurrences (no generic training).
 * This is the trigger the strict re-audit found missing — training is produced from evidence,
 * linked to the staff member, the affected process, the expected metric, and a recheck date.
 */
export async function deriveTrainingFromObservedFailure(input: DeriveTrainingInput, injected?: TrainingDeps): Promise<string | null> {
  if (input.occurrences < 1) return null;
  const evidence: ObservedEvidence[] = [{ code: SIGNAL_TO_GAP[input.signal], occurrences: input.occurrences, evidenceRef: input.evidenceRef }];
  return recordObservedTrainingNeed(
    {
      workspaceId: input.workspaceId,
      staffRef: input.staffRef,
      evidence,
      processAffected: input.processAffected,
      metric: input.metric,
      expectedImprovement: input.expectedImprovement,
      recheckDate: input.recheckDate,
      actorId: input.actorId,
    },
    injected
  );
}

/**
 * Mark training complete with proof and schedule an effectiveness recheck.
 * GAP-ISO-03 — the update is workspace-scoped (where: { id, workspaceId }) so a known id
 * cannot be completed across workspace boundaries, the mutation is rejected if nothing
 * matched in this workspace, and it emits a governed audit event.
 */
export async function completeTraining(
  id: string,
  input: { workspaceId: string; proofOfCompletion: string; recheckDate: Date; actorId: string },
  injected?: TrainingDeps
): Promise<void> {
  const deps = injected ?? (await resolveDefaultDeps());
  const result = await deps.db.ownerTrainingRecommendation.updateMany({
    where: { id, workspaceId: input.workspaceId },
    data: { status: "completed", proofOfCompletion: input.proofOfCompletion, recheckDate: input.recheckDate, updatedAt: (deps.now ?? (() => new Date()))() },
  });
  if (result.count === 0) throw new NotFoundError("OwnerTrainingRecommendation", id);
  await emitAuditEvent({
    eventName: AUDIT_EVENTS.OWNER_TRAINING_COMPLETED,
    actorId: input.actorId,
    workspaceId: input.workspaceId,
    entityType: "OwnerTrainingRecommendation",
    entityId: id,
    payload: { proofOfCompletion: input.proofOfCompletion },
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
