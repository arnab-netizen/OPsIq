/**
 * Jarvis 360 Slice 4 — owner load-reduction service (DI).
 *
 * Persists owner standing instructions (owner-only, audited) and attention events,
 * and evaluates a request against the active standing instruction for its scope.
 * Reuses the pure rules in domain/owner-mode/owner-load (no duplicate logic).
 */

import { emitAuditEvent, type AuditClient } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { assertBusinessInWorkspace, type BusinessScopeDb } from "@/services/owner-mode/business-scope";
import {
  evaluateStandingInstruction,
  type StandingInstructionOutcome,
  type StandingInstructionRecord,
  type AttentionDisposition,
} from "@/domain/owner-mode/owner-load";

interface OwnerLoadDb extends BusinessScopeDb {
  ownerStandingInstruction: {
    create(args: { data: Record<string, unknown> }): Promise<{ id: string }>;
    findFirst(args: {
      where: { workspaceId: string; businessId?: string; scope: string; status: string };
      orderBy: { createdAt: "desc" };
    }): Promise<(StandingInstructionRecord & { id: string }) | null>;
  };
  ownerAttentionEvent: {
    create(args: { data: Record<string, unknown> }): Promise<{ id: string }>;
  };
}

export interface OwnerLoadDeps {
  db: OwnerLoadDb;
  now?: () => Date;
  /** Optional tx client — when provided, audit writes inside this service join the caller's transaction. */
  auditClient?: AuditClient;
}

async function resolveDefaultDeps(): Promise<OwnerLoadDeps> {
  const { db } = await import("@/lib/db");
  return { db: db as unknown as OwnerLoadDb };
}

export class StandingInstructionUnauthorizedError extends Error {
  readonly code = "STANDING_INSTRUCTION_UNAUTHORIZED";
  constructor() {
    super("Only an owner may create a standing instruction.");
    this.name = "StandingInstructionUnauthorizedError";
  }
}

export interface RecordStandingInstructionInput {
  workspaceId: string;
  /** Business this instruction governs (one workspace may hold many businesses). Validated server-side. */
  businessId?: string | null;
  actorId: string;
  actorIsOwner: boolean;
  scope: string;
  allowedActionTypes: string[];
  forbiddenActionTypes: string[];
  maxAmount?: number | null;
  riskClass: string;
  validUntil?: Date | null;
}

/** Record an owner standing instruction. Owner-only; audited. */
export async function recordStandingInstruction(input: RecordStandingInstructionInput, injected?: OwnerLoadDeps): Promise<void> {
  if (!input.actorIsOwner) throw new StandingInstructionUnauthorizedError();
  if (!input.scope.trim()) throw new Error("scope is required.");
  const deps = injected ?? (await resolveDefaultDeps());
  const businessId = input.businessId ?? null;
  // Server-side authority: a supplied businessId must belong to the workspace (rejects cross-workspace).
  if (businessId) await assertBusinessInWorkspace(deps.db, input.workspaceId, businessId);
  const now = (deps.now ?? (() => new Date()))();
  await deps.db.ownerStandingInstruction.create({
    data: {
      workspaceId: input.workspaceId,
      businessId,
      scope: input.scope,
      allowedActionTypes: input.allowedActionTypes,
      forbiddenActionTypes: input.forbiddenActionTypes,
      maxAmount: input.maxAmount ?? null,
      riskClass: input.riskClass,
      status: "active",
      createdByUserId: input.actorId,
      validUntil: input.validUntil ?? null,
      updatedAt: now,
    },
  });
  await emitAuditEvent({
    workspaceId: input.workspaceId,
    eventName: AUDIT_EVENTS.OWNER_STANDING_INSTRUCTION_RECORDED,
    actorId: input.actorId,
    actorType: "user",
    entityType: "owner_standing_instruction",
    entityId: input.scope,
    payload: { scope: input.scope, riskClass: input.riskClass, businessId },
  });
}

/** Evaluate a request against the active standing instruction for its scope (workspace, optionally
 *  business-scoped: a businessId narrows to that business's instructions only). */
export async function evaluateRequestAgainstStandingInstructions(
  input: { workspaceId: string; businessId?: string | null; scope: string; actionType: string; amount?: number | null },
  injected?: OwnerLoadDeps
): Promise<StandingInstructionOutcome> {
  const deps = injected ?? (await resolveDefaultDeps());
  const now = (deps.now ?? (() => new Date()))();
  const where = input.businessId
    ? { workspaceId: input.workspaceId, businessId: input.businessId, scope: input.scope, status: "active" }
    : { workspaceId: input.workspaceId, scope: input.scope, status: "active" };
  const instr = await deps.db.ownerStandingInstruction.findFirst({
    where,
    orderBy: { createdAt: "desc" },
  });
  return evaluateStandingInstruction(instr, { scope: input.scope, actionType: input.actionType, amount: input.amount ?? null, now });
}

/** Record an attention event with its disposition (for the owner attention budget). */
export async function recordAttentionEvent(
  input: {
    workspaceId: string;
    eventType: string;
    severity: string;
    disposition: AttentionDisposition;
    ownerDecisionRequired: boolean;
    handledByOpsIQ: boolean;
    sourceRef?: string;
  },
  injected?: OwnerLoadDeps
): Promise<void> {
  const deps = injected ?? (await resolveDefaultDeps());
  await deps.db.ownerAttentionEvent.create({
    data: {
      workspaceId: input.workspaceId,
      eventType: input.eventType,
      severity: input.severity,
      disposition: input.disposition,
      ownerDecisionRequired: input.ownerDecisionRequired,
      handledByOpsIQ: input.handledByOpsIQ,
      sourceRef: input.sourceRef ?? null,
    },
  });
  await emitAuditEvent(
    {
      workspaceId: input.workspaceId,
      eventName: AUDIT_EVENTS.OWNER_ATTENTION_EVENT_RECORDED,
      actorType: "system",
      entityType: "owner_attention_event",
      entityId: input.eventType,
      payload: { disposition: input.disposition, severity: input.severity },
    },
    deps.auditClient,
  );
}
