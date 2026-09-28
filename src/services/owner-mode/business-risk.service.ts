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
import { SCHEDULER_SYSTEM_ACTOR, toAuditActor } from "@/domain/owner-budget/system-actor";

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

/** Statuses whose risk record is final: a generic edit never rewrites it (status transitions follow the lifecycle). */
const FINAL_RISK_STATUSES = new Set<string>(["RESOLVED", "CLOSED"]);

export async function updateBusinessRisk(input: UpdateBusinessRiskInput) {
  if (input.category) validateCategory(input.category);
  if (input.status) validateRiskStatus(input.status);

  const existing = await db.businessRiskEntry.findFirst({
    where: { id: input.riskId, workspaceId: input.workspaceId },
  });
  if (!existing) throw new NotFoundError("BusinessRiskEntry", input.riskId);
  const statusChange = input.status !== undefined && input.status !== existing.status;
  // A status change follows the same lifecycle as a review (VALID_REVIEW_TRANSITIONS): a closed risk is
  // never silently reopened or re-labelled by a generic edit.
  if (statusChange) {
    const allowed = VALID_REVIEW_TRANSITIONS[existing.status] ?? [];
    if (!allowed.includes(input.status!)) {
      throw new ValidationError(`Illegal risk transition: ${existing.status} → ${input.status}. Allowed: ${allowed.join(", ") || "none"}`);
    }
  }

  const likelihood = input.likelihood !== undefined ? clamp100(input.likelihood) : existing.likelihood;
  const impact = input.impact !== undefined ? clamp100(input.impact) : existing.impact;
  const severity = computeSeverity(likelihood, impact);
  const fields: Record<string, unknown> = {
    ...(input.title !== undefined ? { title: input.title.trim() } : {}),
    ...(input.description !== undefined ? { description: input.description } : {}),
    ...(input.category !== undefined ? { category: input.category } : {}),
    ...(input.likelihood !== undefined ? { likelihood } : {}),
    ...(input.impact !== undefined ? { impact } : {}),
    ...(input.mitigationAction !== undefined ? { mitigationAction: input.mitigationAction } : {}),
    ...(input.residualRisk !== undefined ? { residualRisk: input.residualRisk } : {}),
    ...(input.linkedObjectiveId !== undefined ? { linkedObjectiveId: input.linkedObjectiveId } : {}),
    ...(input.reviewedAt !== undefined ? { reviewedAt: input.reviewedAt } : {}),
  };
  const existingRecord = existing as unknown as Record<string, unknown>;
  const changed = Object.keys(fields).filter((k) => JSON.stringify(fields[k] ?? null) !== JSON.stringify(existingRecord[k] ?? null));
  // A resolved or closed risk is a final record: its fields are never rewritten by a generic edit.
  if (FINAL_RISK_STATUSES.has(existing.status) && changed.length > 0) {
    throw new ValidationError(`This risk is ${existing.status.toLowerCase()}; its record can no longer be edited.`);
  }

  const updated = await db.$transaction(async (tx: Prisma.TransactionClient) => {
    // Compare-and-set on the row version as read (updatedAt changes on every write): a concurrent change to
    // ANY field between the read above and this write — status, residual risk, likelihood or impact the
    // severity is recomputed from — is never overwritten, nor audited as a transition that never happened
    // (the owner decision's "what changed" reads these audit payloads). A lost race is a 409.
    const guarded = await tx.businessRiskEntry.updateMany({
      where: { id: input.riskId, workspaceId: input.workspaceId, updatedAt: existing.updatedAt },
      data: { ...fields, ...(statusChange ? { status: input.status } : {}), severity },
    });
    if (guarded.count !== 1) {
      throw new ConflictError("This risk was changed by another request. Reload and retry.");
    }
    const row = await tx.businessRiskEntry.findFirstOrThrow({ where: { id: input.riskId, workspaceId: input.workspaceId } });

    // The event names what happened: a lifecycle move (resolved/closed, or another status change), or an
    // edit of the record's fields (with their old and new values).
    const eventName: AuditEventName = !statusChange
      ? AUDIT_EVENTS.OWNER_BUSINESS_RISK_UPDATED
      : RISK_RESOLUTION_STATUSES.has(input.status!)
        ? AUDIT_EVENTS.OWNER_BUSINESS_RISK_RESOLVED
        : AUDIT_EVENTS.OWNER_BUSINESS_RISK_STATUS_CHANGED;
    await emitAuditEvent(
      {
        eventName,
        workspaceId: input.workspaceId,
        actorId: input.actorId,
        entityType: "BusinessRiskEntry",
        entityId: input.riskId,
        payload: {
          status: row.status, severity, previousStatus: existing.status,
          previousResidualRisk: existing.residualRisk ?? null, residualRisk: row.residualRisk ?? null,
          changedFields: changed,
          previous: Object.fromEntries(changed.map((k) => [k, existingRecord[k] ?? null])),
          next: Object.fromEntries(changed.map((k) => [k, (row as unknown as Record<string, unknown>)[k] ?? null])),
        },
      },
      tx,
    );

    return row;
  });

  // A risk moved to RESOLVED or CLOSED here resolves its open critical/overdue alerts, as a review does.
  if (statusChange && RISK_RESOLUTION_STATUSES.has(input.status!)) {
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
      for (const a of active) await resolveAlert(a.id, input.workspaceId, input.actorId).catch(() => {});
    }
  }
  return updated;
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
    select: { id: true, status: true, riskCode: true, severity: true, reviewDueDate: true, updatedAt: true },
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
    // Compare-and-set on the status the transition was validated against and the row version as read: a
    // concurrent review is never overwritten nor audited from a status that no longer existed (409).
    const guarded = await tx.businessRiskEntry.updateMany({
      where: { id: input.riskId, workspaceId: input.workspaceId, status: existing.status, updatedAt: existing.updatedAt },
      data: {
        status: input.newStatus,
        reviewedAt: now,
        ...(input.residualRisk !== undefined ? { residualRisk: input.residualRisk } : {}),
        ...(input.acceptanceRationale !== undefined ? { acceptanceRationale: input.acceptanceRationale } : {}),
        ...(input.reviewDueDate !== undefined ? { reviewDueDate: input.reviewDueDate } : {}),
      },
    });
    if (guarded.count !== 1) {
      throw new ConflictError("This risk was changed by another request. Reload and retry.");
    }
    const updated = await tx.businessRiskEntry.findFirstOrThrow({ where: { id: input.riskId, workspaceId: input.workspaceId } });

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
// A risk becomes overdue by time passing, not by a mutation, so this runs as an explicit process: the
// scheduler's risk-review scan (scanOverdueRiskAlertsForWorkspace below, enqueued daily per workspace by
// enqueueDueRiskReviewScanTasks) and the risk review mutation itself (reviewRisk raises or resolves the
// alerts of the risk it changes). It is never run from a read: the owner Now View GET is
// read-only.

