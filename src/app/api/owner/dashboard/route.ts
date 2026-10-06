/**
 * GET /api/owner/dashboard
 * Retrieve owner dashboard with workspace health, action queue summary, and KPIs
 * Owner-only access (requires workspace owner capability)
 */

import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { BadRequestError, AppError } from "@/infra/errors";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { calculateWorkspaceHealth, summarizeActionQueue, buildOwnerDashboardView, DashboardServiceError } from "@/services/owner-mode/dashboard.service";
import { OwnerDashboardConfig, HealthStatus, ActionQueuePriority } from "@/domain/owner-mode/owner-dashboard";
import { classifyOperatorError } from "@/lib/operator-error-governance";
import { z } from "zod/v4";
import { CURRENT_DIAGNOSIS_CYCLE_ORDER, currentEvidenceWhere } from "@/services/owner-spine/current-diagnosis-cycle";
import { loadProvisionalCashFinance, type ProvisionalCashFinanceDb } from "@/services/owner-spine/provisional-cash-finance";
import { cashFlowEvidenceGaps, currentCashFinanceReading, financeEvidenceGaps } from "@/services/owner-spine/current-cash-finance-reading";
import { projectCashflowCycleRow } from "@/domain/owner-cashflow/cycle-projection";
import { classifyDashboardHealth } from "@/services/owner-spine/dashboard-health-classification";

const querySchema = z.object({
  includeKPIs: z.enum(["true", "false"]).optional().default("true"),
  daysOfHistory: z.string().optional().default("30"),
});

/** The dashboard view fields this DTO reads (structural: every field optional, defaulted below). */
interface OwnerDashboardDtoSource {
  workspaceId: string;
  config?: { createdAt?: string };
  health?: {
    recommendedActions?: unknown[];
    overallStatus?: HealthStatus;
    engagementCount?: number;
    healthyEngagements?: number;
    atRiskEngagements?: number;
    criticalEngagements?: number;
    needsDataEngagements?: number;
    needsDataItems?: string[];
    topRisks?: unknown[];
  };
  actionQueue?: {
    totalCount?: number;
    overdueCount?: number;
    byStatus?: Record<string, unknown>;
    byPriority?: Record<string, unknown>;
    criticalActions?: unknown[];
    dueThisWeek?: unknown[];
  };
}

interface DashboardRecommendationRow {
  id: string;
  title: string;
  description: string;
  priority: string;
}

/** The two survival-cycle reads this route makes (the `db` proxy is untyped). */
interface SurvivalCycleReader {
  ownerFinanceCycle: {
    findFirst(args: {
      where: { businessId: string; workspaceId: string; snapshot: { periodEnd: { lte: Date } } };
      orderBy: typeof CURRENT_DIAGNOSIS_CYCLE_ORDER;
      select: { survivalState: true; snapshot: { select: { periodEnd: true; supersededById: true } }; findings: { select: { code: true } } };
    }): Promise<{ survivalState: string | null; snapshot?: { periodEnd: Date; supersededById: string | null } | null; findings?: Array<{ code: string }> } | null>;
  };
  ownerCashflowCycle: {
    findFirst(args: {
      where: { businessId: string; workspaceId: string; snapshot: { periodEnd: { lte: Date } } };
      orderBy: typeof CURRENT_DIAGNOSIS_CYCLE_ORDER;
      select: { cashflowState: true; generatedAt: true; snapshot: true };
    }): Promise<{ cashflowState: string | null; generatedAt?: Date | null; snapshot?: ({ periodEnd: Date } & Record<string, unknown>) | null } | null>;
  };
}

function toOwnerDashboardDTO(data: OwnerDashboardDtoSource, realRecommendations?: DashboardRecommendationRow[]) {
  const recommendedActions = realRecommendations && realRecommendations.length > 0
    ? realRecommendations.map((rec) => ({
        id: rec.id,
        title: rec.title,
        description: rec.description,
        priority: rec.priority,
        source: "diagnosis",
      }))
    : data.health?.recommendedActions || [];

  return {
    workspaceId: data.workspaceId,
    assessedAt: data.config?.createdAt || new Date().toISOString(),
    overallStatus: data.health?.overallStatus || HealthStatus.HEALTHY,
    engagementCount: data.health?.engagementCount || 0,
    healthyEngagements: data.health?.healthyEngagements || 0,
    atRiskEngagements: data.health?.atRiskEngagements || 0,
    criticalEngagements: data.health?.criticalEngagements || 0,
    // Additive: businesses whose evidence is insufficient to assess (a gap to fill — never counted as risk) and what to enter.
    needsDataEngagements: data.health?.needsDataEngagements || 0,
    needsDataItems: data.health?.needsDataItems || [],
    actionQueueSize: data.actionQueue?.totalCount || 0,
    overdueActionCount: data.actionQueue?.overdueCount || 0,
    actionsByStatus: data.actionQueue?.byStatus || {},
    actionsByPriority: data.actionQueue?.byPriority || {},
    topRisks: data.health?.topRisks || [],
    recommendedActions,
    criticalActions: data.actionQueue?.criticalActions || [],
    dueThisWeek: data.actionQueue?.dueThisWeek || [],
  };
}

