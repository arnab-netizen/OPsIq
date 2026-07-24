/**
 * Jarvis 360 Slice 14 — compliance item service (DI for existing, direct-db for lifecycle).
 *
 * Records compliance items (licence/permit/insurance/tax) with expiry and reports
 * those needing review (expired → blocked, expiring soon → caution). Reuses the
 * pure boundary rules. Recording is audited. Bundle 3.4 adds full lifecycle: status
 * transitions, task linkage, breach/overdue alerts.
 */

import { db } from "@/lib/db";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import type { AuditEventName } from "@/domain/constants/audit-events";
import { isExpired, isExpiringSoon } from "@/domain/owner-mode/compliance-boundary";
import { NotFoundError, ValidationError } from "@/infra/errors";
import type { Prisma } from "@/generated/prisma/client";

// ─── Status types ─────────────────────────────────────────────────────────────

export type ComplianceStatus =
  | "active"
  | "evidence_pending"
  | "review_pending"
  | "compliant"
  | "breached"
  | "waived";

const VALID_STATUSES: ComplianceStatus[] = [
  "active", "evidence_pending", "review_pending", "compliant", "breached", "waived",
];

const VALID_TRANSITIONS: Record<string, ComplianceStatus[]> = {
  active:           ["evidence_pending", "review_pending", "compliant", "breached", "waived"],
  evidence_pending: ["active", "review_pending", "breached", "waived"],
  review_pending:   ["active", "compliant", "breached", "waived"],
  compliant:        ["active", "review_pending", "waived"],
  breached:         ["active", "evidence_pending", "review_pending", "waived"],
  waived:           ["active", "breached"],
};

export type ComplianceTemporalState = "upcoming" | "action_required" | "overdue" | null;

function computeTemporalState(expiresAt: Date | null, now: Date, windowDays = 30): ComplianceTemporalState {
  if (!expiresAt) return null;
  if (isExpired(expiresAt, now)) return "overdue";
  if (isExpiringSoon(expiresAt, now, windowDays)) return "action_required";
  return "upcoming";
}

// ─── DI pattern for existing functions ────────────────────────────────────────

interface ComplianceRow {
  id: string;
  kind: string;
  name: string;
  reference: string | null;
  expiresAt: Date | null;
  status: string;
  jurisdiction: string | null;
  obligationOwner: string | null;
  penaltyDescription: string | null;
  createdAt: Date;
}

interface ComplianceDb {
  ownerComplianceItem: {
    create(args: { data: Record<string, unknown> }): Promise<{ id: string }>;
    findMany(args: { where: { workspaceId: string; status: string }; select: Record<string, boolean> }): Promise<ComplianceRow[]>;
  };
}

export interface ComplianceDeps {
  db: ComplianceDb;
  now?: () => Date;
}

async function resolveDefaultDeps(): Promise<ComplianceDeps> {
  return { db: db as unknown as ComplianceDb };
}

// ─── Create ───────────────────────────────────────────────────────────────────

export interface RecordComplianceItemInput {
  workspaceId: string;
  businessId?: string | null;
  kind: string;
  name: string;
  reference?: string | null;
  expiresAt?: Date | null;
  actorId: string;
  jurisdiction?: string | null;
  legalBasis?: string | null;
  obligationOwner?: string | null;
  evidenceValidityDays?: number | null;
  recurrenceMonths?: number | null;
  penaltyDescription?: string | null;
  /** "owner_input" | "professional_input" | "authoritative_document" */
  provenanceSource?: string | null;
}

