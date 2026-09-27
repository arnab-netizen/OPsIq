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
import { ConflictError, NotFoundError, ValidationError } from "@/infra/errors";
import type { Prisma } from "@/generated/prisma/client";
import { hasAnyRealBusiness } from "@/services/founder-recovery/business.service";
import { getFixtureTaintedStartupSessionIds } from "@/services/owner-strategy/startup-session.service";

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
    // Compare-and-set on the fields the audit records as "previous": a concurrent change between the read
    // above and this write would otherwise record a transition that never happened (the owner decision's
    // "what changed" reads these audit payloads). A lost race is a 409 — reload and retry.
    const guarded = await tx.businessRiskEntry.updateMany({
      where: { id: input.riskId, workspaceId: input.workspaceId, status: existing.status, residualRisk: existing.residualRisk ?? null },
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
    if (guarded.count !== 1) {
      throw new ConflictError("This risk was changed by another request. Reload and retry.");
    }
    const updated = await tx.businessRiskEntry.findFirstOrThrow({ where: { id: input.riskId, workspaceId: input.workspaceId } });

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
        payload: { status: updated.status, severity, previousStatus: existing.status, previousResidualRisk: existing.residualRisk ?? null, residualRisk: updated.residualRisk ?? null },
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
  // BusinessRiskEntry has no businessId column (workspace-scoped only) -- without this gate, a
  // workspace with zero real active businesses (or one whose only business was archived) still
  // returned any risk rows it happened to have, which a real human usability test caught: Home
  // correctly showed the "set up your business" onboarding state while Priorities still displayed
  // a critical cash-survival risk. NO VALID REAL ACTIVE BUSINESS => NO BUSINESS-DERIVED RISK.
  if (!(await hasAnyRealBusiness(workspaceId))) return [];

  // Read-time correction for historical rows whose isFixtureRecord was incorrectly persisted as
  // false (createBlueprint()'s write-time gap, now fixed) — excludes any risk linked to a startup
  // session that is itself, or is handed off to a business that is, isFixtureBusiness: true. Never
  // touches stored data. See getFixtureTaintedStartupSessionIds() doc comment.
  const fixtureTaintedSessionIds = await getFixtureTaintedStartupSessionIds(workspaceId);
  const fixtureSessionExclusion =
    fixtureTaintedSessionIds.length > 0
      ? { OR: [{ linkedStartupSessionId: null }, { linkedStartupSessionId: { notIn: fixtureTaintedSessionIds } }] }
      : {};

  return db.businessRiskEntry.findMany({
    where: {
      workspaceId,
      // Excludes acceptance/QA fixture risks (see ACCEPTANCE_FIXTURE_ISOLATION_PLAN.md) — an
      // ordinary owner's risk register must never include a risk a QA blueprint run created.
      isFixtureRecord: false,
      ...fixtureSessionExclusion,
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
// Only RESOLVED and CLOSED unconditionally resolve alerts.
// ACCEPTED resolves alerts only when acceptanceRationale is recorded (authorized acceptance).
// MITIGATING, ASSESSED, IDENTIFIED remain active — mitigation underway ≠ remediation verified.
const RISK_RESOLUTION_STATUSES = new Set(["RESOLVED", "CLOSED"]);

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

  // Alerts are resolved when:
  //   - risk reaches RESOLVED or CLOSED (remediation verified / lifecycle complete)
  //   - risk is ACCEPTED with an explicit rationale (owner-authorized acceptance)
  // MITIGATING does NOT resolve alerts — work underway ≠ remediation verified.
  const resolvesAlerts =
    RISK_RESOLUTION_STATUSES.has(input.newStatus) ||
    (input.newStatus === "ACCEPTED" && !!input.acceptanceRationale);

  if (resolvesAlerts) {
    // Resolve any active critical or overdue alerts
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
    // Non-resolving statuses (IDENTIFIED, ASSESSED, MITIGATING, ACCEPTED w/o rationale):
    // keep or create alerts as appropriate.
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

// ─── Overdue risk alert evaluation ───────────────────────────────────────────
//
// Called best-effort from the owner now-view on every load (and from any other
// evaluation seam that has a valid actorId). Frequency: per owner now-view request.
// Limitation: no background scheduler — alerts surface only when the view is loaded.

export async function evaluateOverdueRiskAlerts(
  workspaceId: string,
  actorId: string,
  now: Date = new Date(),
): Promise<void> {
  // Query non-terminal risks with reviewDueDate in the past (bounded at 500)
  // isFixtureRecord: false — a QA blueprint's risk must never generate a real owner-visible
  // "Risk review overdue" alert. See ACCEPTANCE_FIXTURE_ISOLATION_PLAN.md.
  //
  // Read-time correction (defense in depth; latent bypass, not yet reproduced in production since
  // the known-contaminated rows all have reviewDueDate: null) for the same historical
  // isFixtureRecord write-time gap fixed in createBlueprint() — see
  // getFixtureTaintedStartupSessionIds() doc comment.
  const fixtureTaintedSessionIds = await getFixtureTaintedStartupSessionIds(workspaceId);
  const fixtureSessionExclusion =
    fixtureTaintedSessionIds.length > 0
      ? { OR: [{ linkedStartupSessionId: null }, { linkedStartupSessionId: { notIn: fixtureTaintedSessionIds } }] }
      : {};
  const overdueRisks = await db.businessRiskEntry.findMany({
    where: {
      workspaceId,
      reviewDueDate: { lt: now },
      status: { notIn: ["RESOLVED", "CLOSED"] },
      isFixtureRecord: false,
      ...fixtureSessionExclusion,
    },
    select: { id: true, riskCode: true },
    take: 500,
  }).catch(() => [] as Array<{ id: string; riskCode: string }>);

  if (overdueRisks.length > 0) {
    const { createAlert } = await import("@/services/alerts/alert-service");
    for (const risk of overdueRisks) {
      await createAlert({
        workspaceId,
        userId: actorId,
        type: "blocked",
        channel: "in_app",
        severity: "high",
        message: `Risk review overdue: ${risk.riskCode}`,
        entityType: "BusinessRiskEntry",
        entityId: risk.id,
        idempotencyKey: `risk_overdue_${risk.id}`,
      }).catch(() => {});
    }
  }

  // Resolve stale overdue alerts for risks that have since been resolved/closed
  const resolvedRisks = await db.businessRiskEntry.findMany({
    where: { workspaceId, status: { in: ["RESOLVED", "CLOSED"] } },
    select: { id: true },
    take: 500,
  }).catch(() => [] as Array<{ id: string }>);

  if (resolvedRisks.length > 0) {
    const staleAlerts = await db.alert.findMany({
      where: {
        workspaceId,
        idempotencyKey: { in: resolvedRisks.map((r: { id: string }) => `risk_overdue_${r.id}`) },
        resolvedAt: null,
      },
      select: { id: true },
    }).catch(() => [] as Array<{ id: string }>);

    if (staleAlerts.length > 0) {
      const { resolveAlert } = await import("@/services/alerts/alert-service");
      for (const a of staleAlerts) {
        await resolveAlert(a.id, workspaceId, actorId).catch(() => {});
      }
    }
  }
}
