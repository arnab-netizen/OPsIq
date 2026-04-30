/**
 * Governance Metrics Engine
 * Calculates decision governance metrics from persisted real data only
 * All calculations are workspace-scoped and bounded
 */

import { db } from "@/lib/db";

export interface GovernanceMetrics {
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
    approvedCount: number;
    blockedCount: number;
  };
  blockRates: {
    overallBlockRate: number; // percentage (0-100)
    guardrailBlockRate: number;
    decisionGateBlockRate: number;
    dependencyValidationBlockRate: number;
  };
  confidence: {
    avgConfidenceApproved: number | null;
    avgConfidenceBlocked: number | null;
  };
  impact: {
    approvedExpectedImpact: number;
    blockedExpectedImpact: number;
    realizedImpact: number; // sum of actual outcomes from approved decisions
    lossFromMisses: number; // approved decisions with negative actual outcomes
  };
}

export interface GovernanceMetricsOptions {
  workspaceId: string;
  days?: number; // default 30, max 90
}

/**
 * Calculate governance metrics for a workspace
 * All data sourced from database, no defaults or fake values
 * Returns null-safe results
 */
export async function calculateGovernanceMetrics(
  options: GovernanceMetricsOptions
): Promise<GovernanceMetrics> {
  const { workspaceId, days = 30 } = options;

  // Validate and bound the days parameter
  const boundedDays = Math.min(Math.max(days, 1), 90);

  // Calculate date range
  const endDate = new Date();
  const startDate = new Date(endDate);
  startDate.setDate(startDate.getDate() - boundedDays);

  // Fetch all decisions in period for this workspace
  const allDecisions = await db.operatorItem.findMany({
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
      blockStage: true,
      confidence: true,
      impactExpected: true,
      actualOutcomeValue: true,
      outcomeDelta: true,
    },
  });

  // Separate decisions by status
  const approvedDecisions = allDecisions.filter(
    (d: typeof allDecisions[number]) => d.status === "done"
  );
  const blockedDecisions = allDecisions.filter(
    (d: typeof allDecisions[number]) => d.status === "blocked"
  );

  const totalDecisions = allDecisions.length;
  const approvedCount = approvedDecisions.length;
  const blockedCount = blockedDecisions.length;

  // Calculate block rates
  const overallBlockRate =
    totalDecisions > 0 ? (blockedCount / totalDecisions) * 100 : 0;

  const guardrailBlocks = blockedDecisions.filter(
    (d: typeof blockedDecisions[number]) => d.blockStage === "guardrails"
  ).length;
  const guardrailBlockRate =
    blockedCount > 0 ? (guardrailBlocks / blockedCount) * 100 : 0;

  const decisionGateBlocks = blockedDecisions.filter(
    (d: typeof blockedDecisions[number]) => d.blockStage === "decision_gate"
  ).length;
  const decisionGateBlockRate =
    blockedCount > 0 ? (decisionGateBlocks / blockedCount) * 100 : 0;

  const dependencyBlocks = blockedDecisions.filter(
    (d: typeof blockedDecisions[number]) =>
      d.blockStage === "dependency_validation"
  ).length;
  const dependencyValidationBlockRate =
    blockedCount > 0 ? (dependencyBlocks / blockedCount) * 100 : 0;

  // Calculate confidence metrics
  const avgConfidenceApproved =
    approvedCount > 0
      ? approvedDecisions.reduce(
          (sum: number, d: typeof approvedDecisions[number]) =>
            sum + (Number(d.confidence) || 0),
          0
        ) / approvedCount
      : null;

  const avgConfidenceBlocked =
    blockedCount > 0
      ? blockedDecisions.reduce(
          (sum: number, d: typeof blockedDecisions[number]) =>
            sum + (Number(d.confidence) || 0),
          0
        ) / blockedCount
      : null;

  // Calculate impact metrics
  const approvedExpectedImpact = approvedDecisions.reduce(
    (sum: number, d: typeof approvedDecisions[number]) =>
      sum + (Number(d.impactExpected) || 0),
    0
  );

  const blockedExpectedImpact = blockedDecisions.reduce(
    (sum: number, d: typeof blockedDecisions[number]) =>
      sum + (Number(d.impactExpected) || 0),
    0
  );

  // Calculate realized impact (actual outcomes from approved decisions)
  let realizedImpact = 0;
  let lossFromMisses = 0;

  for (const decision of approvedDecisions) {
    // Use actualOutcomeValue if available, otherwise use outcomeDelta
    const actual = decision.actualOutcomeValue ?? decision.outcomeDelta;
    if (actual !== null && actual !== undefined) {
      const actualValue = Number(actual);
      realizedImpact += actualValue;

      // Track losses from decisions that didn't meet expected impact
      if (actualValue < 0) {
        lossFromMisses += Math.abs(actualValue);
      }
    }
  }

  return {
    workspace: {
      workspaceId,
    },
    period: {
      days: boundedDays,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
    },
    summary: {
      totalDecisions,
      approvedCount,
      blockedCount,
    },
    blockRates: {
      overallBlockRate: Math.round(overallBlockRate * 100) / 100,
      guardrailBlockRate: Math.round(guardrailBlockRate * 100) / 100,
      decisionGateBlockRate: Math.round(decisionGateBlockRate * 100) / 100,
      dependencyValidationBlockRate:
        Math.round(dependencyValidationBlockRate * 100) / 100,
    },
    impact: {
      approvedExpectedImpact,
      blockedExpectedImpact,
      realizedImpact,
      lossFromMisses,
    },
    confidence: {
      avgConfidenceApproved:
        avgConfidenceApproved !== null
          ? Math.round(avgConfidenceApproved * 100) / 100
          : null,
      avgConfidenceBlocked:
        avgConfidenceBlocked !== null
          ? Math.round(avgConfidenceBlocked * 100) / 100
          : null,
    },
  };
}
