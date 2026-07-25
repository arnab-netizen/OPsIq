/**
 * Bundle 3.5 — Customer Complaint and Service Recovery service.
 *
 * Full lifecycle: intake → triage (severity + SLA) → recovery actions → resolution → close.
 * Workspace-scoped. All state transitions emit audit events.
 * Resolution triggers business condition re-evaluation (fire-and-forget seam).
 * Complaint creation is idempotent via caller-supplied idempotencyKey.
 */

import { db } from "@/lib/db";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { NotFoundError, ValidationError } from "@/infra/errors";

// ─── Status machine ──────────────────────────────────────────────────────────

export type ComplaintStatus =
  | "OPEN"
  | "TRIAGED"
  | "RECOVERING"
  | "RESOLVED"
  | "CLOSED"
  | "REOPENED";

export type ComplaintSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

const VALID_STATUSES: ComplaintStatus[] = [
  "OPEN", "TRIAGED", "RECOVERING", "RESOLVED", "CLOSED", "REOPENED",
];

const VALID_SEVERITIES: ComplaintSeverity[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

const VALID_TRANSITIONS: Record<string, ComplaintStatus[]> = {
  OPEN:       ["TRIAGED"],
  TRIAGED:    ["RECOVERING", "RESOLVED"],
  RECOVERING: ["RESOLVED", "CLOSED"],
  RESOLVED:   ["CLOSED", "REOPENED"],
  CLOSED:     ["REOPENED"],
  REOPENED:   ["TRIAGED", "RECOVERING", "RESOLVED"],
};

// SLA in hours by severity
const SLA_HOURS: Record<ComplaintSeverity, number> = {
  LOW:      120, // 5 business days
  MEDIUM:   48,
  HIGH:     24,
  CRITICAL: 4,
};

function assertValidSeverity(s: string): asserts s is ComplaintSeverity {
  if (!VALID_SEVERITIES.includes(s as ComplaintSeverity)) {
    throw new ValidationError(`Invalid complaint severity: ${s}. Must be LOW | MEDIUM | HIGH | CRITICAL`);
  }
}

function assertValidTransition(from: string, to: ComplaintStatus): void {
  const allowed = VALID_TRANSITIONS[from] ?? [];
  if (!allowed.includes(to)) {
    throw new ValidationError(`Invalid complaint status transition: ${from} → ${to}`);
  }
}

function computeSlaDue(severity: ComplaintSeverity, from: Date): Date {
  const hours = SLA_HOURS[severity];
  return new Date(from.getTime() + hours * 60 * 60 * 1000);
}

// ─── Public DTO ──────────────────────────────────────────────────────────────
// Excludes: triageNotes (internal), resolutionEvidenceId (internal FK)

export interface PublicComplaintDTO {
  id: string;
  workspaceId: string;
  status: string;
  title: string;
  description: string;
  channel: string;
  severity: string | null;
  slaDueAt: string | null;
  slaBreached: boolean;
  resolutionSummary: string | null;
  reportedBy: string | null;
  businessId: string | null;
  createdAt: string;
  updatedAt: string;
  recoveryActions: PublicRecoveryActionDTO[];
}

export interface PublicRecoveryActionDTO {
  id: string;
  description: string;
  assignedTo: string | null;
  dueAt: string | null;
  completedAt: string | null;
  evidenceNote: string | null;
}

type ComplaintRow = {
  id: string;
  workspaceId: string;
  status: string;
  title: string;
  description: string;
  channel: string;
  severity: string | null;
  slaDueAt: Date | null;
  slaBreached: boolean;
  triageNotes: string | null;
  resolutionSummary: string | null;
  resolutionEvidenceId: string | null;
  reportedBy: string | null;
  businessId: string | null;
  createdAt: Date;
  updatedAt: Date;
  recoveryActions: RecoveryActionRow[];
};

type RecoveryActionRow = {
  id: string;
  description: string;
  assignedTo: string | null;
  dueAt: Date | null;
  completedAt: Date | null;
  evidenceNote: string | null;
};

function toPublicDTO(row: ComplaintRow): PublicComplaintDTO {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    status: row.status,
    title: row.title,
    description: row.description,
    channel: row.channel,
    severity: row.severity,
    slaDueAt: row.slaDueAt?.toISOString() ?? null,
    slaBreached: row.slaBreached,
    resolutionSummary: row.resolutionSummary,
    reportedBy: row.reportedBy,
    businessId: row.businessId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    recoveryActions: row.recoveryActions.map((a) => ({
      id: a.id,
      description: a.description,
      assignedTo: a.assignedTo,
      dueAt: a.dueAt?.toISOString() ?? null,
      completedAt: a.completedAt?.toISOString() ?? null,
      evidenceNote: a.evidenceNote,
    })),
  };
}

