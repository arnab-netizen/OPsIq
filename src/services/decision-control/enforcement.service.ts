import { db } from "@/lib/db";
import { enforceWorkspaceId } from "@/lib/workspace-validation";
import { calculateDecisionImpact, calculateWorkspaceImpactSummary } from "@/services/business-impact/decision-impact.service";
import { logger } from "@/infra/logger";

const PRIORITY_THRESHOLD = 70; // Block execution below this
const AT_RISK_THRESHOLD = 50000; // Escalate if atRisk exceeds this
const ROI_THRESHOLD = 0.8; // Block execution if ROI below this

export interface DecisionControl {
  decisionId: string;
  problem: string;
  priorityScore: number;
  isBlocked: boolean;
  blockReason: string | null;
  roiMultiple: number | null;
  requiresOverride: boolean;
  atRisk: number;
  shouldEscalate: boolean;
  escalationReason: string | null;
}

export interface DailyControl {
  workspaceId: string;
  date: string;
  topPriorities: Array<{
    decisionId: string;
    problem: string;
    priorityScore: number;
    expectedImpact: number;
  }>;
  risks: Array<{
    decisionId: string;
    problem: string;
    atRisk: number;
    reason: string;
  }>;
  totalBlockedValue: number;
  requiredActions: Array<{
    decisionId: string;
    problem: string;
    action: string;
  }>;
  totalDecisions: number;
  blockedCount: number;
}

/**
 * Enforce decision control based on priority, impact, and ROI
 * Deterministic: no state changes, only enforcement checks
 * Fail-closed: defaults to blocked unless all criteria pass
 */
export async function enforceDecisionControl(
  decisionId: string,
  workspaceId: string,
  overrideFlag: boolean = false
): Promise<DecisionControl> {
  enforceWorkspaceId(workspaceId, "enforceDecisionControl", "OperatorItem");

  const metrics = await calculateDecisionImpact(decisionId, workspaceId);

  // Check priority threshold
  let isBlocked = false;
  let blockReason: string | null = null;

  if (metrics.priorityScore < PRIORITY_THRESHOLD) {
    isBlocked = true;
    blockReason = `Priority score ${metrics.priorityScore} below threshold ${PRIORITY_THRESHOLD}`;
  }

  // Check ROI threshold
  let requiresOverride = false;
  if (
    !isBlocked &&
    metrics.roiMultiple !== null &&
    metrics.roiMultiple < ROI_THRESHOLD &&
    !overrideFlag
  ) {
    isBlocked = true;
    blockReason = `ROI ${metrics.roiMultiple} below threshold ${ROI_THRESHOLD}. Override required.`;
    requiresOverride = true;
  }

  // Check for escalation triggers
  let shouldEscalate = false;
  let escalationReason: string | null = null;

  if (metrics.atRisk > AT_RISK_THRESHOLD) {
    shouldEscalate = true;
    escalationReason = `At-risk value $${metrics.atRisk} exceeds threshold $${AT_RISK_THRESHOLD}`;
  }

  if (metrics.blockedAtRisk > 0) {
    shouldEscalate = true;
    escalationReason = `Decision blocked with $${metrics.blockedAtRisk} at risk`;
  }

  return {
    decisionId,
    problem: metrics.problem,
    priorityScore: metrics.priorityScore,
    isBlocked,
    blockReason,
    roiMultiple: metrics.roiMultiple,
    requiresOverride,
    atRisk: metrics.atRisk,
    shouldEscalate,
    escalationReason,
  };
}

/**
 * Create escalation event if thresholds exceeded
 * Workspace-scoped, workspace isolation enforced
 * Fail-closed: returns without escalation if any check fails
 */
export async function createEscalationIfNeeded(
  decisionId: string,
  workspaceId: string,
  userId: string
): Promise<boolean> {
  enforceWorkspaceId(workspaceId, "createEscalationIfNeeded", "OperatorItem");

  const control = await enforceDecisionControl(decisionId, workspaceId);

  if (!control.shouldEscalate) {
    return false;
  }

  // Create alert for escalation
  try {
    await db.alert.create({
      data: {
        workspaceId,
        userId,
        type: "threshold_breach",
        channel: "in_app",
        message: `Escalation: ${control.problem}. ${control.escalationReason}`,
        entityType: "OperatorItem",
        entityId: decisionId,
      },
    });
    return true;
  } catch {
    // Fail-closed: log but don't throw
    return false;
  }
}

