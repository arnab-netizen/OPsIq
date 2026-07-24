/**
 * Bundle 3.9 — Process Intelligence and SOP Management service.
 *
 * Training assignment lifecycle: assign → complete (evidence required).
 * Compliance tracking: calculateComplianceRate → createNonComplianceAlert (idempotent).
 * SOP compliance below threshold triggers business condition re-assessment (fire-and-forget seam).
 *
 * SOP versions are published via the existing sop-document.service.ts; this service
 * handles training and compliance intelligence on top of those published SOPs.
 *
 * Workspace-scoped throughout. Internal complianceRate formula excluded from alert DTO.
 */

import { db } from "@/lib/db";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { NotFoundError, ValidationError } from "@/infra/errors";

// ─── Constants ────────────────────────────────────────────────────────────────

const COMPLIANCE_THRESHOLD_DEFAULT = 0.8; // 80% — alert if below

// ─── Public DTOs ─────────────────────────────────────────────────────────────

export interface PublicTrainingAssignmentDTO {
  id: string;
  workspaceId: string;
  sopDocumentId: string;
  assignedTo: string;
  dueDate: string | null;
  status: string;
  completedAt: string | null;
  evidenceUrl: string | null;
  evidenceNote: string | null;
  createdAt: string;
  updatedAt: string;
  // Excluded: assignedBy (internal actor tracking)
}

export interface PublicNonComplianceAlertDTO {
  id: string;
  workspaceId: string;
  sopDocumentId: string;
  alertWindow: string;
  threshold: number;
  acknowledged: boolean;
  acknowledgedAt: string | null;
  createdAt: string;
  // Excluded: complianceRate (internal compliance formula is confidential)
}

export interface ComplianceSummaryDTO {
  sopDocumentId: string;
  workspaceId: string;
  totalAssigned: number;
  totalCompleted: number;
  complianceRate: number;
  meetsThreshold: boolean;
}

// ─── Row types ────────────────────────────────────────────────────────────────

