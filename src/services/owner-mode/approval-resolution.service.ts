/**
 * Bundle 3.7 — Approval Resolution and Evidence Chain service.
 *
 * Full lifecycle: create (idempotent) → submit evidence (append-only) →
 * decide (APPROVED | REJECTED | DEFERRED; immutable once APPROVED/REJECTED) →
 * appeal (new request linked via appealOfId).
 *
 * REJECTED decision triggers rescope signal (fire-and-forget seam).
 * All mutations emit audit events. Evidence credibility score is internal only.
 * Workspace-scoped throughout.
 */

import { db } from "@/lib/db";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { NotFoundError, ValidationError } from "@/infra/errors";

// ─── Status machine ──────────────────────────────────────────────────────────

type ApprovalStatus = "PENDING" | "APPROVED" | "REJECTED" | "DEFERRED";
type DecisionStatus = "APPROVED" | "REJECTED" | "DEFERRED";
type EvidenceType = "document" | "photo" | "data" | "testimony";

const DECISION_STATUSES: DecisionStatus[] = ["APPROVED", "REJECTED", "DEFERRED"];
const EVIDENCE_TYPES: EvidenceType[] = ["document", "photo", "data", "testimony"];
const TERMINAL_STATUSES: ApprovalStatus[] = ["APPROVED", "REJECTED"];
const MUTABLE_STATUSES: ApprovalStatus[] = ["PENDING", "DEFERRED"];

function assertDecisionStatus(s: string): asserts s is DecisionStatus {
  if (!DECISION_STATUSES.includes(s as DecisionStatus)) {
    throw new ValidationError(
      `Invalid decision: ${s}. Must be APPROVED | REJECTED | DEFERRED`
    );
  }
}

function assertEvidenceType(t: string): asserts t is EvidenceType {
  if (!EVIDENCE_TYPES.includes(t as EvidenceType)) {
    throw new ValidationError(
      `Invalid evidenceType: ${t}. Must be document | photo | data | testimony`
    );
  }
}

// ─── Public DTOs ─────────────────────────────────────────────────────────────

export interface PublicEvidenceDTO {
  id: string;
  workspaceId: string;
  approvalId: string;
  evidenceType: string;
  description: string;
  sourceUrl: string | null;
  submittedBy: string;
  createdAt: string;
}

export interface PublicApprovalDTO {
  id: string;
  workspaceId: string;
  businessId: string;
  actionId: string | null;
  actionDomain: string | null;
  requestedBy: string;
  status: string;
  rationale: string | null;
  decidedAt: string | null;
  appealOfId: string | null;
  rescopeTriggered: boolean;
  createdAt: string;
  updatedAt: string;
  evidences: PublicEvidenceDTO[];
}

// ─── Row types ───────────────────────────────────────────────────────────────

type EvidenceRow = {
  id: string;
  workspaceId: string;
  approvalId: string;
  evidenceType: string;
  description: string;
  sourceUrl: string | null;
  credibilityScore: number | null;
  submittedBy: string;
  createdAt: Date;
};

type ApprovalRow = {
  id: string;
  workspaceId: string;
  idempotencyKey: string;
  businessId: string;
  actionId: string | null;
  actionDomain: string | null;
  requestedBy: string;
  status: string;
  rationale: string | null;
  decidedById: string | null;
  decidedAt: Date | null;
  appealOfId: string | null;
  rescopeTriggered: boolean;
  createdBy: string;
  updatedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  evidences: EvidenceRow[];
};

const evidenceSelect = {
  id: true,
  workspaceId: true,
  approvalId: true,
  evidenceType: true,
  description: true,
  sourceUrl: true,
  credibilityScore: true,
  submittedBy: true,
  createdAt: true,
};

const approvalSelect = {
  id: true,
  workspaceId: true,
  idempotencyKey: true,
  businessId: true,
  actionId: true,
  actionDomain: true,
  requestedBy: true,
  status: true,
  rationale: true,
  decidedById: true,
  decidedAt: true,
  appealOfId: true,
  rescopeTriggered: true,
  createdBy: true,
  updatedBy: true,
  createdAt: true,
  updatedAt: true,
  evidences: { select: evidenceSelect },
};

function toPublicEvidenceDTO(row: EvidenceRow): PublicEvidenceDTO {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    approvalId: row.approvalId,
    evidenceType: row.evidenceType,
    description: row.description,
    sourceUrl: row.sourceUrl,
    submittedBy: row.submittedBy,
    createdAt: row.createdAt.toISOString(),
  };
}

