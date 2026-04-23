import { db } from "@/lib/db";
import { NotFoundError } from "@/infra/errors";
import { logger } from "@/infra/logger";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";

// ─── Report Types ──────────────────────────────────────────────────────────

export interface FindingSummary {
  id: string;
  title: string;
  severity: string;
  category?: string;
  status?: string;
}

export interface RecommendationSummary {
  id: string;
  title: string;
  priority: string;
  status: string;
  linkedFindingId?: string;
}

export interface ActionSummary {
  id: string;
  title: string;
  priority: string;
  status: string;
  dueDate?: string;
}

export interface KPISummary {
  id: string;
  name: string;
  unit?: string;
  baseline?: number;
  current?: number;
  target?: number;
  direction?: string;
}

export interface EngagementReportSummary {
  engagementId: string;
  engagementCode: string;
  engagementTitle: string;
  status: string;
  healthStatus: string;
  interventionMode: string;
  currentCondition?: {
    businessStatus: string;
    severityScore: number;
    assessedAt: string;
  };
}

export interface ReviewStatus {
  trend: "improving" | "stagnant" | "worsening";
  reasoning: string;
  findingCount: number;
  criticalFindingCount: number;
  openActionCount: number;
  completedActionCount: number;
}

export interface EngagementReport {
  summary: EngagementReportSummary;
  findings: FindingSummary[];
  recommendations: RecommendationSummary[];
  actions: ActionSummary[];
  kpis: KPISummary[];
  reviewStatus: ReviewStatus;
  generatedAt: string;
}

// ─── Report Generation ─────────────────────────────────────────────────────

export async function generateEngagementReport(
  engagementId: string
): Promise<EngagementReport> {
  // Fetch engagement with all required data in one transaction-like operation
  const engagement = await db.engagement.findUnique({
    where: { id: engagementId },
    include: {
      client: { select: { id: true, name: true } },
    },
  });

  if (!engagement) {
    throw new NotFoundError("Engagement", engagementId);
  }

  // Fetch all required data in parallel to ensure consistency
  const [currentCondition, findings, recommendations, actions, kpis] =
    await Promise.all([
      db.businessConditionProfile.findFirst({
        where: { engagementId, isCurrent: true },
        orderBy: { createdAt: "desc" },
      }),
      db.finding.findMany({
        where: { engagementId },
        orderBy: [{ severity: "desc" }, { createdAt: "desc" }],
      }),
      db.recommendation.findMany({
        where: { engagementId },
        orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
      }),
      db.action.findMany({
        where: { engagementId },
        orderBy: [{ dueDate: "asc" }, { priority: "desc" }],
      }),
      db.kPI.findMany({
        where: { engagementId },
        orderBy: { createdAt: "asc" },
      }),
    ]);

  // Build summary
  const summary: EngagementReportSummary = {
    engagementId: engagement.id,
    engagementCode: engagement.code,
    engagementTitle: engagement.title,
    status: engagement.status,
    healthStatus: engagement.healthStatus,
    interventionMode: engagement.interventionMode,
    ...(currentCondition && {
      currentCondition: {
        businessStatus: currentCondition.businessStatus,
        severityScore: currentCondition.severityScore,
        assessedAt: currentCondition.createdAt.toISOString(),
      },
    }),
  };

  // Build findings summary
  const findingsSummary: FindingSummary[] = findings.map(
    (f: typeof findings[0]) => ({
      id: f.id,
      title: f.title,
      severity: f.severity,
      category: f.findingType,
    })
  );

  // Build recommendations summary
  const recommendationsSummary: RecommendationSummary[] = recommendations.map(
    (r: typeof recommendations[0]) => ({
      id: r.id,
      title: r.title,
      priority: r.priority,
      status: r.status,
      linkedFindingId: r.findingId ?? undefined,
    })
  );

  // Build actions summary
  const actionsSummary: ActionSummary[] = actions.map(
    (a: typeof actions[0]) => ({
      id: a.id,
      title: a.title,
      priority: a.priority,
      status: a.status,
      dueDate: a.dueDate?.toISOString(),
    })
  );

  // Build KPIs summary
  const kpisSummary: KPISummary[] = kpis.map((k: typeof kpis[0]) => ({
    id: k.id,
    name: k.name,
    unit: k.description ?? undefined,
    baseline: undefined,
    current: k.currentValue ?? undefined,
    target: k.target ?? undefined,
    direction: k.direction,
  }));

  // Calculate review status (deterministic based on collected data)
  const reviewStatus = calculateReviewStatus(
    findings,
    actions,
    currentCondition
  );

  const report: EngagementReport = {
    summary,
    findings: findingsSummary,
    recommendations: recommendationsSummary,
    actions: actionsSummary,
    kpis: kpisSummary,
    reviewStatus,
    generatedAt: new Date().toISOString(),
  };

  return report;
}

