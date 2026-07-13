import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { db } from "@/lib/db";
import { classifyOperatorError } from "@/lib/operator-error-governance";

interface DecisionLatencyMetrics {
  workspace: {
    workspaceId: string;
  };
  period: {
    days: number;
  };
  latency: {
    completedCount: number;
    avgLatencyMs: number;
    medianLatencyMs: number;
    minLatencyMs: number;
    maxLatencyMs: number;
    p95LatencyMs: number;
    p99LatencyMs: number;
  };
  queue: {
    pendingCount: number;
    inProgressCount: number;
    avgPendingAgeMs: number;
  };
  statusBreakdown: {
    pending: number;
    inProgress: number;
    completed: number;
    failed: number;
    blocked: number;
  };
}

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const workspaceId = ctx.verifiedWorkspaceId;
    const actorId = ctx.verifiedActorId;

    // Calculate date range: last N days
    const daysParam = ctx.request?.nextUrl.searchParams.get("days");
    const days = daysParam ? Math.min(Math.max(parseInt(daysParam), 1), 90) : 7;

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    const endDate = new Date();

    // Fetch all decisions in period, grouping by status
    const decisions = await db.operatorItem.findMany({
      where: {
        workspaceId,
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      },
      select: {
        id: true,
        status: true,
        createdAt: true,
        startedAt: true,
        completedAt: true,
      },
    });

    type DecisionRecord = typeof decisions[number];

    // Calculate latency for completed decisions
    const completedDecisions = decisions.filter((d: DecisionRecord) => d.status === "done");
    const latencies: number[] = [];

    for (const decision of completedDecisions) {
      if (decision.completedAt && decision.createdAt) {
        const latency = decision.completedAt.getTime() - decision.createdAt.getTime();
        latencies.push(latency);
      }
    }

    // Sort for percentile calculations
    latencies.sort((a, b) => a - b);

    const avgLatency = latencies.length > 0
      ? latencies.reduce((a: number, b: number) => a + b, 0) / latencies.length
      : 0;

    const medianLatency = latencies.length > 0
      ? latencies[Math.floor(latencies.length / 2)]
      : 0;

    const minLatency = latencies.length > 0 ? latencies[0] : 0;
    const maxLatency = latencies.length > 0 ? latencies[latencies.length - 1] : 0;

    const p95Index = Math.ceil(latencies.length * 0.95) - 1;
    const p95Latency = p95Index >= 0 ? latencies[p95Index] : 0;

    const p99Index = Math.ceil(latencies.length * 0.99) - 1;
    const p99Latency = p99Index >= 0 ? latencies[p99Index] : 0;

    // Calculate queue depth
    const pendingDecisions = decisions.filter((d: DecisionRecord) => d.status === "pending");
    const inProgressDecisions = decisions.filter((d: DecisionRecord) => d.status === "in_progress");

    // Calculate average pending age
    let avgPendingAge = 0;
    if (pendingDecisions.length > 0) {
      const pendingAges = pendingDecisions.map((d: DecisionRecord) => {
        return endDate.getTime() - d.createdAt.getTime();
      });
      avgPendingAge = pendingAges.reduce((a: number, b: number) => a + b, 0) / pendingAges.length;
    }

    // Status breakdown
    const statusCounts = {
      pending: decisions.filter((d: DecisionRecord) => d.status === "pending").length,
      inProgress: decisions.filter((d: DecisionRecord) => d.status === "in_progress").length,
      completed: decisions.filter((d: DecisionRecord) => d.status === "done").length,
      failed: decisions.filter((d: DecisionRecord) => d.status === "failed").length,
      blocked: decisions.filter((d: DecisionRecord) => d.status === "blocked").length,
    };

    const metrics: DecisionLatencyMetrics = {
      workspace: { workspaceId },
      period: { days },
      latency: {
        completedCount: completedDecisions.length,
        avgLatencyMs: Math.round(avgLatency),
        medianLatencyMs: Math.round(medianLatency),
        minLatencyMs: Math.round(minLatency),
        maxLatencyMs: Math.round(maxLatency),
        p95LatencyMs: Math.round(p95Latency),
        p99LatencyMs: Math.round(p99Latency),
      },
      queue: {
        pendingCount: pendingDecisions.length,
        inProgressCount: inProgressDecisions.length,
        avgPendingAgeMs: Math.round(avgPendingAge),
      },
      statusBreakdown: statusCounts,
    };

    // Log audit event for metrics access
    await emitAuditEvent({
      eventName: AUDIT_EVENTS.DECISION_LATENCY_ACCESSED,
      entityType: "LatencyMetrics",
      entityId: workspaceId,
      actorId,
      actorType: "user",
      workspaceId,
      payload: {
        action: "view_decision_latency",
        days,
        summary: {
          completedCount: completedDecisions.length,
          avgLatencyMs: metrics.latency.avgLatencyMs,
          pendingCount: pendingDecisions.length,
        },
      },
    }).catch((auditError) => {
      const governed = classifyOperatorError(auditError instanceof Error ? auditError : new Error(String(auditError)), { context: 'load' });
      console.error(`Audit logging failed: ${governed.operatorMessage}`);
    });

    return metrics;
  },
  { requireWorkspace: true, requireCapabilities: [CAPABILITIES.AUDIT_VIEW] }
);
