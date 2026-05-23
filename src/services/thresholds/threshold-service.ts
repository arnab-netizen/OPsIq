import { randomUUID } from "crypto";
import { db } from "@/lib/db";

export interface ThresholdConfig {
  // Low Confidence Risk
  confidenceMinThreshold: number;
  lowConfidenceValueThreshold: number;
  lowConfidenceFailureRateThreshold: number;

  // Rule Block Risk
  ruleBlockValueThreshold: number;
  falsePositiveRateThreshold: number;
  blockCountThreshold: number;

  // Override Failure Risk
  overrideFailureRateThreshold: number;
  overrideFailureValueThreshold: number;
  failureCountThreshold: number;

  // Missing Data Risk
  missingDataValueThreshold: number;
  pendingAgeThreshold: number;
  fieldMissingRateThreshold: number;

  // Time-Series Monitoring
  confidenceChangeThreshold: number;
  approvalRateChangeThreshold: number;
  blockRateChangeThreshold: number;

  // Drift Detection Severity Levels
  driftSeverityLow: number;
  driftSeverityMedium: number;
  driftSeverityHigh: number;

  // Stalled Pipeline
  stalledPipelineThreshold: number;
}

const DEFAULT_THRESHOLDS: ThresholdConfig = {
  // Low Confidence Risk
  confidenceMinThreshold: parseFloat(process.env.THRESHOLD_CONFIDENCE_MIN || "0.65"),
  lowConfidenceValueThreshold: parseFloat(process.env.THRESHOLD_LOW_CONFIDENCE_VALUE || "3000000"),
  lowConfidenceFailureRateThreshold: parseFloat(process.env.THRESHOLD_LOW_CONFIDENCE_FAILURE_RATE || "0.40"),

  // Rule Block Risk
  ruleBlockValueThreshold: parseFloat(process.env.THRESHOLD_RULE_BLOCK_VALUE || "5000000"),
  falsePositiveRateThreshold: parseFloat(process.env.THRESHOLD_FALSE_POSITIVE_RATE || "0.25"),
  blockCountThreshold: parseInt(process.env.THRESHOLD_BLOCK_COUNT || "50", 10),

  // Override Failure Risk
  overrideFailureRateThreshold: parseFloat(process.env.THRESHOLD_OVERRIDE_FAILURE_RATE || "0.30"),
  overrideFailureValueThreshold: parseFloat(process.env.THRESHOLD_OVERRIDE_FAILURE_VALUE || "2000000"),
  failureCountThreshold: parseInt(process.env.THRESHOLD_FAILURE_COUNT || "10", 10),

  // Missing Data Risk
  missingDataValueThreshold: parseFloat(process.env.THRESHOLD_MISSING_DATA_VALUE || "4000000"),
  pendingAgeThreshold: parseInt(process.env.THRESHOLD_PENDING_AGE || "604800000", 10),
  fieldMissingRateThreshold: parseFloat(process.env.THRESHOLD_FIELD_MISSING_RATE || "0.30"),

  // Time-Series Monitoring
  confidenceChangeThreshold: parseFloat(process.env.THRESHOLD_CONFIDENCE_CHANGE || "0.05"),
  approvalRateChangeThreshold: parseFloat(process.env.THRESHOLD_APPROVAL_RATE_CHANGE || "0.10"),
  blockRateChangeThreshold: parseFloat(process.env.THRESHOLD_BLOCK_RATE_CHANGE || "0.10"),

  // Drift Detection Severity Levels
  driftSeverityLow: parseFloat(process.env.DRIFT_SEVERITY_LOW || "0.02"),
  driftSeverityMedium: parseFloat(process.env.DRIFT_SEVERITY_MEDIUM || "0.05"),
  driftSeverityHigh: parseFloat(process.env.DRIFT_SEVERITY_HIGH || "0.10"),

  // Stalled Pipeline
  stalledPipelineThreshold: parseFloat(process.env.THRESHOLD_STALLED_PIPELINE || "10000000"),
};

export async function getWorkspaceThresholds(
  workspaceId: string
): Promise<ThresholdConfig> {
  try {
    const config = await db.thresholdConfig.findUnique({
      where: { workspaceId },
    });

    if (!config) {
      return DEFAULT_THRESHOLDS;
    }

    return {
      confidenceMinThreshold: config.confidenceMinThreshold,
      lowConfidenceValueThreshold: config.lowConfidenceValueThreshold,
      lowConfidenceFailureRateThreshold: config.lowConfidenceFailureRateThreshold,
      ruleBlockValueThreshold: config.ruleBlockValueThreshold,
      falsePositiveRateThreshold: config.falsePositiveRateThreshold,
      blockCountThreshold: config.blockCountThreshold,
      overrideFailureRateThreshold: config.overrideFailureRateThreshold,
      overrideFailureValueThreshold: config.overrideFailureValueThreshold,
      failureCountThreshold: config.failureCountThreshold,
      missingDataValueThreshold: config.missingDataValueThreshold,
      pendingAgeThreshold: config.pendingAgeThreshold,
      fieldMissingRateThreshold: config.fieldMissingRateThreshold,
      confidenceChangeThreshold: config.confidenceChangeThreshold,
      approvalRateChangeThreshold: config.approvalRateChangeThreshold,
      blockRateChangeThreshold: config.blockRateChangeThreshold,
      driftSeverityLow: config.driftSeverityLow,
      driftSeverityMedium: config.driftSeverityMedium,
      driftSeverityHigh: config.driftSeverityHigh,
      stalledPipelineThreshold: config.stalledPipelineThreshold,
    };
  } catch (error) {
    console.error(`Failed to fetch threshold config for workspace ${workspaceId}:`, error);
    return DEFAULT_THRESHOLDS;
  }
}