const complaintSelect = {
  id: true,
  workspaceId: true,
  status: true,
  title: true,
  description: true,
  channel: true,
  severity: true,
  slaDueAt: true,
  slaBreached: true,
  triageNotes: true,
  resolutionSummary: true,
  resolutionEvidenceId: true,
  reportedBy: true,
  businessId: true,
  createdAt: true,
  updatedAt: true,
  recoveryActions: {
    select: {
      id: true,
      description: true,
      assignedTo: true,
      dueAt: true,
      completedAt: true,
      evidenceNote: true,
    },
  },
};

async function loadComplaint(id: string, workspaceId: string): Promise<ComplaintRow> {
  const row = await db.customerComplaint.findFirst({
    where: { id, workspaceId },
    select: complaintSelect,
  });
  if (!row) throw new NotFoundError("CustomerComplaint", id);
  return row as ComplaintRow;
}

// ─── Create ──────────────────────────────────────────────────────────────────

export interface CreateComplaintInput {
  workspaceId: string;
  actorId: string;
  idempotencyKey: string;
  title: string;
  description: string;
  channel?: string;
  reportedBy?: string;
  businessId?: string;
}

export async function createComplaint(input: CreateComplaintInput): Promise<PublicComplaintDTO> {
  const {
    workspaceId, actorId, idempotencyKey,
    title, description,
    channel = "DIRECT", reportedBy, businessId,
  } = input;

  // Idempotency: return existing if key already used in this workspace
  const existing = await db.customerComplaint.findFirst({
    where: { workspaceId, idempotencyKey },
    select: complaintSelect,
  });
  if (existing) return toPublicDTO(existing as ComplaintRow);

  const row = await db.customerComplaint.create({
    data: {
      workspaceId,
      idempotencyKey,
      title,
      description,
      channel,
      reportedBy: reportedBy ?? null,
      businessId: businessId ?? null,
      createdBy: actorId,
      status: "OPEN",
    },
    select: complaintSelect,
  });

  await emitAuditEvent({
    workspaceId,
    actorId,
    eventName: AUDIT_EVENTS.COMPLAINT_CREATED,
    entityType: "CustomerComplaint",
    entityId: row.id,
    payload: { title, channel, idempotencyKey },
  });

  return toPublicDTO(row as ComplaintRow);
}

// ─── Triage ──────────────────────────────────────────────────────────────────

export interface TriageComplaintInput {
  workspaceId: string;
  actorId: string;
  complaintId: string;
  severity: string;
  triageNotes?: string;
  now?: Date;
}

export async function triageComplaint(input: TriageComplaintInput): Promise<PublicComplaintDTO> {
  const { workspaceId, actorId, complaintId, triageNotes, now = new Date() } = input;

  assertValidSeverity(input.severity);
  const severity = input.severity as ComplaintSeverity;

  const complaint = await loadComplaint(complaintId, workspaceId);
  assertValidTransition(complaint.status, "TRIAGED");

  const slaDueAt = computeSlaDue(severity, now);

  const updated = await db.customerComplaint.update({
    where: { id: complaintId },
    data: {
      status: "TRIAGED",
      severity,
      slaDueAt,
      triageNotes: triageNotes ?? null,
      updatedBy: actorId,
    },
    select: complaintSelect,
  });

  await emitAuditEvent({
    workspaceId,
    actorId,
    eventName: AUDIT_EVENTS.COMPLAINT_TRIAGED,
    entityType: "CustomerComplaint",
    entityId: complaintId,
    payload: { severity, slaDueAt: slaDueAt.toISOString() },
  });

  return toPublicDTO(updated as ComplaintRow);
}

