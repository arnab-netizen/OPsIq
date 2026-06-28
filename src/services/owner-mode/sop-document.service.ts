/**
 * Jarvis 360 Slice 5 — SOP document lifecycle service (DI).
 *
 * Persists SOP documents and runs the lifecycle: create draft, owner-approve,
 * revise (material change → new draft version requiring re-approval), retire.
 * Owner-only for approve/retire; all mutations audited. Reuses the pure lifecycle
 * rules (no duplicate engine; the Module-7 SOP diagnosis is untouched).
 */

import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import {
  planSopTransition,
  hashSopContent,
  isMaterialSopChange,
  nextSopVersion,
  type SopStatus,
} from "@/domain/owner-mode/sop-document";

interface SopRow {
  id: string;
  workspaceId: string;
  process: string;
  role: string | null;
  steps: string[];
  proofRequirements: string[];
  version: number;
  status: SopStatus;
  contentHash: string;
}

interface SopDb {
  ownerSopDocument: {
    create(args: { data: Record<string, unknown> }): Promise<{ id: string; version: number }>;
    findFirst(args: { where: { id: string; workspaceId: string } }): Promise<SopRow | null>;
    update(args: { where: { id: string }; data: Record<string, unknown> }): Promise<unknown>;
  };
}

export interface SopDeps {
  db: SopDb;
  now?: () => Date;
}

async function resolveDefaultDeps(): Promise<SopDeps> {
  const { db } = await import("@/lib/db");
  return { db: db as unknown as SopDb };
}

export class SopUnauthorizedError extends Error {
  readonly code = "SOP_UNAUTHORIZED";
  constructor(action: string) {
    super(`Only an owner may ${action} an SOP.`);
    this.name = "SopUnauthorizedError";
  }
}
export class SopNotFoundError extends Error {
  constructor(id: string) {
    super(`SOP ${id} not found in workspace.`);
    this.name = "SopNotFoundError";
  }
}
export class SopTransitionError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "SopTransitionError";
  }
}

export interface CreateSopInput {
  workspaceId: string;
  businessId?: string | null;
  process: string;
  role?: string | null;
  title: string;
  steps: string[];
  proofRequirements: string[];
  actorId: string;
}

/** Create a draft SOP (version 1). Any workspace member may draft; approval is owner-only. */
export async function createSopDraft(input: CreateSopInput, injected?: SopDeps): Promise<string> {
  const deps = injected ?? (await resolveDefaultDeps());
  const now = (deps.now ?? (() => new Date()))();
  const contentHash = hashSopContent(input);
  const created = await deps.db.ownerSopDocument.create({
    data: {
      workspaceId: input.workspaceId,
      businessId: input.businessId ?? null,
      process: input.process,
      role: input.role ?? null,
      title: input.title,
      steps: input.steps,
      proofRequirements: input.proofRequirements,
      version: 1,
      status: "draft",
      contentHash,
      createdByUserId: input.actorId,
      updatedAt: now,
    },
  });
  await audit(input.workspaceId, AUDIT_EVENTS.OWNER_SOP_DOC_CREATED, input.actorId, created.id, { process: input.process });
  return created.id;
}

async function load(id: string, workspaceId: string, deps: SopDeps): Promise<SopRow> {
  const row = await deps.db.ownerSopDocument.findFirst({ where: { id, workspaceId } });
  if (!row) throw new SopNotFoundError(id);
  return row;
}

/** Owner-approve a draft SOP → effective, with an optional review date. */
export async function approveSopDocument(
  id: string,
  input: { workspaceId: string; actorId: string; actorIsOwner: boolean; effectiveDate?: Date; reviewDate?: Date | null },
  injected?: SopDeps
): Promise<void> {
  if (!input.actorIsOwner) throw new SopUnauthorizedError("approve");
  const deps = injected ?? (await resolveDefaultDeps());
  const now = (deps.now ?? (() => new Date()))();
  const row = await load(id, input.workspaceId, deps);
  const decision = planSopTransition(row.status, "approved");
  if (!decision.allowed) throw new SopTransitionError(decision.reason);
  await deps.db.ownerSopDocument.update({
    where: { id },
    data: {
      status: "approved",
      approvedByUserId: input.actorId,
      effectiveDate: input.effectiveDate ?? now,
      reviewDate: input.reviewDate ?? null,
      updatedAt: now,
    },
  });
  await audit(input.workspaceId, AUDIT_EVENTS.OWNER_SOP_DOC_APPROVED, input.actorId, id, { version: row.version });
}

/**
 * Revise an SOP. A material change (content hash differs) forks a NEW draft version
 * that must be re-approved; the prior approved version stays effective until then.
 * Returns the new draft id, or null when nothing material changed (no re-approval).
 */
export async function reviseSopDocument(
  id: string,
  input: { workspaceId: string; actorId: string; role?: string | null; steps: string[]; proofRequirements: string[] },
  injected?: SopDeps
): Promise<string | null> {
  const deps = injected ?? (await resolveDefaultDeps());
  const now = (deps.now ?? (() => new Date()))();
  const row = await load(id, input.workspaceId, deps);
  const newHash = hashSopContent({ process: row.process, role: input.role ?? row.role, steps: input.steps, proofRequirements: input.proofRequirements });
  if (!isMaterialSopChange(row.contentHash, newHash)) return null;
  const created = await deps.db.ownerSopDocument.create({
    data: {
      workspaceId: row.workspaceId,
      process: row.process,
      role: input.role ?? row.role,
      title: `${row.process} v${nextSopVersion(row.version)}`,
      steps: input.steps,
      proofRequirements: input.proofRequirements,
      version: nextSopVersion(row.version),
      status: "draft",
      contentHash: newHash,
      supersedesId: row.id,
      createdByUserId: input.actorId,
      updatedAt: now,
    },
  });
  await audit(input.workspaceId, AUDIT_EVENTS.OWNER_SOP_DOC_REVISED, input.actorId, created.id, { supersedes: row.id, version: nextSopVersion(row.version) });
  return created.id;
}

/** Owner-retire (archive) an SOP. */
export async function retireSopDocument(
  id: string,
  input: { workspaceId: string; actorId: string; actorIsOwner: boolean },
  injected?: SopDeps
): Promise<void> {
  if (!input.actorIsOwner) throw new SopUnauthorizedError("retire");
  const deps = injected ?? (await resolveDefaultDeps());
  const now = (deps.now ?? (() => new Date()))();
  const row = await load(id, input.workspaceId, deps);
  const decision = planSopTransition(row.status, "retired");
  if (!decision.allowed) throw new SopTransitionError(decision.reason);
  await deps.db.ownerSopDocument.update({ where: { id }, data: { status: "retired", updatedAt: now } });
  await audit(input.workspaceId, AUDIT_EVENTS.OWNER_SOP_DOC_RETIRED, input.actorId, id, { version: row.version });
}

async function audit(workspaceId: string, eventName: string, actorId: string, entityId: string, payload: Record<string, unknown>): Promise<void> {
  await emitAuditEvent({ workspaceId, eventName, actorId, actorType: "user", entityType: "owner_sop_document", entityId, payload });
}
