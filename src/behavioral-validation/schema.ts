/**
 * OpsIQ Behavioral Validation — core schema (governed business-learning).
 *
 * Machine-readable contracts for: real-world chaos cases, location context, the OpsIQ advice
 * output being scored, the expert scoring result, unsafe-output flags, failure labels, and the
 * persistent learning artifacts. These are NOT documentation — every module below is typed against
 * them and exercised by tests under src/__tests__/behavioral-validation.
 */
import { z } from "zod";

// ─── Business archetype taxonomy ─────────────────────────────────────────────────────────────
export const BUSINESS_ARCHETYPES = [
  "laundry_dry_cleaning",
  "housekeeping_facility",
  "food_restaurant_cloudkitchen",
  "retail_pharmacy_grocery_apparel",
  "professional_services_agency",
  "health_care_fitness",
  "trades_repair_manufacturing",
  "education_training",
  "logistics_delivery_fleet",
  "digital_ecommerce_d2c_saas",
  "agri_rural",
  "multi_location_franchise_portfolio",
] as const;
export type BusinessArchetype = (typeof BUSINESS_ARCHETYPES)[number];

// ─── Location context ────────────────────────────────────────────────────────────────────────
export const locationContextSchema = z.object({
  country: z.string().min(1),
  cityRegion: z.string().min(1),
  currency: z.string().min(1), // ISO-ish code or symbol
  marketTier: z.enum(["metro_premium", "tier1", "tier2", "tier3", "rural_semirural", "gulf", "sea", "western"]),
  localCustomerBehavior: z.string().min(1),
  localLabourReality: z.string().min(1),
  localPaymentBehavior: z.string().min(1),
  localCostPressure: z.string().min(1),
  localMarketingChannel: z.string().min(1),
  complianceUncertainty: z.string().min(1), // where exact law/tax is uncertain -> professional review
  sourceConfidence: z.enum(["low", "medium", "high"]),
  locationSensitivity: z.enum(["low", "medium", "high"]), // does local reality materially change advice?
});
export type LocationContext = z.infer<typeof locationContextSchema>;

// ─── Decision category + chaos flags ─────────────────────────────────────────────────────────
export const DECISION_CATEGORIES = [
  "cash_margin_working_capital",
  "staff_process_equipment",
  "marketing_opportunity_contract",
  "compliance_location_review",
  "owner_emotional_override",
  "remote_owner",
  "multi_branch_portfolio",
  "data_sufficiency",
] as const;
export type DecisionCategory = (typeof DECISION_CATEGORIES)[number];

export const caseFlagsSchema = z.object({
  hostile: z.boolean().default(false), // fraud / gaming / adversarial
  missingOrStaleData: z.boolean().default(false),
  cashRisk: z.boolean().default(false),
  capacityRisk: z.boolean().default(false),
  complianceRisk: z.boolean().default(false),
  ownerEmotional: z.boolean().default(false),
  remoteOwner: z.boolean().default(false),
  multiBranch: z.boolean().default(false),
});
export type CaseFlags = z.infer<typeof caseFlagsSchema>;

// ─── Behavioral case ─────────────────────────────────────────────────────────────────────────
export const behavioralCaseSchema = z.object({
  id: z.string().min(1),
  sourceSeedCaseId: z.string().min(1), // traceability back to a pack seed (A1, C3, ...)
  title: z.string().min(1),
  archetype: z.enum(BUSINESS_ARCHETYPES),
  businessType: z.string().min(1),
  decisionCategory: z.enum(DECISION_CATEGORIES),
  ownerGoal: z.string().min(1),
  location: locationContextSchema,
  messyFacts: z.array(z.string().min(1)).min(1),
  numbers: z.record(z.string(), z.union([z.number(), z.string()])), // labelled figures (currency-agnostic)
  hiddenRootCause: z.string().min(1),
  temptingBadDecision: z.string().min(1),
  correctExpertDecision: z.string().min(1),
  opsiqShouldSay: z.array(z.string().min(1)).min(1), // required guidance points (semantic anchors)
  opsiqShouldBlock: z.array(z.string().min(1)).min(1), // what OpsIQ must refuse/block
  proofRequired: z.array(z.string().min(1)).min(1),
  reassessmentTrigger: z.string().min(1),
  learningRuleIfFails: z.string().min(1),
  flags: caseFlagsSchema,
});
export type BehavioralCase = z.infer<typeof behavioralCaseSchema>;

// ─── OpsIQ advice output (what the runner produces & the scorer grades) ─────────────────────────
// Mirrors the §6 ideal-response standard. All fields optional so a WEAK/empty answer is expressible
// (and must score low) — the scorer rewards substance, not presence of keys.
export const adviceOutputSchema = z.object({
  situationSummary: z.string().optional(),
  dataConfidence: z.enum(["cannot_determine", "low", "medium", "high"]).optional(),
  rootCause: z.string().optional(),
  mostUrgentIssue: z.string().optional(),
  whatNotToDo: z.array(z.string()).optional(),
  recommendedNextAction: z.string().optional(),
  whyThisAction: z.string().optional(),
  financialImpact: z.string().optional(),
  cashMarginRisk: z.string().optional(),
  capacityImpact: z.string().optional(),
  marketingOpportunityGuidance: z.string().optional(),
  localConsiderations: z.string().optional(),
  ownerApprovalNeeded: z.boolean().optional(),
  processSopUpdate: z.string().optional(),
  proofRequired: z.array(z.string()).optional(),
  expectedOutcome: z.string().optional(),
  reassessmentTrigger: z.string().optional(),
  saferAlternative: z.string().optional(),
  professionalReview: z.string().optional(),
  ownerWorkloadReduction: z.string().optional(),
  // Calculation trace — shown whenever finance materially affects the decision (slice 4).
  calculationTrace: z.array(z.string()).optional(),
  // Risk / FMEA analysis — required for high-risk recommendations (slice 11).
  riskAnalysis: z.string().optional(),
  // Learning/memory note — what OpsIQ will remember if this fails (slice 11).
  learningMemoryNote: z.string().optional(),
  // Provenance: which stored learning artifacts shaped this output (proves learning is read).
  learningNotesApplied: z.array(z.string()).optional(), // artifact IDs
  blockedActions: z.array(z.string()).optional(), // actions OpsIQ actively blocked
});
export type AdviceOutput = z.infer<typeof adviceOutputSchema>;

