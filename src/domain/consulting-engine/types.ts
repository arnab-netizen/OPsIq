import { z } from "zod";

// ─── Canonical Enums ──────────────────────────────────────────────────────

export enum DiagnosisType {
  OPERATIONAL_BOTTLENECK = "operational_bottleneck",
  QUALITY_CONTROL_FAILURE = "quality_control_failure",
  CUSTOMER_RETENTION_EROSION = "customer_retention_erosion",
  UNKNOWN = "unknown",
}

export enum InterventionType {
  CONTAINMENT = "CONTAINMENT",
  STABILIZATION = "STABILIZATION",
  STRUCTURAL_REPAIR = "STRUCTURAL_REPAIR",
  GROWTH_ENABLEMENT = "GROWTH_ENABLEMENT",
  RESILIENCE_PROTECTION = "RESILIENCE_PROTECTION",
}

export enum ConstraintSeverity {
  LOW = "LOW",
  MEDIUM = "MEDIUM",
  HIGH = "HIGH",
  CRITICAL = "CRITICAL",
}

export enum PriorityLevel {
  CRITICAL = "CRITICAL",
  HIGH = "HIGH",
  MEDIUM = "MEDIUM",
  LOW = "LOW",
}

// ─── Evidence Types ────────────────────────────────────────────────────────

export enum ConfidenceLevel {
  LOW = "LOW",
  MEDIUM = "MEDIUM",
  HIGH = "HIGH",
  PROVISIONAL = "PROVISIONAL",
}

export const BUSINESS_DIMENSIONS = [
  "customer_retention",
  "operational_efficiency",
  "quality_delivery",
  "financial_health",
  "process_maturity",
  "team_capability",
  "market_position",
] as const;

export type BusinessDimension = (typeof BUSINESS_DIMENSIONS)[number];

export const SupportingDataSchema = z.record(z.string(), z.union([z.string(), z.number(), z.boolean()]));

export const EvidenceItemSchema = z.object({
  id: z.string().uuid(),
  dimension: z.enum(BUSINESS_DIMENSIONS),
  finding: z.string().min(1),
  confidence: z.nativeEnum(ConfidenceLevel),
  source: z.string().min(1),
  timestamp: z.date(),
  isCritical: z.boolean().default(false),
  supportingData: SupportingDataSchema.optional(),
});

export type EvidenceItem = z.infer<typeof EvidenceItemSchema>;

// ─── Constraint Types ─────────────────────────────────────────────────────

export enum ConstraintType {
  RESOURCE = "RESOURCE",
  SKILL = "SKILL",
  PROCESS = "PROCESS",
  CAPITAL = "CAPITAL",
  TIME = "TIME",
  ORGANIZATIONAL = "ORGANIZATIONAL",
}

export const ConstraintSchema = z.object({
  id: z.string().uuid(),
  type: z.nativeEnum(ConstraintType),
  description: z.string().min(1),
  severity: z.nativeEnum(ConstraintSeverity),
  blocksActions: z.array(z.string()),
  releasableVia: z.array(z.string()),
});

export type Constraint = z.infer<typeof ConstraintSchema>;

// ─── Diagnosis Types ──────────────────────────────────────────────────────

export enum DiagnosisConfidence {
  DEFINITIVE = "DEFINITIVE",
  HIGH = "HIGH",
  MODERATE = "MODERATE",
  PROVISIONAL = "PROVISIONAL",
  INSUFFICIENT_EVIDENCE = "INSUFFICIENT_EVIDENCE",
}

export const RootCauseSchema = z.object({
  id: z.string().uuid(),
  type: z.nativeEnum(DiagnosisType),
  description: z.string().min(1),
  mechanismDescription: z.string().min(1),
  evidenceIds: z.array(z.string().uuid()),
  confidence: z.nativeEnum(DiagnosisConfidence),
  alternativeExplanations: z.array(z.string()).optional(),
  missingEvidenceFor: z.array(z.string()).optional(),
});

export type RootCause = z.infer<typeof RootCauseSchema>;

// ─── Intervention Types ────────────────────────────────────────────────────

export enum InterventionClass {
  CONTAINMENT = "CONTAINMENT",
  STABILIZATION = "STABILIZATION",
  STRUCTURAL_REPAIR = "STRUCTURAL_REPAIR",
  GROWTH_ENABLEMENT = "GROWTH_ENABLEMENT",
  RESILIENCE_PROTECTION = "RESILIENCE_PROTECTION",
}

