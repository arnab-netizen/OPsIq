/**
 * System Truth Contract Foundation
 *
 * Defines the 4 dimensions of business truth that must be assessed
 * before any recommendation can be safely created.
 *
 * Prevents generic, unsafe, or fake-confident advice by requiring
 * explicit modeling of:
 * 1. Consulting Lifecycle Stage
 * 2. Business Condition Profile
 * 3. Intervention Mode & Phase
 * 4. Human Execution Reality
 *
 * Recommendations failing truth gate become BLOCKED_BY_TRUTH.
 */

import { z } from "zod";

/**
 * Consulting Lifecycle Stage
 */
export enum ConsultingStage {
  DISCOVERY = "discovery",
  DIAGNOSIS = "diagnosis",
  DESIGN = "design",
  IMPLEMENTATION = "implementation",
  OPTIMIZATION = "optimization",
  GRADUATION = "graduation",
}

/**
 * Business condition maturity assessment
 */
export enum BusinessMaturity {
  STRUGGLING = "struggling",
  SURVIVING = "surviving",
  STABLE = "stable",
  SCALING = "scaling",
  TRANSFORMING = "transforming",
}

/**
 * Intervention mode (how we help)
 */
export enum InterventionMode {
  EMERGENCY_STABILIZATION = "emergency_stabilization",
  CORE_REBUILD = "core_rebuild",
  CAPABILITY_BUILD = "capability_build",
  PROCESS_OPTIMIZATION = "process_optimization",
  GROWTH_ACCELERATION = "growth_acceleration",
}

/**
 * Phase within intervention mode
 */
export enum InterventionPhase {
  ASSESSMENT = "assessment",
  PLANNING = "planning",
  EXECUTION = "execution",
  VERIFICATION = "verification",
  SCALING = "scaling",
  HANDOFF = "handoff",
}

/**
 * Business condition profile dimension
 */
export const BusinessConditionSchema = z.object({
  maturity: z.nativeEnum(BusinessMaturity),
  financialHealth: z.enum(["critical", "stressed", "stable", "healthy", "thriving"]),
  cashRunwayMonths: z.number().int().min(0),
  burnRate: z.number().min(0),
  revenuePerMonth: z.number().min(0),
  keyPersonDependency: z.boolean().describe("Owner is bottleneck"),
  ownerAvailability: z.enum(["unavailable", "limited", "part_time", "full_time"]),
  teamCapability: z.enum(["minimal", "emerging", "competent", "strong", "exceptional"]),
  customerHealthScore: z.number().min(0).max(100),
  marketPosition: z.enum(["lost", "weak", "viable", "strong", "dominant"]),
});

export type BusinessCondition = z.infer<typeof BusinessConditionSchema>;

/**
 * Intervention reality dimension
 */
export const InterventionRealitySchema = z.object({
  stage: z.nativeEnum(ConsultingStage),
  mode: z.nativeEnum(InterventionMode),
  phase: z.nativeEnum(InterventionPhase),
  daysInPhase: z.number().int().min(0),
  blockerCount: z.number().int().min(0),
  completedMilestones: z.number().int().min(0),
  ownerCommitment: z.enum(["uncommitted", "conditional", "committed", "relentless"]),
  teamAdoption: z.enum(["resisting", "hesitant", "participating", "driving"]),
});

export type InterventionReality = z.infer<typeof InterventionRealitySchema>;

/**
 * Evidence sufficiency assessment
 */
export const EvidenceSufficiencySchema = z.object({
  hasFinancialData: z.boolean(),
  hasCustomerData: z.boolean(),
  hasOperationalData: z.boolean(),
  hasOwnerAssessment: z.boolean(),
  dataFreshness: z.enum(["stale", "recent", "current"]),
  sourceDiversity: z.enum(["single", "limited", "multiple", "comprehensive"]),
  contradictionsDetected: z.boolean(),
  reliabilityScore: z.number().min(0).max(100),
});

export type EvidenceSufficiency = z.infer<typeof EvidenceSufficiencySchema>;

/**
 * Execution readiness assessment
 */