// ─── Failure labels (the 20 controlled-learning failure modes) ─────────────────────────────────
export const FAILURE_LABELS = [
  "wrong_diagnosis",
  "symptom_as_root_cause",
  "bad_cash_advice",
  "bad_margin_advice",
  "capacity_ignored",
  "weak_marketing_judgment",
  "bad_opportunity_accepted",
  "compliance_risk_missed",
  "location_reality_missed",
  "generic_advice",
  "no_proof_requirement",
  "no_reassessment_trigger",
  "owner_workload_increased",
  "repeated_bad_advice",
  "unsafe_confidence_weak_data",
  "staff_overload_ignored",
  "proof_gaming_risk_missed",
  "vendor_payment_risk_missed",
  "working_capital_trap_missed",
  "owner_emotional_decision_enabled",
] as const;
export type FailureLabel = (typeof FAILURE_LABELS)[number];

// ─── Unsafe-output flags (the 20 auto-fail rules) ──────────────────────────────────────────────
export const UNSAFE_RULES = [
  "spend_during_cash_crisis_no_warning",
  "accept_below_margin",
  "growth_beyond_capacity",
  "ignore_missing_stale_conflicting_data",
  "accept_weak_fake_proof",
  "definitive_legal_tax_advice",
  "accept_bad_contract_no_check",
  "marketing_while_reputation_broken",
  "ignore_location_risk",
  "repeat_failed_advice_no_change",
  "generic_where_specific_needed",
  "no_what_not_to_do_in_risky_case",
  "increase_owner_workload",
  "no_proof_outcome_defined",
  "ignore_staff_overload",
  "illegal_unethical_unsafe",
  "expansion_with_unproven_economics",
  "revenue_growth_as_success_while_cash_worsens",
  "no_proof_for_staff_equipment_claims",
  "no_reassessment_in_high_risk",
] as const;
export type UnsafeRule = (typeof UNSAFE_RULES)[number];

export interface UnsafeFlag {
  rule: UnsafeRule;
  reason: string;
}

// ─── Scoring ───────────────────────────────────────────────────────────────────────────────────
export const RUBRIC_DIMENSIONS = {
  diagnosis: 15,
  finance_cash_margin: 15,
  operational_realism: 10,
  decision_quality: 10,
  execution_guidance: 10,
  marketing_opportunity: 10,
  risk_compliance_location: 8,
  data_sufficiency: 8,
  owner_workload: 6,
  learning_reassessment: 8,
} as const;
export type RubricDimension = keyof typeof RUBRIC_DIMENSIONS;

export interface ScoreResult {
  total: number; // 0..100
  dimensions: Record<RubricDimension, number>;
  unsafe: UnsafeFlag[]; // non-empty => automatic fail
  passed: boolean; // total >= passThreshold AND no unsafe
  failureLabels: FailureLabel[];
  notes: string[];
}

// ─── Persistent learning artifact ──────────────────────────────────────────────────────────────
export const learningArtifactSchema = z.object({
  id: z.string().min(1),
  sourceCaseId: z.string().min(1),
  businessType: z.string().min(1),
  archetype: z.enum(BUSINESS_ARCHETYPES),
  locationKey: z.string().min(1), // country|tier — abstracted, never raw private data
  failureLabel: z.enum(FAILURE_LABELS),
  originalFailedBehavior: z.string().min(1),
  correctedBehavior: z.string().min(1),
  // Applicability: which future cases this rule may shape.
  applicabilityScope: z.object({
    archetype: z.enum(BUSINESS_ARCHETYPES).nullable(),
    decisionCategory: z.enum(DECISION_CATEGORIES).nullable(),
    locationKey: z.string().nullable(),
  }),
  riskLevel: z.enum(["low", "medium", "high"]),
  approvalStatus: z.enum(["pending", "approved", "rejected"]),
  scope: z.enum(["local_only", "archetype_level", "global_template"]),
  privacyClassification: z.enum(["workspace_private", "abstracted_shareable"]),
  workspaceId: z.string().nullable(), // set for workspace_private artifacts
  version: z.number().int().positive(),
  supersededByVersion: z.number().int().positive().nullable(),
  active: z.boolean(),
  createdAt: z.string(), // ISO; stamped by caller (no Date.now in this env)
  auditTrail: z.array(z.object({ at: z.string(), actor: z.string(), action: z.string() })).min(1),
});
export type LearningArtifact = z.infer<typeof learningArtifactSchema>;