/** What an overdue-risk evaluation did; `failed` counts alerts that could not be raised or resolved. */
export interface OverdueRiskAlertResult {
  raised: number;
  resolved: number;
  failed: number;
}

/**
 * Raise a "Risk review overdue" alert (idempotent per risk) for each open, overdue, non-fixture risk, and
 * resolve those alerts for risks since resolved/closed. `recipientUserId` receives the alerts; raising and
 * resolving are audited as `auditActorId` (a human actor, or SCHEDULER_SYSTEM_ACTOR → a system event — the
 * recipient is never recorded as having acted). A failure is counted, never swallowed as success.
 */
export async function evaluateOverdueRiskAlerts(
  workspaceId: string,
  recipientUserId: string,
  now: Date = new Date(),
  auditActorId: string = recipientUserId,
): Promise<OverdueRiskAlertResult> {
  const result: OverdueRiskAlertResult = { raised: 0, resolved: 0, failed: 0 };
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
    // Most overdue first, deterministically (a bounded scan never starves the same risks every day).
    orderBy: [{ reviewDueDate: "asc" }, { id: "asc" }],
    take: 500,
  });

  if (overdueRisks.length > 0) {
    const { createAlert } = await import("@/services/alerts/alert-service");
    for (const risk of overdueRisks) {
      try {
        await createAlert({
          workspaceId,
          userId: recipientUserId,
          type: "blocked",
          channel: "in_app",
          severity: "high",
          message: `Risk review overdue: ${risk.riskCode}`,
          entityType: "BusinessRiskEntry",
          entityId: risk.id,
          idempotencyKey: `risk_overdue_${risk.id}`,
          auditActor: toAuditActor(auditActorId),
        });
        result.raised++;
      } catch {
        result.failed++;
      }
    }
  }

  // Resolve stale overdue alerts for risks that have since been resolved/closed: read from the open alerts
  // themselves (never a bounded list of resolved risks, which could miss some).
  const openOverdueAlerts: Array<{ id: string; idempotencyKey: string | null }> = await db.alert.findMany({
    where: { workspaceId, idempotencyKey: { startsWith: "risk_overdue_" }, resolvedAt: null },
    select: { id: true, idempotencyKey: true },
    orderBy: { createdAt: "asc" },
    take: 1000,
  });
  const riskIds = openOverdueAlerts.map((a) => String(a.idempotencyKey).slice("risk_overdue_".length));
  const closedRisks: Array<{ id: string }> = riskIds.length > 0
    ? await db.businessRiskEntry.findMany({ where: { workspaceId, id: { in: riskIds }, status: { in: ["RESOLVED", "CLOSED"] } }, select: { id: true } })
    : [];
  const closedIds = new Set(closedRisks.map((r) => r.id));
  for (const a of openOverdueAlerts) {
    if (!closedIds.has(String(a.idempotencyKey).slice("risk_overdue_".length))) continue;
    try {
      await db.$transaction(async (tx: Prisma.TransactionClient) => {
        // Compare-and-set on "still unresolved": a concurrent scan never resolves (or audits) it twice.
        const res = await tx.alert.updateMany({
          where: { id: a.id, workspaceId, resolvedAt: null },
          data: { resolvedAt: now, isRead: true, readAt: now },
        });
        if (res.count !== 1) return;
        await emitAuditEvent({
          eventName: AUDIT_EVENTS.ALERT_UPDATED,
          ...toAuditActor(auditActorId),
          entityType: "alert",
          entityId: a.id,
          workspaceId,
          payload: { resolvedAt: now.toISOString(), reason: "risk_resolved" },
          visibility: "internal",
        }, tx);
        result.resolved++;
      });
    } catch {
      result.failed++;
    }
  }
  return result;
}

/**
 * The scheduler's risk-review scan for one workspace: alerts go to the workspace's active owner (the
 * earliest-added active owner membership); resolutions are audited as a system event. Returns what it
 * did so the task reports honestly (no owner ⇒ nothing can be addressed).
 */
export async function scanOverdueRiskAlertsForWorkspace(
  workspaceId: string,
  now: Date = new Date(),
): Promise<{ recipientFound: boolean } & OverdueRiskAlertResult> {
  const owner = await db.workspaceMembership.findFirst({
    where: { workspaceId, role: "owner", isActive: true, removedAt: null },
    orderBy: { addedAt: "asc" },
    select: { userId: true },
  });
  if (!owner) return { recipientFound: false, raised: 0, resolved: 0, failed: 0 };
  // Raised and resolved as the scheduler (a system event) — the recipient owner did not act.
  const result = await evaluateOverdueRiskAlerts(workspaceId, owner.userId, now, SCHEDULER_SYSTEM_ACTOR);
  return { recipientFound: true, ...result };
}