export const ExecutionReadinessSchema = z.object({
  ownerCanCommit: z.boolean(),
  teamCanExecute: z.boolean(),
  resourcesAvailable: z.boolean(),
  timelineRealistic: z.boolean(),
  dependenciesMapped: z.boolean(),
  risksMitigated: z.boolean(),
  measurablesSet: z.boolean(),
  backupPlanExists: z.boolean(),
});

export type ExecutionReadiness = z.infer<typeof ExecutionReadinessSchema>;

/**
 * System truth contract - all 4 dimensions must be assessed
 */
export const SystemTruthContractSchema = z.object({
  workspaceId: z.string().uuid(),
  engagementId: z.string().uuid(),
  assessedAt: z.date(),
  assessedByUserId: z.string().uuid(),
  businessCondition: BusinessConditionSchema,
  interventionReality: InterventionRealitySchema,
  evidenceSufficiency: EvidenceSufficiencySchema,
  executionReadiness: ExecutionReadinessSchema,
  truthGatePassed: z.boolean(),
  gateFailureReason: z.string().optional(),
});

export type SystemTruthContract = z.infer<typeof SystemTruthContractSchema>;

/**
 * Truth gate assessment result
 */
export const TruthGateResultSchema = z.object({
  passed: z.boolean(),
  businessConditionValid: z.boolean(),
  interventionRealityValid: z.boolean(),
  evidenceSufficient: z.boolean(),
  executionReady: z.boolean(),
  failureReasons: z.array(z.string()),
  recommendedActions: z.array(z.string()),
});

export type TruthGateResult = z.infer<typeof TruthGateResultSchema>;

/**
 * Validate business condition has minimum requirements
 */
export function validateBusinessCondition(
  condition: BusinessCondition
): { valid: boolean; reason?: string } {
  // Cannot give growth advice to struggling business with <1 month runway
  if (
    condition.maturity === BusinessMaturity.STRUGGLING &&
    condition.cashRunwayMonths < 1
  ) {
    return {
      valid: false,
      reason: "Business is in survival mode with critical cash runway",
    };
  }

  // Must have team if implementing (not assessment)
  const ownerUnavailable =
    condition.ownerAvailability === "unavailable" ||
    condition.ownerAvailability === "limited";
  const teamIncapable =
    condition.teamCapability === "minimal" ||
    condition.teamCapability === "emerging";

  if (ownerUnavailable && teamIncapable) {
    return {
      valid: false,
      reason: "Cannot execute without owner commitment or team capability",
    };
  }

  return { valid: true };
}

/**
 * Validate intervention reality is coherent
 */
export function validateInterventionReality(
  reality: InterventionReality
): { valid: boolean; reason?: string } {
  // Cannot be in EXECUTION phase without completing PLANNING
  if (
    reality.phase === InterventionPhase.EXECUTION &&
    reality.completedMilestones === 0
  ) {
    return {
      valid: false,
      reason: "Cannot be in execution phase without planning milestones completed",
    };
  }

  // Owner must be committed for implementation phases
  if (
    [
      InterventionPhase.EXECUTION,
      InterventionPhase.VERIFICATION,
      InterventionPhase.SCALING,
    ].includes(reality.phase)
  ) {
    if (
      reality.ownerCommitment === "uncommitted" ||
      reality.ownerCommitment === "conditional"
    ) {
      return {
        valid: false,
        reason: "Owner commitment required for execution phases",
      };
    }
  }

  return { valid: true };
}

/**
 * Validate evidence is sufficient for recommendations
 */
export function validateEvidenceSufficiency(
  evidence: EvidenceSufficiency
): { valid: boolean; reason?: string } {
  // Must have owner perspective on issues
  if (!evidence.hasOwnerAssessment) {
    return {
      valid: false,
      reason: "Cannot recommend without owner assessment of business reality",
    };
  }

  // Data must not be stale
  if (evidence.dataFreshness === "stale") {
    return {
      valid: false,
      reason: "Cannot recommend based on stale data - refresh required",
    };
  }

  // Cannot have contradictions without resolution
  if (evidence.contradictionsDetected && evidence.reliabilityScore < 60) {
    return {
      valid: false,
      reason: "Contradictions detected - data reliability too low for recommendations",
    };
  }

  // Must have multiple data sources for critical decisions
  if (
    evidence.sourceDiversity === "single" ||
    evidence.sourceDiversity === "limited"
  ) {
    return {
      valid: false,
      reason: "Need diverse evidence sources before making critical recommendations",
    };
  }

  return { valid: true };
}

