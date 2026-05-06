/**
 * Human Factors Engine
 *
 * Integrates all human factors assessment (bottleneck detection, follow-through risk,
 * and other human variables) into comprehensive reality-aware decision profiles.
 *
 * This engine evaluates the "human execution reality" dimension of OpsIQ decisions,
 * ensuring intervention recommendations account for actual human constraints and risks.
 */

import {
  HumanFactorAssessment,
  HumanFactorProfile,
  HumanExecutionContext,
  HUMAN_FACTORS,
  HumanFactorKey,
  HUMAN_FACTOR_LABELS,
  HUMAN_FACTOR_DESCRIPTIONS,
  calculateHumanRiskScore,
  identifyCriticalFactors,
  validateHumanFactorProfile,
  prioritizeFactorsForIntervention,
  SeverityLevel,
  SEVERITY_SCORES,
} from "@/domain/reality/human-factors-model";

import {
  BottleneckContext,
  assessBottleneckRisk,
  estimateExecutionDelay as estimateBottleneckDelay,
  detectBottlenecks,
} from "./bottleneck-detector";

import {
  FollowThroughContext,
  assessFollowThroughRisk,
  estimateFollowThroughDelay,
  detectFollowThroughRisks,
} from "./follow-through-risk";

export interface HumanFactorsAssessmentRequest {
  workspaceId: string;
  engagementId: string;
  context: HumanExecutionContext;
  bottleneckContext?: BottleneckContext;
  followThroughContext?: FollowThroughContext;
}

export interface HumanFactorsAssessmentResult {
  profile: HumanFactorProfile;
  estimatedExecutionDelay: number; // days
  recommendations: string[];
  interventionPlans: Map<HumanFactorKey, string[]>;
  successProbability: number; // 0-1
}

export interface HumanRealityImpact {
  delayDays: number;
  riskFactor: number; // 1-3x multiplier on base risk
  successProbabilityAdjustment: number; // -0.3 to 0
  requiredInterventions: HumanFactorKey[];
}

/**
 * Assess human factors for engagement decision
 */
export function assessHumanFactors(
  request: HumanFactorsAssessmentRequest
): HumanFactorsAssessmentResult {
  const factors: Record<HumanFactorKey, HumanFactorAssessment> = {} as Record<
    HumanFactorKey,
    HumanFactorAssessment
  >;

  // Assess owner bottleneck
  const bottleneckContext: BottleneckContext = request.bottleneckContext || {
    workspaceId: request.workspaceId,
    engagementId: request.engagementId,
    ownerId: request.context.ownerId,
    ownerAvailabilityPercent: Math.max(0, Math.min(100, request.context.ownerAvailability)),
    recentDecisionApprovalTimes: [5, 7, 4, 6], // Default historical data
    organizationSize: Math.max(1, request.context.teamSize + 5),
    executionComplexity: "moderate",
    seasonalVariation: [],
    delegationCapability: false,
  };

  factors.owner_bottleneck = assessBottleneckRisk(bottleneckContext);

  // Assess follow-through risk
  const followThroughContext: FollowThroughContext =
    request.followThroughContext || {
      workspaceId: request.workspaceId,
      engagementId: request.engagementId,
      pastInitiativeOutcomes: [],
      teamSize: Math.max(1, request.context.teamSize),
      teamExperienceLevel: "mixed",
      currentWorkloadPercent: Math.max(0, Math.min(100, 75)),
      managerAttentionLevel: "medium",
      organizationalChangeFrequency: "occasional",
    };

  factors.follow_through_risk = assessFollowThroughRisk(followThroughContext);

  // Assess other human factors based on context
  factors.resistance_to_change = assessResistanceToChange(request.context);
  factors.communication_breakdown = assessCommunicationBreakdown(
    request.context
  );
  factors.morale_fragility = assessMoraleFragility(request.context);
  factors.management_capability = assessManagementCapability(request.context);
  factors.key_person_dependency = assessKeyPersonDependency(request.context);
  factors.accountability_weakness = assessAccountabilityWeakness(
    request.context
  );

  // Build profile
  const profile: HumanFactorProfile = {
    workspaceId: request.workspaceId,
    engagementId: request.engagementId,
    assessedAt: new Date(),
    factors,
    overallRiskScore: calculateHumanRiskScore(factors),
    criticalFactors: identifyCriticalFactors(factors),
    timeToMitigation: estimateTimeToMitigation(factors),
  };

  // Validate profile
  const validation = validateHumanFactorProfile(profile);
  if (!validation.valid) {
    throw new Error(`Invalid human factors profile: ${validation.errors.join(", ")}`);
  }

  // Get delay indicators from contexts
  const bottleneckIndicators = detectBottlenecks(bottleneckContext);
  const followThroughIndicators = detectFollowThroughRisks(followThroughContext);

  // Calculate execution delay
  const estimatedDelay =
    estimateBottleneckDelay(bottleneckIndicators) +
    estimateFollowThroughDelay(followThroughIndicators);

  // Generate recommendations
  const recommendations = generateRecommendations(profile);

  // Generate intervention plans
  const interventionPlans = generateInterventionPlans(profile);

  // Calculate success probability
  const successProbability = calculateSuccessProbability(profile);

  return {
    profile,
    estimatedExecutionDelay: estimatedDelay,
    recommendations,
    interventionPlans,
    successProbability,
  };
}