export const InterventionStepSchema = z.object({
  sequence: z.number().int().positive(),
  title: z.string().min(1),
  description: z.string().min(1),
  ownerRole: z.enum([
    "operations_lead",
    "finance_lead",
    "consultant",
    "owner",
    "team_lead",
  ]),
  estimatedDays: z.number().int().positive(),
  dependsOn: z.array(z.number()).optional(),
  successCriteria: z.string().min(1),
});

export type InterventionStep = z.infer<typeof InterventionStepSchema>;

export const InterventionSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1),
  class: z.nativeEnum(InterventionClass),
  objective: z.string().min(1),
  rationale: z.string().min(1),
  whyThisNow: z.string().min(1),
  ownerRole: z.enum([
    "operations_lead",
    "finance_lead",
    "consultant",
    "owner",
    "team_lead",
  ]),
  steps: z.array(InterventionStepSchema).min(1),
  estimatedCostBand: z.enum(["MINIMAL", "LOW", "MEDIUM", "HIGH"]),
  expectedImpactOnRevenue: z.enum(["NONE", "MINOR", "SIGNIFICANT", "TRANSFORMATIVE"]),
  successMetrics: z.array(z.string()).min(1),
  failureRisks: z.array(z.string()).min(1),
  fallbackPlan: z.string().min(1),
  evidenceBasis: z.array(z.string().uuid()),
  constraintDependencies: z.array(z.string().uuid()).optional(),
  estimatedTotalDays: z.number().int().positive(),
  priorityScore: z.number().min(0).max(100),
});

export type Intervention = z.infer<typeof InterventionSchema>;

// ─── Prioritization Types ─────────────────────────────────────────────────

export const PrioritizationFactorSchema = z.object({
  factor: z.string().min(1),
  score: z.number().min(0).max(10),
  rationale: z.string().min(1),
});

export type PrioritizationFactor = z.infer<typeof PrioritizationFactorSchema>;

export const PrioritizedInterventionSchema = z.object({
  intervention: InterventionSchema,
  priorityScore: z.number().min(0).max(100),
  factors: z.array(PrioritizationFactorSchema),
  sequencingReason: z.string().min(1),
  blockedUntil: z.array(z.string().uuid()).optional(),
  enablesInterventions: z.array(z.string().uuid()).optional(),
});

export type PrioritizedIntervention = z.infer<typeof PrioritizedInterventionSchema>;

// ─── Scenario Types ───────────────────────────────────────────────────────

export const ScenarioSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  description: z.string().min(1),
  assumptions: z.array(z.string()).min(1),
  interventionSubset: z.array(z.string().uuid()),
  expectedOutcome: z.string().min(1),
  risks: z.array(z.string()),
  likelihood: z.enum(["VERY_LOW", "LOW", "MODERATE", "HIGH", "VERY_HIGH"]),
});

export type Scenario = z.infer<typeof ScenarioSchema>;

// ─── Decision Memo Types ──────────────────────────────────────────────────

export const DecisionMemoSchema = z.object({
  id: z.string().uuid(),
  engagementId: z.string().uuid(),
  timestamp: z.date(),
  businessProblem: z.string().min(1),
  rootCauseDiagnosis: RootCauseSchema,
  diagnosisConfidence: z.nativeEnum(DiagnosisConfidence),
  criticalConstraints: z.array(ConstraintSchema),
  recommendedInterventions: z.array(PrioritizedInterventionSchema),
  scenarios: z.array(ScenarioSchema).optional(),
  implementation: z.object({
    firstInterventionId: z.string().uuid(),
    totalEstimatedDays: z.number().int().positive(),
    criticalPathInterventions: z.array(z.string().uuid()),
    contingencyRequired: z.boolean(),
  }),
  limitations: z.array(z.string()),
  nextReviewTriggers: z.array(z.string()),
});

export type DecisionMemo = z.infer<typeof DecisionMemoSchema>;

// ─── Consulting Run Input ─────────────────────────────────────────────────

export const ConsultingEngineInputSchema = z.object({
  engagementId: z.string().uuid(),
  businessProblem: z.string().min(1),
  evidence: z.array(EvidenceItemSchema).min(1),
  existingConstraints: z.array(ConstraintSchema).optional(),
  clientContext: z.object({
    industry: z.string(),
    size: z.string(),
    revenueImpactUrgency: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
  }),
});

export type ConsultingEngineInput = z.infer<typeof ConsultingEngineInputSchema>;

// ─── Consulting Run Output ────────────────────────────────────────────────

export const ConsultingEngineOutputSchema = z.object({
  decisionMemo: DecisionMemoSchema,
  status: z.enum(["SUCCESS", "PROVISIONAL", "INSUFFICIENT_EVIDENCE"]),
  warnings: z.array(z.string()),
});

export type ConsultingEngineOutput = z.infer<typeof ConsultingEngineOutputSchema>;
