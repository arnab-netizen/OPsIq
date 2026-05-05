/**
 * Human Factors Model
 *
 * Operational human variables that affect decision execution:
 * - owner bottlenecking (key person dependency, decision delays)
 * - follow-through risk (execution slippage, incomplete implementation)
 * - resistance to change (stakeholder buy-in, organizational alignment)
 * - communication breakdown (clarity gaps, alignment failure)
 * - morale fragility (team motivation, commitment level)
 * - management capability (execution competence, resource coordination)
 * - key-person dependency (knowledge concentration, continuity risk)
 * - accountability weakness (ownership clarity, consequence tracking)
 *
 * These factors drive intervention timing and risk profiles in reality.
 */

export const HUMAN_FACTORS = [
  "owner_bottleneck",
  "follow_through_risk",
  "resistance_to_change",
  "communication_breakdown",
  "morale_fragility",
  "management_capability",
  "key_person_dependency",
  "accountability_weakness",
] as const;

export type HumanFactorKey = (typeof HUMAN_FACTORS)[number];

export const HUMAN_FACTOR_LABELS: Record<HumanFactorKey, string> = {
  owner_bottleneck: "Owner Bottlenecking",
  follow_through_risk: "Follow-Through Risk",
  resistance_to_change: "Resistance to Change",
  communication_breakdown: "Communication Breakdown",
  morale_fragility: "Morale Fragility",
  management_capability: "Management Capability",
  key_person_dependency: "Key-Person Dependency",
  accountability_weakness: "Accountability Weakness",
};

export const HUMAN_FACTOR_DESCRIPTIONS: Record<HumanFactorKey, string> = {
  owner_bottleneck:
    "Decision approval or critical work concentrated with owner; delays execution timeline",
  follow_through_risk:
    "Execution slippage; team commits but doesn't deliver; partial or late implementation",
  resistance_to_change:
    "Stakeholder pushback; organizational alignment gaps; adoption barriers",
  communication_breakdown:
    "Information silos; clarity gaps; misaligned understanding of priorities",
  morale_fragility:
    "Low team motivation; burnout indicators; weakened commitment",
  management_capability:
    "Leadership execution gaps; resource coordination weakness; supervision quality",
  key_person_dependency:
    "Critical work concentrated in one person; continuity risk if person unavailable",
  accountability_weakness:
    "Unclear ownership; weak consequence tracking; responsibility diffusion",
};

// Risk severity levels for human factors
export const SEVERITY_LEVELS = ["NONE", "LOW", "MODERATE", "HIGH", "CRITICAL"] as const;
export type SeverityLevel = (typeof SEVERITY_LEVELS)[number];

export const SEVERITY_SCORES: Record<SeverityLevel, number> = {
  NONE: 0,
  LOW: 1,
  MODERATE: 2,
  HIGH: 3,
  CRITICAL: 4,
};

export interface HumanFactorAssessment {
  factor: HumanFactorKey;
  severity: SeverityLevel;
  evidencePoints: string[];
  interventionNeeded: boolean;
  targetState?: string;
}

export interface HumanFactorProfile {
  workspaceId: string;
  engagementId: string;
  assessedAt: Date;
  factors: Record<HumanFactorKey, HumanFactorAssessment>;
  overallRiskScore: number; // 0-100, aggregated from all factors
  criticalFactors: HumanFactorKey[];
  timeToMitigation: {
    owner_bottleneck?: number; // days
    follow_through_risk?: number;
    resistance_to_change?: number;
    communication_breakdown?: number;
    morale_fragility?: number;
    management_capability?: number;
    key_person_dependency?: number;
    accountability_weakness?: number;
  };
}

export interface HumanExecutionContext {
  workspaceId: string;
  engagementId: string;
  ownerId: string;
  teamSize: number;
  organizationalMaturity: "startup" | "growth" | "established" | "complex";
  recentlyFailedInitiatives?: string[];
  communicationQuality: "poor" | "fair" | "good" | "excellent";
  teamMorale: "low" | "recovering" | "stable" | "high";
  ownerAvailability: number; // percentage 0-100
  keyPersonCount: number;
  accountabilityFramework: "weak" | "developing" | "clear" | "rigorous";
}

/**
 * Aggregate human factor severity into overall risk score
 */
export function calculateHumanRiskScore(
  factors: Record<HumanFactorKey, HumanFactorAssessment>
): number {
  const scores = Object.values(factors).map((f) => SEVERITY_SCORES[f.severity]);
  if (scores.length === 0) return 0;

  const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
  return Math.round(avgScore * (100 / SEVERITY_SCORES.CRITICAL));
}

/**
 * Identify critical human factors from profile
 */
export function identifyCriticalFactors(
  factors: Record<HumanFactorKey, HumanFactorAssessment>
): HumanFactorKey[] {
  return Object.entries(factors)
    .filter(([, assessment]) => assessment.severity === "CRITICAL")
    .map(([key]) => key as HumanFactorKey);
}

/**
 * Validate human factor assessment structure
 */
export function validateHumanFactorAssessment(
  assessment: HumanFactorAssessment
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!HUMAN_FACTORS.includes(assessment.factor)) {
    errors.push(`Invalid human factor: ${assessment.factor}`);
  }

  if (!SEVERITY_LEVELS.includes(assessment.severity)) {
    errors.push(`Invalid severity level: ${assessment.severity}`);
  }

  if (!Array.isArray(assessment.evidencePoints) || assessment.evidencePoints.length === 0) {
    if (assessment.severity !== "NONE") {
      errors.push(
        `Evidence points required for severity ${assessment.severity}`
      );
    }
  }

  if (assessment.interventionNeeded && !assessment.targetState?.trim()) {
    errors.push(`Target state required when intervention is needed`);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate complete human factor profile
 */
export function validateHumanFactorProfile(
  profile: HumanFactorProfile
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!profile.workspaceId?.trim()) {
    errors.push("workspaceId is required");
  }

  if (!profile.engagementId?.trim()) {
    errors.push("engagementId is required");
  }

  if (Object.keys(profile.factors).length !== HUMAN_FACTORS.length) {
    errors.push(`All ${HUMAN_FACTORS.length} human factors must be assessed`);
  }

  Object.values(profile.factors).forEach((assessment) => {
    const { valid, errors: assessmentErrors } = validateHumanFactorAssessment(assessment);
    if (!valid) {
      errors.push(...assessmentErrors);
    }
  });

  if (profile.overallRiskScore < 0 || profile.overallRiskScore > 100) {
    errors.push("Overall risk score must be between 0 and 100");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Get priority-ordered list of human factors for intervention
 */
export function prioritizeFactorsForIntervention(
  factors: Record<HumanFactorKey, HumanFactorAssessment>,
  timeToMitigation: HumanFactorProfile["timeToMitigation"]
): HumanFactorKey[] {
  const prioritized = Object.entries(factors)
    .filter(([, assessment]) => assessment.interventionNeeded)
    .sort(([keyA, assessmentA], [keyB, assessmentB]) => {
      // Sort by severity first (descending)
      const severityDiff = SEVERITY_SCORES[assessmentB.severity] - SEVERITY_SCORES[assessmentA.severity];
      if (severityDiff !== 0) return severityDiff;

      // Then by time to mitigation (ascending - shorter time = higher priority)
      const timeA = timeToMitigation[keyA as HumanFactorKey] ?? Infinity;
      const timeB = timeToMitigation[keyB as HumanFactorKey] ?? Infinity;
      return timeA - timeB;
    })
    .map(([key]) => key as HumanFactorKey);

  return prioritized;
}
