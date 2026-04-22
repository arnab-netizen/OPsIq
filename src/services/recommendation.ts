import { db } from "@/lib/db";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { NotFoundError, ValidationError } from "@/infra/errors";
import { RISK_SEVERITIES } from "@/domain/constants/statuses";
import { triggerReEvaluation } from "@/services/re-evaluation";
import { detectShockFromCurrentState } from "@/services/shock-detection";
import type { RiskSeverity } from "@/domain/constants/statuses";

export interface GenerateRecommendationsInput {
  engagementId: string;
  findingIds?: string[];
  considerShockState?: boolean;
}

export interface Recommendation {
  id: string;
  engagementId: string;
  title: string;
  statement: string;
  severity: RiskSeverity;
  rationale: string;
  sourceFindingIds: string[];
  sourceShockDetected: boolean;
  priority: number;
  status: string;
  createdAt: Date;
}

const RECOMMENDATION_PRIORITIES = {
  critical: 1,
  high: 2,
  medium: 3,
  low: 4,
};

export async function generateRecommendations(
  input: GenerateRecommendationsInput,
  actorId: string
): Promise<Recommendation[]> {
  // Validate engagement exists
  const engagement = await db.engagement.findUnique({
    where: { id: input.engagementId },
    select: { id: true },
  });
  if (!engagement) throw new NotFoundError("Engagement", input.engagementId);

  const recommendations: Recommendation[] = [];
  let shockDetected = false;

  // Evaluate shock state if requested
  if (input.considerShockState) {
    const detection = await detectShockFromCurrentState(input.engagementId);
    shockDetected = detection.shockDetected;

    if (shockDetected) {
      // Add shock-based recommendations
      if (detection.severity === "critical") {
        recommendations.push({
          id: "", // Generated in DB
          engagementId: input.engagementId,
          title: "Immediate Crisis Response Required",
          statement: "Shock state detected with critical indicators. Mobilize crisis management team immediately.",
          severity: "critical",
          rationale: detection.rationale,
          sourceFindingIds: [],
          sourceShockDetected: true,
          priority: RECOMMENDATION_PRIORITIES.critical,
          status: "draft",
          createdAt: new Date(),
        });

        if (detection.indicators.some((i) => i.includes("cash pressure"))) {
          recommendations.push({
            id: "",
            engagementId: input.engagementId,
            title: "Urgent Cash Flow Stabilization",
            statement: "Critical cash pressure detected. Implement immediate cash preservation measures.",
            severity: "critical",
            rationale: "Cash pressure indicator in shock detection",
            sourceFindingIds: [],
            sourceShockDetected: true,
            priority: RECOMMENDATION_PRIORITIES.critical,
            status: "draft",
            createdAt: new Date(),
          });
        }

        if (detection.indicators.some((i) => i.includes("owner dependency"))) {
          recommendations.push({
            id: "",
            engagementId: input.engagementId,
            title: "Owner Dependency Risk Mitigation",
            statement: "Critical owner dependency risk. Establish succession/delegation plan immediately.",
            severity: "critical",
            rationale: "Owner dependency indicator in shock detection",
            sourceFindingIds: [],
            sourceShockDetected: true,
            priority: RECOMMENDATION_PRIORITIES.critical,
            status: "draft",
            createdAt: new Date(),
          });
        }
      } else if (detection.severity === "high") {
        recommendations.push({
          id: "",
          engagementId: input.engagementId,
          title: "Enhanced Monitoring & Response Plan",
          statement: "High-risk indicators present. Develop contingency plans and increase monitoring frequency.",
          severity: "high",
          rationale: detection.rationale,
          sourceFindingIds: [],
          sourceShockDetected: true,
          priority: RECOMMENDATION_PRIORITIES.high,
          status: "draft",
          createdAt: new Date(),
        });
      }
    }
  }

  // Generate recommendations from findings if provided
  if (input.findingIds && input.findingIds.length > 0) {
    const findings = await db.finding.findMany({
      where: {
        id: { in: input.findingIds },
        engagementId: input.engagementId,
        status: { in: ["validated", "under_review"] },
      },
      select: {
        id: true,
        title: true,
        severity: true,
        confidenceLabel: true,
      },
    });

    // Group findings by severity
    const criticalFindings = findings.filter((f) => f.severity === "critical");
    const highFindings = findings.filter((f) => f.severity === "high");
    const mediumFindings = findings.filter((f) => f.severity === "medium");

    // Generate structured recommendations from critical findings
    if (criticalFindings.length > 0) {
      const findingTitles = criticalFindings.map((f) => f.title).join(", ");
      recommendations.push({
        id: "",
        engagementId: input.engagementId,
        title: "Address Critical Findings Immediately",
        statement: `Critical findings require immediate action: ${findingTitles}. Establish task force and timeline.`,
        severity: "critical",
        rationale: `${criticalFindings.length} critical findings identified requiring urgent remediation`,
        sourceFindingIds: criticalFindings.map((f) => f.id),
        sourceShockDetected: false,
        priority: RECOMMENDATION_PRIORITIES.critical,
        status: "draft",
        createdAt: new Date(),
      });
    }

    // Generate recommendations from high-severity findings
    if (highFindings.length > 0) {
      const findingTitles = highFindings.map((f) => f.title).join(", ");
      recommendations.push({
        id: "",
        engagementId: input.engagementId,
        title: "High-Priority Finding Remediation",
        statement: `High-priority findings require structured remediation: ${findingTitles}. Develop remediation plan.`,
        severity: "high",
        rationale: `${highFindings.length} high-severity findings identified requiring structured approach`,
        sourceFindingIds: highFindings.map((f) => f.id),
        sourceShockDetected: false,
        priority: RECOMMENDATION_PRIORITIES.high,
        status: "draft",
        createdAt: new Date(),
      });
    }

    // Generate recommendations for medium findings if no critical/high
    if (
      mediumFindings.length > 0 &&
      criticalFindings.length === 0 &&
      highFindings.length === 0
    ) {
      recommendations.push({
        id: "",
        engagementId: input.engagementId,
        title: "Medium-Priority Finding Resolution",
        statement: `Medium-priority findings require attention: ${mediumFindings.length} items. Prioritize and schedule.`,
        severity: "medium",
        rationale: "Medium-severity findings identified requiring planned resolution",
        sourceFindingIds: mediumFindings.map((f) => f.id),
        sourceShockDetected: false,
        priority: RECOMMENDATION_PRIORITIES.medium,
        status: "draft",
        createdAt: new Date(),
      });
    }
  }

  // If no recommendations generated, return empty list (no error)
  if (recommendations.length === 0) {
    return [];
  }

  // Persist recommendations to database
  const persistedRecommendations: Array<Omit<Recommendation, 'visibilityStatus'>> = [];
  for (const rec of recommendations) {
    const created = await db.recommendation.create({
      data: {
        engagementId: input.engagementId,
        title: rec.title,
        statement: rec.statement,
        severity: rec.severity,
        rationale: rec.rationale,
        sourceFindingIds: rec.sourceFindingIds,
        sourceShockDetected: rec.sourceShockDetected,
        priority: rec.priority,
        status: rec.status,
        createdBy: actorId,
      },
      select: {
        id: true,
        engagementId: true,
        title: true,
        statement: true,
        severity: true,
        rationale: true,
        sourceFindingIds: true,
        sourceShockDetected: true,
        priority: true,
        status: true,
        createdAt: true,
      },
    });

    persistedRecommendations.push(created as any);

    await emitAuditEvent({
      eventName: AUDIT_EVENTS.RECOMMENDATION_CREATED,
      actorId,
      entityType: "Recommendation",
      entityId: created.id,
      payload: {
        engagementId: input.engagementId,
        title: created.title,
        severity: created.severity,
        sourceFindingIds: created.sourceFindingIds,
        sourceShockDetected: created.sourceShockDetected,
      },
    });
  }

  // Trigger re-evaluation due to recommendations
  if (persistedRecommendations.length > 0) {
    await triggerReEvaluation({
      changeType: "new_critical_evidence",
      entityType: "Recommendation",
      entityId: persistedRecommendations[0].id,
      engagementId: input.engagementId,
      severity: persistedRecommendations[0].severity,
      description: `${persistedRecommendations.length} recommendations generated`,
      triggeredBy: actorId,
    });
  }

  return persistedRecommendations;
}