export async function recordComplianceItem(input: RecordComplianceItemInput, injected?: ComplianceDeps): Promise<string> {
  const deps = injected ?? (await resolveDefaultDeps());
  const now = (deps.now ?? (() => new Date()))();
  const created = await deps.db.ownerComplianceItem.create({
    data: {
      workspaceId: input.workspaceId,
      businessId: input.businessId ?? null,
      kind: input.kind,
      name: input.name,
      reference: input.reference ?? null,
      expiresAt: input.expiresAt ?? null,
      status: "active",
      createdByUserId: input.actorId,
      jurisdiction: input.jurisdiction ?? null,
      legalBasis: input.legalBasis ?? null,
      obligationOwner: input.obligationOwner ?? null,
      evidenceValidityDays: input.evidenceValidityDays ?? null,
      recurrenceMonths: input.recurrenceMonths ?? null,
      penaltyDescription: input.penaltyDescription ?? null,
      provenanceSource: input.provenanceSource ?? null,
      updatedAt: now,
    },
  });
  await emitAuditEvent({
    workspaceId: input.workspaceId,
    eventName: AUDIT_EVENTS.OWNER_COMPLIANCE_REVIEW_REQUIRED,
    actorId: input.actorId,
    actorType: "user",
    entityType: "owner_compliance_item",
    entityId: created.id,
    payload: { kind: input.kind, name: input.name },
  });
  return created.id;
}

// ─── Review queue (existing, DI) ─────────────────────────────────────────────

export interface ComplianceReviewItem {
  id: string;
  kind: string;
  name: string;
  reference: string | null;
  expiresAt: string | null;
  status: string;
  jurisdiction: string | null;
  obligationOwner: string | null;
  penaltyDescription: string | null;
  state: "expired" | "expiring_soon";
  createdAt: string;
}

/** List compliance items needing attention (expired or expiring soon). */
export async function getComplianceReviewItems(
  workspaceId: string,
  injected?: ComplianceDeps,
  windowDays = 30
): Promise<ComplianceReviewItem[]> {
  const deps = injected ?? (await resolveDefaultDeps());
  const now = (deps.now ?? (() => new Date()))();
  const rows = await deps.db.ownerComplianceItem.findMany({
    where: { workspaceId, status: "active" },
    select: {
      id: true,
      kind: true,
      name: true,
      reference: true,
      expiresAt: true,
      status: true,
      jurisdiction: true,
      obligationOwner: true,
      penaltyDescription: true,
      createdAt: true,
    },
  });
  const out: ComplianceReviewItem[] = [];
  for (const r of rows) {
    let state: "expired" | "expiring_soon" | null = null;
    if (isExpired(r.expiresAt, now)) state = "expired";
    else if (isExpiringSoon(r.expiresAt, now, windowDays)) state = "expiring_soon";
    if (!state) continue;
    out.push({
      id: r.id,
      kind: r.kind,
      name: r.name,
      reference: r.reference,
      expiresAt: r.expiresAt ? r.expiresAt.toISOString() : null,
      status: r.status,
      jurisdiction: r.jurisdiction,
      obligationOwner: r.obligationOwner,
      penaltyDescription: r.penaltyDescription,
      state,
      createdAt: r.createdAt.toISOString(),
    });
  }
  return out;
}

// ─── Lifecycle: list all items ────────────────────────────────────────────────

export interface ComplianceDetail {
  id: string;
  workspaceId: string;
  kind: string;
  name: string;
  reference: string | null;
  expiresAt: string | null;
  status: string;
  jurisdiction: string | null;
  legalBasis: string | null;
  obligationOwner: string | null;
  evidenceValidityDays: number | null;
  recurrenceMonths: number | null;
  penaltyDescription: string | null;
  provenanceSource: string | null;
  reviewedAt: string | null;
  reviewedBy: string | null;
  complianceNotes: string | null;
  temporalState: ComplianceTemporalState;
  taskLinks: Array<{
    id: string;
    taskId: string;
    linkType: string;
    linkedBy: string;
    createdAt: string;
  }>;
  createdAt: string;
  updatedAt: string;
}