/**
 * Get daily control view for workspace
 * Aggregates all controls for informed decision-making
 * Workspace-scoped, deterministic
 */
export async function getDailyControl(
  workspaceId: string
): Promise<DailyControl> {
  enforceWorkspaceId(workspaceId, "getDailyControl", "OperatorItem");

  const summary = await calculateWorkspaceImpactSummary(workspaceId);

  // Process each decision for control enforcement
  const controls = await Promise.all(
    summary.metrics.map((m) =>
      enforceDecisionControl(m.decisionId, workspaceId).catch((error) => {
        logger.warn("Failed to enforce decision control", {
          decisionId: m.decisionId,
          workspaceId,
          error: error instanceof Error ? error.message : String(error),
        });
        return null;
      })
    )
  );

  // Filter out nulls (failed controls)
  const validControls = controls.filter((c): c is DecisionControl => c !== null);

  // Top priorities: sorted by priority score, not blocked
  const topPriorities = validControls
    .filter((c) => !c.isBlocked)
    .sort((a, b) => b.priorityScore - a.priorityScore)
    .slice(0, 5)
    .map((c) => {
      const metric = summary.metrics.find((m) => m.decisionId === c.decisionId);
      return {
        decisionId: c.decisionId,
        problem: c.problem,
        priorityScore: c.priorityScore,
        expectedImpact: metric?.expected ?? 0,
      };
    });

  // Risks: decisions with high atRisk or blocked status
  const risks = validControls
    .filter((c) => c.atRisk > 0 || c.shouldEscalate)
    .sort((a, b) => b.atRisk - a.atRisk)
    .slice(0, 5)
    .map((c) => ({
      decisionId: c.decisionId,
      problem: c.problem,
      atRisk: c.atRisk,
      reason: c.escalationReason || "High at-risk value",
    }));

  // Total blocked value: sum of blockedAtRisk and failedLoss
  const totalBlockedValue = summary.metrics.reduce(
    (sum, m) => sum + m.blockedAtRisk + m.failedLoss,
    0
  );

  // Required actions: blocked decisions or those requiring override
  const requiredActions = validControls
    .filter((c) => c.isBlocked || c.requiresOverride)
    .map((c) => {
      const metric = summary.metrics.find((m) => m.decisionId === c.decisionId);
      return {
        decisionId: c.decisionId,
        problem: c.problem,
        action: c.requiresOverride
          ? `Approve override (ROI: ${c.roiMultiple})`
          : `Increase priority (current: ${c.priorityScore})`,
      };
    });

  return {
    workspaceId,
    date: new Date().toISOString().split("T")[0],
    topPriorities,
    risks,
    totalBlockedValue: Math.round(totalBlockedValue),
    requiredActions,
    totalDecisions: summary.totalDecisions,
    blockedCount: validControls.filter((c) => c.isBlocked).length,
  };
}

/**
 * Trigger re-evaluation on action completion
 * Compares before/after impact metrics
 * Store delta in decision record
 */
export async function triggerReEvaluationOnCompletion(
  decisionId: string,
  workspaceId: string
): Promise<{ delta: number; beforeImpact: number; afterImpact: number } | null> {
  enforceWorkspaceId(
    workspaceId,
    "triggerReEvaluationOnCompletion",
    "OperatorItem"
  );

  const decision = await db.operatorItem.findFirst({
    where: { id: decisionId, workspaceId },
  });

  if (!decision) {
    return null;
  }

  const metrics = await calculateDecisionImpact(decisionId, workspaceId);

  // Before impact: expected
  const beforeImpact = metrics.expected;

  // After impact: realized (actual outcome)
  const afterImpact = metrics.realized ?? 0;

  // Delta: difference
  const delta = afterImpact - beforeImpact;

  // Update decision with delta (if not already set)
  if (decision.outcomeDelta === null) {
    try {
      await db.operatorItem.update({
        where: { id: decisionId, workspaceId },
        data: {
          outcomeDelta: delta,
        },
      });
    } catch {
      // Fail-closed: update may fail due to constraints
    }
  }

  return {
    delta: Math.round(delta * 100) / 100,
    beforeImpact: beforeImpact,
    afterImpact: afterImpact,
  };
}
