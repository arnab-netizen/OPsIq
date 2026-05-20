import { withAuth, createServiceCapabilityContext } from "@/lib/auth-guard";
import { NextRequest } from "next/server";
import { withEnforcementFull } from "@/lib/enforced-route";
import { requireWorkspaceContext } from "@/services/workspace/context";
import { getSession } from "@/services/auth";
import { logAuditEvent } from "@/services/audit/audit-log";
import { db } from "@/lib/db";

interface RuleEffectiveness {
  ruleId: string;
  triggerCount: number;
  blockPercentage: number;
  avgConfidenceWhenTriggered: number;
}

interface StageBreakdown {
  stage: string;
  blockCount: number;
  totalDecisionsInStage: number;
  blockRate: number;
  avgConfidenceWhenBlocked: number;
  topReasons: Array<{
    reason: string;
    count: number;
    percentage: number;
  }>;
}

interface ControlEffectiveness {
  workspace: {
    workspaceId: string;
  };
  period: {
    days: number;
    startDate: string;
    endDate: string;
  };
  summary: {
    totalDecisions: number;
    totalBlocked: number;
    overallBlockRate: number;
    averageConfidenceOfBlockedDecisions: number;
  };
  stageBreakdown: StageBreakdown[];
  topGuardrailRules: RuleEffectiveness[];
}