function toPublicDTO(row: ApprovalRow): PublicApprovalDTO {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    businessId: row.businessId,
    actionId: row.actionId,
    actionDomain: row.actionDomain,
    requestedBy: row.requestedBy,
    status: row.status,
    rationale: row.rationale,
    decidedAt: row.decidedAt?.toISOString() ?? null,
    appealOfId: row.appealOfId,
    rescopeTriggered: row.rescopeTriggered,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    evidences: row.evidences.map(toPublicEvidenceDTO),
  };
}

async function loadApproval(id: string, workspaceId: string): Promise<ApprovalRow> {
  const row = await db.ownerApprovalRequest.findFirst({
    where: { id, workspaceId },
    select: approvalSelect,
  });
  if (!row) throw new NotFoundError("OwnerApprovalRequest", id);
  return row as ApprovalRow;
}

// ─── Create ──────────────────────────────────────────────────────────────────

export interface CreateApprovalInput {
  workspaceId: string;
  actorId: string;
  idempotencyKey: string;
  businessId: string;
  actionId?: string;
  actionDomain?: string;
}

export async function createApproval(input: CreateApprovalInput): Promise<PublicApprovalDTO> {
  const { workspaceId, actorId, idempotencyKey, businessId, actionId, actionDomain } = input;

  const existing = await db.ownerApprovalRequest.findFirst({
    where: { workspaceId, idempotencyKey },
    select: approvalSelect,
  });
  if (existing) return toPublicDTO(existing as ApprovalRow);

  const row = await db.ownerApprovalRequest.create({
    data: {
      workspaceId,
      idempotencyKey,
      businessId,
      actionId: actionId ?? null,
      actionDomain: actionDomain ?? null,
      requestedBy: actorId,
      status: "PENDING",
      createdBy: actorId,
    },
    select: approvalSelect,
  });

  await emitAuditEvent({
    workspaceId,
    actorId,
    eventName: AUDIT_EVENTS.APPROVAL_CREATED,
    entityType: "OwnerApprovalRequest",
    entityId: row.id,
    payload: { businessId, actionId, actionDomain, idempotencyKey },
  });

  return toPublicDTO(row as ApprovalRow);
}

// ─── Submit Evidence ──────────────────────────────────────────────────────────

export interface SubmitEvidenceInput {
  workspaceId: string;
  actorId: string;
  approvalId: string;
  evidenceType: string;
  description: string;
  sourceUrl?: string;
  credibilityScore?: number;
}

export async function submitEvidence(input: SubmitEvidenceInput): Promise<PublicApprovalDTO> {
  const { workspaceId, actorId, approvalId, description, sourceUrl, credibilityScore } = input;

  assertEvidenceType(input.evidenceType);

  const approval = await loadApproval(approvalId, workspaceId);

  if (TERMINAL_STATUSES.includes(approval.status as ApprovalStatus)) {
    throw new ValidationError(
      `Cannot submit evidence on a ${approval.status} approval. Only PENDING or DEFERRED approvals accept evidence.`
    );
  }

  await db.ownerApprovalEvidence.create({
    data: {
      workspaceId,
      approvalId,
      evidenceType: input.evidenceType,
      description,
      sourceUrl: sourceUrl ?? null,
      credibilityScore: credibilityScore ?? null,
      submittedBy: actorId,
    },
  });

  await emitAuditEvent({
    workspaceId,
    actorId,
    eventName: AUDIT_EVENTS.APPROVAL_EVIDENCE_SUBMITTED,
    entityType: "OwnerApprovalRequest",
    entityId: approvalId,
    payload: { evidenceType: input.evidenceType, approvalId },
  });

  const updated = await loadApproval(approvalId, workspaceId);
  return toPublicDTO(updated);
}

// ─── Make Decision ───────────────────────────────────────────────────────────

export interface MakeDecisionInput {
  workspaceId: string;
  actorId: string;
  approvalId: string;
  decision: string;
  rationale?: string;
}