interface ComplianceRow2 {
  id: string; workspaceId: string; kind: string; name: string;
  reference: string | null; expiresAt: Date | null; status: string;
  jurisdiction: string | null; legalBasis: string | null; obligationOwner: string | null;
  evidenceValidityDays: number | null; recurrenceMonths: number | null;
  penaltyDescription: string | null; provenanceSource: string | null;
  reviewedAt: Date | null; reviewedBy: string | null; complianceNotes: string | null;
  taskLinks: Array<{ id: string; taskId: string; linkType: string; linkedBy: string; createdAt: Date }>;
  createdAt: Date; updatedAt: Date;
}

function rowToDetail(
  r: ComplianceRow2,
  now: Date,
): ComplianceDetail {
  return {
    id: r.id,
    workspaceId: r.workspaceId,
    kind: r.kind,
    name: r.name,
    reference: r.reference,
    expiresAt: r.expiresAt ? r.expiresAt.toISOString() : null,
    status: r.status,
    jurisdiction: r.jurisdiction,
    legalBasis: r.legalBasis,
    obligationOwner: r.obligationOwner,
    evidenceValidityDays: r.evidenceValidityDays,
    recurrenceMonths: r.recurrenceMonths,
    penaltyDescription: r.penaltyDescription,
    provenanceSource: r.provenanceSource,
    reviewedAt: r.reviewedAt ? r.reviewedAt.toISOString() : null,
    reviewedBy: r.reviewedBy,
    complianceNotes: r.complianceNotes,
    temporalState: computeTemporalState(r.expiresAt, now),
    taskLinks: r.taskLinks.map((tl) => ({
      id: tl.id,
      taskId: tl.taskId,
      linkType: tl.linkType,
      linkedBy: tl.linkedBy,
      createdAt: tl.createdAt.toISOString(),
    })),
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

export async function getAllComplianceItems(
  workspaceId: string,
  opts: { status?: string } = {},
): Promise<ComplianceDetail[]> {
  const now = new Date();
  const rows = await db.ownerComplianceItem.findMany({
    where: {
      workspaceId,
      ...(opts.status ? { status: opts.status } : {}),
    },
    include: {
      taskLinks: {
        select: { id: true, taskId: true, linkType: true, linkedBy: true, createdAt: true },
      },
    },
    orderBy: [{ expiresAt: "asc" }, { createdAt: "desc" }],
  });
  return rows.map((r: ComplianceRow2) => rowToDetail(r, now));
}

export async function getComplianceItem(workspaceId: string, itemId: string): Promise<ComplianceDetail> {
  const now = new Date();
  const row = await db.ownerComplianceItem.findFirst({
    where: { id: itemId, workspaceId },
    include: {
      taskLinks: {
        select: { id: true, taskId: true, linkType: true, linkedBy: true, createdAt: true },
      },
    },
  });
  if (!row) throw new NotFoundError("OwnerComplianceItem", itemId);
  return rowToDetail(row as unknown as ComplianceRow2, now);
}

// ─── Lifecycle: status transition ─────────────────────────────────────────────

export interface UpdateComplianceStatusInput {
  workspaceId: string;
  itemId: string;
  actorId: string;
  newStatus: ComplianceStatus;
  complianceNotes?: string | null;
  reviewedBy?: string | null;
}

export async function updateComplianceStatus(input: UpdateComplianceStatusInput): Promise<ComplianceDetail> {
  if (!VALID_STATUSES.includes(input.newStatus)) {
    throw new ValidationError(`Invalid compliance status: ${input.newStatus}`);
  }

  const existing = await db.ownerComplianceItem.findFirst({
    where: { id: input.itemId, workspaceId: input.workspaceId },
    select: { id: true, status: true, name: true, workspaceId: true },
  });
  if (!existing) throw new NotFoundError("OwnerComplianceItem", input.itemId);

  const allowed = VALID_TRANSITIONS[existing.status] ?? [];
  if (!allowed.includes(input.newStatus)) {
    throw new ValidationError(
      `Illegal compliance transition: ${existing.status} → ${input.newStatus}. Allowed: ${allowed.join(", ") || "none"}`,
    );
  }

  const now = new Date();

  await db.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.ownerComplianceItem.update({
      where: { id: input.itemId },
      data: {
        status: input.newStatus,
        reviewedAt: now,
        reviewedBy: input.reviewedBy ?? input.actorId,
        ...(input.complianceNotes !== undefined ? { complianceNotes: input.complianceNotes } : {}),
        updatedAt: now,
      },
    });

    let eventName: AuditEventName = AUDIT_EVENTS.OWNER_COMPLIANCE_STATUS_CHANGED;
    if (input.newStatus === "breached") eventName = AUDIT_EVENTS.OWNER_COMPLIANCE_BREACH_RECORDED;
    else if (input.newStatus === "compliant") eventName = AUDIT_EVENTS.OWNER_COMPLIANCE_REVIEW_COMPLETED;

    await emitAuditEvent(
      {
        eventName,
        workspaceId: input.workspaceId,
        actorId: input.actorId,
        actorType: "user",
        entityType: "OwnerComplianceItem",
        entityId: input.itemId,
        payload: {
          previousStatus: existing.status,
          newStatus: input.newStatus,
          complianceNotes: input.complianceNotes,
        },
      },
      tx,
    );
  });

  if (input.newStatus === "breached") {
    const { createAlert } = await import("@/services/alerts/alert-service");
    await createAlert({
      workspaceId: input.workspaceId,
      userId: input.actorId,
      type: "threshold_breach",
      channel: "in_app",
      severity: "critical",
      message: `Compliance breach recorded for item: ${existing.name}`,
      entityType: "OwnerComplianceItem",
      entityId: input.itemId,
      idempotencyKey: `compliance-breach:${input.itemId}:${input.newStatus}`,
    });
  }

  return getComplianceItem(input.workspaceId, input.itemId);
}