export const GET = withEnforcementFull(async (request: NextRequest) => {
  await withAuth();
  const auditContext = createServiceCapabilityContext({ capability: "mutation" });
  // Get workspace context (fail closed if missing)
  const workspace = await requireWorkspaceContext();

  // Get session for audit logging
  const { session } = await withAuth();
  const userId = session?.user?.id ?? null;

  // Calculate date range
  const daysParam = request.nextUrl.searchParams.get("days");
  const days = daysParam ? Math.min(Math.max(parseInt(daysParam), 1), 90) : 30;

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  const endDate = new Date();

  // Fetch all decisions in period
  const decisions = await db.operatorItem.findMany({
    where: {
      workspaceId: workspace.workspaceId,
      createdAt: {
        gte: startDate,
        lte: endDate,
      },
    },
    select: {
      id: true,
      status: true,
      blockStage: true,
      blockReason: true,
      confidence: true,
      guardrailResult: true,
    },
  });

  if (decisions.length === 0) {
    return {
      workspace: { workspaceId: workspace.workspaceId },
      period: {
        days,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      },
      summary: {
        totalDecisions: 0,
        totalBlocked: 0,
        overallBlockRate: 0,
        averageConfidenceOfBlockedDecisions: 0,
      },
      stageBreakdown: [],
      topGuardrailRules: [],
    } as ControlEffectiveness;
  }

  type DecisionRecord = typeof decisions[number];

  // Calculate summary metrics
  const blocked = decisions.filter((d: DecisionRecord) => d.status === "blocked");
  const totalDecisions = decisions.length;
  const totalBlocked = blocked.length;
  const overallBlockRate = totalBlocked > 0 ? (totalBlocked / totalDecisions) * 100 : 0;

  const avgConfidenceBlocked =
    blocked.length > 0
      ? blocked.reduce((sum: number, d: DecisionRecord) => sum + (Number(d.confidence) || 0), 0) / blocked.length
      : 0;

  // Break down by stage
  const stageMap: Record<
    string,
    {
      blockCount: number;
      totalCount: number;
      reasonCounts: Record<string, number>;
      confidences: number[];
    }
  > = {};

  for (const decision of decisions) {
    const stage = decision.blockStage || "unknown";
    if (!stageMap[stage]) {
      stageMap[stage] = {
        blockCount: 0,
        totalCount: 0,
        reasonCounts: {},
        confidences: [],
      };
    }

    stageMap[stage].totalCount++;

    if (decision.status === "blocked") {
      stageMap[stage].blockCount++;
      const reason = decision.blockReason || "unknown";
      stageMap[stage].reasonCounts[reason] = (stageMap[stage].reasonCounts[reason] || 0) + 1;
      stageMap[stage].confidences.push(Number(decision.confidence) || 0);
    }
  }

  // Build stage breakdown
  const stageBreakdown: StageBreakdown[] = Object.entries(stageMap)
    .map(([stage, data]) => {
      const blockRate = data.totalCount > 0 ? (data.blockCount / data.totalCount) * 100 : 0;
      const avgConfidence =
        data.confidences.length > 0
          ? data.confidences.reduce((a: number, b: number) => a + b, 0) / data.confidences.length
          : 0;

      const topReasons = Object.entries(data.reasonCounts)
        .map(([reason, count]) => ({
          reason,
          count,
          percentage: data.blockCount > 0 ? (count / data.blockCount) * 100 : 0,
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 3);

      return {
        stage,
        blockCount: data.blockCount,
        totalDecisionsInStage: data.totalCount,
        blockRate: Math.round(blockRate * 100) / 100,
        avgConfidenceWhenBlocked: Math.round(avgConfidence * 100) / 100,
        topReasons,
      };
    })
    .sort((a, b) => b.blockCount - a.blockCount);

  // Extract guardrail rules
  const ruleMap: Record<string, { count: number; blocked: number; confidences: number[] }> = {};

  for (const decision of decisions) {
    if (decision.blockStage === "guardrails" && decision.guardrailResult) {
      try {
        const result = typeof decision.guardrailResult === "string"
          ? JSON.parse(decision.guardrailResult)
          : decision.guardrailResult;

        if (result.violations && Array.isArray(result.violations)) {
          for (const violation of result.violations) {
            const ruleId = violation.ruleId || "unknown";
            if (!ruleMap[ruleId]) {
              ruleMap[ruleId] = {
                count: 0,
                blocked: 0,
                confidences: [],
              };
            }
            ruleMap[ruleId].count++;
            ruleMap[ruleId].confidences.push(Number(decision.confidence) || 0);

            if (decision.status === "blocked") {
              ruleMap[ruleId].blocked++;
            }
          }
        }
      } catch {
        // Skip malformed guardrail results
      }
    }
  }

  // Build top guardrail rules
  const topGuardrailRules: RuleEffectiveness[] = Object.entries(ruleMap)
    .map(([ruleId, data]) => ({
      ruleId,
      triggerCount: data.count,
      blockPercentage: data.count > 0 ? (data.blocked / data.count) * 100 : 0,
      avgConfidenceWhenTriggered:
        Math.round((data.confidences.reduce((a: number, b: number) => a + b, 0) / data.confidences.length) * 100) / 100,
    }))
    .sort((a, b) => b.triggerCount - a.triggerCount)
    .slice(0, 10);

  const metrics: ControlEffectiveness = {
    workspace: {
      workspaceId: workspace.workspaceId,
    },
    period: {
      days,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
    },
    summary: {
      totalDecisions,
      totalBlocked,
      overallBlockRate: Math.round(overallBlockRate * 100) / 100,
      averageConfidenceOfBlockedDecisions: Math.round(avgConfidenceBlocked * 100) / 100,
    },
    stageBreakdown,
    topGuardrailRules,
  };

  // Log audit event for metrics access
  await logAuditEvent({
    eventName: "CONTROL_EFFECTIVENESS_ACCESSED",
    entityType: "ControlMetrics",
    entityId: workspace.workspaceId,
    actorId: userId,
    role: null,
    before: null,
    after: null,
    metadata: {
      action: "view_control_effectiveness",
      days,
      summary: {
        totalDecisions,
        totalBlocked,
        overallBlockRate: metrics.summary.overallBlockRate,
      },
    },
    context: auditContext,
    workspaceId: workspace.workspaceId,
  }).catch((auditError) => {
    // Log but don't fail on audit error - observability only
    console.error(`Audit logging failed: ${auditError instanceof Error ? auditError.message : String(auditError)}`);
  });

  return metrics;
});
