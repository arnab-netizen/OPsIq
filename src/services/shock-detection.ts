import { db } from "@/lib/db";
import { logger } from "@/infra/logger";
import type { RiskSeverity } from "@/domain/constants/statuses";

export interface ShockDetectionInput {
  engagementId: string;
  evidenceItems?: Array<{
    evidenceType: string;
    status: string;
    severity?: string | null;
  }>;
  conditionProfile?: {
    severityScore: number;
    urgencyLevel: string;
    cashPressureLevel: string;
    marginPressureLevel: string;
    ownerDependencyRisk: string;
  };
}

export interface ShockDetectionResult {
  shockDetected: boolean;
  severity: RiskSeverity;
  indicators: string[];
  rationale: string;
}

const PRESSURE_LEVELS_WEIGHT = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

const SEVERITY_SCORE_THRESHOLDS = {
  critical: 9,
  high: 7,
  medium: 4,
  low: 0,
};

export async function detectShockState(
  input: ShockDetectionInput
): Promise<ShockDetectionResult> {
  const indicators: string[] = [];
  let riskScore = 0;

  // Evaluate condition profile signals
  if (input.conditionProfile) {
    const profile = input.conditionProfile;

    // Check severity score
    if (profile.severityScore >= SEVERITY_SCORE_THRESHOLDS.critical) {
      indicators.push(`Critical severity score: ${profile.severityScore}/10`);
      riskScore += 3;
    } else if (profile.severityScore >= SEVERITY_SCORE_THRESHOLDS.high) {
      indicators.push(`High severity score: ${profile.severityScore}/10`);
      riskScore += 2;
    }

    // Check pressure levels
    const cashWeight = PRESSURE_LEVELS_WEIGHT[profile.cashPressureLevel as keyof typeof PRESSURE_LEVELS_WEIGHT] || 0;
    const marginWeight = PRESSURE_LEVELS_WEIGHT[profile.marginPressureLevel as keyof typeof PRESSURE_LEVELS_WEIGHT] || 0;

    if (cashWeight >= 3) {
      indicators.push(`Critical cash pressure: ${profile.cashPressureLevel}`);
      riskScore += 2;
    } else if (cashWeight === 2) {
      indicators.push(`High cash pressure: ${profile.cashPressureLevel}`);
      riskScore += 1;
    }

    if (marginWeight >= 3) {
      indicators.push(`Critical margin pressure: ${profile.marginPressureLevel}`);
      riskScore += 2;
    } else if (marginWeight === 2) {
      indicators.push(`High margin pressure: ${profile.marginPressureLevel}`);
      riskScore += 1;
    }

    // Check owner dependency
    if (profile.ownerDependencyRisk === "critical") {
      indicators.push("Critical owner dependency risk");
      riskScore += 2;
    } else if (profile.ownerDependencyRisk === "high") {
      indicators.push("High owner dependency risk");
      riskScore += 1;
    }

    // Check urgency level
    if (profile.urgencyLevel === "critical") {
      indicators.push("Critical urgency level");
      riskScore += 2;
    } else if (profile.urgencyLevel === "high") {
      indicators.push("High urgency level");
      riskScore += 1;
    }
  }

  // Evaluate critical evidence items
  if (input.evidenceItems && input.evidenceItems.length > 0) {
    const criticalEvidence = input.evidenceItems.filter(
      (e) => e.status === "submitted" && e.severity === "critical"
    );

    const highRiskEvidence = input.evidenceItems.filter(
      (e) =>
        e.status === "submitted" &&
        (e.severity === "high" ||
          ["document", "interview", "metric", "observation"].includes(e.evidenceType))
    );

    if (criticalEvidence.length >= 2) {
      indicators.push(`Multiple critical evidence items: ${criticalEvidence.length}`);
      riskScore += 3;
    } else if (criticalEvidence.length === 1) {
      indicators.push("Critical evidence item validated");
      riskScore += 2;
    }

    if (highRiskEvidence.length >= 3) {
      indicators.push(`Multiple high-risk evidence items: ${highRiskEvidence.length}`);
      riskScore += 2;
    } else if (highRiskEvidence.length >= 1) {
      riskScore += 1;
    }
  }

  // Determine shock state and severity
  let shockDetected = false;
  let severity: RiskSeverity = "low";
  let rationale = "";

  if (riskScore >= 8) {
    shockDetected = true;
    severity = "critical";
    rationale = "Multiple critical indicators present; shock state confirmed";
  } else if (riskScore >= 5) {
    shockDetected = true;
    severity = "high";
    rationale = "Significant risk indicators present; shock state likely";
  } else if (riskScore >= 3) {
    severity = "medium";
    rationale = "Elevated risk indicators present; monitor for escalation";
  } else {
    severity = "low";
    rationale = "No immediate shock indicators detected";
  }

  logger.info("Shock detection evaluated", {
    engagementId: input.engagementId,
    shockDetected,
    severity,
    riskScore,
    indicatorCount: indicators.length,
  });

  return {
    shockDetected,
    severity,
    indicators,
    rationale,
  };
}

export async function detectShockFromCurrentState(
  engagementId: string
): Promise<ShockDetectionResult> {
  // Fetch current engagement state
  const engagement = await db.engagement.findUnique({
    where: { id: engagementId },
    select: {
      id: true,
      conditionProfiles: {
        where: { isCurrent: true },
        select: {
          severityScore: true,
          urgencyLevel: true,
          cashPressureLevel: true,
          marginPressureLevel: true,
          ownerDependencyRisk: true,
        },
        take: 1,
      },
      evidence: {
        where: {
          status: { in: ["submitted", "submitted"] },
        },
        select: {
          evidenceType: true,
          status: true,
        },
      },
    },
  });

  if (!engagement) {
    return {
      shockDetected: false,
      severity: "low",
      indicators: [],
      rationale: "Engagement not found",
    };
  }

  return detectShockState({
    engagementId,
    conditionProfile: engagement.conditionProfiles[0],
    evidenceItems: engagement.evidence,
  });
}
