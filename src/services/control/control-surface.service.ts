import { classifyOperatorError } from "@/lib/operator-error-governance";
import { db } from "@/lib/db";
import { enforceWorkspaceId } from "@/lib/workspace-validation";
import { calculateWorkspaceImpactSummary } from "@/services/business-impact/decision-impact.service";
import { enforceDecisionControl } from "@/services/decision-control/enforcement.service";
import { logger } from "@/infra/logger";

export interface ActionItem {
  decisionId: string;
  problem: string;
  expectedImpact: number;
  confidence: number;
  priorityScore: number;
  reason: string;
}

export interface RiskItem {
  decisionId: string;
  problem: string;
  atRisk: number;
  blockedAtRisk: number;
  reason: string;
}

export interface ControlSurface {
  workspaceId: string;
  date: string;
  topActions: ActionItem[];
  risks: RiskItem[];
  blockedValue: number;
  totalImpactToday: number;
  missedIfIgnored: number;
}

/**
 * Generate deterministic reason for action based on metrics
 * No AI, no randomness - purely rule-based
 */
function generateActionReason(
  priorityScore: number,
  expectedImpact: number,
  confidence: number
): string {
  if (priorityScore >= 85) {
    return "Critical priority - immediate execution required";
  } else if (priorityScore >= 75) {
    return "High priority - execute this week";
  } else if (expectedImpact >= 100000) {
    return "High impact ($" +
      Math.round(expectedImpact / 1000) +
      "k) - escalate for approval";
  } else if (confidence >= 0.9) {
    return "High confidence (" +
      Math.round(confidence * 100) +
      "%) - safe to proceed";
  } else if (confidence >= 0.75) {
    return "Moderate confidence (" +
      Math.round(confidence * 100) +
      "%) - review before execution";
  } else {
    return "Low confidence - requires validation";
  }
}

/**
 * Generate deterministic reason for risk based on metrics
 */
function generateRiskReason(
  atRisk: number,
  blockedAtRisk: number,
  status: string
): string {
  if (status === "blocked") {
    if (blockedAtRisk > 0) {
      return "Blocked decision with $" +
        Math.round(blockedAtRisk) +
        " at risk - requires unblocking";
    } else {
      return "Decision blocked - resolve dependencies";
    }
  } else if (status === "failed") {
    return "Previous execution failed - reassess approach";
  } else if (blockedAtRisk > 0) {
    return "Blocked decision with $" +
      Math.round(blockedAtRisk) +
      " at risk - requires unblocking";
  } else if (atRisk > 50000) {
    return "High at-risk value ($" +
      Math.round(atRisk / 1000) +
      "k) - escalate immediately";
  } else if (atRisk > 25000) {
    return "Moderate at-risk value ($" +
      Math.round(atRisk / 1000) +
      "k) - monitor closely";
  } else {
    return "At-risk action - may need intervention";
  }
}

/**
 * Get unified control surface response
 * Reuses Business Impact Engine calculations
 * Deterministic aggregation, no randomness
 */
export async function getControlSurface(
  workspaceId: string
): Promise<ControlSurface> {
  enforceWorkspaceId(workspaceId, "getControlSurface", "OperatorItem");

  // Get summary using Business Impact Engine
  const summary = await calculateWorkspaceImpactSummary(workspaceId);

  // Get decisions for confidence data
  const decisions = await db.operatorItem.findMany({
    where: { workspaceId },
  });

  const decisionMap = new Map<string, unknown>();
  for (const d of decisions) {
    decisionMap.set(d.id, d);
  }

  // Process each decision for control enforcement
  const controls = await Promise.all(
    summary.metrics.map((m) =>
      enforceDecisionControl(m.decisionId, workspaceId).catch((error) => {
        const governed = classifyOperatorError(error instanceof Error ? error : new Error(String(error)), { context: "load" });
        logger.warn("Failed to enforce decision control", {
          decisionId: m.decisionId,
          workspaceId,
          error: governed.operatorMessage,
        });
        return null;
      })
    )
  );

  const validControls = controls.filter((c): c is any => c !== null);

  // Build topActions: high priority, not blocked
  const topActions: ActionItem[] = validControls
    .filter((c) => !c.isBlocked)
    .sort((a, b) => b.priorityScore - a.priorityScore)
    .slice(0, 10)
    .map((c) => {
      const metric = summary.metrics.find((m) => m.decisionId === c.decisionId);
      const decision = decisionMap.get(c.decisionId);
      const confidence = decision?.confidence ?? 0;

      return {
        decisionId: c.decisionId,
        problem: c.problem,
        expectedImpact: metric?.expected ?? 0,
        confidence,
        priorityScore: c.priorityScore,
        reason: generateActionReason(
          c.priorityScore,
          metric?.expected ?? 0,
          confidence
        ),
      };
    });

  // Build risks: high atRisk or blocked
  const risks: RiskItem[] = validControls
    .filter((c) => c.atRisk > 0 || c.shouldEscalate)
    .sort((a, b) => {
      const bRisk = b.atRisk + b.blockedAtRisk;
      const aRisk = a.atRisk + a.blockedAtRisk;
      return bRisk - aRisk;
    })
    .slice(0, 10)
    .map((c) => {
      const decision = decisionMap.get(c.decisionId);
      const status = decision?.status ?? "unknown";

      return {
        decisionId: c.decisionId,
        problem: c.problem,
        atRisk: c.atRisk,
        blockedAtRisk: c.blockedAtRisk,
        reason: generateRiskReason(c.atRisk, c.blockedAtRisk, status),
      };
    });

  // Calculate aggregates
  const blockedValue = summary.metrics.reduce(
    (sum, m) => sum + m.blockedAtRisk + m.failedLoss,
    0
  );

  // Total impact today: sum of expected impact for top actions
  const totalImpactToday = topActions.reduce(
    (sum, a) => sum + a.expectedImpact,
    0
  );

  // Missed if ignored: sum of atRisk for all risks
  const missedIfIgnored = risks.reduce(
    (sum, r) => sum + r.atRisk + r.blockedAtRisk,
    0
  );

  return {
    workspaceId,
    date: new Date().toISOString().split("T")[0],
    topActions,
    risks,
    blockedValue: Math.round(blockedValue),
    totalImpactToday: Math.round(totalImpactToday),
    missedIfIgnored: Math.round(missedIfIgnored),
  };
}
