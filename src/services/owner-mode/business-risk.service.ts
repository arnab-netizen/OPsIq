/**
 * Phase 4 — Business Risk Register service.
 *
 * CRUD for BusinessRiskEntry (workspace-scoped, distinct from engagement Risk).
 * Severity is stored as likelihood × impact / 100 for efficient ordering.
 * Workspace isolation enforced. Audit events emitted atomically.
 */

import { db } from "@/lib/db";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import type { AuditEventName } from "@/domain/constants/audit-events";
import { NotFoundError, ValidationError } from "@/infra/errors";
import type { Prisma } from "@/generated/prisma/client";

export type RiskCategory =
  | "OPERATIONAL"
  | "FINANCIAL"
  | "MARKET"
  | "COMPLIANCE"
  | "EXECUTION"
  | "STRATEGIC";

const VALID_CATEGORIES: RiskCategory[] = [
  "OPERATIONAL", "FINANCIAL", "MARKET", "COMPLIANCE", "EXECUTION", "STRATEGIC",
];

export type RiskStatus = "IDENTIFIED" | "ASSESSED" | "MITIGATING" | "ACCEPTED" | "RESOLVED" | "CLOSED";
const VALID_STATUSES: RiskStatus[] = [
  "IDENTIFIED", "ASSESSED", "MITIGATING", "ACCEPTED", "RESOLVED", "CLOSED",
];

function validateCategory(c: string): asserts c is RiskCategory {
  if (!VALID_CATEGORIES.includes(c as RiskCategory)) {
    throw new ValidationError(`Invalid risk category: ${c}`);
  }
}

function validateRiskStatus(s: string): asserts s is RiskStatus {
  if (!VALID_STATUSES.includes(s as RiskStatus)) {
    throw new ValidationError(`Invalid risk status: ${s}`);
  }
}

