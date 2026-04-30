import { NextRequest, NextResponse } from "next/server";
import { requireWorkspaceContext } from "@/services/workspace/context";
import { db } from "@/lib/db";

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

export async function GET(request: NextRequest) {
  try {
    // Get workspace context (fail closed if missing)
    const workspace = await requireWorkspaceContext();

    // Calculate date range: last N days
    const daysParam = request.nextUrl.searchParams.get("days");
    const days = daysParam ? Math.min(parseInt(daysParam), 90) : 7;

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    const endDate = new Date();

    // Fetch all decisions in period, grouping by status
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
      workspace: {
        workspaceId: workspace.workspaceId,
      },
      period: {
        days,
      },
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

    return NextResponse.json(metrics);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    if (message.includes("Unauthorized")) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 403 }
      );
    }
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