function parseOwnerDashboardQuery(searchParams: URLSearchParams) {
  return querySchema.parse({
    includeKPIs: searchParams.get("includeKPIs") || undefined,
    daysOfHistory: searchParams.get("daysOfHistory") || undefined,
  });
}

export async function buildOwnerDashboardPayload(
  ctx: CanonicalAuthContext,
  workspaceId: string,
  userId: string
) {
  const url = new URL(ctx.request!.url);
  const queryParams = parseOwnerDashboardQuery(url.searchParams);

  const context = { workspaceId, userId };

  // Use owner-mode tables only — not consulting-mode Engagement/Action/KPI tables.
  // RC-A7-001 fix: replaced db.engagement/action/KPI/recommendation with owner-mode sources.
  const { db } = await import("@/lib/db");
  const { listBusinesses } = await import("@/services/founder-recovery/business.service");
  const { getOwnerBusinessProgress } = await import("@/services/owner-mode/owner-progress.service");

  // QUERY 1: Owner-mode businesses (workspace-scoped)
  const businesses: Array<{ id: string; name: string; businessType: string; currency: string; isActive: boolean }> =
    await listBusinesses(workspaceId);

  // Current evidence is judged relative to one `now` for every business (future periods excluded).
  const evidenceNow = new Date();

  // QUERY 2: Per-business — health status from the shared cash/finance survival reading + cross-domain action counts
  const businessSnapshots = await Promise.all(
    businesses.map(async (biz, idx) => {
      const reader = db as unknown as SurvivalCycleReader;
      const [progress, financeCycle, cashCycle, provisional] = await Promise.all([
        getOwnerBusinessProgress(biz.id, workspaceId, db as never),
        reader.ownerFinanceCycle.findFirst({
          where: { businessId: biz.id, workspaceId, ...currentEvidenceWhere(evidenceNow) },
          orderBy: CURRENT_DIAGNOSIS_CYCLE_ORDER,
          select: { survivalState: true, snapshot: { select: { periodEnd: true, supersededById: true } }, findings: { select: { code: true } } },
        }),
        reader.ownerCashflowCycle.findFirst({
          where: { businessId: biz.id, workspaceId, ...currentEvidenceWhere(evidenceNow) },
          orderBy: CURRENT_DIAGNOSIS_CYCLE_ORDER,
          select: { cashflowState: true, generatedAt: true, snapshot: true },
        }),
        // The in-progress current period (provisional): may only tighten the health status.
        loadProvisionalCashFinance(db as unknown as ProvisionalCashFinanceDb, { workspaceId, businessId: biz.id }, evidenceNow),
      ]);

      // The ONE current cash/finance survival reading (the same one Owner Home, Now View and the action
      // gate use): a critical Cash flow reading is never hidden behind a SAFE Finance diagnosis, a genuine
      // disagreement counts as the worse reading, and amended Finance figures fail safe.
      const cashRead = cashCycle ? projectCashflowCycleRow(cashCycle) : null;
      const reading = currentCashFinanceReading(
        cashRead ? { state: cashRead.cashflowState, snapshot: cashRead.snapshot, evidenceGaps: cashFlowEvidenceGaps(cashRead) } : null,
        financeCycle ? { state: financeCycle.survivalState, snapshot: financeCycle.snapshot, evidenceGaps: financeEvidenceGaps(financeCycle.findings) } : null,
        evidenceNow.getTime(),
        provisional
      );
      // Health is classified at the dashboard boundary (dashboard-health-classification.ts): the reading's enforcement
      // state (a fail-safe gate floor) and its "no gaps" flag are never read as "evidence exists" or "measured danger".
      const { status: healthStatus, needsDataReason } = classifyDashboardHealth({
        reading,
        progressSummary: progress.summary,
        businessName: biz.name,
      });

      return { bizId: biz.id, bizIdx: idx, healthStatus, needsDataReason, progress };
    })
  );

  // Map to EngagementHealthSnapshot shape (businessId used as snapshot key — no consulting model needed)
  const engagementSnapshots = businessSnapshots.map(({ bizId, healthStatus, needsDataReason, progress }) => ({
    engagementId: bizId,
    status: healthStatus,
    needsDataReason,
    kpiOnTrackCount: progress.totals.completed,
    kpiTotalCount: progress.totals.total,
  }));

  // Build ActionData[] from aggregated cross-domain progress (5 domain spines)
  // Each logical action gets a unique synthetic id so summarizeActionQueue counts correctly.
  const actionData: Array<{
    id: string; engagementId: string; name: string; status: string;
    priority: string; dueDate?: string; assignee?: string; blockerCount: number;
  }> = [];

  for (const { bizId, progress } of businessSnapshots) {
    const { open, inProgress, completed, blocked, overdue } = progress.totals;
    for (let i = 0; i < open; i++)
      actionData.push({ id: `${bizId}-open-${i}`, engagementId: bizId, name: "Open action", status: "open", priority: "medium", blockerCount: 0 });
    for (let i = 0; i < inProgress; i++)
      actionData.push({ id: `${bizId}-ip-${i}`, engagementId: bizId, name: "In-progress action", status: "in_progress", priority: "medium", blockerCount: 0 });
    for (let i = 0; i < completed; i++)
      actionData.push({ id: `${bizId}-done-${i}`, engagementId: bizId, name: "Completed action", status: "completed", priority: "low", blockerCount: 0 });
    for (let i = 0; i < blocked; i++)
      actionData.push({ id: `${bizId}-blocked-${i}`, engagementId: bizId, name: "Blocked action", status: "blocked", priority: "high", blockerCount: 1 });
    for (let i = 0; i < overdue; i++)
      actionData.push({ id: `${bizId}-overdue-${i}`, engagementId: bizId, name: "Overdue action", status: "overdue", priority: "critical", blockerCount: 0 });
  }

  // Calculate health from owner-mode business snapshots
  const health = await calculateWorkspaceHealth(context, engagementSnapshots);
  const actionQueue = await summarizeActionQueue(context, actionData);

  const config: OwnerDashboardConfig = {
    workspaceId,
    ownerId: userId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    showCompletedActions: true,
    daysOfHistoryVisible: parseInt(queryParams.daysOfHistory),
    actionPriorityThreshold: ActionQueuePriority.MEDIUM,
    healthStatusThreshold: HealthStatus.AT_RISK,
    enableBulkActions: true,
    enableAdvancedFiltering: true,
  };

  // Owner-mode does not use consulting KPI records; pass [] unless a future slice adds owner KPIs
  const dashboard = await buildOwnerDashboardView(context, config, health, actionQueue, []);

  return toOwnerDashboardDTO(dashboard, []);
}