interface ThresholdUpdate {
  [key: string]: number;
}

export async function updateWorkspaceThresholds(
  workspaceId: string,
  updates: Partial<ThresholdConfig>,
  updatedBy: string
): Promise<ThresholdConfig> {
  // Validate all provided values
  for (const [field, value] of Object.entries(updates)) {
    validateThresholdValue(field, value);
  }

  // Validate severity ordering for drift thresholds
  if (
    updates.driftSeverityLow !== undefined ||
    updates.driftSeverityMedium !== undefined ||
    updates.driftSeverityHigh !== undefined
  ) {
    const low = updates.driftSeverityLow ?? DEFAULT_THRESHOLDS.driftSeverityLow;
    const medium = updates.driftSeverityMedium ?? DEFAULT_THRESHOLDS.driftSeverityMedium;
    const high = updates.driftSeverityHigh ?? DEFAULT_THRESHOLDS.driftSeverityHigh;

    if (!(low < medium && medium < high)) {
      throw new Error("Drift severity thresholds must be ordered: low < medium < high");
    }
  }

  const updateData: unknown = {
    ...updates,
    updatedAt: new Date(),
  };

  const result = await db.thresholdConfig.upsert({
    where: { workspaceId },
    update: updateData,
    create: {
      id: randomUUID(),
      workspaceId,
      ...DEFAULT_THRESHOLDS,
      ...updateData,
      createdBy: updatedBy,
    },
  });

  return {
    confidenceMinThreshold: result.confidenceMinThreshold,
    lowConfidenceValueThreshold: result.lowConfidenceValueThreshold,
    lowConfidenceFailureRateThreshold: result.lowConfidenceFailureRateThreshold,
    ruleBlockValueThreshold: result.ruleBlockValueThreshold,
    falsePositiveRateThreshold: result.falsePositiveRateThreshold,
    blockCountThreshold: result.blockCountThreshold,
    overrideFailureRateThreshold: result.overrideFailureRateThreshold,
    overrideFailureValueThreshold: result.overrideFailureValueThreshold,
    failureCountThreshold: result.failureCountThreshold,
    missingDataValueThreshold: result.missingDataValueThreshold,
    pendingAgeThreshold: result.pendingAgeThreshold,
    fieldMissingRateThreshold: result.fieldMissingRateThreshold,
    confidenceChangeThreshold: result.confidenceChangeThreshold,
    approvalRateChangeThreshold: result.approvalRateChangeThreshold,
    blockRateChangeThreshold: result.blockRateChangeThreshold,
    driftSeverityLow: result.driftSeverityLow,
    driftSeverityMedium: result.driftSeverityMedium,
    driftSeverityHigh: result.driftSeverityHigh,
    stalledPipelineThreshold: result.stalledPipelineThreshold,
  };
}

export async function resetWorkspaceThresholds(
  workspaceId: string
): Promise<void> {
  await db.thresholdConfig.delete({
    where: { workspaceId },
  }).catch(() => {
    // Workspace config doesn't exist, which is fine
  });
}

export function validateThresholdValue(field: string, value: unknown): void {
  if (value === null || value === undefined) {
    return; // Null values skip validation
  }

  const numValue = Number(value);

  if (isNaN(numValue)) {
    throw new Error(`Invalid threshold value for ${field}: must be numeric`);
  }

  // Percentage-based thresholds (0-1.0)
  const percentageFields = [
    "confidenceMinThreshold",
    "lowConfidenceFailureRateThreshold",
    "falsePositiveRateThreshold",
    "overrideFailureRateThreshold",
    "fieldMissingRateThreshold",
    "confidenceChangeThreshold",
    "approvalRateChangeThreshold",
    "blockRateChangeThreshold",
    "driftSeverityLow",
    "driftSeverityMedium",
    "driftSeverityHigh",
  ];

  if (percentageFields.includes(field)) {
    if (numValue < 0 || numValue > 1) {
      throw new Error(`${field} must be between 0 and 1`);
    }
  }

  // Count-based thresholds (positive integers)
  const countFields = ["blockCountThreshold", "failureCountThreshold"];

  if (countFields.includes(field)) {
    if (numValue < 0 || !Number.isInteger(numValue)) {
      throw new Error(`${field} must be a non-negative integer`);
    }
  }

  // Currency/value-based thresholds (non-negative floats)
  const valueFields = [
    "lowConfidenceValueThreshold",
    "ruleBlockValueThreshold",
    "overrideFailureValueThreshold",
    "missingDataValueThreshold",
    "stalledPipelineThreshold",
  ];

  if (valueFields.includes(field)) {
    if (numValue < 0) {
      throw new Error(`${field} must be non-negative`);
    }
  }

  // Time-based thresholds in milliseconds (non-negative integers)
  const timeFields = ["pendingAgeThreshold"];

  if (timeFields.includes(field)) {
    if (numValue < 0 || !Number.isInteger(numValue)) {
      throw new Error(`${field} must be a non-negative integer (milliseconds)`);
    }
  }
}

export function getDefaultThresholds(): ThresholdConfig {
  return DEFAULT_THRESHOLDS;
}
