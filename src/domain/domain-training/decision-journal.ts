/**
 * F7 — Decision journal record shape + validation (pure).
 *
 * Defines the governed decision record every domain decision must produce. Integrates
 * with the existing decision-memory / outcome-tracking / audit-event architecture for
 * persistence (workspace-scoped); this module owns the SHAPE + the hard rules: a
 * decision cannot be recorded without workspace id, domain, proof requirement, or a
 * verification plan. Pure + deterministic.
 */

import type { RecommendationConfidence, TrainingSeverity } from "@/domain/domain-training/training-types";

export interface DecisionRecord {
  occurredAtMs: number;
  workspaceId: string;
  domain: string;
  archetype: string;
  diagnosis: string;
  evidenceUsed: string[];
  missingData: string[];
  confidence: RecommendationConfidence;
  severity: TrainingSeverity;
  recommendation: string;
  whatNotToDo: string[];
  responsibleRole: string;
  howToExecute: string;
  proofRequired: string;
  expectedOutcome: string;
  verificationPlan: string;
  stopRollbackRedesign: string;
  /** Filled in later, after the outcome window. */
  verificationResult?: string;
  learningStatus?: string;
}

function blank(s: string | undefined | null): boolean {
  return typeof s !== "string" || s.trim().length === 0;
}

/** Returns violations; a decision is unrecordable without the governed essentials. */
export function validateDecisionRecord(r: DecisionRecord): string[] {
  const v: string[] = [];
  if (blank(r.workspaceId)) v.push("missing_workspace_id");
  if (blank(r.domain)) v.push("missing_domain");
  if (blank(r.diagnosis)) v.push("missing_diagnosis");
  if (blank(r.recommendation)) v.push("missing_recommendation");
  if (blank(r.responsibleRole)) v.push("missing_responsible_role");
  if (blank(r.proofRequired)) v.push("missing_proof_requirement");
  if (blank(r.verificationPlan)) v.push("missing_verification_plan");
  if (blank(r.stopRollbackRedesign)) v.push("missing_stop_rollback_redesign");
  return v;
}

export function isDecisionRecordValid(r: DecisionRecord): boolean {
  return validateDecisionRecord(r).length === 0;
}

export class InvalidDecisionRecordError extends Error {
  readonly code = "INVALID_DECISION_RECORD";
  readonly violations: string[];
  constructor(violations: string[]) {
    super(`Decision record invalid: ${violations.join(", ")}.`);
    this.name = "InvalidDecisionRecordError";
    this.violations = violations;
  }
}

/** Guard before persisting via the existing decision-memory/audit layer. */
export function assertRecordable(r: DecisionRecord): void {
  const violations = validateDecisionRecord(r);
  if (violations.length > 0) throw new InvalidDecisionRecordError(violations);
}
