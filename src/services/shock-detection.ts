import { db } from "@/lib/db";
import { logger } from "@/infra/logger";
import type { RiskSeverity } from "@/domain/constants/statuses";

export interface ShockDetectionInput {
  engagementId: string;
  evidenceItems?: Array<{
    evidenceType?: string;
    category?: string;
    status?: string;
    validationStatus?: string;
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

    // Primary indicator: Use severity score directly as contract-defined threshold
    if (profile.severityScore >= SEVERITY_SCORE_THRESHOLDS.critical) {
      indicators.push(`Critical severity score: ${profile.severityScore}/10`);
      riskScore = 9; // Map directly to severity level
    } else if (profile.severityScore >= SEVERITY_SCORE_THRESHOLDS.high) {
      indicators.push(`High severity score: ${profile.severityScore}/10`);
      riskScore = 7; // Map directly to severity level
    } else if (profile.severityScore >= SEVERITY_SCORE_THRESHOLDS.medium) {
      indicators.push(`Medium severity score: ${profile.severityScore}/10`);
      riskScore = 4;
    } else {
      riskScore = 0;
    }

    // Check pressure levels (add to risk score)
    const cashWeight = PRESSURE_LEVELS_WEIGHT[profile.cashPressureLevel as keyof typeof PRESSURE_LEVELS_WEIGHT] || 0;
    const marginWeight = PRESSURE_LEVELS_WEIGHT[profile.marginPressureLevel as keyof typeof PRESSURE_LEVELS_WEIGHT] || 0;

    if (cashWeight >= 3) {
      indicators.push(`Critical cash pressure: ${profile.cashPressureLevel}`);
      riskScore = Math.max(riskScore, 3);
    } else if (cashWeight === 2) {
      indicators.push(`High cash pressure: ${profile.cashPressureLevel}`);
      riskScore = Math.max(riskScore, 2);
    }

    if (marginWeight >= 3) {
      indicators.push(`Critical margin pressure: ${profile.marginPressureLevel}`);
      riskScore = Math.max(riskScore, 3);
    } else if (marginWeight === 2) {
      indicators.push(`High margin pressure: ${profile.marginPressureLevel}`);
      riskScore = Math.max(riskScore, 2);
    }

    // Check owner dependency
    if (profile.ownerDependencyRisk === "critical") {
      indicators.push("Critical owner dependency risk");
      riskScore = Math.max(riskScore, 3);
    } else if (profile.ownerDependencyRisk === "high") {
      indicators.push("High owner dependency risk");
      riskScore = Math.max(riskScore, 2);
    }

    // Check urgency level
    if (profile.urgencyLevel === "critical") {
      indicators.push("Critical urgency level");
      riskScore = Math.max(riskScore, 3);
    } else if (profile.urgencyLevel === "high") {
      indicators.push("High urgency level");
      riskScore = Math.max(riskScore, 2);
    }
  }

  // Evaluate critical evidence items
  if (input.evidenceItems && input.evidenceItems.length > 0) {
    // Consider evidence with "validated" status (test uses validationStatus) or "submitted" status
    const validatedEvidence = input.evidenceItems.filter(
      (e) => (e.status === "validated" || e.validationStatus === "validated") && e.severity === "critical"
    );

    const criticalEvidence = input.evidenceItems.filter(
      (e) => (e.status === "submitted" || e.validationStatus === "submitted") && e.severity === "critical"
    );

    const highRiskEvidence = input.evidenceItems.filter(
      (e) =>
        (e.status === "submitted" || e.validationStatus === "submitted") &&
        (e.severity === "high" ||
          ["document", "interview", "metric", "observation"].includes(e.evidenceType || ""))
    );

    if (validatedEvidence.length >= 2) {
      indicators.push(`Multiple critical evidence items: ${validatedEvidence.length}`);
      riskScore = Math.max(riskScore, 9);
    } else if (validatedEvidence.length === 1) {
      indicators.push("Critical evidence item validated");
      riskScore = Math.max(riskScore, 7);
    }

    if (criticalEvidence.length >= 2) {
      indicators.push(`Multiple critical evidence items: ${criticalEvidence.length}`);
      riskScore = Math.max(riskScore, 6);
    } else if (criticalEvidence.length === 1) {
      indicators.push("Critical evidence item detected");
      riskScore = Math.max(riskScore, 3);
    }

    if (highRiskEvidence.length >= 3) {
      indicators.push(`Multiple high-risk evidence items: ${highRiskEvidence.length}`);
      riskScore = Math.max(riskScore, 5);
    } else if (highRiskEvidence.length >= 1) {
      riskScore = Math.max(riskScore, 2);
    }
  }

  // Determine shock state and severity based on contract-defined thresholds
  let shockDetected = false;
  let severity: RiskSeverity = "low";
  let rationale = "";

  if (riskScore >= 9) {
    shockDetected = true;
    severity = "critical";
    rationale = "Critical risk indicators present; shock state confirmed";
  } else if (riskScore >= 7) {
    shockDetected = true;
    severity = "high";
    rationale = "High risk indicators present; shock state likely";
  } else if (riskScore >= 4) {
    shockDetected = false;
    severity = "medium";
    rationale = "Elevated risk indicators present; monitor for escalation";
  } else {
    shockDetected = false;
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
  engagementId: string,
  workspaceId: string
): Promise<ShockDetectionResult> {
  // Fetch current engagement state
  const engagement = await db.engagement.findFirst({
    where: { id: engagementId, workspaceId },
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
