/**
 * Follow-Through Risk Service
 *
 * Assesses risk of execution slippage: team commits to actions but doesn't deliver,
 * implementation is partial, or delivery is significantly delayed.
 * Analyzes past execution patterns, commitment patterns, and delivery success rates.
 */

import { HumanFactorAssessment, SeverityLevel } from "@/domain/reality/human-factors-model";

export interface FollowThroughIndicators {
  executionCompletionRate: number; // 0-1, percentage of committed work that was completed
  averageDelayDays: number; // How many days late are deliverables on average?
  partialDeliveryRate: number; // 0-1, percentage of deliverables that were partial
  commitmentAccuracy: number; // 0-1, how accurate are scope estimates?
  teamCapacityUtilization: number; // 0-1, are they over-committed?
  changeOrderFrequency: number; // How many scope changes mid-execution?
  regressionRate: number; // 0-1, how often do prior implementations fail?
  communicationQuality: "poor" | "fair" | "good" | "excellent";
  supervisorEngagementLevel: number; // 0-1, how involved is management?
  incentiveAlignment: boolean; // Are personal incentives aligned with completion?
}

export interface FollowThroughContext {
  workspaceId: string;
  engagementId: string;
  pastInitiativeOutcomes: {
    commitmentDate: Date;
    actualCompletionDate: Date;
    scope: string;
    wasPartial: boolean;
    reasonForSlippage?: string;
  }[];
  teamSize: number;
  teamExperienceLevel: "junior" | "mid" | "senior" | "mixed";
  currentWorkloadPercent: number; // 0-100, what % are they at capacity?
  managerAttentionLevel: "low" | "medium" | "high" | "intensive";
  organizationalChangeFrequency: "rare" | "occasional" | "frequent" | "constant";
}

/**
 * Detect follow-through risk indicators
 */
export function detectFollowThroughRisks(
  context: FollowThroughContext
): FollowThroughIndicators {
  // Validate context
  const workloadPercent = Math.max(0, Math.min(100, context.currentWorkloadPercent || 75));

  let completionRate = 0.95; // Start optimistic
  let avgDelay = 0;
  let partialRate = 0;
  let regressions = 0;

  // Analyze historical outcomes
  if (context.pastInitiativeOutcomes.length > 0) {
    const completed = context.pastInitiativeOutcomes.filter(
      (o) => !o.wasPartial
    ).length;
    completionRate = completed / context.pastInitiativeOutcomes.length;

    partialRate =
      context.pastInitiativeOutcomes.filter((o) => o.wasPartial).length /
      context.pastInitiativeOutcomes.length;

    const delays = context.pastInitiativeOutcomes.map((o) => {
      const delayMs =
        o.actualCompletionDate.getTime() - o.commitmentDate.getTime();
      return Math.max(0, delayMs / (1000 * 60 * 60 * 24)); // Convert to days
    });
    avgDelay = delays.reduce((a, b) => a + b, 0) / delays.length;
  }

  // Workload impact
  const overcommitmentFactor = 1 + (workloadPercent - 70) / 100;

  // Change frequency impact
  const changeImpact: Record<string, number> = {
    rare: 0,
    occasional: 0.1,
    frequent: 0.25,
    constant: 0.4,
  };

  const adjustedCompletionRate = Math.max(
    0,
    completionRate *
      (1 - changeImpact[context.organizationalChangeFrequency]) *
      overcommitmentFactor
  );

  const commitmentAccuracy = Math.max(0.3, 1 - (avgDelay || 0) / 30);

  return {
    executionCompletionRate: adjustedCompletionRate,
    averageDelayDays: avgDelay || 0,
    partialDeliveryRate: partialRate,
    commitmentAccuracy,
    teamCapacityUtilization: Math.min(
      1,
      workloadPercent / 100
    ),
    changeOrderFrequency: changeImpact[context.organizationalChangeFrequency] || 0,
    regressionRate: regressions,
    communicationQuality: "fair",
    supervisorEngagementLevel:
      { low: 0.2, medium: 0.5, high: 0.8, intensive: 1.0 }[
        context.managerAttentionLevel
      ] || 0.5,
    incentiveAlignment: context.managerAttentionLevel !== "low",
  };
}

/**
 * Calculate severity of follow-through risk
 */