export const GET = withCanonicalEnforcement(async (ctx: CanonicalAuthContext) => {
  if (!ctx.request) {
    throw new Error("Request object not available");
  }

  const workspaceId = ctx.verifiedWorkspaceId;
  const userId = ctx.verifiedActorId;

  // Workspace membership already verified by canonical auth wrapper
  // ctx.verifiedWorkspaceId is derived from user's active membership
  // ctx.verifiedActorId is authenticated user
  // No redundant database check needed

  try {
    const payload = await buildOwnerDashboardPayload(ctx, workspaceId, userId);

    // Emit audit event for dashboard view
    const { db: _db } = await import("@/lib/db");
    await emitAuditEvent({
      eventName: AUDIT_EVENTS.OWNER_DASHBOARD_VIEWED,
      workspaceId,
      actorId: userId,
      entityType: "dashboard",
      entityId: workspaceId,
      payload: {
        engagementCount: payload.engagementCount,
        criticalCount: payload.criticalEngagements,
        actionQueueSize: payload.actionQueueSize,
      },
    });

    return payload;
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new BadRequestError("Validation error: " + error.issues.map((i) => i.message).join(", "));
    }
    if (error instanceof DashboardServiceError) {
      const governed = classifyOperatorError(error, { context: "load" });
      throw new BadRequestError(governed.operatorMessage);
    }
    if (error instanceof Error) {
      const governed = classifyOperatorError(error, { context: "load" });
      throw new BadRequestError(governed.operatorMessage);
    }
    throw new AppError(
      "INTERNAL_ERROR",
      "Internal server error",
      500,
      {
        telemetryClass: "INTERNAL_ERROR",
        auditClass: "INTERNAL_ERROR",
        severity: "HIGH",
        retryable: false,
        securityRelevant: false,
        infrastructureRelevant: true,
        abuseRelevant: false,
        handlerAllowed: true,
        mutationAllowed: false,
      }
    );
  }
}, { requireCapabilities: [CAPABILITIES.OWNER_VIEW] });
