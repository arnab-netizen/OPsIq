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

  return db.$transaction(async (tx: Prisma.TransactionClient) => {
    const risk = await tx.businessRiskEntry.create({
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
        entityId: risk.id,
        payload: { riskCode: risk.riskCode, category: input.category, severity },
      },
      tx,
    );

    return risk;
  });
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
    orderBy: [{ severity: "desc" }, { createdAt: "desc" }],
  });
}

export async function getBusinessRisk(workspaceId: string, riskId: string) {
  const risk = await db.businessRiskEntry.findFirst({
    where: { id: riskId, workspaceId },
  });
  if (!risk) throw new NotFoundError("BusinessRiskEntry", riskId);
  return risk;
}
