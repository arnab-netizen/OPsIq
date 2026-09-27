/**
 * Owner Progress Tracking Service — cross-domain action progress aggregation.
 *
 * Closes Workflow 7: provides a business-scoped progress surface that does NOT
 * require an `engagementId` (the consulting-mode construct). Instead it reads
 * directly from the 5 owner-mode domain action tables and the latest open cycle
 * for each domain.
 *
 * Two surfaces:
 *
 * 1. `getOwnerBusinessProgress(businessId, workspaceId, db)` — counts actions by
 *    status across all 5 domain spines for a single owner dashboard "progress bar".
 *
 * 2. `generateOwnerBusinessReview(businessId, workspaceId, actorId, db)` — produces
 *    a review summary (improving / stagnant / worsening) across all 5 domain cycle
 *    states without referencing any `Engagement` model. Emits an audit event.
 *
 * Both functions are workspace-scoped. Neither modifies any record.
 */

import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { CURRENT_DIAGNOSIS_CYCLE_ORDER, CURRENT_STRATEGY_CYCLE_ORDER } from "@/services/owner-spine/current-diagnosis-cycle";

// ── Minimal Prisma-compatible interfaces (injectable for tests) ──────────────

type CountResult = Promise<number>;

export interface OwnerProgressDb {
  ownerFinanceAction: { count(args: { where: Record<string, unknown> }): CountResult };
  ownerSalesAction: { count(args: { where: Record<string, unknown> }): CountResult };
  ownerOperationsAction: { count(args: { where: Record<string, unknown> }): CountResult };
  ownerSopAction: { count(args: { where: Record<string, unknown> }): CountResult };
  ownerStrategyAction: { count(args: { where: Record<string, unknown> }): CountResult };
  ownerFinanceCycle: {
    findFirst(args: { where: Record<string, unknown>; orderBy: typeof CURRENT_DIAGNOSIS_CYCLE_ORDER; select: Record<string, boolean> }): Promise<{ status: string } | null>;
  };
  ownerSalesCycle: {
    findFirst(args: { where: Record<string, unknown>; orderBy: typeof CURRENT_DIAGNOSIS_CYCLE_ORDER; select: Record<string, boolean> }): Promise<{ status: string } | null>;
  };
  ownerOperationsCycle: {
    findFirst(args: { where: Record<string, unknown>; orderBy: typeof CURRENT_DIAGNOSIS_CYCLE_ORDER; select: Record<string, boolean> }): Promise<{ status: string } | null>;
  };
  ownerSopCycle: {
    findFirst(args: { where: Record<string, unknown>; orderBy: typeof CURRENT_DIAGNOSIS_CYCLE_ORDER; select: Record<string, boolean> }): Promise<{ status: string } | null>;
  };
  ownerStrategyCycle: {
    findFirst(args: { where: Record<string, unknown>; orderBy: typeof CURRENT_STRATEGY_CYCLE_ORDER; select: Record<string, boolean> }): Promise<{ status: string } | null>;
  };
}

export interface DomainActionCounts {
  open: number;
  inProgress: number;
  completed: number;
  blocked: number;
  overdue: number;
  total: number;
}

export interface OwnerBusinessProgress {
  workspaceId: string;
  businessId: string;
  byDomain: {
    finance: DomainActionCounts;
    sales: DomainActionCounts;
    operations: DomainActionCounts;
    sop: DomainActionCounts;
    strategy: DomainActionCounts;
  };
  totals: DomainActionCounts;
  completionRate: number; // 0..1 — completed / total (excluding cancelled)
  summary: "on_track" | "at_risk" | "blocked" | "no_actions";
}