export function calculateFollowThroughSeverity(
  indicators: FollowThroughIndicators
): SeverityLevel {
  let score = 0;

  // Completion rate factor (0-3 points)
  if (indicators.executionCompletionRate < 0.7) score += 3;
  else if (indicators.executionCompletionRate < 0.85) score += 2;
  else if (indicators.executionCompletionRate < 0.95) score += 1;

  // Delay factor (0-2 points)
  if (indicators.averageDelayDays > 14) score += 2;
  else if (indicators.averageDelayDays > 7) score += 1;

  // Partial delivery rate (0-2 points)
  if (indicators.partialDeliveryRate > 0.3) score += 2;
  else if (indicators.partialDeliveryRate > 0.1) score += 1;

  // Commitment accuracy (0-1 point)
  if (indicators.commitmentAccuracy < 0.6) score += 1;

  // Capacity utilization (0-2 points)
  if (indicators.teamCapacityUtilization > 0.9) score += 2;
  else if (indicators.teamCapacityUtilization > 0.75) score += 1;

  // Change frequency (0-1 point)
  if (indicators.changeOrderFrequency > 0.2) score += 1;

  // Supervisor engagement (0-1 point)
  if (indicators.supervisorEngagementLevel < 0.4) score += 1;

  if (score >= 8) return "CRITICAL";
  if (score >= 6) return "HIGH";
  if (score >= 3) return "MODERATE";
  if (score >= 1) return "LOW";
  return "NONE";
}

/**
 * Generate evidence points for follow-through risk
 */
export function generateFollowThroughEvidence(
  indicators: FollowThroughIndicators,
  severity: SeverityLevel
): string[] {
  const evidence: string[] = [];

  const completionPercent = Math.round(
    indicators.executionCompletionRate * 100
  );
  if (completionPercent < 95) {
    evidence.push(
      `Execution completion rate: ${completionPercent}% (commits vs actual delivery)`
    );
  }

  if (indicators.averageDelayDays > 5) {
    evidence.push(
      `Average delivery delay: ${Math.round(indicators.averageDelayDays)} days`
    );
  }

  const partialPercent = Math.round(indicators.partialDeliveryRate * 100);
  if (partialPercent > 10) {
    evidence.push(
      `Partial deliverables: ${partialPercent}% of work is incomplete at delivery`
    );
  }

  if (indicators.teamCapacityUtilization > 0.8) {
    evidence.push(
      `Team capacity utilization: ${Math.round(indicators.teamCapacityUtilization * 100)}% (over-committed)`
    );
  }

  if (indicators.changeOrderFrequency > 0.15) {
    evidence.push(
      `High change order frequency: ${Math.round(indicators.changeOrderFrequency * 100)}% of initiatives change scope mid-execution`
    );
  }

  if (indicators.supervisorEngagementLevel < 0.5) {
    evidence.push(
      "Low manager engagement and oversight during execution"
    );
  }

  if (indicators.commitmentAccuracy < 0.7) {
    evidence.push(
      "Team estimates are frequently inaccurate; scope slippage is common"
    );
  }

  return evidence.length > 0
    ? evidence
    : ["Team has consistent track record of delivering on commitments"];
}

/**
 * Generate follow-through risk assessment
 */
export function assessFollowThroughRisk(
  context: FollowThroughContext
): HumanFactorAssessment {
  const indicators = detectFollowThroughRisks(context);
  const severity = calculateFollowThroughSeverity(indicators);
  const evidencePoints = generateFollowThroughEvidence(indicators, severity);

  const interventionNeeded = severity !== "NONE" && severity !== "LOW";

  const targetState =
    severity === "CRITICAL"
      ? "Weekly check-ins; clear accountability metrics; daily standups"
      : severity === "HIGH"
        ? "Bi-weekly reviews; accountability owners assigned; progress tracked"
        : "Regular updates; clear responsibilities; execution tracking";

  return {
    factor: "follow_through_risk",
    severity,
    evidencePoints,
    interventionNeeded,
    targetState: interventionNeeded ? targetState : undefined,
  };
}

/**
 * Estimate execution delay due to follow-through risk
 */
export function estimateFollowThroughDelay(
  indicators: FollowThroughIndicators
): number {
  let delay = 0;

  // Base delay from historical average
  delay += Math.max(0, Math.ceil((indicators.averageDelayDays || 0)));

  // Partial delivery rework
  delay += Math.max(0, Math.ceil((indicators.partialDeliveryRate || 0) * 10));

  // Over-capacity impact
  if (indicators.teamCapacityUtilization > 0.85) {
    delay += 5;
  }

  // Change frequency impact
  delay += Math.max(0, Math.ceil((indicators.changeOrderFrequency || 0) * 15));

  // Low supervisor engagement impact
  if (indicators.supervisorEngagementLevel < 0.4) {
    delay += 7;
  }

  return Math.max(0, delay);
}
