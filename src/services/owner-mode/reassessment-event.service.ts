/**
 * Owner Reassessment Event creation service (app service).
 *
 * Creates an OwnerReassessmentEvent when a supported trigger occurs — a bad recommendation/action
 * outcome, or an accepted proof that was later contradicted (DISPUTED / OVERRIDDEN_NOT_VERIFIED).
 * This is the app service that was previously missing: OpsIQ's correction loop now has a real,
 * governed entry point, so REASSESSMENT_LATENCY has events to measure and OUTCOME/PROOF →
 * reassessment is a persisted, queryable link (via outcomeId / sourceProofId).
 *
 * Governed and safe:
 *   - AUDIT-01: the reassessment row and its OWNER_REASSESSMENT_CREATED audit are written in ONE
 *     transaction (a failed audit rolls the reassessment back — never a silent governed mutation).
 *   - Idempotent: a still-open reassessment for the same (workspace, trigger, source) is reused,
 *     never duplicated (protects against duplicate submission / repeated triggers).
 *   - Server-authoritative timestamp (createdAt default now) and workspaceId — no user timestamp.
 *
 * Note: OwnerReassessmentEvent.workspaceId references the owner-mode ClientAccount id (owner-mode
 * convention); callers pass the owner workspace id, which must resolve to that account.
 */

import { AUDIT_EVENTS } from "@/domain/constants/audit-events";

export type ReassessmentTrigger =
  | "failed_outcome" | "disputed_outcome" | "harmful_outcome" | "external_event_invalidation"
  | "execution_invalidation" | "owner_dispute" | "evidence_retraction" | "new_contradicting_evidence"
  // Phase 3 — triggered after any terminal outcome verification (success or failure)
  | "verified_outcome";

/** Open (non-terminal) statuses — a reassessment in one of these is still an active dedupe target. */
const OPEN_STATUSES = ["pending", "in_progress", "diagnosis_reopened", "corrective_action_issued", "blocked_awaiting_human_review"];

/** Triggers that always require human review (higher-severity contradictions). */
const HUMAN_REVIEW_TRIGGERS = new Set<ReassessmentTrigger>(["harmful_outcome", "evidence_retraction", "owner_dispute"]);

export interface CreateReassessmentInput {
  workspaceId: string;
  businessId: string;
  trigger: ReassessmentTrigger;
  triggerDescription: string;
  /** Proof whose accepted-then-contradicted reversal triggered this (proof→reassessment link). */
  sourceProofId?: string | null;
  /** Bad OwnerActionOutcome that triggered this (outcome→reassessment link). */
  outcomeId?: string | null;
  actionId?: string | null;
  recommendationId?: string | null;
  invalidatedAssumptions?: string[];
  actorId?: string | null;
}

export interface ReassessmentEventRecord {
  id: string;
  workspaceId: string;
  businessId: string;
  trigger: string;
  status: string;
  sourceProofId: string | null;
  outcomeId: string | null;
  createdAt: Date;
  /** True when an existing open reassessment was reused (idempotency), false when newly created. */
  deduped: boolean;
}

interface ReassessmentDelegate {
  findFirst(a: { where: Record<string, unknown>; select?: Record<string, boolean> }): Promise<{ id: string; workspaceId: string; businessId: string; trigger: string; status: string; sourceProofId: string | null; outcomeId: string | null; createdAt: Date } | null>;
  create(a: { data: Record<string, unknown> }): Promise<{ id: string; workspaceId: string; businessId: string; trigger: string; status: string; sourceProofId: string | null; outcomeId: string | null; createdAt: Date }>;
}
interface AuditDelegate { create(a: { data: Record<string, unknown> }): Promise<unknown> }
export interface ReassessmentTx { ownerReassessmentEvent: ReassessmentDelegate; auditEvent: AuditDelegate }
export interface ReassessmentDb extends ReassessmentTx {
  $transaction<T>(fn: (tx: ReassessmentTx) => Promise<T>): Promise<T>;
}
export interface ReassessmentDeps {
  db: ReassessmentDb;
  uuid: () => string;
  now: () => Date;
}

async function resolveDefaultDeps(): Promise<ReassessmentDeps> {
  const { db } = await import("@/lib/db");
  const { randomUUID } = await import("crypto");
  return { db: db as unknown as ReassessmentDb, uuid: () => randomUUID(), now: () => new Date() };
}

/**
 * Create (or idempotently reuse) an OwnerReassessmentEvent for a supported trigger.
 * The reassessment row + its audit event are written atomically.
 */
export async function createReassessmentEvent(
  input: CreateReassessmentInput,
  injected?: ReassessmentDeps
): Promise<ReassessmentEventRecord> {
  const deps = injected ?? (await resolveDefaultDeps());
  const requiresHumanReview = HUMAN_REVIEW_TRIGGERS.has(input.trigger);

  return deps.db.$transaction(async (tx) => {
    // Idempotency: reuse a still-open reassessment for the same workspace + trigger + source key.
    const sourceKey: Record<string, unknown> = {};
    if (input.sourceProofId) sourceKey.sourceProofId = input.sourceProofId;
    else if (input.outcomeId) sourceKey.outcomeId = input.outcomeId;
    if (Object.keys(sourceKey).length > 0) {
      const existing = await tx.ownerReassessmentEvent.findFirst({
        where: { workspaceId: input.workspaceId, trigger: input.trigger, status: { in: OPEN_STATUSES }, ...sourceKey },
        select: { id: true, workspaceId: true, businessId: true, trigger: true, status: true, sourceProofId: true, outcomeId: true, createdAt: true },
      });
      if (existing) {
        return { ...existing, deduped: true };
      }
    }

    const id = deps.uuid();
    const now = deps.now();
    const created = await tx.ownerReassessmentEvent.create({
      data: {
        id,
        workspaceId: input.workspaceId,
        businessId: input.businessId,
        recommendationId: input.recommendationId ?? null,
        actionId: input.actionId ?? null,
        outcomeId: input.outcomeId ?? null,
        sourceProofId: input.sourceProofId ?? null,
        trigger: input.trigger,
        triggerDescription: input.triggerDescription,
        status: "pending",
        requiresHumanReview,
        reopensDiagnosis: false,
        assumptionsChecked: false,
        invalidatedAssumptions: JSON.stringify(input.invalidatedAssumptions ?? []),
        ownerAcknowledged: false,
        createdAt: now,
        updatedAt: now,
      },
    });

    // AUDIT-01: audit inside the same transaction — a failed audit rolls the reassessment back.
    await tx.auditEvent.create({
      data: {
        id: deps.uuid(),
        workspaceId: input.workspaceId,
        eventName: AUDIT_EVENTS.OWNER_REASSESSMENT_CREATED,
        actorId: input.actorId ?? null,
        actorType: input.actorId ? "user" : "system",
        entityType: "OwnerReassessmentEvent",
        entityId: id,
        payload: {
          trigger: input.trigger,
          sourceProofId: input.sourceProofId ?? null,
          outcomeId: input.outcomeId ?? null,
          businessId: input.businessId,
          requiresHumanReview,
        },
        visibility: "internal",
        occurredAt: now,
      },
    });

    return { ...created, deduped: false };
  });
}
