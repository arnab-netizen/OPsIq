import { db } from "@/lib/db";
import { NotFoundError } from "@/infra/errors";
import { generateBusinessImpact, type BusinessImpactResult } from "./business-impact.service";
import { detectExecutionDrift } from "@/services/execution-drift/execution-drift.service";
import { calculateExecutionCertainty } from "@/services/execution-certainty";

export interface ImpactDeltaScenario {
  impactLevel: "low" | "medium" | "high" | "critical" | "existential";
  estimatedLoss: number | null;
  recoveryProbability: "low" | "medium" | "high";
  recoveryTimeline: number | null;
}

export interface CompletionScenario extends ImpactDeltaScenario {
  estimatedLossReduction: number | null; // Reduction in dollars
  recoveryImprovement: string; // e.g., "low → medium" or "medium → high"
  timeSavedDays: number | null;
}

export interface DelayScenario extends ImpactDeltaScenario {
  additionalLoss: number | null;
  delayPenaltyDays: number;
}

export interface IgnoredScenario extends ImpactDeltaScenario {
  projectedFailureDays: number | null;
  lossEscalation: number | null;
}

export interface ImpactDeltaResult {
  actionId: string;
  actionTitle: string;
  engagementId: string;
  current: ImpactDeltaScenario;
  ifCompleted: CompletionScenario;
  ifDelayed: DelayScenario;
  ifIgnored: IgnoredScenario;
}

// Impact level progression for severity reduction
const severityProgression = ["low", "medium", "high", "critical", "existential"];

function reduceSeverity(
  level: "low" | "medium" | "high" | "critical" | "existential"
): "low" | "medium" | "high" | "critical" | "existential" {
  const currentIndex = severityProgression.indexOf(level);
  if (currentIndex === 0) return "low";
  return severityProgression[currentIndex - 1] as any;
}

function increaseSeverity(
  level: "low" | "medium" | "high" | "critical" | "existential"
): "low" | "medium" | "high" | "critical" | "existential" {
  const currentIndex = severityProgression.indexOf(level);
  if (currentIndex === severityProgression.length - 1) return "existential";
  return severityProgression[currentIndex + 1] as any;
}

function improveProbability(
  prob: "low" | "medium" | "high"
): "low" | "medium" | "high" {
  if (prob === "low") return "medium";
  if (prob === "medium") return "high";
  return "high";
}

function worseProbability(
  prob: "low" | "medium" | "high"
): "low" | "medium" | "high" {
  if (prob === "high") return "medium";
  if (prob === "medium") return "low";
  return "low";
}

