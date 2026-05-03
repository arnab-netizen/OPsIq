import { db } from "@/lib/db";
import { enforceWorkspaceId } from "@/lib/workspace-validation";

export interface DecisionImpactMetrics {
  decisionId: string;
  problem: string;
  status: string;
  blockStage: string | null;
  expected: number;
  realized: number | null;
  variance: number | null;
  atRisk: number;
  blockedAtRisk: number;
  failedLoss: number;
  costOfDelay: number;
  priorityScore: number;
  roiMultiple: number | null;
  calculatedAt: string;
}

export interface WorkspaceImpactSummary {
  workspaceId: string;
  totalDecisions: number;
  totalExpectedImpact: number;
  totalRealizedImpact: number;
  totalVariance: number;
  totalAtRisk: number;
  totalBlockedAtRisk: number;
  totalFailedLoss: number;
  totalCostOfDelay: number;
  averagePriorityScore: number;
  averageRoiMultiple: number;
  blockedCount: number;
  failedCount: number;
  succeededCount: number;
  metrics: DecisionImpactMetrics[];
  calculatedAt: string;
}

/**
 * Calculate impact metrics for a single decision
 * Deterministic calculation based on decision data only
 * Fail-closed: returns zero impact for missing data
 */
export async function calculateDecisionImpact(
  decisionId: string,
  workspaceId: string
): Promise<DecisionImpactMetrics> {
  enforceWorkspaceId(workspaceId, "calculateDecisionImpact", "OperatorItem");

  const decision = await db.operatorItem.findFirst({
    where: { id: decisionId, workspaceId },
  });

  if (!decision) {
    throw new Error(`Decision not found or unauthorized`);
  }

  // Expected impact: impactExpected (deterministic)
  const expected = decision.impactExpected ?? 0;

  // Realized impact: only if decision completed with outcome value
  const realized =
    decision.status === "done" && decision.actualOutcomeValue !== null
      ? decision.actualOutcomeValue
      : null;

  // Variance: realized - expected
  const variance =
    realized !== null ? Math.round((realized - expected) * 100) / 100 : null;

  // At Risk: projected impact if action not completed
  // = max(0, (baselineValue - projectedWithoutAction))
  const atRisk =
    decision.status !== "done" && decision.projectedWithoutAction !== null && decision.baselineValue !== null
      ? Math.max(0, decision.baselineValue - decision.projectedWithoutAction)
      : 0;

  // Blocked At Risk: atRisk if decision is blocked
  const blockedAtRisk = decision.status === "blocked" ? atRisk : 0;

  // Failed Loss: expected impact lost due to failed status
  const failedLoss = decision.status === "failed" ? expected : 0;

  // Cost of Delay: projected cost for each day of delay
  // = atRisk / 30 (assuming 30-day impact window)
  const costOfDelay = atRisk > 0 ? Math.round(atRisk / 30 * 100) / 100 : 0;

  // Priority Score: already calculated in decision (deterministic)
  const priorityScore = decision.priorityScore ?? 0;

  // ROI Multiple: realized / (expected or 1 if expected is 0)
  const roiMultiple =
    realized !== null && expected > 0
      ? Math.round((realized / expected) * 100) / 100
      : null;

  return {
    decisionId,
    problem: decision.problem,
    status: decision.status,
    blockStage: decision.blockStage,
    expected,
    realized,
    variance,
    atRisk,
    blockedAtRisk,
    failedLoss,
    costOfDelay,
    priorityScore,
    roiMultiple,
    calculatedAt: new Date().toISOString(),
  };
}

/**
 * Calculate impact summary for all decisions in workspace
 * Aggregates metrics for all decisions
 * Workspace-scoped, fail-closed on missing data
 */
export async function calculateWorkspaceImpactSummary(
  workspaceId: string
): Promise<WorkspaceImpactSummary> {
  enforceWorkspaceId(workspaceId, "calculateWorkspaceImpactSummary", "OperatorItem");

  const decisions = await db.operatorItem.findMany({
    where: { workspaceId },
  });

  if (decisions.length === 0) {
    return {
      workspaceId,
      totalDecisions: 0,
      totalExpectedImpact: 0,
      totalRealizedImpact: 0,
      totalVariance: 0,
      totalAtRisk: 0,
      totalBlockedAtRisk: 0,
      totalFailedLoss: 0,
      totalCostOfDelay: 0,
      averagePriorityScore: 0,
      averageRoiMultiple: 0,
      blockedCount: 0,
      failedCount: 0,
      succeededCount: 0,
      metrics: [],
      calculatedAt: new Date().toISOString(),
    };
  }

  // Calculate metrics for each decision
  const metrics = await Promise.all(
    decisions.map((d: any) => calculateDecisionImpact(d.id, workspaceId))
  );

  // Aggregate metrics
  let totalExpectedImpact = 0;
  let totalRealizedImpact = 0;
  let totalVariance = 0;
  let totalAtRisk = 0;
  let totalBlockedAtRisk = 0;
  let totalFailedLoss = 0;
  let totalCostOfDelay = 0;
  let roiMultipleCount = 0;
  let roiMultipleSum = 0;

  const blockedCount = decisions.filter((d: any) => d.status === "blocked").length;
  const failedCount = decisions.filter((d: any) => d.status === "failed").length;
  const succeededCount = decisions.filter((d: any) => d.status === "done").length;

  for (const metric of metrics) {
    totalExpectedImpact += metric.expected;
    if (metric.realized !== null) {
      totalRealizedImpact += metric.realized;
    }
    if (metric.variance !== null) {
      totalVariance += metric.variance;
    }
    totalAtRisk += metric.atRisk;
    totalBlockedAtRisk += metric.blockedAtRisk;
    totalFailedLoss += metric.failedLoss;
    totalCostOfDelay += metric.costOfDelay;

    if (metric.roiMultiple !== null) {
      roiMultipleSum += metric.roiMultiple;
      roiMultipleCount++;
    }
  }

  const averageRoiMultiple =
    roiMultipleCount > 0
      ? Math.round((roiMultipleSum / roiMultipleCount) * 100) / 100
      : 0;

  const averagePriorityScore =
    decisions.length > 0
      ? Math.round(
          (decisions.reduce((sum: number, d: any) => sum + (d.priorityScore ?? 0), 0) /
            decisions.length) *
            100
        ) / 100
      : 0;

  return {
    workspaceId,
    totalDecisions: decisions.length,
    totalExpectedImpact: Math.round(totalExpectedImpact * 100) / 100,
    totalRealizedImpact: Math.round(totalRealizedImpact * 100) / 100,
    totalVariance: Math.round(totalVariance * 100) / 100,
    totalAtRisk: Math.round(totalAtRisk * 100) / 100,
    totalBlockedAtRisk: Math.round(totalBlockedAtRisk * 100) / 100,
    totalFailedLoss: Math.round(totalFailedLoss * 100) / 100,
    totalCostOfDelay: Math.round(totalCostOfDelay * 100) / 100,
    averagePriorityScore,
    averageRoiMultiple,
    blockedCount,
    failedCount,
    succeededCount,
    metrics: metrics.sort((a, b) => b.priorityScore - a.priorityScore),
    calculatedAt: new Date().toISOString(),
  };
}
