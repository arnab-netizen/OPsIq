import { NextRequest, NextResponse } from "next/server";
import { requireWorkspaceContext } from "@/services/workspace/context";
import { db } from "@/lib/db";

interface SevenDayImpact {
  workspace: {
    workspaceId: string;
  };
  period: {
    startDate: string;
    endDate: string;
    daysInPeriod: number;
  };
  metrics: {
    totalGain: number;
    totalLoss: number;
    netImpact: number;
    decisionsCount: number;
    successRate: number;
  };
}

export async function GET(request: NextRequest) {
  try {
    // Get workspace context (fail closed if missing)
    const workspace = await requireWorkspaceContext();

    // Calculate date range: last 7 days
    const endDate = new Date();
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - 7);

    // Fetch all completed items from last 7 days
    const items = await db.operatorItem.findMany({
      where: {
        workspaceId: workspace.workspaceId,
        status: "done",
        completedAt: {
          gte: startDate,
          lte: endDate,
        },
      },
    });

    // Calculate metrics
    let totalGain = 0;
    let totalLoss = 0;
    let successCount = 0;

    for (const item of items) {
      // Use actualOutcomeValue if available, otherwise try to infer from delta
      let impact = 0;

      if (item.actualOutcomeValue !== null && item.actualOutcomeValue !== undefined) {
        impact = Number(item.actualOutcomeValue);
      } else if (item.outcomeDelta !== null && item.outcomeDelta !== undefined) {
        impact = Number(item.outcomeDelta);
      } else {
        // Fallback to expected impact as proxy
        impact = Number(item.impactExpected);
      }

      if (impact > 0) {
        totalGain += impact;
        successCount++;
      } else if (impact < 0) {
        totalLoss += Math.abs(impact);
      }
    }

    const netImpact = totalGain - totalLoss;
    const successRate =
      items.length > 0 ? (successCount / items.length) * 100 : 0;

    const summary: SevenDayImpact = {
      workspace: {
        workspaceId: workspace.workspaceId,
      },
      period: {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        daysInPeriod: 7,
      },
      metrics: {
        totalGain,
        totalLoss,
        netImpact,
        decisionsCount: items.length,
        successRate: Math.round(successRate * 100) / 100,
      },
    };

    return NextResponse.json(summary);
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
