/**
 * Owner Mode Individual Domain Training — domain training contract + validator (pure).
 *
 * The shared contract every business-control domain must satisfy before it can be
 * trained/scored. It binds a domain to its required inputs, diagnostic rubric, decision
 * and anti-action rules, and — critically — its PROOF, VERIFICATION, and
 * STOP/ROLLBACK/REDESIGN rules. A domain without those governance rules is rejected:
 * OpsIQ must never advise without proof + verification + a way to stop.
 *
 * Reuses the shared training vocabulary (training-types.ts); does not re-derive
 * confidence/severity scales. Pure + deterministic.
 */

import {
  TrainingLevel,
  type RecommendationConfidence,
  type TrainingSeverity,
  type ScenarioType,
  MIN_CASES_PER_DOMAIN,
} from "@/domain/domain-training/training-types";

/** A named data field a domain consumes, with its confidence sensitivity. */
export interface DataField {
  key: string;
  description: string;
  /** Whether this field is required for any confident advice. */
  critical: boolean;
}

export interface ProofRule {
  /** What the proof attests (e.g. "bank balance", "call note + promised date"). */
  requirement: string;
  /** Acceptable proof types (reuses the proof-FSM vocabulary, e.g. "call_log"). */
  acceptableProofTypes: string[];
}

export interface VerificationRule {
  /** How the outcome is measured (not just task completion). */
  method: string;
  /** The metric that must move for success. */
  successMetric: string;
}

export interface StopRollbackRedesignRules {
  stop: string;
  rollback: string;
  redesign: string;
}

export interface ScoringRubric {
  diagnosis: number;
  priority: number;
  confidenceSeverity: number;
  whatNotToDo: number;
  nextAction: number;
  assignment: number;
  executionSteps: number;
  proofRequirement: number;
  verificationMethod: number;
  stopRollbackRedesign: number;
}

/** The canonical 100-point rubric (F15). */
export const STANDARD_SCORING_RUBRIC: ScoringRubric = {
  diagnosis: 20,
  priority: 10,
  confidenceSeverity: 10,
  whatNotToDo: 10,
  nextAction: 10,
  assignment: 10,
  executionSteps: 10,
  proofRequirement: 10,
  verificationMethod: 5,
  stopRollbackRedesign: 5,
};

export interface PromotionGates {
  /** Minimum level this domain must reach to be considered complete. */
  minimumLevel: TrainingLevel;
  /** Score (%) required for the minimum level. */
  requiredScorePct: number;
  /** Unsafe outputs that hard-fail regardless of score. */
  hardFailOnUnsafe: true;
}

export interface DomainContract {
  domainId: string;
  domainName: string;
  domainCategory: string;
  /** Archetypes this contract applies to ("universal" + specific packs). */
  archetypes: string[];
  requiredInputs: DataField[];
  optionalInputs: DataField[];
  /** Minimum data needed to advise at all. */
  minimumViableDataPack: string[];
  /** Reduced pack acceptable only in an emergency (conservative advice). */
  emergencyDataPack: string[];
  /** Below this confidence the domain must refuse to advise. */
  cannotAdviseThreshold: RecommendationConfidence;
  diagnosticRubric: string[];
  decisionRules: string[];
  antiActionRules: string[];
  proofRules: ProofRule[];
  verificationRules: VerificationRule[];
  stopRollbackRedesign: StopRollbackRedesignRules;
  severityRules: string[];
  confidenceRules: string[];
  /** Metrics that must be checked for harm even when the primary metric improves. */
  sideEffectMetrics: string[];
  learningEligibilityRules: string[];
  /** Identifiers of simulation cases registered for this domain. */
  simulationCaseIds: string[];
  scoringRubric: ScoringRubric;
  promotionGates: PromotionGates;
}

function blank(s: string | undefined | null): boolean {
  return typeof s !== "string" || s.trim().length === 0;
}

/**
 * Validate a domain contract against the hard governance rules. Returns violations
 * (empty when valid). A domain is INVALID without proof, verification, or
 * stop/rollback/redesign rules.
 */
export function validateDomainContract(c: DomainContract): string[] {
  const v: string[] = [];
  if (blank(c.domainId)) v.push("missing_domain_id");
  if (blank(c.domainName)) v.push("missing_domain_name");
  if (blank(c.domainCategory)) v.push("missing_domain_category");
  if (!c.archetypes || c.archetypes.length === 0) v.push("missing_archetypes");
  if (!c.requiredInputs || c.requiredInputs.length === 0) v.push("missing_required_inputs");
  if (!c.minimumViableDataPack || c.minimumViableDataPack.length === 0) v.push("missing_minimum_viable_data_pack");
  if (!c.diagnosticRubric || c.diagnosticRubric.length === 0) v.push("missing_diagnostic_rubric");
  if (!c.decisionRules || c.decisionRules.length === 0) v.push("missing_decision_rules");
  if (!c.antiActionRules || c.antiActionRules.length === 0) v.push("missing_anti_action_rules");

  // The non-negotiable governance trio.
  if (!c.proofRules || c.proofRules.length === 0) v.push("missing_proof_rules");
  else if (c.proofRules.some((p) => blank(p.requirement) || !p.acceptableProofTypes?.length)) v.push("incomplete_proof_rules");
  if (!c.verificationRules || c.verificationRules.length === 0) v.push("missing_verification_rules");
  else if (c.verificationRules.some((r) => blank(r.method) || blank(r.successMetric))) v.push("incomplete_verification_rules");
  if (!c.stopRollbackRedesign
      || blank(c.stopRollbackRedesign.stop)
      || blank(c.stopRollbackRedesign.rollback)
      || blank(c.stopRollbackRedesign.redesign)) {
    v.push("missing_stop_rollback_redesign_rules");
  }

  if (!c.sideEffectMetrics || c.sideEffectMetrics.length === 0) v.push("missing_side_effect_metrics");
  if (!c.severityRules || c.severityRules.length === 0) v.push("missing_severity_rules");
  if (!c.confidenceRules || c.confidenceRules.length === 0) v.push("missing_confidence_rules");
  if (!c.learningEligibilityRules || c.learningEligibilityRules.length === 0) v.push("missing_learning_eligibility_rules");
  if (!c.promotionGates || c.promotionGates.hardFailOnUnsafe !== true) v.push("missing_or_unsafe_promotion_gates");

  return v;
}

export function isDomainContractValid(c: DomainContract): boolean {
  return validateDomainContract(c).length === 0;
}

export class InvalidDomainContractError extends Error {
  readonly code = "INVALID_DOMAIN_CONTRACT";
  readonly violations: string[];
  constructor(domainId: string, violations: string[]) {
    super(`Domain contract ${domainId || "<unknown>"} invalid: ${violations.join(", ")}.`);
    this.name = "InvalidDomainContractError";
    this.violations = violations;
  }
}

export function assertValidDomainContract(c: DomainContract): void {
  const violations = validateDomainContract(c);
  if (violations.length > 0) throw new InvalidDomainContractError(c.domainId, violations);
}

/** Whether a contract carries enough registered cases to be eligible for training. */
export function hasMinimumCases(c: DomainContract): boolean {
  return (c.simulationCaseIds?.length ?? 0) >= MIN_CASES_PER_DOMAIN;
}

export type { RecommendationConfidence, TrainingSeverity, ScenarioType };