export async function calculateImpactDelta(
  engagementId: string,
  actionId: string,
  actorId: string,
  workspaceId: string
): Promise<ImpactDeltaResult> {
  // Fetch action and engagement
  const [action, engagement, currentBusinessImpact] = await Promise.all([
    db.action.findUnique({
      where: { id: actionId, workspaceId },
      include: { engagement: true },
    }),
    db.engagement.findUnique({
      where: { id: engagementId, workspaceId },
    }),
    generateBusinessImpact(engagementId, actorId),
  ]);

  if (!action) {
    throw new NotFoundError("Action", actionId);
  }

  if (!action.engagement || action.engagement.workspaceId !== workspaceId) {
    throw new NotFoundError("Action", actionId);
  }

  if (!engagement) {
    throw new NotFoundError("Engagement", engagementId);
  }

  // Determine priority weight for loss reduction
  const priorityWeights: Record<string, number> = {
    critical: 0.4, // 40% loss reduction
    high: 0.3, // 30% loss reduction
    medium: 0.2, // 20% loss reduction
    low: 0.1, // 10% loss reduction
  };

  const lossReductionPercent = priorityWeights[action.priority] || 0.2;

  // Build current scenario
  const current: ImpactDeltaScenario = {
    impactLevel: currentBusinessImpact.impactLevel,
    estimatedLoss: currentBusinessImpact.estimatedLoss,
    recoveryProbability: currentBusinessImpact.recoveryImpact.recoveryProbability,
    recoveryTimeline: currentBusinessImpact.recoveryImpact.recoveryTimeline,
  };

  // IF COMPLETED: Reduce severity and loss
  const completedSeverity = reduceSeverity(currentBusinessImpact.impactLevel);
  const completedLoss =
    currentBusinessImpact.estimatedLoss !== null
      ? Math.round(currentBusinessImpact.estimatedLoss * (1 - lossReductionPercent))
      : null;
  const completedLossReduction =
    currentBusinessImpact.estimatedLoss !== null && completedLoss !== null
      ? currentBusinessImpact.estimatedLoss - completedLoss
      : null;
  const completedRecoveryTimeline =
    currentBusinessImpact.recoveryImpact.recoveryTimeline !== null
      ? Math.round(currentBusinessImpact.recoveryImpact.recoveryTimeline * 0.7) // 30% faster
      : null;

  const ifCompleted: CompletionScenario = {
    impactLevel: completedSeverity,
    estimatedLoss: completedLoss,
    recoveryProbability: improveProbability(
      currentBusinessImpact.recoveryImpact.recoveryProbability
    ),
    recoveryTimeline: completedRecoveryTimeline,
    estimatedLossReduction: completedLossReduction,
    recoveryImprovement: `${current.recoveryProbability} → ${improveProbability(current.recoveryProbability)}`,
    timeSavedDays: currentBusinessImpact.recoveryImpact.recoveryTimeline
      ? Math.round(currentBusinessImpact.recoveryImpact.recoveryTimeline * 0.3)
      : null,
  };

  // IF DELAYED: Determine delay duration and penalty
  const now = new Date();
  const daysOverdue = action.dueDate
    ? Math.max(0, Math.ceil((now.getTime() - action.dueDate.getTime()) / (1000 * 60 * 60 * 24)))
    : 0;
  const delayPenaltyDays = Math.min(daysOverdue + 7, 30); // Additional 7 days delay + current overdue

  const delayedLoss =
    currentBusinessImpact.estimatedLoss !== null
      ? Math.round(
          currentBusinessImpact.estimatedLoss * (1 + delayPenaltyDays / 30) // Loss increases 1% per day delayed
        )
      : null;
  const additionalLoss =
    currentBusinessImpact.estimatedLoss !== null && delayedLoss !== null
      ? delayedLoss - currentBusinessImpact.estimatedLoss
      : null;

  const ifDelayed: DelayScenario = {
    impactLevel:
      delayPenaltyDays > 20
        ? increaseSeverity(currentBusinessImpact.impactLevel)
        : currentBusinessImpact.impactLevel,
    estimatedLoss: delayedLoss,
    recoveryProbability:
      delayPenaltyDays > 14
        ? worseProbability(currentBusinessImpact.recoveryImpact.recoveryProbability)
        : currentBusinessImpact.recoveryImpact.recoveryProbability,
    recoveryTimeline: currentBusinessImpact.recoveryImpact.recoveryTimeline
      ? Math.round(currentBusinessImpact.recoveryImpact.recoveryTimeline * 1.5)
      : null,
    additionalLoss,
    delayPenaltyDays,
  };

  // IF IGNORED: Worst-case scenario
  const ignoredSeverity = increaseSeverity(increaseSeverity(currentBusinessImpact.impactLevel));
  const ignoredLoss =
    currentBusinessImpact.estimatedLoss !== null
      ? Math.round(currentBusinessImpact.estimatedLoss * 2.5) // 2.5x escalation
      : null;
  const ignoredRecoveryTimeline =
    currentBusinessImpact.recoveryImpact.recoveryTimeline !== null
      ? Math.round(currentBusinessImpact.recoveryImpact.recoveryTimeline * 2)
      : null;

  // Projected failure based on timeline to failure
  const projectedFailureDays = currentBusinessImpact.timeImpact.timelineToFailure
    ? Math.max(1, currentBusinessImpact.timeImpact.timelineToFailure - 14) // 2 weeks until critical
    : null;

  const ifIgnored: IgnoredScenario = {
    impactLevel: ignoredSeverity,
    estimatedLoss: ignoredLoss,
    recoveryProbability: "low",
    recoveryTimeline: ignoredRecoveryTimeline,
    projectedFailureDays,
    lossEscalation:
      currentBusinessImpact.estimatedLoss !== null && ignoredLoss !== null
        ? ignoredLoss - currentBusinessImpact.estimatedLoss
        : null,
  };

  return {
    actionId,
    actionTitle: action.title,
    engagementId,
    current,
    ifCompleted,
    ifDelayed,
    ifIgnored,
  };
}