/**
 * Validate execution readiness - can owner actually do this?
 */
export function validateExecutionReadiness(
  readiness: ExecutionReadiness
): { valid: boolean; reason?: string } {
  // All execution readiness gates must pass
  const checks = [
    { condition: readiness.ownerCanCommit, reason: "Owner cannot commit" },
    { condition: readiness.teamCanExecute, reason: "Team cannot execute" },
    { condition: readiness.resourcesAvailable, reason: "Resources unavailable" },
    { condition: readiness.timelineRealistic, reason: "Timeline unrealistic" },
    {
      condition: readiness.dependenciesMapped,
      reason: "Dependencies not mapped",
    },
    { condition: readiness.risksMitigated, reason: "Risks not mitigated" },
    { condition: readiness.measurablesSet, reason: "Success metrics not set" },
    {
      condition: readiness.backupPlanExists,
      reason: "Backup plan not documented",
    },
  ];

  const failed = checks.filter((c) => !c.condition);
  if (failed.length > 0) {
    return {
      valid: false,
      reason: `Execution readiness failed: ${failed.map((f) => f.reason).join(", ")}`,
    };
  }

  return { valid: true };
}

/**
 * Assess full system truth contract
 * All 4 dimensions must be valid for gate to pass
 */
export function assessTruthGate(
  contract: SystemTruthContract
): TruthGateResult {
  const failures: string[] = [];
  const recommendations: string[] = [];

  // Check business condition
  const businessValid = validateBusinessCondition(contract.businessCondition);
  if (!businessValid.valid) {
    failures.push(businessValid.reason || "Business condition invalid");
    recommendations.push("Stabilize cash position before growth initiatives");
  }

  // Check intervention reality
  const interventionValid = validateInterventionReality(
    contract.interventionReality
  );
  if (!interventionValid.valid) {
    failures.push(interventionValid.reason || "Intervention reality invalid");
    recommendations.push("Complete current phase before advancing");
  }

  // Check evidence sufficiency
  const evidenceValid = validateEvidenceSufficiency(
    contract.evidenceSufficiency
  );
  if (!evidenceValid.valid) {
    failures.push(evidenceValid.reason || "Evidence insufficient");
    recommendations.push("Gather additional data before recommending");
  }

  // Check execution readiness
  const executionValid = validateExecutionReadiness(
    contract.executionReadiness
  );
  if (!executionValid.valid) {
    failures.push(executionValid.reason || "Execution not ready");
    recommendations.push(
      "Address execution blockers before proceeding with recommendation"
    );
  }

  const passed = failures.length === 0;

  return {
    passed,
    businessConditionValid: businessValid.valid,
    interventionRealityValid: interventionValid.valid,
    evidenceSufficient: evidenceValid.valid,
    executionReady: executionValid.valid,
    failureReasons: failures,
    recommendedActions: recommendations,
  };
}

/**
 * Check if recommendation can be made
 * Returns false if any truth gate fails
 */
export function canMakeRecommendation(
  contract: SystemTruthContract
): boolean {
  const result = assessTruthGate(contract);
  return result.passed;
}

/**
 * Get human-readable summary of truth assessment
 */
export function getTruthAssessmentSummary(
  contract: SystemTruthContract
): string {
  const result = assessTruthGate(contract);

  if (result.passed) {
    return `✓ All 4 truth dimensions valid. Recommendation safe to make.`;
  }

  const failedDimensions = [
    !result.businessConditionValid && "Business Condition",
    !result.interventionRealityValid && "Intervention Reality",
    !result.evidenceSufficient && "Evidence Sufficiency",
    !result.executionReady && "Execution Readiness",
  ]
    .filter(Boolean)
    .join(", ");

  return `✗ Truth gate blocked. Failed dimensions: ${failedDimensions}. ${result.recommendedActions[0] || ""}`;
}