/**
 * Assess resistance to change
 */
function assessResistanceToChange(
  context: HumanExecutionContext
): HumanFactorAssessment {
  // Base assessment from organizational maturity
  const maturityRiskMap: Record<string, SeverityLevel> = {
    startup: "LOW",
    growth: "MODERATE",
    established: "MODERATE",
    complex: "HIGH",
  };

  const severity: SeverityLevel = maturityRiskMap[context.organizationalMaturity] || "MODERATE";

  const evidencePoints: string[] = [];
  if (context.recentlyFailedInitiatives && context.recentlyFailedInitiatives.length > 0) {
    evidencePoints.push(
      `${context.recentlyFailedInitiatives.length} recent failed initiatives lower change appetite`
    );
  }

  evidencePoints.push(
    `Organization maturity level: ${context.organizationalMaturity}`
  );

  return {
    factor: "resistance_to_change",
    severity,
    evidencePoints,
    interventionNeeded: severity !== "LOW" && severity !== "NONE",
    targetState:
      severity === "HIGH"
        ? "Change champions identified; communication plan in place"
        : "Clear benefits communicated; stakeholder concerns addressed",
  };
}

/**
 * Assess communication breakdown risk
 */
function assessCommunicationBreakdown(
  context: HumanExecutionContext
): HumanFactorAssessment {
  const communicationQualityMap: Record<string, SeverityLevel> = {
    poor: "CRITICAL",
    fair: "MODERATE",
    good: "LOW",
    excellent: "NONE",
  };

  const severity = communicationQualityMap[context.communicationQuality] || "MODERATE";

  const evidence = [
    `Communication quality: ${context.communicationQuality}`,
    `Team size: ${context.teamSize} people (${context.teamSize > 10 ? "communication overhead" : "manageable"})`,
  ];

  return {
    factor: "communication_breakdown",
    severity,
    evidencePoints: evidence,
    interventionNeeded: severity !== "LOW" && severity !== "NONE",
    targetState:
      severity === "CRITICAL"
        ? "Daily stand-ups; clear escalation paths; written decisions"
        : "Weekly syncs; clear decision communication",
  };
}

/**
 * Assess morale fragility
 */
function assessMoraleFragility(
  context: HumanExecutionContext
): HumanFactorAssessment {
  const moraleMap: Record<string, SeverityLevel> = {
    low: "HIGH",
    recovering: "MODERATE",
    stable: "LOW",
    high: "NONE",
  };

  const severity = moraleMap[context.teamMorale] || "MODERATE";

  const evidence = [
    `Team morale: ${context.teamMorale}`,
    context.teamMorale === "low"
      ? "Risk of disengagement during implementation"
      : "Team commitment is stable",
  ];

  return {
    factor: "morale_fragility",
    severity,
    evidencePoints: evidence,
    interventionNeeded: severity !== "LOW" && severity !== "NONE",
    targetState:
      severity === "HIGH"
        ? "Manager 1:1s; clear success metrics; celebration milestones"
        : "Regular feedback; recognition programs",
  };
}

/**
 * Assess management capability
 */
function assessManagementCapability(
  context: HumanExecutionContext
): HumanFactorAssessment {
  // Infer from organizational maturity and team morale
  const maturityMap: Record<string, SeverityLevel> = {
    startup: "MODERATE",
    growth: "MODERATE",
    established: "LOW",
    complex: "HIGH",
  };

  let severity = maturityMap[context.organizationalMaturity] || "MODERATE";

  // Morale reflects management capability
  if (context.teamMorale === "low") {
    severity = "HIGH";
  } else if (context.teamMorale === "high") {
    severity = "LOW";
  }

  const evidence = [
    `Organizational maturity: ${context.organizationalMaturity}`,
    `Team morale: ${context.teamMorale}`,
  ];

  return {
    factor: "management_capability",
    severity,
    evidencePoints: evidence,
    interventionNeeded: severity !== "LOW" && severity !== "NONE",
    targetState:
      severity === "HIGH"
        ? "Management coaching; clear execution frameworks"
        : "Existing management structure sufficient",
  };
}