// ─── Task linkage ─────────────────────────────────────────────────────────────

export interface LinkComplianceTaskInput {
  workspaceId: string;
  itemId: string;
  taskId: string;
  linkType?: "REMEDIATION" | "EVIDENCE";
  actorId: string;
}

export async function linkTaskToComplianceItem(input: LinkComplianceTaskInput): Promise<{ id: string }> {
  const item = await db.ownerComplianceItem.findFirst({
    where: { id: input.itemId, workspaceId: input.workspaceId },
    select: { id: true },
  });
  if (!item) throw new NotFoundError("OwnerComplianceItem", input.itemId);

  const task = await db.delegatedTask.findFirst({
    where: { id: input.taskId, workspaceId: input.workspaceId },
    select: { id: true },
  });
  if (!task) throw new NotFoundError("DelegatedTask", input.taskId);

  const link = await db.$transaction(async (tx: Prisma.TransactionClient) => {
    const created = await tx.complianceTaskLink.upsert({
      where: {
        workspaceId_complianceItemId_taskId: {
          workspaceId: input.workspaceId,
          complianceItemId: input.itemId,
          taskId: input.taskId,
        },
      },
      create: {
        workspaceId: input.workspaceId,
        complianceItemId: input.itemId,
        taskId: input.taskId,
        linkType: input.linkType ?? "REMEDIATION",
        linkedBy: input.actorId,
      },
      update: { linkType: input.linkType ?? "REMEDIATION" },
    });

    await emitAuditEvent(
      {
        eventName: AUDIT_EVENTS.OWNER_COMPLIANCE_TASK_LINKED,
        workspaceId: input.workspaceId,
        actorId: input.actorId,
        actorType: "user",
        entityType: "OwnerComplianceItem",
        entityId: input.itemId,
        payload: { taskId: input.taskId, linkType: input.linkType ?? "REMEDIATION" },
      },
      tx,
    );

    return created;
  });

  return { id: link.id };
}