// ─── Add Recovery Action ─────────────────────────────────────────────────────

export interface AddRecoveryActionInput {
  workspaceId: string;
  actorId: string;
  complaintId: string;
  description: string;
  assignedTo?: string;
  dueAt?: string;
}

export async function addRecoveryAction(input: AddRecoveryActionInput): Promise<PublicComplaintDTO> {
  const { workspaceId, actorId, complaintId, description, assignedTo, dueAt } = input;

  const complaint = await loadComplaint(complaintId, workspaceId);

  // Move to RECOVERING if currently TRIAGED
  const nextStatus: ComplaintStatus =
    complaint.status === "TRIAGED" ? "RECOVERING" : (complaint.status as ComplaintStatus);

  await db.complaintRecoveryAction.create({
    data: {
      workspaceId,
      complaintId,
      description,
      assignedTo: assignedTo ?? null,
      dueAt: dueAt ? new Date(dueAt) : null,
      createdBy: actorId,
    },
  });

  const updated = await db.customerComplaint.update({
    where: { id: complaintId },
    data: { status: nextStatus, updatedBy: actorId },
    select: complaintSelect,
  });

  await emitAuditEvent({
    workspaceId,
    actorId,
    eventName: AUDIT_EVENTS.COMPLAINT_RECOVERY_ACTION_ADDED,
    entityType: "CustomerComplaint",
    entityId: complaintId,
    payload: { description, assignedTo: assignedTo ?? null },
  });

  return toPublicDTO(updated as ComplaintRow);
}

// ─── Resolve ─────────────────────────────────────────────────────────────────

export interface ResolveComplaintInput {
  workspaceId: string;
  actorId: string;
  complaintId: string;
  resolutionSummary: string;
  resolutionEvidenceId?: string;
}

export async function resolveComplaint(input: ResolveComplaintInput): Promise<PublicComplaintDTO> {
  const { workspaceId, actorId, complaintId, resolutionSummary, resolutionEvidenceId } = input;

  const complaint = await loadComplaint(complaintId, workspaceId);
  assertValidTransition(complaint.status, "RESOLVED");

  const updated = await db.customerComplaint.update({
    where: { id: complaintId },
    data: {
      status: "RESOLVED",
      resolutionSummary,
      resolutionEvidenceId: resolutionEvidenceId ?? null,
      updatedBy: actorId,
    },
    select: complaintSelect,
  });

  await emitAuditEvent({
    workspaceId,
    actorId,
    eventName: AUDIT_EVENTS.COMPLAINT_RESOLVED,
    entityType: "CustomerComplaint",
    entityId: complaintId,
    payload: { resolutionSummary },
  });

  // Business condition re-evaluation (fire-and-forget, Bundle 4.1).
  // Resolved complaint is a material quality signal → owner reassessment event.
  void fireComplaintResolvedSignal(workspaceId, actorId, complaintId, complaint.businessId);

  return toPublicDTO(updated as ComplaintRow);
}

async function fireComplaintResolvedSignal(
  workspaceId: string,
  actorId: string,
  complaintId: string,
  businessId: string | null,
): Promise<void> {
  const { routeComplaintResolutionSignal } = await import(
    "@/services/owner-mode/stage3-signal-router.service"
  );
  await routeComplaintResolutionSignal(workspaceId, actorId, complaintId, businessId);
}

// ─── Close ───────────────────────────────────────────────────────────────────

