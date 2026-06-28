/**
 * Jarvis 360 Slice 4 — owner approval-memory service (DI).
 *
 * Persists an owner's approval of a content-hashed decision/rule and finds a
 * reusable approval for a new request (workspace-scoped). Recording is owner-only
 * and audited; reuse emits an audit event so "approval avoided" is observable.
 * Reuses the pure approval-memory rules (no duplicate approval engine).
 */

import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import {
  canReuseApproval,
  APPROVAL_RISK_CLASSES,
  type ApprovalMemoryRecord,
  type ApprovalRiskClass,
} from "@/domain/owner-mode/approval-memory";

interface MemoryRow extends ApprovalMemoryRecord {
  id: string;
  version: number;
}

interface ApprovalMemoryDb {
  ownerApprovalMemory: {
    findUnique(args: {
      where: { workspaceId_scope_contentHash: { workspaceId: string; scope: string; contentHash: string } };
    }): Promise<MemoryRow | null>;
    upsert(args: {
      where: { workspaceId_scope_contentHash: { workspaceId: string; scope: string; contentHash: string } };
      create: Record<string, unknown>;
      update: Record<string, unknown>;
    }): Promise<MemoryRow>;
  };
}

export interface ApprovalMemoryDeps {
  db: ApprovalMemoryDb;
  now?: () => Date;
}

async function resolveDefaultDeps(): Promise<ApprovalMemoryDeps> {
  const { db } = await import("@/lib/db");
  return { db: db as unknown as ApprovalMemoryDb };
}

export class ApprovalMemoryUnauthorizedError extends Error {
  readonly code = "APPROVAL_MEMORY_UNAUTHORIZED";
  constructor() {
    super("Only an owner may record a reusable approval.");
    this.name = "ApprovalMemoryUnauthorizedError";
  }
}

export interface RecordApprovalInput {
  workspaceId: string;
  scope: string;
  contentHash: string;
  riskClass: ApprovalRiskClass;
  actorId: string;
  actorIsOwner: boolean;
  validUntil?: Date | null;
}

/** Record (or refresh) an owner approval for a content-hashed subject. Owner-only; audited. */
export async function recordApproval(input: RecordApprovalInput, injected?: ApprovalMemoryDeps): Promise<void> {
  if (!input.actorIsOwner) throw new ApprovalMemoryUnauthorizedError();
  if (!APPROVAL_RISK_CLASSES.includes(input.riskClass)) {
    throw new Error(`Invalid approval risk class '${input.riskClass}'.`);
  }
  const deps = injected ?? (await resolveDefaultDeps());
  const now = (deps.now ?? (() => new Date()))();
  await deps.db.ownerApprovalMemory.upsert({
    where: { workspaceId_scope_contentHash: { workspaceId: input.workspaceId, scope: input.scope, contentHash: input.contentHash } },
    create: {
      workspaceId: input.workspaceId,
      scope: input.scope,
      contentHash: input.contentHash,
      riskClass: input.riskClass,
      approvalStatus: "approved",
      approvedByUserId: input.actorId,
      validUntil: input.validUntil ?? null,
      updatedAt: now,
    },
    update: {
      riskClass: input.riskClass,
      approvalStatus: "approved",
      approvedByUserId: input.actorId,
      validUntil: input.validUntil ?? null,
      version: { increment: 1 },
      updatedAt: now,
    },
  });
  await emitAuditEvent({
    workspaceId: input.workspaceId,
    eventName: AUDIT_EVENTS.OWNER_APPROVAL_MEMORY_RECORDED,
    actorId: input.actorId,
    actorType: "user",
    entityType: "owner_approval_memory",
    entityId: `${input.scope}:${input.contentHash.slice(0, 12)}`,
    payload: { scope: input.scope, riskClass: input.riskClass },
  });
}

export interface FindReusableApprovalInput {
  workspaceId: string;
  scope: string;
  contentHash: string;
  riskClass: ApprovalRiskClass;
}

/**
 * Return true when a recorded approval can be reused for this request (avoiding a
 * re-ask). Emits an audit event when reuse is granted. Workspace-scoped + fail-closed.
 */
export async function isApprovalRemembered(input: FindReusableApprovalInput, injected?: ApprovalMemoryDeps): Promise<boolean> {
  const deps = injected ?? (await resolveDefaultDeps());
  const now = (deps.now ?? (() => new Date()))();
  const row = await deps.db.ownerApprovalMemory.findUnique({
    where: { workspaceId_scope_contentHash: { workspaceId: input.workspaceId, scope: input.scope, contentHash: input.contentHash } },
  });
  const reusable = canReuseApproval(row, { ...input, now });
  if (reusable) {
    await emitAuditEvent({
      workspaceId: input.workspaceId,
      eventName: AUDIT_EVENTS.OWNER_APPROVAL_MEMORY_REUSED,
      actorType: "system",
      entityType: "owner_approval_memory",
      entityId: `${input.scope}:${input.contentHash.slice(0, 12)}`,
      payload: { scope: input.scope, riskClass: input.riskClass },
    });
  }
  return reusable;
}