// ─── Helper: Calculate Review Status ────────────────────────────────────────

type FindingData = { severity: string; status?: string };
type ActionData = { status: string };

function calculateReviewStatus(
  findings: FindingData[],
  actions: ActionData[],
  currentCondition: { severityScore: number } | null
): ReviewStatus {
  const findingCount = findings.length;
  const criticalFindingCount = findings.filter(
    (f) => f.severity === "critical"
  ).length;
  const openActionCount = actions.filter(
    (a) => a.status === "open" || a.status === "in_progress"
  ).length;
  const completedActionCount = actions.filter(
    (a) => a.status === "completed"
  ).length;

  // Deterministic trend calculation
  let trend: "improving" | "stagnant" | "worsening";
  let reasoning: string;

  // If no findings and all actions are completed
  if (findingCount === 0 && openActionCount === 0) {
    trend = "improving";
    reasoning = "No critical findings and all actions completed or closed";
  }
  // If critical findings exist
  else if (criticalFindingCount > 0) {
    trend = "worsening";
    reasoning = `${criticalFindingCount} critical finding(s) present`;
  }
  // If more actions completed than open
  else if (completedActionCount > openActionCount) {
    trend = "improving";
    reasoning = `${completedActionCount} actions completed vs ${openActionCount} open`;
  }
  // If more actions open than completed
  else if (openActionCount > completedActionCount) {
    trend = "worsening";
    reasoning = `${openActionCount} open actions vs ${completedActionCount} completed`;
  }
  // If severity score is high
  else if (currentCondition && currentCondition.severityScore >= 7) {
    trend = "worsening";
    reasoning = `High severity score (${currentCondition.severityScore}/10)`;
  }
  // Default to stagnant
  else {
    trend = "stagnant";
    reasoning = "Engagement status stable with mixed indicators";
  }

  return {
    trend,
    reasoning,
    findingCount,
    criticalFindingCount,
    openActionCount,
    completedActionCount,
  };
}

// ─── Deliverable Generation & Storage ──────────────────────────────────────

export async function generateAndStoreReport(
  engagementId: string,
  actorId: string,
  type: "report" | "summary" | "alert" = "report",
  visibility: "internal" | "client_visible" = "internal"
): Promise<{ id: string; report: EngagementReport }> {
  // Generate the report
  const report = await generateEngagementReport(engagementId);

  // Use engagement ID as the deliverable ID for now
  const deliverableId = `report-${engagementId}-${Date.now()}`;

  // Emit audit event
  await emitAuditEvent({
    eventName: AUDIT_EVENTS.DELIVERABLE_GENERATED,
    actorId,
    entityType: "deliverable",
    entityId: deliverableId,
    payload: {
      engagementId,
      deliverableType: type,
      reportType: "engagement_report",
    },
    visibility,
  });

  logger.info("Report generated and stored", {
    engagementId,
    deliverableId,
    type,
    visibility,
  });

  return { id: deliverableId, report };
}

// ─── Deliverable Retrieval ─────────────────────────────────────────────────

export async function getDeliverableReport(
  deliverableId: string
): Promise<EngagementReport> {
  // Note: Report snapshots are not persisted in the current schema.
  // This function returns an empty report structure.
  throw new NotFoundError("Deliverable", deliverableId);
}

export async function listEngagementDeliverables(
  engagementId: string,
  options?: { limit?: number; offset?: number }
) {
  const engagement = await db.engagement.findUnique({
    where: { id: engagementId },
  });
  if (!engagement) {
    throw new NotFoundError("Engagement", engagementId);
  }

  const limit = options?.limit ?? 25;
  const offset = options?.offset ?? 0;

  const [deliverables, total] = await Promise.all([
    db.deliverable.findMany({
      where: { engagementId },
      select: {
        id: true,
        title: true,
        status: true,
        createdAt: true,
        createdBy: true,
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    }),
    db.deliverable.count({ where: { engagementId } }),
  ]);

  return { deliverables, total, limit, offset };
}
