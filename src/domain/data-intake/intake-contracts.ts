/**
 * ADDENDUM F: Data Intake Contracts
 *
 * Defines all API schemas, DTO contracts, and input validation gates
 * for data entry points across OpsIQ.
 *
 * Non-DB: Contains only type definitions and validation schemas (no persistence).
 * Ready for: Integration with API routes once database available.
 */

import { z } from "zod";

// ============================================================================
// CORE INTAKE CONTRACTS (foundational for all data operations)
// ============================================================================

/** Request context containing auth + workspace + user info */
export const RequestContextSchema = z.object({
  workspaceId: z.string().min(1),
  userId: z.string().min(1),
  userEmail: z.string().email(),
  userRole: z.enum(["admin", "owner", "user", "guest"]),
  timestamp: z.date(),
  traceId: z.string().optional(),
});

export type RequestContext = z.infer<typeof RequestContextSchema>;

// ============================================================================
// BUSINESS ENTITY INTAKE SCHEMAS
// ============================================================================

/** Engagement creation intake (consulting lifecycle data) */
export const EngagementIntakeSchema = z.object({
  clientName: z.string().min(1).max(255),
  clientEmail: z.string().email(),
  projectName: z.string().min(1).max(255),
  projectScope: z.enum(["diagnosis", "optimization", "transformation", "coaching"]),
  estimatedDuration: z.number().min(1).max(365),
  estimatedBudget: z.number().min(0),
  businessGoals: z.array(z.string().min(1)).min(1),
  initialCondition: z.object({
    revenue: z.number().min(0).optional(),
    employees: z.number().min(1).optional(),
    marketShare: z.number().min(0).max(100).optional(),
    growthRate: z.number().optional(),
  }),
});

export type EngagementIntake = z.infer<typeof EngagementIntakeSchema>;

/** Evidence intake (findings, data points, observations) */
export const EvidenceIntakeSchema = z.object({
  findingType: z.enum([
    "metric_variance",
    "process_gap",
    "capability_gap",
    "market_threat",
    "opportunity",
    "risk",
    "dependency",
  ]),
  title: z.string().min(1).max(255),
  description: z.string().min(1),
  severity: z.enum(["critical", "high", "medium", "low", "informational"]),
  source: z.enum([
    "client_interview",
    "data_analysis",
    "market_research",
    "internal_audit",
    "financial_review",
    "operational_review",
  ]),
  sourceReference: z.string().optional(),
  measurableImpact: z.object({
    metric: z.string(),
    currentValue: z.number(),
    targetValue: z.number(),
    unit: z.string(),
    timeframe: z.string(),
  }).optional(),
});

export type EvidenceIntake = z.infer<typeof EvidenceIntakeSchema>;

/** Action intake (executable next steps) */
export const ActionIntakeSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().min(1),
  owner: z.string().min(1),
  dueDate: z.date(),
  priority: z.enum(["critical", "high", "normal", "low"]),
  estimatedHours: z.number().min(0.5),
  expectedOutcome: z.string().min(1),
  successCriteria: z.array(z.string().min(1)).min(1),
  dependencies: z.array(z.string()).optional(),
  riskOfDelay: z.enum(["revenue_loss", "capability_gap", "compliance_risk", "relationship_risk", "none"]).optional(),
});

export type ActionIntake = z.infer<typeof ActionIntakeSchema>;

/** Decision intake (strategic choices with options) */
export const DecisionIntakeSchema = z.object({
  title: z.string().min(1).max(255),
  context: z.string().min(1),
  optionsToConsider: z.array(z.object({
    name: z.string().min(1),
    pros: z.array(z.string().min(1)),
    cons: z.array(z.string().min(1)),
    estimatedCost: z.number().min(0).optional(),
    estimatedTimelineWeeks: z.number().min(0).optional(),
  })).min(2),
  deadline: z.date().optional(),
  decisionMaker: z.string(),
  recommendedOption: z.number().int().min(0).optional(),
});

export type DecisionIntake = z.infer<typeof DecisionIntakeSchema>;

/** Recommendation intake (expert advice tied to evidence) */
export const RecommendationIntakeSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().min(1),
  rationale: z.string().min(1),
  linkedEvidenceIds: z.array(z.string()).min(1),
  implementationSteps: z.array(z.string().min(1)),
  expectedROI: z.object({
    metric: z.string(),
    projectedImprovement: z.number(),
    timelineMonths: z.number().min(1),
  }).optional(),
  risk: z.enum(["low", "medium", "high"]).optional(),
  owner: z.string().optional(),
});

export type RecommendationIntake = z.infer<typeof RecommendationIntakeSchema>;

/** Experiment intake (hypothesis testing) */
export const ExperimentIntakeSchema = z.object({
  title: z.string().min(1).max(255),
  hypothesis: z.string().min(1),
  controlGroup: z.string().min(1),
  treatmentGroup: z.string().min(1),
  successMetric: z.object({
    name: z.string(),
    baselineValue: z.number(),
    successThreshold: z.number(),
    measurementMethod: z.string(),
  }),
  durationDays: z.number().min(1).max(365),
  estimatedCost: z.number().min(0).optional(),
});