export interface OwnerBusinessReview {
  workspaceId: string;
  businessId: string;
  status: "improving" | "stagnant" | "worsening" | "insufficient_data";
  domainCycleStatuses: {
    finance: string | null;
    sales: string | null;
    operations: string | null;
    sop: string | null;
    strategy: string | null;
  };
  progress: OwnerBusinessProgress;
  rationale: string;
  reviewedAt: string;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

async function countDomainActions(
  table: OwnerProgressDb["ownerFinanceAction"],
  where: Record<string, unknown>,
): Promise<DomainActionCounts> {
  const [open, inProgress, completed, blocked, overdue] = await Promise.all([
    table.count({ where: { ...where, status: "open" } }),
    table.count({ where: { ...where, status: "in_progress" } }),
    table.count({ where: { ...where, status: "completed" } }),
    table.count({ where: { ...where, status: "blocked" } }),
    table.count({ where: { ...where, status: "overdue" } }),
  ]);
  const total = open + inProgress + completed + blocked + overdue;
  return { open, inProgress, completed, blocked, overdue, total };
}

function aggregateCounts(domains: DomainActionCounts[]): DomainActionCounts {
  return domains.reduce(
    (acc, d) => ({
      open: acc.open + d.open,
      inProgress: acc.inProgress + d.inProgress,
      completed: acc.completed + d.completed,
      blocked: acc.blocked + d.blocked,
      overdue: acc.overdue + d.overdue,
      total: acc.total + d.total,
    }),
    { open: 0, inProgress: 0, completed: 0, blocked: 0, overdue: 0, total: 0 },
  );
}

function computeCompletionRate(totals: DomainActionCounts): number {
  if (totals.total === 0) return 0;
  return totals.completed / totals.total;
}

function computeProgressSummary(totals: DomainActionCounts): OwnerBusinessProgress["summary"] {
  if (totals.total === 0) return "no_actions";
  if (totals.blocked > 0 || totals.overdue > 0) return "blocked";
  const rate = computeCompletionRate(totals);
  if (rate >= 0.5) return "on_track";
  return "at_risk";
}

function computeReviewStatus(domainCycleStatuses: Record<string, string | null>, progress: OwnerBusinessProgress): OwnerBusinessReview["status"] {
  const statuses = Object.values(domainCycleStatuses).filter(Boolean) as string[];
  if (statuses.length === 0) return "insufficient_data";
  const worsening = statuses.some((s) => s.includes("critical") || s.includes("failing") || s.includes("deteriorat"));
  if (worsening) return "worsening";
  if (progress.completionRate >= 0.5 && progress.summary !== "blocked") return "improving";
  return "stagnant";
}

function buildRationale(status: OwnerBusinessReview["status"], progress: OwnerBusinessProgress): string {
  if (status === "insufficient_data") return "Not enough domain cycle data to assess overall business trajectory.";
  const rate = Math.round(progress.completionRate * 100);
  if (status === "worsening") return `One or more domains show critical or failing status. Action completion rate: ${rate}%.`;
  if (status === "improving") return `Action completion rate is ${rate}% and no domains are blocked. Progress is on track.`;
  return `Action completion rate is ${rate}%. Some actions are open or at risk — owner attention needed.`;
}

// ── Public API ───────────────────────────────────────────────────────────────

/** Return cross-domain action progress counts for a business. Pure read — no writes. */
export async function getOwnerBusinessProgress(
  businessId: string,
  workspaceId: string,
  db: OwnerProgressDb,
): Promise<OwnerBusinessProgress> {
  const where = { businessId, workspaceId };

  const [finance, sales, operations, sop, strategy] = await Promise.all([
    countDomainActions(db.ownerFinanceAction, where),
    countDomainActions(db.ownerSalesAction, where),
    countDomainActions(db.ownerOperationsAction, where),
    countDomainActions(db.ownerSopAction, where),
    countDomainActions(db.ownerStrategyAction, where),
  ]);

  const totals = aggregateCounts([finance, sales, operations, sop, strategy]);

  return {
    workspaceId,
    businessId,
    byDomain: { finance, sales, operations, sop, strategy },
    totals,
    completionRate: computeCompletionRate(totals),
    summary: computeProgressSummary(totals),
  };
}

/** Generate a cross-domain business review. Decoupled from engagementId. Emits audit event. */
export async function generateOwnerBusinessReview(
  businessId: string,
  workspaceId: string,
  actorId: string,
  reviewedAt: string,
  db: OwnerProgressDb,
): Promise<OwnerBusinessReview> {
  const where = { businessId, workspaceId };
  const order = CURRENT_DIAGNOSIS_CYCLE_ORDER;
  const select = { status: true };

  const [financeCycle, salesCycle, operationsCycle, sopCycle, strategyCycle, progress] = await Promise.all([
    db.ownerFinanceCycle.findFirst({ where, orderBy: order, select }),
    db.ownerSalesCycle.findFirst({ where, orderBy: order, select }),
    db.ownerOperationsCycle.findFirst({ where, orderBy: order, select }),
    db.ownerSopCycle.findFirst({ where, orderBy: order, select }),
    db.ownerStrategyCycle.findFirst({ where, orderBy: CURRENT_STRATEGY_CYCLE_ORDER, select }),
    getOwnerBusinessProgress(businessId, workspaceId, db),
  ]);

  const domainCycleStatuses = {
    finance: financeCycle?.status ?? null,
    sales: salesCycle?.status ?? null,
    operations: operationsCycle?.status ?? null,
    sop: sopCycle?.status ?? null,
    strategy: strategyCycle?.status ?? null,
  };

  const status = computeReviewStatus(domainCycleStatuses, progress);
  const rationale = buildRationale(status, progress);

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.OWNER_BUSINESS_REVIEW_GENERATED,
    actorId,
    workspaceId,
    entityType: "OwnerBusiness",
    entityId: businessId,
    payload: { businessId, status, completionRate: progress.completionRate, reviewedAt },
  });

  return {
    workspaceId,
    businessId,
    status,
    domainCycleStatuses,
    progress,
    rationale,
    reviewedAt,
  };
}