export async function listRecommendationsForEngagement(
  engagementId: string,
  visibility?: "internal" | "all"
): Promise<Array<Omit<Recommendation, 'visibilityStatus'>>> {
  // Validate engagement exists
  const engagement = await db.engagement.findUnique({
    where: { id: engagementId },
    select: { id: true },
  });
  if (!engagement) throw new NotFoundError("Engagement", engagementId);

  const recommendations = await db.recommendation.findMany({
    where: { engagementId },
    select: {
      id: true,
      engagementId: true,
      title: true,
      statement: true,
      severity: true,
      rationale: true,
      sourceFindingIds: true,
      sourceShockDetected: true,
      priority: true,
      status: true,
      createdAt: true,
      visibilityStatus: true,
    },
    orderBy: { priority: "asc" },
  });

  // Filter by visibility if not requesting all
  if (visibility === "internal") {
    return recommendations
      .filter((r) => r.visibilityStatus === "internal")
      .map(({ visibilityStatus, ...r }) => r as any);
  }

  return recommendations.map(({ visibilityStatus, ...r }) => r as any);
}

export async function getRecommendationDetail(
  recommendationId: string,
  visibility?: "internal" | "all"
): Promise<Omit<Recommendation, 'visibilityStatus'>> {
  const rec = await db.recommendation.findUnique({
    where: { id: recommendationId },
    select: {
      id: true,
      engagementId: true,
      title: true,
      statement: true,
      severity: true,
      rationale: true,
      sourceFindingIds: true,
      sourceShockDetected: true,
      priority: true,
      status: true,
      createdAt: true,
      visibilityStatus: true,
    },
  });

  if (!rec) throw new NotFoundError("Recommendation", recommendationId);

  // Filter internal-only recommendations if not requested
  if (visibility === "internal" && rec.visibilityStatus === "internal") {
    const { visibilityStatus, ...rest } = rec;
    return rest as any;
  }

  const { visibilityStatus, ...rest } = rec;
  return rest as any;
}