function clamp100(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

function computeSeverity(likelihood: number, impact: number): number {
  return Math.round((likelihood * impact) / 100);
}

export interface CreateBusinessRiskInput {
  workspaceId: string;
  actorId: string;
  riskCode: string;
  title: string;
  description?: string | null;
  category: RiskCategory;
  likelihood?: number; // 0..100
  impact?: number; // 0..100
  mitigationAction?: string | null;
  linkedObjectiveId?: string | null;
}

export interface UpdateBusinessRiskInput {
  workspaceId: string;
  riskId: string;
  actorId: string;
  title?: string;
  description?: string | null;
  category?: RiskCategory;
  status?: RiskStatus;
  likelihood?: number;
  impact?: number;
  mitigationAction?: string | null;
  residualRisk?: number | null;
  linkedObjectiveId?: string | null;
  reviewedAt?: Date | null;
}

export async function createBusinessRisk(input: CreateBusinessRiskInput) {
  validateCategory(input.category);

  if (input.riskCode.trim().length === 0) {
    throw new ValidationError("riskCode cannot be empty");
  }
  if (input.title.trim().length === 0) {
    throw new ValidationError("title cannot be empty");
  }

  const likelihood = clamp100(input.likelihood ?? 50);
  const impact = clamp100(input.impact ?? 50);
  const severity = computeSeverity(likelihood, impact);

  const risk = await db.$transaction(async (tx: Prisma.TransactionClient) => {
    const created = await tx.businessRiskEntry.create({
      data: {
        workspaceId: input.workspaceId,
        riskCode: input.riskCode.trim().toUpperCase(),
        title: input.title.trim(),
        description: input.description ?? null,
        category: input.category,
        likelihood,
        impact,
        severity,
        status: "IDENTIFIED",
        mitigationAction: input.mitigationAction ?? null,
        linkedObjectiveId: input.linkedObjectiveId ?? null,
        identifiedBy: input.actorId,
      },
    });

    await emitAuditEvent(
      {
        eventName: AUDIT_EVENTS.OWNER_BUSINESS_RISK_IDENTIFIED,
        workspaceId: input.workspaceId,
        actorId: input.actorId,
        entityType: "BusinessRiskEntry",
        entityId: created.id,
        payload: { riskCode: created.riskCode, category: input.category, severity },
      },
      tx,
    );

    return created;
  });

  if (severity >= CRITICAL_SEVERITY_THRESHOLD) {
    const { createAlert } = await import("@/services/alerts/alert-service");
    await createAlert({
      workspaceId: input.workspaceId,
      userId: input.actorId,
      type: "threshold_breach",
      channel: "in_app",
      severity: "critical",
      message: `Critical risk identified: ${risk.riskCode}`,
      entityType: "BusinessRiskEntry",
      entityId: risk.id,
      idempotencyKey: `risk_critical_${risk.id}`,
    }).catch(() => {});
  }

  return risk;
}

export async function updateBusinessRisk(input: UpdateBusinessRiskInput) {
  if (input.category) validateCategory(input.category);
  if (input.status) validateRiskStatus(input.status);

  const existing = await db.businessRiskEntry.findFirst({
    where: { id: input.riskId, workspaceId: input.workspaceId },
  });
  if (!existing) throw new NotFoundError("BusinessRiskEntry", input.riskId);

  const likelihood = input.likelihood !== undefined ? clamp100(input.likelihood) : existing.likelihood;
  const impact = input.impact !== undefined ? clamp100(input.impact) : existing.impact;
  const severity = computeSeverity(likelihood, impact);

  return db.$transaction(async (tx: Prisma.TransactionClient) => {
    const updated = await tx.businessRiskEntry.update({
      where: { id: input.riskId },
      data: {
        ...(input.title !== undefined ? { title: input.title.trim() } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.category !== undefined ? { category: input.category } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        likelihood,
        impact,
        severity,
        ...(input.mitigationAction !== undefined ? { mitigationAction: input.mitigationAction } : {}),
        ...(input.residualRisk !== undefined ? { residualRisk: input.residualRisk } : {}),
        ...(input.linkedObjectiveId !== undefined ? { linkedObjectiveId: input.linkedObjectiveId } : {}),
        ...(input.reviewedAt !== undefined ? { reviewedAt: input.reviewedAt } : {}),
      },
    });

    let eventName: AuditEventName = AUDIT_EVENTS.OWNER_BUSINESS_RISK_STATUS_CHANGED;
    if (input.status === "RESOLVED" || input.status === "CLOSED") {
      eventName = AUDIT_EVENTS.OWNER_BUSINESS_RISK_RESOLVED;
    }

    await emitAuditEvent(
      {
        eventName,
        workspaceId: input.workspaceId,
        actorId: input.actorId,
        entityType: "BusinessRiskEntry",
        entityId: input.riskId,
        payload: { status: updated.status, severity },
      },
      tx,
    );

    return updated;
  });
}

export async function listBusinessRisks(
  workspaceId: string,
  opts: { status?: RiskStatus; category?: RiskCategory } = {},
) {
  return db.businessRiskEntry.findMany({
    where: {
      workspaceId,
      ...(opts.status ? { status: opts.status } : {}),
      ...(opts.category ? { category: opts.category } : {}),
    },
    include: { taskLinks: { select: { id: true, taskId: true, linkType: true, createdAt: true } } },
    orderBy: [{ severity: "desc" }, { createdAt: "desc" }],
  });
}

export async function getBusinessRisk(workspaceId: string, riskId: string) {
  const risk = await db.businessRiskEntry.findFirst({
    where: { id: riskId, workspaceId },
    include: { taskLinks: { select: { id: true, taskId: true, linkType: true, linkedBy: true, createdAt: true } } },
  });
  if (!risk) throw new NotFoundError("BusinessRiskEntry", riskId);
  return risk;
}

// ─── Task linkage ─────────────────────────────────────────────────────────────

export interface LinkRiskTaskInput {
  workspaceId: string;
  riskId: string;
  taskId: string;
  linkType?: "MITIGATION" | "EVIDENCE";
  actorId: string;
}

export async function linkTaskToRisk(input: LinkRiskTaskInput) {
  // Verify risk belongs to workspace
  const risk = await db.businessRiskEntry.findFirst({
    where: { id: input.riskId, workspaceId: input.workspaceId },
    select: { id: true },
  });
  if (!risk) throw new NotFoundError("BusinessRiskEntry", input.riskId);

  // Verify task belongs to workspace (cross-workspace guard)
  const task = await db.delegatedTask.findFirst({
    where: { id: input.taskId, workspaceId: input.workspaceId },
    select: { id: true },
  });
  if (!task) throw new NotFoundError("DelegatedTask", input.taskId);

  const link = await db.$transaction(async (tx: Prisma.TransactionClient) => {
    const created = await (tx as unknown as { riskTaskLink: { upsert(a: unknown): Promise<unknown> } }).riskTaskLink.upsert({
      where: { workspaceId_riskId_taskId: { workspaceId: input.workspaceId, riskId: input.riskId, taskId: input.taskId } },
      create: {
        workspaceId: input.workspaceId,
        riskId: input.riskId,
        taskId: input.taskId,
        linkType: input.linkType ?? "MITIGATION",
        linkedBy: input.actorId,
      },
      update: { linkType: input.linkType ?? "MITIGATION" },
    });
    await emitAuditEvent(
      {
        eventName: AUDIT_EVENTS.OWNER_RISK_TASK_LINKED,
        workspaceId: input.workspaceId,
        actorId: input.actorId,
        entityType: "BusinessRiskEntry",
        entityId: input.riskId,
        payload: { taskId: input.taskId, linkType: input.linkType ?? "MITIGATION" },
      },
      tx,
    );
    return created;
  });
  return link;
}

// ─── Lifecycle transitions ────────────────────────────────────────────────────

export interface ReviewRiskInput {
  workspaceId: string;
  riskId: string;
  actorId: string;
  newStatus: "MITIGATING" | "ACCEPTED" | "RESOLVED" | "CLOSED" | "ASSESSED";
  residualRisk?: number | null;
  acceptanceRationale?: string | null;
  reviewNotes?: string | null;
  reviewDueDate?: Date | null;
}

const CRITICAL_SEVERITY_THRESHOLD = 75;
const RISK_TERMINAL_STATUSES = new Set(["MITIGATING", "ACCEPTED", "RESOLVED", "CLOSED"]);

const VALID_REVIEW_TRANSITIONS: Record<string, string[]> = {
  IDENTIFIED:  ["ASSESSED", "MITIGATING", "ACCEPTED", "CLOSED"],
  ASSESSED:    ["MITIGATING", "ACCEPTED", "CLOSED"],
  MITIGATING:  ["ASSESSED", "RESOLVED", "ACCEPTED", "CLOSED"],
  ACCEPTED:    ["MITIGATING", "RESOLVED", "CLOSED"],
  RESOLVED:    ["CLOSED", "IDENTIFIED"],
  CLOSED:      [],
  TRANSFERRED: ["CLOSED"],
};

export async function reviewRisk(input: ReviewRiskInput) {
  const existing = await db.businessRiskEntry.findFirst({
    where: { id: input.riskId, workspaceId: input.workspaceId },
    select: { id: true, status: true, riskCode: true, severity: true, reviewDueDate: true },
  });
  if (!existing) throw new NotFoundError("BusinessRiskEntry", input.riskId);

  const allowed = VALID_REVIEW_TRANSITIONS[existing.status] ?? [];
  if (!allowed.includes(input.newStatus)) {
    throw new ValidationError(
      `Illegal risk transition: ${existing.status} → ${input.newStatus}. Allowed: ${allowed.join(", ") || "none"}`
    );
  }

  const now = new Date();
  const result = await db.$transaction(async (tx: Prisma.TransactionClient) => {
    const updated = await tx.businessRiskEntry.update({
      where: { id: input.riskId },
      data: {
        status: input.newStatus,
        reviewedAt: now,
        ...(input.residualRisk !== undefined ? { residualRisk: input.residualRisk } : {}),
        ...(input.acceptanceRationale !== undefined ? { acceptanceRationale: input.acceptanceRationale } : {}),
        ...(input.reviewDueDate !== undefined ? { reviewDueDate: input.reviewDueDate } : {}),
      },
    });

    let eventName: AuditEventName = AUDIT_EVENTS.OWNER_BUSINESS_RISK_REVIEW_COMPLETED;
    if (input.newStatus === "ACCEPTED") eventName = AUDIT_EVENTS.OWNER_BUSINESS_RISK_ACCEPTED;
    else if (input.newStatus === "CLOSED" || input.newStatus === "RESOLVED") eventName = AUDIT_EVENTS.OWNER_BUSINESS_RISK_CLOSED;

    await emitAuditEvent(
      {
        eventName,
        workspaceId: input.workspaceId,
        actorId: input.actorId,
        entityType: "BusinessRiskEntry",
        entityId: input.riskId,
        payload: {
          previousStatus: existing.status,
          newStatus: input.newStatus,
          residualRisk: input.residualRisk,
          acceptanceRationale: input.acceptanceRationale,
        },
      },
      tx,
    );
    return updated;
  });

  // Post-transaction alert integration (best effort — risk is already committed)
  const effectiveReviewDueDate =
    input.reviewDueDate !== undefined ? input.reviewDueDate : existing.reviewDueDate;

  if (RISK_TERMINAL_STATUSES.has(input.newStatus)) {
    // Resolve any active critical or overdue alerts on terminal transition
    const active = await db.alert.findMany({
      where: {
        workspaceId: input.workspaceId,
        idempotencyKey: { in: [`risk_critical_${input.riskId}`, `risk_overdue_${input.riskId}`] },
        resolvedAt: null,
      },
      select: { id: true },
    }).catch(() => [] as Array<{ id: string }>);
    if (active.length > 0) {
      const { resolveAlert } = await import("@/services/alerts/alert-service");
      for (const a of active) {
        await resolveAlert(a.id, input.workspaceId, input.actorId).catch(() => {});
      }
    }
  } else {
    const { createAlert } = await import("@/services/alerts/alert-service");
    if (existing.severity >= CRITICAL_SEVERITY_THRESHOLD) {
      await createAlert({
        workspaceId: input.workspaceId,
        userId: input.actorId,
        type: "threshold_breach",
        channel: "in_app",
        severity: "critical",
        message: `Critical risk under review: ${existing.riskCode}`,
        entityType: "BusinessRiskEntry",
        entityId: input.riskId,
        idempotencyKey: `risk_critical_${input.riskId}`,
      }).catch(() => {});
    }
    if (effectiveReviewDueDate && effectiveReviewDueDate < now) {
      await createAlert({
        workspaceId: input.workspaceId,
        userId: input.actorId,
        type: "blocked",
        channel: "in_app",
        severity: "high",
        message: `Risk review overdue: ${existing.riskCode}`,
        entityType: "BusinessRiskEntry",
        entityId: input.riskId,
        idempotencyKey: `risk_overdue_${input.riskId}`,
      }).catch(() => {});
    }
  }

  return result;
}