export async function makeDecision(input: MakeDecisionInput): Promise<PublicApprovalDTO> {
  const { workspaceId, actorId, approvalId, rationale } = input;

  assertDecisionStatus(input.decision);
  const decision = input.decision as DecisionStatus;

  const approval = await loadApproval(approvalId, workspaceId);

  if (!MUTABLE_STATUSES.includes(approval.status as ApprovalStatus)) {
    throw new ValidationError(
      `Cannot decide on approval in status ${approval.status}. Only PENDING or DEFERRED approvals can be decided.`
    );
  }

  await db.ownerApprovalRequest.update({
    where: { id: approvalId },
    data: {
      status: decision,
      rationale: rationale ?? null,
      decidedById: actorId,
      decidedAt: new Date(),
      updatedBy: actorId,
    },
    select: approvalSelect,
  });

  await emitAuditEvent({
    workspaceId,
    actorId,
    eventName: AUDIT_EVENTS.APPROVAL_DECIDED,
    entityType: "OwnerApprovalRequest",
    entityId: approvalId,
    payload: { decision, actionId: approval.actionId, actionDomain: approval.actionDomain },
  });

  if (decision === "REJECTED") {
    await db.ownerApprovalRequest.update({
      where: { id: approvalId },
      data: { rescopeTriggered: true },
    });

    await emitAuditEvent({
      workspaceId,
      actorId,
      eventName: AUDIT_EVENTS.APPROVAL_ACTION_RESCOPED,
      entityType: "OwnerApprovalRequest",
      entityId: approvalId,
      payload: { actionId: approval.actionId, actionDomain: approval.actionDomain },
    });

    void fireRescopeSignal(workspaceId, actorId, approvalId, approval.businessId, approval.actionId);
  }

  const reloaded = await loadApproval(approvalId, workspaceId);
  return toPublicDTO(reloaded);
}

async function fireRescopeSignal(
  workspaceId: string,
  actorId: string,
  approvalId: string,
  businessId: string,
  actionId: string | null,
): Promise<void> {
  const { routeApprovalRejectionSignal } = await import(
    "@/services/owner-mode/stage3-signal-router.service"
  );
  await routeApprovalRejectionSignal(workspaceId, actorId, approvalId, businessId, actionId);
}

// ─── Initiate Appeal ─────────────────────────────────────────────────────────

export interface InitiateAppealInput {
  workspaceId: string;
  actorId: string;
  idempotencyKey: string;
  priorApprovalId: string;
}

export async function initiateAppeal(input: InitiateAppealInput): Promise<PublicApprovalDTO> {
  const { workspaceId, actorId, idempotencyKey, priorApprovalId } = input;

  const prior = await loadApproval(priorApprovalId, workspaceId);

  if (prior.status !== "REJECTED") {
    throw new ValidationError(
      `Appeals can only be initiated against REJECTED approvals. Current status: ${prior.status}`
    );
  }

  const existing = await db.ownerApprovalRequest.findFirst({
    where: { workspaceId, idempotencyKey },
    select: approvalSelect,
  });
  if (existing) return toPublicDTO(existing as ApprovalRow);

  const row = await db.ownerApprovalRequest.create({
    data: {
      workspaceId,
      idempotencyKey,
      businessId: prior.businessId,
      actionId: prior.actionId,
      actionDomain: prior.actionDomain,
      requestedBy: actorId,
      status: "PENDING",
      appealOfId: priorApprovalId,
      createdBy: actorId,
    },
    select: approvalSelect,
  });

  await emitAuditEvent({
    workspaceId,
    actorId,
    eventName: AUDIT_EVENTS.APPROVAL_APPEAL_INITIATED,
    entityType: "OwnerApprovalRequest",
    entityId: row.id,
    payload: { priorApprovalId, businessId: prior.businessId, actionId: prior.actionId },
  });

  return toPublicDTO(row as ApprovalRow);
}

// ─── List / Get ───────────────────────────────────────────────────────────────

export async function getApproval(input: {
  workspaceId: string;
  approvalId: string;
}): Promise<PublicApprovalDTO> {
  const row = await loadApproval(input.approvalId, input.workspaceId);
  return toPublicDTO(row);
}

export async function listApprovals(input: {
  workspaceId: string;
  businessId?: string;
  status?: string;
  actionId?: string;
}): Promise<PublicApprovalDTO[]> {
  const { workspaceId, businessId, status, actionId } = input;

  const rows = await db.ownerApprovalRequest.findMany({
    where: {
      workspaceId,
      ...(businessId ? { businessId } : {}),
      ...(status ? { status } : {}),
      ...(actionId ? { actionId } : {}),
    },
    orderBy: { createdAt: "desc" },
    select: approvalSelect,
  });

  return (rows as ApprovalRow[]).map(toPublicDTO);
}