/**
 * Assess key-person dependency
 */
function assessKeyPersonDependency(
  context: HumanExecutionContext
): HumanFactorAssessment {
  const dependencyRatio = context.keyPersonCount / Math.max(1, context.teamSize);
  let severity: SeverityLevel = "NONE";

  if (dependencyRatio > 0.5) severity = "HIGH";
  else if (dependencyRatio > 0.25) severity = "MODERATE";
  else if (dependencyRatio > 0.1) severity = "LOW";

  const evidence = [
    `${context.keyPersonCount} key people out of ${context.teamSize} total (${Math.round(dependencyRatio * 100)}% dependency)`,
  ];

  if (dependencyRatio > 0.3) {
    evidence.push("High concentration of critical knowledge");
  }

  return {
    factor: "key_person_dependency",
    severity,
    evidencePoints: evidence,
    interventionNeeded: severity !== "LOW" && severity !== "NONE",
    targetState:
      severity === "HIGH"
        ? "Knowledge transfer plan; cross-training initiated"
        : "Documentation of critical processes in progress",
  };
}

/**
 * Assess accountability weakness
 */
function assessAccountabilityWeakness(
  context: HumanExecutionContext
): HumanFactorAssessment {
  const accountabilityMap: Record<string, SeverityLevel> = {
    weak: "HIGH",
    developing: "MODERATE",
    clear: "LOW",
    rigorous: "NONE",
  };

  const severity = accountabilityMap[context.accountabilityFramework] || "MODERATE";

  const evidence = [
    `Accountability framework: ${context.accountabilityFramework}`,
  ];

  return {
    factor: "accountability_weakness",
    severity,
    evidencePoints: evidence,
    interventionNeeded: severity !== "LOW" && severity !== "NONE",
    targetState:
      severity === "HIGH"
        ? "Clear owner assignment; weekly outcome tracking; consequence clarity"
        : "Standard accountability processes in place",
  };
}

/**
 * Estimate time to mitigate each factor
 */
function estimateTimeToMitigation(
  factors: Record<HumanFactorKey, HumanFactorAssessment>
): HumanFactorProfile["timeToMitigation"] {
  const timingMap: Record<SeverityLevel, Record<HumanFactorKey, number>> = {
    NONE: {
      owner_bottleneck: 0,
      follow_through_risk: 0,
      resistance_to_change: 0,
      communication_breakdown: 0,
      morale_fragility: 0,
      management_capability: 0,
      key_person_dependency: 0,
      accountability_weakness: 0,
    },
    LOW: {
      owner_bottleneck: 3,
      follow_through_risk: 3,
      resistance_to_change: 5,
      communication_breakdown: 2,
      morale_fragility: 7,
      management_capability: 5,
      key_person_dependency: 10,
      accountability_weakness: 3,
    },
    MODERATE: {
      owner_bottleneck: 7,
      follow_through_risk: 7,
      resistance_to_change: 14,
      communication_breakdown: 5,
      morale_fragility: 14,
      management_capability: 10,
      key_person_dependency: 21,
      accountability_weakness: 7,
    },
    HIGH: {
      owner_bottleneck: 14,
      follow_through_risk: 14,
      resistance_to_change: 28,
      communication_breakdown: 10,
      morale_fragility: 28,
      management_capability: 21,
      key_person_dependency: 35,
      accountability_weakness: 14,
    },
    CRITICAL: {
      owner_bottleneck: 28,
      follow_through_risk: 28,
      resistance_to_change: 56,
      communication_breakdown: 21,
      morale_fragility: 56,
      management_capability: 42,
      key_person_dependency: 70,
      accountability_weakness: 28,
    },
  };

  const mitigation = {} as HumanFactorProfile["timeToMitigation"];

  Object.entries(factors).forEach(([key, assessment]) => {
    const factor = key as HumanFactorKey;
    const times = timingMap[assessment.severity as keyof typeof timingMap] || timingMap.MODERATE;
    mitigation[factor] = times[factor];
  });

  return mitigation;
}

/**
 * Generate recommendations based on human factors profile
 */
