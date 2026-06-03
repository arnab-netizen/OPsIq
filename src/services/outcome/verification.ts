import type { OperatorItem } from "@/generated/prisma/client";

export interface VerificationResult {
  allowed: boolean;
  reason?: string;
  confidence: number;
  verificationMethod: string;
}

export interface FraudRiskAssessment {
  riskLevel: "low" | "medium" | "high";
  indicators: string[];
  confidence: number;
}

export interface AuditTrailEntry {
  timestamp: string;
  actorId: string;
  action: string;
  beforeValue?: number;
  afterValue?: number;
  reason?: string;
}

export function verifyOutcomeValue(
  actualOutcome: number,
  impactExpected: number,
  currentVerificationStatus: string | null
): VerificationResult {
  const reasons: string[] = [];

  // Check if value is in reasonable range
  if (actualOutcome < 0) {
    reasons.push("Negative outcome values require manual review");
  }

  // Check if outcome is plausible relative to expected impact
  const variance = actualOutcome > 0 && impactExpected > 0
    ? Math.abs(actualOutcome - impactExpected) / impactExpected
    : 0;

  if (variance > 2) {
    reasons.push("Outcome variance >200% from expected impact");
  }

  // Check for extreme values that suggest data entry error
  if (actualOutcome > 100000000) {
    reasons.push("Outcome value exceeds 100M threshold");
  }

  // For now, customer-reported outcomes are always unverified
  // They require integration with external systems or admin review
  return {
    allowed: true,
    confidence: 0,
    verificationMethod: "customer_reported_unverified",
    reason: reasons.length > 0
      ? `Flagged for review: ${reasons.join("; ")}`
      : undefined,
  };
}

export function checkFraudRisk(
  actualOutcome: number,
  impactExpected: number,
  previousActualOutcomeValue: number | null
): FraudRiskAssessment {
  const indicators: string[] = [];
  let riskScore = 0;

  // Indicator 1: Outcome exactly matches expected (unlikely)
  if (impactExpected > 0 && actualOutcome === impactExpected) {
    indicators.push("Outcome exactly matches expected (suspiciously precise)");
    riskScore += 1;
  }

  // Indicator 2: Round numbers (e.g., 100000, 500000)
  if (actualOutcome > 0 && actualOutcome % 100000 === 0) {
    indicators.push("Round number outcome (may indicate estimation rather than measurement)");
    riskScore += 0.5;
  }

  // Indicator 3: Extreme variance from expected
  if (impactExpected > 0) {
    const variance = Math.abs(actualOutcome - impactExpected) / impactExpected;
    if (variance >= 2) {
      indicators.push("Extreme variance from expected (>=200%)");
      riskScore += 1;
    }
  }

  // Indicator 4: Retroactive modification (changing an already-verified outcome)
  if (previousActualOutcomeValue !== null && previousActualOutcomeValue !== actualOutcome) {
    indicators.push("Retroactive modification of outcome value");
    riskScore += 2;
  }

  // Indicator 5: Very high impact with very high confidence
  if (actualOutcome > 1000000 && impactExpected > 1000000) {
    indicators.push("High-impact outcome claimed");
    riskScore += 0.5;
  }

  const riskLevel: "low" | "medium" | "high" =
    riskScore >= 1.5 ? "high" : riskScore >= 1.0 ? "medium" : "low";

  return {
    riskLevel,
    indicators,
    confidence: Math.min(riskScore / 3, 1),
  };
}

export function buildAuditTrail(
  previousTrail: AuditTrailEntry[] | null,
  actorId: string,
  action: string,
  beforeValue?: number,
  afterValue?: number,
  reason?: string
): AuditTrailEntry[] {
  const trail = previousTrail || [];

  trail.push({
    timestamp: new Date().toISOString(),
    actorId,
    action,
    beforeValue,
    afterValue,
    reason,
  });

  return trail;
}

export function captureOutcomeVerificationMetadata(
  actualOutcomeValue: number,
  impactExpected: number,
  currentValue: number | null,
  actorId: string
) {
  const fraudRisk = checkFraudRisk(actualOutcomeValue, impactExpected, currentValue);
  const verificationResult = verifyOutcomeValue(
    actualOutcomeValue,
    impactExpected,
    "unverified"
  );

  // Mark as disputed if fraud risk is high (contract-compliant state)
  const verificationStatus = fraudRisk.riskLevel === "high" ? "disputed" : "unverified";

  return {
    verificationStatus,
    verificationMethod: verificationResult.verificationMethod,
    verificationConfidence: verificationResult.confidence,
    verificationEvidence: {
      fraudRiskAssessment: fraudRisk,
      verificationReason: verificationResult.reason,
      capturedAt: new Date().toISOString(),
      capturedBy: actorId,
    },
    auditTrail: buildAuditTrail(
      null,
      actorId,
      "OUTCOME_RECORDED",
      undefined,
      actualOutcomeValue,
      `Customer reported outcome value: ${actualOutcomeValue}`
    ),
  };
}