type TrainingRow = {
  id: string;
  workspaceId: string;
  sopDocumentId: string;
  assignedTo: string;
  assignedBy: string;
  dueDate: Date | null;
  status: string;
  completedAt: Date | null;
  evidenceUrl: string | null;
  evidenceNote: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type AlertRow = {
  id: string;
  workspaceId: string;
  sopDocumentId: string;
  alertWindow: string;
  complianceRate: number;
  threshold: number;
  acknowledged: boolean;
  acknowledgedAt: Date | null;
  createdAt: Date;
};

const trainingSelect = {
  id: true,
  workspaceId: true,
  sopDocumentId: true,
  assignedTo: true,
  assignedBy: true,
  dueDate: true,
  status: true,
  completedAt: true,
  evidenceUrl: true,
  evidenceNote: true,
  createdAt: true,
  updatedAt: true,
};

const alertSelect = {
  id: true,
  workspaceId: true,
  sopDocumentId: true,
  alertWindow: true,
  complianceRate: true,
  threshold: true,
  acknowledged: true,
  acknowledgedAt: true,
  createdAt: true,
};

function toPublicTrainingDTO(row: TrainingRow): PublicTrainingAssignmentDTO {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    sopDocumentId: row.sopDocumentId,
    assignedTo: row.assignedTo,
    dueDate: row.dueDate?.toISOString() ?? null,
    status: row.status,
    completedAt: row.completedAt?.toISOString() ?? null,
    evidenceUrl: row.evidenceUrl,
    evidenceNote: row.evidenceNote,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toPublicAlertDTO(row: AlertRow): PublicNonComplianceAlertDTO {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    sopDocumentId: row.sopDocumentId,
    alertWindow: row.alertWindow,
    threshold: row.threshold,
    acknowledged: row.acknowledged,
    acknowledgedAt: row.acknowledgedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    // complianceRate intentionally excluded from public DTO
  };
}

// ─── Assign Training ─────────────────────────────────────────────────────────

export interface AssignTrainingInput {
  workspaceId: string;
  actorId: string;
  sopDocumentId: string;
  assignedTo: string;
  dueDate?: Date;
}

export async function assignTraining(input: AssignTrainingInput): Promise<PublicTrainingAssignmentDTO> {
  const { workspaceId, actorId, sopDocumentId, assignedTo, dueDate } = input;

  // Idempotent: one assignment per (workspace, sop, staff member)
  const existing = await db.ownerSopTrainingAssignment.findFirst({
    where: { workspaceId, sopDocumentId, assignedTo },
    select: trainingSelect,
  });
  if (existing) return toPublicTrainingDTO(existing as TrainingRow);

  const row = await db.ownerSopTrainingAssignment.create({
    data: {
      workspaceId,
      sopDocumentId,
      assignedTo,
      assignedBy: actorId,
      dueDate: dueDate ?? null,
      status: "ASSIGNED",
    },
    select: trainingSelect,
  });

  await emitAuditEvent({
    workspaceId,
    actorId,
    eventName: AUDIT_EVENTS.SOP_TRAINING_ASSIGNED,
    entityType: "OwnerSopTrainingAssignment",
    entityId: row.id,
    payload: { sopDocumentId, assignedTo },
  });

  return toPublicTrainingDTO(row as TrainingRow);
}

// ─── Record Training Completion ───────────────────────────────────────────────

export interface RecordTrainingCompletionInput {
  workspaceId: string;
  actorId: string;
  assignmentId: string;
  evidenceUrl: string;
  evidenceNote?: string;
}

export async function recordTrainingCompletion(
  input: RecordTrainingCompletionInput
): Promise<PublicTrainingAssignmentDTO> {
  const { workspaceId, actorId, assignmentId, evidenceUrl, evidenceNote } = input;

  if (!evidenceUrl.trim()) {
    throw new ValidationError("evidenceUrl is required to record training completion");
  }

  const assignment = await db.ownerSopTrainingAssignment.findFirst({
    where: { id: assignmentId, workspaceId },
    select: trainingSelect,
  });
  if (!assignment) throw new NotFoundError("OwnerSopTrainingAssignment", assignmentId);

  if (assignment.status === "COMPLETED") {
    return toPublicTrainingDTO(assignment as TrainingRow);
  }

  const updated = await db.ownerSopTrainingAssignment.update({
    where: { id: assignmentId },
    data: {
      status: "COMPLETED",
      completedAt: new Date(),
      evidenceUrl,
      evidenceNote: evidenceNote ?? null,
    },
    select: trainingSelect,
  });

  await emitAuditEvent({
    workspaceId,
    actorId,
    eventName: AUDIT_EVENTS.SOP_TRAINING_COMPLETED,
    entityType: "OwnerSopTrainingAssignment",
    entityId: assignmentId,
    payload: { sopDocumentId: assignment.sopDocumentId, assignedTo: assignment.assignedTo },
  });

  return toPublicTrainingDTO(updated as TrainingRow);
}

// ─── Calculate Compliance Rate ────────────────────────────────────────────────

export async function calculateComplianceRate(input: {
  workspaceId: string;
  sopDocumentId: string;
  threshold?: number;
}): Promise<ComplianceSummaryDTO> {
  const { workspaceId, sopDocumentId, threshold = COMPLIANCE_THRESHOLD_DEFAULT } = input;

  const [totalAssigned, totalCompleted] = await Promise.all([
    db.ownerSopTrainingAssignment.count({
      where: { workspaceId, sopDocumentId },
    }),
    db.ownerSopTrainingAssignment.count({
      where: { workspaceId, sopDocumentId, status: "COMPLETED" },
    }),
  ]);

  const complianceRate = totalAssigned > 0 ? totalCompleted / totalAssigned : 1.0;

  return {
    sopDocumentId,
    workspaceId,
    totalAssigned,
    totalCompleted,
    complianceRate,
    meetsThreshold: complianceRate >= threshold,
  };
}

// ─── Create Non-Compliance Alert (idempotent) ─────────────────────────────────

export interface CreateNonComplianceAlertInput {
  workspaceId: string;
  actorId: string;
  sopDocumentId: string;
  alertWindow: string;
  complianceRate: number;
  threshold?: number;
}

export async function createNonComplianceAlert(
  input: CreateNonComplianceAlertInput
): Promise<PublicNonComplianceAlertDTO> {
  const {
    workspaceId, actorId, sopDocumentId, alertWindow, complianceRate,
    threshold = COMPLIANCE_THRESHOLD_DEFAULT,
  } = input;

  if (complianceRate >= threshold) {
    throw new ValidationError(
      `Compliance rate ${complianceRate} meets threshold ${threshold}. Alert not required.`
    );
  }

  // Idempotent: same (workspaceId, sopDocumentId, alertWindow) = one alert
  const existing = await db.ownerSopNonComplianceAlert.findFirst({
    where: { workspaceId, sopDocumentId, alertWindow },
    select: alertSelect,
  });
  if (existing) return toPublicAlertDTO(existing as AlertRow);

  const alert = await db.ownerSopNonComplianceAlert.create({
    data: {
      workspaceId,
      sopDocumentId,
      alertWindow,
      complianceRate,
      threshold,
      acknowledged: false,
    },
    select: alertSelect,
  });

  await emitAuditEvent({
    workspaceId,
    actorId,
    eventName: AUDIT_EVENTS.SOP_NONCOMPLIANCE_ALERT_CREATED,
    entityType: "OwnerSopNonComplianceAlert",
    entityId: alert.id,
    payload: { sopDocumentId, alertWindow, threshold },
  });

  // Trigger business condition re-assessment (fire-and-forget, Bundle 4.1).
  // SOP non-compliance is a contradicting evidence signal → owner reassessment event.
  void fireComplianceReAssessmentSignal(workspaceId, actorId, alert.id);

  return toPublicAlertDTO(alert as AlertRow);
}

async function fireComplianceReAssessmentSignal(
  workspaceId: string,
  actorId: string,
  alertId: string,
): Promise<void> {
  const { routeSopComplianceSignal } = await import(
    "@/services/owner-mode/stage3-signal-router.service"
  );
  // businessId is not yet available on SOP alerts — signal is wired but skips until
  // OwnerSopNonComplianceAlert gains a businessId field (Stage 5+).
  await routeSopComplianceSignal(workspaceId, actorId, alertId, null);
}

// ─── List Training Assignments ────────────────────────────────────────────────

export async function listTrainingAssignments(input: {
  workspaceId: string;
  sopDocumentId?: string;
  status?: string;
  assignedTo?: string;
}): Promise<PublicTrainingAssignmentDTO[]> {
  const { workspaceId, sopDocumentId, status, assignedTo } = input;

  const rows = await db.ownerSopTrainingAssignment.findMany({
    where: {
      workspaceId,
      ...(sopDocumentId ? { sopDocumentId } : {}),
      ...(status ? { status } : {}),
      ...(assignedTo ? { assignedTo } : {}),
    },
    orderBy: { createdAt: "desc" },
    select: trainingSelect,
  });

  return (rows as TrainingRow[]).map(toPublicTrainingDTO);
}

// ─── List Non-Compliance Alerts ────────────────────────────────────────────────

export async function listNonComplianceAlerts(input: {
  workspaceId: string;
  sopDocumentId?: string;
  acknowledged?: boolean;
}): Promise<PublicNonComplianceAlertDTO[]> {
  const { workspaceId, sopDocumentId, acknowledged } = input;

  const rows = await db.ownerSopNonComplianceAlert.findMany({
    where: {
      workspaceId,
      ...(sopDocumentId ? { sopDocumentId } : {}),
      ...(acknowledged !== undefined ? { acknowledged } : {}),
    },
    orderBy: { createdAt: "desc" },
    select: alertSelect,
  });

  return (rows as AlertRow[]).map(toPublicAlertDTO);
}
