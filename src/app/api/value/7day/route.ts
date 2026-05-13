import { NextRequest } from "next/server";
import { withEnforcementFull } from "@/lib/enforced-route";
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
    approvedCount: number;
    blockedCount: number;
    totalGain: number;
    totalLoss: number;
    netImpact: number;
    rejectedImpact: number;
    actualImpactApproved: number;
    avgConfidenceApproved: number;
    avgConfidenceBlocked: number;
    successRate: number;
  };
}

export const GET = withEnforcementFull(async (request: NextRequest) => {
  // Get workspace context (fail closed if missing)
  const workspace = await requireWorkspaceContext();

  // Calculate date range: last 7 days
  const endDate = new Date();
  const startDate = new Date(endDate);
  startDate.setDate(startDate.getDate() - 7);

  // Fetch all completed items from last 7 days (approved decisions)
  const approvedItems = await db.operatorItem.findMany({
    where: {
      workspaceId: workspace.workspaceId,
      status: "done",
      completedAt: {
        gte: startDate,
        lte: endDate,
      },
    },
  });

  // Fetch all blocked decisions from last 7 days
  const blockedItems = await db.operatorItem.findMany({
    where: {
      workspaceId: workspace.workspaceId,
      status: "blocked",
      createdAt: {
        gte: startDate,
        lte: endDate,
      },
    },
  });

  // Calculate approved metrics
  let totalGain = 0;
  let totalLoss = 0;
  let successCount = 0;
  let totalApprovedConfidence = 0;
  let totalActualImpact = 0;

  for (const item of approvedItems) {
    // Use actualOutcomeValue if available, otherwise try to infer from delta
    let impact = 0;

    if (item.actualOutcomeValue !== null && item.actualOutcomeValue !== undefined) {
      impact = Number(item.actualOutcomeValue);
      totalActualImpact += impact;
    } else if (item.outcomeDelta !== null && item.outcomeDelta !== undefined) {
      impact = Number(item.outcomeDelta);
      totalActualImpact += impact;
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

    totalApprovedConfidence += Number(item.confidence || 0);
  }

  // Calculate blocked metrics
  let totalRejectedImpact = 0;
  let totalBlockedConfidence = 0;

  for (const item of blockedItems) {
    const expectedImpact = Number(item.impactExpected || 0);
    totalRejectedImpact += expectedImpact;
    totalBlockedConfidence += Number(item.confidence || 0);
  }

  const netImpact = totalGain - totalLoss;
  const approvedCount = approvedItems.length;
  const blockedCount = blockedItems.length;
  const totalDecisions = approvedCount + blockedCount;
  const successRate =
    approvedCount > 0 ? (successCount / approvedCount) * 100 : 0;
  const avgConfidenceApproved =
    approvedCount > 0 ? totalApprovedConfidence / approvedCount : 0;
  const avgConfidenceBlocked =
    blockedCount > 0 ? totalBlockedConfidence / blockedCount : 0;

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
      approvedCount,
      blockedCount,
      totalGain,
      totalLoss,
      netImpact,
      rejectedImpact: totalRejectedImpact,
      actualImpactApproved: totalActualImpact,
      avgConfidenceApproved: Math.round(avgConfidenceApproved * 100) / 100,
      avgConfidenceBlocked: Math.round(avgConfidenceBlocked * 100) / 100,
      successRate: Math.round(successRate * 100) / 100,
    },
  };

  return summary;
});
