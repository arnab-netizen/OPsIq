/**
 * B18-S1: Adversarial Test Suite — Domain Model
 *
 * Represents adversarial cases that test diagnosis engine robustness
 * against bad data, misleading signals, and edge cases.
 *
 * Each case has known bad data characteristics and expected system behavior.
 */

export type AdversarialCaseType =
  | "missing_data"
  | "misleading_data"
  | "conflicting_data"
  | "fake_improvement"
  | "vanity_metrics"
  | "wrong_attribution"
  | "margin_illusion"
  | "cash_illusion"
  | "founder_bias"
  | "seasonality_trap"
  | "outlier_distortion";

export interface BadDataCharacteristic {
  characteristic: string;
  severity: "critical" | "high" | "medium" | "low";
  description: string;
  howToDetect: string;
}

export interface ExpectedSystemBehavior {
  confidenceShouldDecline: boolean;
  targetConfidenceLevel: number; // 0.0-1.0
  shouldFlagAsFake: boolean;
  shouldBlockRecommendation: boolean;
  failureMode: string; // what the system should do or not do
}

export interface AdversarialCase {
  id: string; // adversarial_<type>_<version>
  type: AdversarialCaseType;
  title: string;
  description: string;
  version: number;

  // Bad data characteristics
  badDataCharacteristics: BadDataCharacteristic[];
  dataQualityScore: number; // 0.0-1.0: how bad is the data (0 = worst)

  // Input data (intentionally flawed)
  inputMetrics: Record<string, number | string>;
  inputEvidence: string[];

  // What the system should NOT do
  acceptableBehavior: {
    mustLowerConfidence: boolean;
    minConfidenceAfter: number; // system must not exceed this
    mustNotRecommendAs: string[]; // recommendations to block
    mustNotIdentifyAs: string[]; // causes to reject
    mustFlagIfDetected: string[]; // signals that must be flagged
  };

  // Expected detection
  expectedDetection: {
    caseType: string; // what type of adversarial case this is
    confidence: number; // system should detect with this confidence
    evidence: string[]; // evidence that should trigger detection
  };

  // Metadata
  createdAt: Date;
  updatedAt: Date;
}

export interface AdversarialCaseRunResult {
  caseId: string;
  runId: string;
  inputMetrics: Record<string, number | string>;
  inputEvidence: string[];

  // What the system identified
  identifiedCauses: string[];
  identifiedRecommendations: string[];
  systemConfidence: number; // 0.0-1.0
  evidenceQualityScore: number; // system's own assessment of data quality

  // Evaluation
  confidenceDeclining: boolean; // did confidence decline as expected?
  fakeImprovementDetected: boolean; // did system detect fake improvement?
  vanityMetricsDetected: boolean; // did system detect vanity metrics?
  conflictingDataDetected: boolean; // did system detect conflicting signals?
  adversarialCaseDetected: boolean; // did system detect the adversarial nature?

  // Pass/fail
  passed: boolean;
  failureReasons: string[];
  evidence: string[];

  // Metadata
  ranAt: Date;
  executionTimeMs: number;
}

/**
 * Validate that an adversarial case is well-formed
 */
export function validateAdversarialCase(
  caseData: AdversarialCase
): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!caseData.id || !caseData.id.startsWith("adversarial_")) {
    errors.push("Case ID must start with 'adversarial_'");
  }

  if (!caseData.badDataCharacteristics || caseData.badDataCharacteristics.length === 0) {
    errors.push("Case must have at least one bad data characteristic");
  }

  if (caseData.dataQualityScore < 0 || caseData.dataQualityScore > 1) {
    errors.push("dataQualityScore must be between 0 and 1");
  }

  if (caseData.acceptableBehavior.minConfidenceAfter < 0 || caseData.acceptableBehavior.minConfidenceAfter > 1) {
    errors.push("minConfidenceAfter must be between 0 and 1");
  }

  if (caseData.expectedDetection.confidence < 0 || caseData.expectedDetection.confidence > 1) {
    errors.push("expectedDetection.confidence must be between 0 and 1");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Evaluate adversarial case result
 */
export function evaluateAdversarialResult(
  caseData: AdversarialCase,
  result: AdversarialCaseRunResult
): {
  passed: boolean;
  violations: string[];
  evidence: string[];
} {
  const violations: string[] = [];
  const evidence: string[] = [];

  // Check confidence decline
  if (caseData.acceptableBehavior.mustLowerConfidence) {
    if (result.systemConfidence >= caseData.acceptableBehavior.minConfidenceAfter) {
      violations.push(
        `System confidence (${(result.systemConfidence * 100).toFixed(1)}%) must be below ${(caseData.acceptableBehavior.minConfidenceAfter * 100).toFixed(0)}%`
      );
    } else {
      evidence.push(`✓ Confidence correctly declined to ${(result.systemConfidence * 100).toFixed(1)}%`);
    }
  }

  // Check recommendation blocks
  const blockedRecs = result.identifiedRecommendations.filter((r) =>
    caseData.acceptableBehavior.mustNotRecommendAs.includes(r)
  );
  if (blockedRecs.length > 0) {
    violations.push(`System recommended blocked recommendations: ${blockedRecs.join(", ")}`);
  } else {
    evidence.push("✓ System correctly avoided blocked recommendations");
  }

  // Check cause blocks
  const blockedCauses = result.identifiedCauses.filter((c) =>
    caseData.acceptableBehavior.mustNotIdentifyAs.includes(c)
  );
  if (blockedCauses.length > 0) {
    violations.push(`System identified blocked causes: ${blockedCauses.join(", ")}`);
  } else {
    evidence.push("✓ System correctly avoided blocked causes");
  }

  // Check flags
  const missingFlags = caseData.acceptableBehavior.mustFlagIfDetected.filter(
    (flag) => !result.identifiedRecommendations.some((r) => r.includes(flag))
  );
  if (missingFlags.length > 0) {
    violations.push(`System failed to flag: ${missingFlags.join(", ")}`);
  } else {
    evidence.push("✓ System correctly flagged all required signals");
  }

  return {
    passed: violations.length === 0,
    violations,
    evidence,
  };
}