export async function closeComplaint(input: {
  workspaceId: string;
  actorId: string;
  complaintId: string;
}): Promise<PublicComplaintDTO> {
  const { workspaceId, actorId, complaintId } = input;
  const complaint = await loadComplaint(complaintId, workspaceId);
  assertValidTransition(complaint.status, "CLOSED");

  const updated = await db.customerComplaint.update({
    where: { id: complaintId },
    data: { status: "CLOSED", updatedBy: actorId },
    select: complaintSelect,
  });

  await emitAuditEvent({
    workspaceId,
    actorId,
    eventName: AUDIT_EVENTS.COMPLAINT_CLOSED,
    entityType: "CustomerComplaint",
    entityId: complaintId,
    payload: {},
  });

  return toPublicDTO(updated as ComplaintRow);
}

// ─── Reopen ──────────────────────────────────────────────────────────────────

export async function reopenComplaint(input: {
  workspaceId: string;
  actorId: string;
  complaintId: string;
  reason: string;
}): Promise<PublicComplaintDTO> {
  const { workspaceId, actorId, complaintId, reason } = input;
  const complaint = await loadComplaint(complaintId, workspaceId);
  assertValidTransition(complaint.status, "REOPENED");

  const updated = await db.customerComplaint.update({
    where: { id: complaintId },
    data: { status: "REOPENED", updatedBy: actorId },
    select: complaintSelect,
  });

  await emitAuditEvent({
    workspaceId,
    actorId,
    eventName: AUDIT_EVENTS.COMPLAINT_REOPENED,
    entityType: "CustomerComplaint",
    entityId: complaintId,
    payload: { reason },
  });

  return toPublicDTO(updated as ComplaintRow);
}

// ─── SLA breach evaluator ────────────────────────────────────────────────────
// Called by a scheduled job or get-now-view to surface overdue complaints.

export async function evaluateOverdueComplaintSlas(input: {
  workspaceId: string;
  actorId: string;
  now?: Date;
}): Promise<{ breached: string[] }> {
  const { workspaceId, actorId, now = new Date() } = input;

  const overdue = await db.customerComplaint.findMany({
    where: {
      workspaceId,
      status: { in: ["TRIAGED", "RECOVERING"] },
      slaBreached: false,
      slaDueAt: { lt: now },
    },
    select: { id: true },
  });

  if (overdue.length === 0) return { breached: [] };

  const ids = overdue.map((r: { id: string }) => r.id);

  await db.customerComplaint.updateMany({
    where: { id: { in: ids } },
    data: { slaBreached: true },
  });

  for (const { id } of overdue) {
    await emitAuditEvent({
      workspaceId,
      actorId,
      eventName: AUDIT_EVENTS.COMPLAINT_SLA_BREACHED,
      entityType: "CustomerComplaint",
      entityId: id,
      payload: { evaluatedAt: now.toISOString() },
    });
  }

  return { breached: ids };
}

// ─── Get ─────────────────────────────────────────────────────────────────────

export async function getComplaint(input: {
  workspaceId: string;
  complaintId: string;
}): Promise<PublicComplaintDTO> {
  const row = await loadComplaint(input.complaintId, input.workspaceId);
  return toPublicDTO(row);
}

export async function listComplaints(input: {
  workspaceId: string;
  status?: string;
  severity?: string;
  slaBreachedOnly?: boolean;
}): Promise<PublicComplaintDTO[]> {
  const { workspaceId, status, severity, slaBreachedOnly } = input;

  if (status && !VALID_STATUSES.includes(status as ComplaintStatus)) {
    throw new ValidationError(`Invalid status filter: ${status}`);
  }
  if (severity && !VALID_SEVERITIES.includes(severity as ComplaintSeverity)) {
    throw new ValidationError(`Invalid severity filter: ${severity}`);
  }

  const rows = await db.customerComplaint.findMany({
    where: {
      workspaceId,
      ...(status ? { status } : {}),
      ...(severity ? { severity } : {}),
      ...(slaBreachedOnly ? { slaBreached: true } : {}),
    },
    orderBy: { createdAt: "desc" },
    select: complaintSelect,
  });

  return (rows as ComplaintRow[]).map(toPublicDTO);
}