function generateRecommendations(profile: HumanFactorProfile): string[] {
  const recommendations: string[] = [];

  if (profile.criticalFactors.length > 0) {
    recommendations.push(
      `CRITICAL: Address ${profile.criticalFactors.length} critical human factor(s) before execution: ${profile.criticalFactors.map((f) => HUMAN_FACTOR_LABELS[f]).join(", ")}`
    );
  }

  if (profile.overallRiskScore > 75) {
    recommendations.push(
      "Overall human execution risk is very high. Consider delay to mitigate factors."
    );
  } else if (profile.overallRiskScore > 50) {
    recommendations.push(
      "Moderate human execution risks identified. Implement targeted interventions."
    );
  }

  // Specific recommendations
  const interventionFactors = prioritizeFactorsForIntervention(
    profile.factors,
    profile.timeToMitigation
  );

  if (interventionFactors.length > 0) {
    recommendations.push(
      `Prioritize mitigation of: ${interventionFactors.slice(0, 3).map((f) => HUMAN_FACTOR_LABELS[f]).join(", ")}`
    );
  }

  return recommendations;
}

/**
 * Generate intervention plans for each factor
 */
function generateInterventionPlans(
  profile: HumanFactorProfile
): Map<HumanFactorKey, string[]> {
  const plans = new Map<HumanFactorKey, string[]>();

  Object.entries(profile.factors).forEach(([key, assessment]) => {
    const factor = key as HumanFactorKey;
    const planSteps: string[] = [];

    if (assessment.interventionNeeded && assessment.targetState) {
      planSteps.push(`Target state: ${assessment.targetState}`);

      // Add generic intervention steps based on factor type
      switch (factor) {
        case "owner_bottleneck":
          planSteps.push("Identify decision bottleneck causes");
          planSteps.push("Establish deputy or decision delegate");
          planSteps.push("Set SLA for decision cycle time");
          break;
        case "follow_through_risk":
          planSteps.push("Increase execution oversight frequency");
          planSteps.push("Define clear completion criteria");
          planSteps.push("Add weekly progress tracking");
          break;
        case "resistance_to_change":
          planSteps.push("Identify change resistors");
          planSteps.push("Develop stakeholder communication plan");
          planSteps.push("Assign change champions");
          break;
        case "communication_breakdown":
          planSteps.push("Establish communication cadence");
          planSteps.push("Define decision communication protocol");
          planSteps.push("Create shared decision record");
          break;
        case "morale_fragility":
          planSteps.push("Assess team engagement");
          planSteps.push("Schedule manager 1:1s");
          planSteps.push("Define small success milestones");
          break;
        case "management_capability":
          planSteps.push("Identify capability gaps");
          planSteps.push("Provide management coaching/training");
          planSteps.push("Establish execution framework");
          break;
        case "key_person_dependency":
          planSteps.push("Document critical processes");
          planSteps.push("Cross-train backup person");
          planSteps.push("Create knowledge transfer plan");
          break;
        case "accountability_weakness":
          planSteps.push("Assign clear decision owners");
          planSteps.push("Define success metrics");
          planSteps.push("Set up outcome tracking");
          break;
      }
    }

    plans.set(factor, planSteps);
  });

  return plans;
}

/**
 * Calculate success probability adjusted for human factors
 */
function calculateSuccessProbability(profile: HumanFactorProfile): number {
  // Start with base probability
  let probability = 0.85; // 85% base success

  // Adjust for each critical factor
  Object.values(profile.factors).forEach((assessment) => {
    const severityAdjustment: Record<SeverityLevel, number> = {
      NONE: 0,
      LOW: 0.05,
      MODERATE: 0.1,
      HIGH: 0.2,
      CRITICAL: 0.35,
    };

    probability -= severityAdjustment[assessment.severity];
  });

  return Math.max(0.1, Math.min(1, probability));
}

/**
 * Get human execution reality impact for decision
 */
export function getHumanRealityImpact(
  profile: HumanFactorProfile
): HumanRealityImpact {
  const requiredInterventions = prioritizeFactorsForIntervention(
    profile.factors,
    profile.timeToMitigation
  );

  // Estimate delay from all factors
  let delayDays = 0;
  Object.values(profile.factors).forEach((assessment) => {
    if (assessment.severity === "CRITICAL") delayDays += 14;
    else if (assessment.severity === "HIGH") delayDays += 7;
    else if (assessment.severity === "MODERATE") delayDays += 3;
  });

  // Calculate risk multiplier
  const riskFactor = 1 + profile.overallRiskScore / 100;

  // Calculate success probability adjustment
  const successAdjustment =
    -(profile.overallRiskScore / 100) * 0.3; // Up to -30%

  return {
    delayDays,
    riskFactor,
    successProbabilityAdjustment: successAdjustment,
    requiredInterventions,
  };
}
