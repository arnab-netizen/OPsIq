/**
 * Bottleneck Detector Service
 *
 * Identifies owner bottlenecks and key-person dependencies that will delay execution.
 * Analyzes decision approval patterns, involvement frequency, and concentration risk.
 */

import { HumanFactorAssessment, SeverityLevel, SEVERITY_LEVELS } from "@/domain/reality/human-factors-model";

export interface BottleneckIndicators {
  ownerApprovalDelayDays: number; // Historical average for approval decisions
  ownerInvolvementFrequency: number; // Percentage of decisions owner is directly involved in
  criticalPathDependency: boolean; // Is owner on critical path?
  decisionCycleTime: number; // Days from decision creation to approval
  parallelApprovalCapacity: number; // How many decisions can owner process in parallel?
  knowledgeConcentration: number; // 0-1, how concentrated is critical knowledge?
  keyPersonCount: number; // How many people are critical to execution?
  busySeasonRisk: boolean; // Will execution timing coincide with owner's busy season?
}

export interface BottleneckContext {
  workspaceId: string;
  engagementId: string;
  ownerId: string;
  ownerAvailabilityPercent: number; // 0-100
  recentDecisionApprovalTimes: number[]; // days
  organizationSize: number;
  executionComplexity: "simple" | "moderate" | "complex" | "critical";
  seasonalVariation: string[]; // Names of seasonal busy periods
  delegationCapability: boolean; // Can owner delegate approval?
}

/**
 * Detect owner bottleneck indicators
 */
export function detectBottlenecks(
  context: BottleneckContext
): BottleneckIndicators {
  // Validate context
  const orgSize = Math.max(1, context.organizationSize || 1);
  const availability = Math.max(0, Math.min(100, context.ownerAvailabilityPercent || 50));

  const avgApprovalTime =
    context.recentDecisionApprovalTimes.length > 0
      ? context.recentDecisionApprovalTimes.reduce((a, b) => a + b, 0) /
        context.recentDecisionApprovalTimes.length
      : 5;

  const ownerInvolvementFrequency = Math.min(
    (100 / orgSize) * 3,
    100
  );

  const complexityMultiplier: Record<string, number> = {
    simple: 1,
    moderate: 1.5,
    complex: 2.5,
    critical: 4,
  };

  const availabilityFactor = 1 + (100 - availability) / 50;

  return {
    ownerApprovalDelayDays: Math.ceil(avgApprovalTime * availabilityFactor),
    ownerInvolvementFrequency: Math.round(ownerInvolvementFrequency),
    criticalPathDependency:
      context.executionComplexity === "critical" ||
      context.executionComplexity === "complex",
    decisionCycleTime: Math.ceil(
      avgApprovalTime * complexityMultiplier[context.executionComplexity]
    ),
    parallelApprovalCapacity: Math.max(
      1,
      Math.floor(5 * (availability / 100))
    ),
    knowledgeConcentration: Math.min(
      1,
      (ownerInvolvementFrequency / 100) * 1.5
    ),
    keyPersonCount: Math.max(
      1,
      Math.ceil(
        orgSize * 0.2 * (100 - availability) / 50
      )
    ),
    busySeasonRisk: context.seasonalVariation.length > 0,
  };
}

/**
 * Calculate severity of owner bottleneck
 */
export function calculateBottleneckSeverity(
  indicators: BottleneckIndicators
): SeverityLevel {
  let score = 0;

  // Approval delay factor (0-3 points)
  if (indicators.ownerApprovalDelayDays > 14) score += 3;
  else if (indicators.ownerApprovalDelayDays > 7) score += 2;
  else if (indicators.ownerApprovalDelayDays > 3) score += 1;

  // Involvement frequency factor (0-2 points)
  if (indicators.ownerInvolvementFrequency > 80) score += 2;
  else if (indicators.ownerInvolvementFrequency > 50) score += 1;

  // Critical path dependency (0-2 points)
  if (indicators.criticalPathDependency) score += 2;

  // Knowledge concentration (0-2 points)
  if (indicators.knowledgeConcentration > 0.7) score += 2;
  else if (indicators.knowledgeConcentration > 0.4) score += 1;

  // Parallel capacity (0-1 point)
  if (indicators.parallelApprovalCapacity < 2) score += 1;

  // Busy season risk (0-1 point)
  if (indicators.busySeasonRisk) score += 1;

  if (score >= 8) return "CRITICAL";
  if (score >= 6) return "HIGH";
  if (score >= 4) return "MODERATE";
  if (score >= 1) return "LOW";
  return "NONE";
}

/**
 * Generate evidence points for bottleneck severity
 */
export function generateBottleneckEvidence(
  indicators: BottleneckIndicators,
  severity: SeverityLevel
): string[] {
  const evidence: string[] = [];

  if (indicators.ownerApprovalDelayDays > 7) {
    evidence.push(
      `Average approval delay: ${indicators.ownerApprovalDelayDays} days`
    );
  }

  if (indicators.ownerInvolvementFrequency > 50) {
    evidence.push(
      `Owner involved in ${indicators.ownerInvolvementFrequency}% of decisions`
    );
  }

  if (indicators.criticalPathDependency) {
    evidence.push("Owner is on critical path for execution");
  }

  if (indicators.decisionCycleTime > 10) {
    evidence.push(
      `Decision cycle time: ${indicators.decisionCycleTime} days (above acceptable threshold)`
    );
  }

  if (indicators.parallelApprovalCapacity < 3) {
    evidence.push(
      `Owner can only process ${indicators.parallelApprovalCapacity} decisions in parallel`
    );
  }

  if (indicators.knowledgeConcentration > 0.6) {
    evidence.push(
      `Critical knowledge concentration: ${Math.round(indicators.knowledgeConcentration * 100)}%`
    );
  }

  if (indicators.keyPersonCount > 2) {
    evidence.push(
      `${indicators.keyPersonCount} key people are critical to execution`
    );
  }

  if (indicators.busySeasonRisk) {
    evidence.push("Execution timing coincides with owner's busy season");
  }

  return evidence.length > 0
    ? evidence
    : ["Owner availability and decision cycle times within acceptable parameters"];
}

/**
 * Generate bottleneck assessment
 */
export function assessBottleneckRisk(
  context: BottleneckContext
): HumanFactorAssessment {
  const indicators = detectBottlenecks(context);
  const severity = calculateBottleneckSeverity(indicators);
  const evidencePoints = generateBottleneckEvidence(indicators, severity);

  const interventionNeeded = severity !== "NONE" && severity !== "LOW";

  const targetState =
    severity === "CRITICAL"
      ? "Owner has delegated approval authority; decision cycle < 3 days"
      : severity === "HIGH"
        ? "Owner has a deputy; decision cycle < 5 days"
        : "Owner has clearly defined priorities and communication cadence";

  return {
    factor: "owner_bottleneck",
    severity,
    evidencePoints,
    interventionNeeded,
    targetState: interventionNeeded ? targetState : undefined,
  };
}

/**
 * Estimate delay caused by bottleneck
 */
export function estimateExecutionDelay(
  indicators: BottleneckIndicators
): number {
  let delay = 0;

  // Approval delay
  delay += Math.max(0, Math.ceil(indicators.ownerApprovalDelayDays || 0));

  // Decision cycle overhead
  delay += Math.max(0, Math.ceil((indicators.decisionCycleTime || 0) / 5));

  // Parallel capacity constraint
  if (indicators.parallelApprovalCapacity < 2) {
    delay += 5;
  }

  return Math.max(0, delay);
}