export type ExperimentIntake = z.infer<typeof ExperimentIntakeSchema>;

// ============================================================================
// FINANCIAL INTAKE SCHEMAS
// ============================================================================

/** Cost center intake */
export const CostCenterIntakeSchema = z.object({
  name: z.string().min(1).max(255),
  owner: z.string().min(1),
  budget: z.number().min(0),
  budgetPeriod: z.enum(["monthly", "quarterly", "annual"]),
  description: z.string().optional(),
});

export type CostCenterIntake = z.infer<typeof CostCenterIntakeSchema>;

/** Revenue stream intake */
export const RevenueStreamIntakeSchema = z.object({
  name: z.string().min(1).max(255),
  model: z.enum(["subscription", "transaction", "licensing", "consulting", "marketplace", "other"]),
  currentMonthlyRevenue: z.number().min(0),
  growthRate: z.number().optional(),
  margin: z.number().min(0).max(100).optional(),
  customerCount: z.number().min(0).optional(),
});

export type RevenueStreamIntake = z.infer<typeof RevenueStreamIntakeSchema>;

// ============================================================================
// DATA QUALITY CONTRACTS
// ============================================================================

/** Intake validation result */
export const IntakeValidationResultSchema = z.object({
  valid: z.boolean(),
  errors: z.array(z.object({
    field: z.string(),
    message: z.string(),
    code: z.enum([
      "MISSING_REQUIRED",
      "INVALID_FORMAT",
      "OUT_OF_RANGE",
      "INVALID_ENUM",
      "CONSTRAINT_VIOLATED",
      "UNKNOWN",
    ]),
  })),
  warnings: z.array(z.object({
    field: z.string().optional(),
    message: z.string(),
  })),
  metadata: z.object({
    receivedAt: z.date(),
    processedAt: z.date(),
    processingTimeMs: z.number(),
  }),
});

export type IntakeValidationResult = z.infer<typeof IntakeValidationResultSchema>;

/** Data completeness gate */
export const DataCompletenessSchema = z.object({
  requiredFieldsPresent: z.number().min(0),
  optionalFieldsPresent: z.number().min(0),
  totalRequiredFields: z.number().min(1),
  totalOptionalFields: z.number().min(0),
  completenessPercent: z.number().min(0).max(100),
  missingCriticalFields: z.array(z.string()),
});

export type DataCompleteness = z.infer<typeof DataCompletenessSchema>;

// ============================================================================
// VALIDATION HELPER FUNCTIONS
// ============================================================================

/**
 * Validates intake against schema, returns structured result
 */
export function validateIntake<T>(
  schema: z.ZodSchema<T>,
  data: unknown,
  intakeType: string,
): IntakeValidationResult {
  const receivedAt = new Date();
  const result = schema.safeParse(data);
  const processedAt = new Date();
  const processingTimeMs = processedAt.getTime() - receivedAt.getTime();

  if (result.success) {
    return {
      valid: true,
      errors: [],
      warnings: [],
      metadata: { receivedAt, processedAt, processingTimeMs },
    };
  }

  // Parse Zod errors into structured format
  const errors = result.error.issues.map((issue) => ({
    field: issue.path.join("."),
    message: issue.message,
    code: mapZodCodeToIntakeCode(issue.code),
  }));

  return {
    valid: false,
    errors,
    warnings: [],
    metadata: { receivedAt, processedAt, processingTimeMs },
  };
}

/**
 * Map Zod error codes to intake-specific codes
 */
function mapZodCodeToIntakeCode(
  zodCode: string,
): "MISSING_REQUIRED" | "INVALID_FORMAT" | "OUT_OF_RANGE" | "INVALID_ENUM" | "CONSTRAINT_VIOLATED" | "UNKNOWN" {
  switch (zodCode) {
    case "invalid_type":
      return "INVALID_FORMAT";
    case "too_small":
    case "too_big":
      return "OUT_OF_RANGE";
    case "invalid_enum_value":
      return "INVALID_ENUM";
    default:
      return "UNKNOWN";
  }
}

/**
 * Assess data completeness
 */
export function assessCompleteness(data: Record<string, unknown>): DataCompleteness {
  const entries = Object.entries(data);
  const presentCount = entries.filter(([, v]) => v !== null && v !== undefined && v !== "").length;
  const totalCount = entries.length;

  return {
    requiredFieldsPresent: presentCount,
    optionalFieldsPresent: 0,
    totalRequiredFields: totalCount,
    totalOptionalFields: 0,
    completenessPercent: totalCount > 0 ? Math.round((presentCount / totalCount) * 100) : 0,
    missingCriticalFields: entries
      .filter(([, v]) => v === null || v === undefined || v === "")
      .map(([k]) => k),
  };
}
