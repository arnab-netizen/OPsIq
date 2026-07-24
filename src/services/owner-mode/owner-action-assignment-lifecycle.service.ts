/**
 * Bundle 3.6 — Owner Action Assignment and Outcome Tracking service.
 *
 * Full lifecycle: assign → reassign → record outcome (COMPLETED | FAILED | STALLED).
 * Stall detection evaluator runs periodically (idempotent per assignment).
 * FAILED outcome triggers business condition re-evaluation (fire-and-forget seam).
 * All state transitions emit audit events. Workspace-scoped.
 * Assignment creation is idempotent via caller-supplied idempotencyKey.
 */

import { db } from "@/lib/db";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { NotFoundError, ValidationError } from "@/infra/errors";

// ─── Status / priority machine ───────────────────────────────────────────────

export type AssignmentStatus = "ASSIGNED" | "COMPLETED" | "FAILED" | "STALLED";
export type AssignmentPriority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

const VALID_STATUSES: AssignmentStatus[] = ["ASSIGNED", "COMPLETED", "FAILED", "STALLED"];
const VALID_PRIORITIES: AssignmentPriority[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

const OUTCOME_STATUSES: AssignmentStatus[] = ["COMPLETED", "FAILED", "STALLED"];

function assertValidPriority(p: string): asserts p is AssignmentPriority {
  if (!VALID_PRIORITIES.includes(p as AssignmentPriority)) {
    throw new ValidationError(
      `Invalid priority: ${p}. Must be LOW | MEDIUM | HIGH | CRITICAL`
    );
  }
}

function assertOutcomeStatus(s: string): asserts s is AssignmentStatus {
  if (!OUTCOME_STATUSES.includes(s as AssignmentStatus)) {
    throw new ValidationError(
      `Invalid outcome status: ${s}. Must be COMPLETED | FAILED | STALLED`
    );
  }
}

// ─── Public DTO ──────────────────────────────────────────────────────────────
// Excludes: assignedById, createdBy, updatedBy (internal actor IDs)

export interface PublicAssignmentDTO {
  id: string;
  workspaceId: string;
  businessId: string;
  actionId: string;
  actionDomain: string;
  assignedTo: string;
  priority: string;
  dueAt: string | null;
  status: string;
  stallDetected: boolean;
  outcomeNote: string | null;
  reassignReason: string | null;
  createdAt: string;
  updatedAt: string;
}

type AssignmentRow = {
  id: string;
  workspaceId: string;
  businessId: string;
  idempotencyKey: string;
  actionId: string;
  actionDomain: string;
  assignedTo: string;
  assignedById: string;
  priority: string;
  dueAt: Date | null;
  status: string;
  stallDetected: boolean;
  outcomeNote: string | null;
  reassignReason: string | null;
  createdBy: string;
  updatedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
};

function toPublicDTO(row: AssignmentRow): PublicAssignmentDTO {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    businessId: row.businessId,
    actionId: row.actionId,
    actionDomain: row.actionDomain,
    assignedTo: row.assignedTo,
    priority: row.priority,
    dueAt: row.dueAt?.toISOString() ?? null,
    status: row.status,
    stallDetected: row.stallDetected,
    outcomeNote: row.outcomeNote,
    reassignReason: row.reassignReason,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

const assignmentSelect = {
  id: true,
  workspaceId: true,
  businessId: true,
  idempotencyKey: true,
  actionId: true,
  actionDomain: true,
  assignedTo: true,
  assignedById: true,
  priority: true,
  dueAt: true,
  status: true,
  stallDetected: true,
  outcomeNote: true,
  reassignReason: true,
  createdBy: true,
  updatedBy: true,
  createdAt: true,
  updatedAt: true,
};

async function loadAssignment(id: string, workspaceId: string): Promise<AssignmentRow> {
  const row = await db.ownerActionAssignment.findFirst({
    where: { id, workspaceId },
    select: assignmentSelect,
  });
  if (!row) throw new NotFoundError("OwnerActionAssignment", id);
  return row as AssignmentRow;
}

// ─── Assign ──────────────────────────────────────────────────────────────────

export interface AssignActionInput {
  workspaceId: string;
  actorId: string;
  idempotencyKey: string;
  businessId: string;
  actionId: string;
  actionDomain: string;
  assignedTo: string;
  priority?: string;
  dueAt?: string;
}

export async function assignAction(input: AssignActionInput): Promise<PublicAssignmentDTO> {
  const {
    workspaceId, actorId, idempotencyKey,
    businessId, actionId, actionDomain, assignedTo,
    priority = "MEDIUM", dueAt,
  } = input;

  assertValidPriority(priority);

  const existing = await db.ownerActionAssignment.findFirst({
    where: { workspaceId, idempotencyKey },
    select: assignmentSelect,
  });
  if (existing) return toPublicDTO(existing as AssignmentRow);

  const row = await db.ownerActionAssignment.create({
    data: {
      workspaceId,
      idempotencyKey,
      businessId,
      actionId,
      actionDomain,
      assignedTo,
      assignedById: actorId,
      priority,
      dueAt: dueAt ? new Date(dueAt) : null,
      status: "ASSIGNED",
      createdBy: actorId,
    },
    select: assignmentSelect,
  });

  await emitAuditEvent({
    workspaceId,
    actorId,
    eventName: AUDIT_EVENTS.OWNER_ACTION_ASSIGNED,
    entityType: "OwnerActionAssignment",
    entityId: row.id,
    payload: { actionId, actionDomain, assignedTo, priority, idempotencyKey },
  });

  return toPublicDTO(row as AssignmentRow);
}

// ─── Reassign ────────────────────────────────────────────────────────────────

export interface ReassignActionInput {
  workspaceId: string;
  actorId: string;
  assignmentId: string;
  assignedTo: string;
  reason: string;
  dueAt?: string;
  priority?: string;
}

export async function reassignAction(input: ReassignActionInput): Promise<PublicAssignmentDTO> {
  const { workspaceId, actorId, assignmentId, assignedTo, reason, dueAt, priority } = input;

  const existing = await loadAssignment(assignmentId, workspaceId);

  if (existing.status !== "ASSIGNED") {
    throw new ValidationError(
      `Cannot reassign an assignment in status ${existing.status}. Only ASSIGNED assignments can be reassigned.`
    );
  }

  if (priority) assertValidPriority(priority);

  const updated = await db.ownerActionAssignment.update({
    where: { id: assignmentId },
    data: {
      assignedTo,
      assignedById: actorId,
      reassignReason: reason,
      ...(dueAt !== undefined ? { dueAt: dueAt ? new Date(dueAt) : null } : {}),
      ...(priority ? { priority } : {}),
      updatedBy: actorId,
    },
    select: assignmentSelect,
  });

  await emitAuditEvent({
    workspaceId,
    actorId,
    eventName: AUDIT_EVENTS.OWNER_ACTION_REASSIGNED,
    entityType: "OwnerActionAssignment",
    entityId: assignmentId,
    payload: { assignedTo, reason, previousAssignedTo: existing.assignedTo },
  });

  return toPublicDTO(updated as AssignmentRow);
}

// ─── Record Outcome ──────────────────────────────────────────────────────────

export interface RecordOutcomeInput {
  workspaceId: string;
  actorId: string;
  assignmentId: string;
  outcome: string;
  outcomeNote?: string;
}

export async function recordOutcome(input: RecordOutcomeInput): Promise<PublicAssignmentDTO> {
  const { workspaceId, actorId, assignmentId, outcomeNote } = input;

  assertOutcomeStatus(input.outcome);
  const outcome = input.outcome as AssignmentStatus;

  const existing = await loadAssignment(assignmentId, workspaceId);

  if (existing.status !== "ASSIGNED" && existing.status !== "STALLED") {
    throw new ValidationError(
      `Cannot record outcome on assignment in status ${existing.status}. Must be ASSIGNED or STALLED.`
    );
  }

  const updated = await db.ownerActionAssignment.update({
    where: { id: assignmentId },
    data: {
      status: outcome,
      outcomeNote: outcomeNote ?? null,
      updatedBy: actorId,
    },
    select: assignmentSelect,
  });

  await emitAuditEvent({
    workspaceId,
    actorId,
    eventName: AUDIT_EVENTS.OWNER_ACTION_OUTCOME_CLOSED,
    entityType: "OwnerActionAssignment",
    entityId: assignmentId,
    payload: { outcome, actionId: existing.actionId, actionDomain: existing.actionDomain },
  });

  // FAILED outcome → business condition re-evaluation (fire-and-forget seam).
  // Wired to real re-evaluation when dashboard service exposes entry point (Stage 4+).
  if (outcome === "FAILED") {
    void fireActionFailedSignal(workspaceId, actorId, assignmentId);
  }

  return toPublicDTO(updated as AssignmentRow);
}

async function fireActionFailedSignal(
  _workspaceId: string,
  _actorId: string,
  _assignmentId: string,
): Promise<void> {
  // Seam: replaced by real reeval call when dashboard service supports it.
}

// ─── Stall Detection Evaluator ───────────────────────────────────────────────

export async function evaluateStallDetection(input: {
  workspaceId: string;
  actorId: string;
  now?: Date;
}): Promise<{ stalled: string[] }> {
  const { workspaceId, actorId, now = new Date() } = input;

  const overdue = await db.ownerActionAssignment.findMany({
    where: {
      workspaceId,
      status: "ASSIGNED",
      stallDetected: false,
      dueAt: { lt: now },
    },
    select: { id: true, actionId: true, actionDomain: true, assignedTo: true },
  });

  if (overdue.length === 0) return { stalled: [] };

  const ids = overdue.map((r: { id: string }) => r.id);

  await db.ownerActionAssignment.updateMany({
    where: { id: { in: ids } },
    data: { stallDetected: true, status: "STALLED" },
  });

  for (const r of overdue) {
    await emitAuditEvent({
      workspaceId,
      actorId,
      eventName: AUDIT_EVENTS.OWNER_ACTION_STALL_DETECTED,
      entityType: "OwnerActionAssignment",
      entityId: r.id,
      payload: {
        actionId: r.actionId,
        actionDomain: r.actionDomain,
        assignedTo: r.assignedTo,
        evaluatedAt: now.toISOString(),
      },
    });
  }

  return { stalled: ids };
}

// ─── Get / List ───────────────────────────────────────────────────────────────

export async function getAssignment(input: {
  workspaceId: string;
  assignmentId: string;
}): Promise<PublicAssignmentDTO> {
  const row = await loadAssignment(input.assignmentId, input.workspaceId);
  return toPublicDTO(row);
}

export async function listAssignments(input: {
  workspaceId: string;
  businessId?: string;
  status?: string;
  assignedTo?: string;
  stallOnly?: boolean;
}): Promise<PublicAssignmentDTO[]> {
  const { workspaceId, businessId, status, assignedTo, stallOnly } = input;

  if (status && !VALID_STATUSES.includes(status as AssignmentStatus)) {
    throw new ValidationError(`Invalid status filter: ${status}`);
  }

  const rows = await db.ownerActionAssignment.findMany({
    where: {
      workspaceId,
      ...(businessId ? { businessId } : {}),
      ...(status ? { status } : {}),
      ...(assignedTo ? { assignedTo } : {}),
      ...(stallOnly ? { stallDetected: true } : {}),
    },
    orderBy: { createdAt: "desc" },
    select: assignmentSelect,
  });

  return (rows as AssignmentRow[]).map(toPublicDTO);
}

// ─── Bottleneck summary ───────────────────────────────────────────────────────

export interface BottleneckSummaryDTO {
  workspaceId: string;
  totalAssigned: number;
  stalled: number;
  failed: number;
  completed: number;
  bottleneckScore: number; // (stalled + failed) / max(totalAssigned, 1)
}

export async function getBottleneckSummary(input: {
  workspaceId: string;
  businessId?: string;
}): Promise<BottleneckSummaryDTO> {
  const { workspaceId, businessId } = input;

  const where = { workspaceId, ...(businessId ? { businessId } : {}) };

  const [totalAssigned, stalled, failed, completed] = await Promise.all([
    db.ownerActionAssignment.count({ where }),
    db.ownerActionAssignment.count({ where: { ...where, status: "STALLED" } }),
    db.ownerActionAssignment.count({ where: { ...where, status: "FAILED" } }),
    db.ownerActionAssignment.count({ where: { ...where, status: "COMPLETED" } }),
  ]);

  return {
    workspaceId,
    totalAssigned,
    stalled,
    failed,
    completed,
    bottleneckScore: (stalled + failed) / Math.max(totalAssigned, 1),
  };
}
