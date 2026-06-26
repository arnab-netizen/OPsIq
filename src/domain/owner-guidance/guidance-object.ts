/**
 * Module 41 — Step-by-step guidance object contract + validation (pure).
 *
 * Every owner-approved action is convertible into one or more guidance objects.
 * This file defines the contract and the HARD-RULE validation that enforces the
 * non-negotiable fields (workspaceId, businessFunction, reasonNow, exactStep,
 * proof requirement, boundary validation for employee-facing steps, owner approval
 * for high-risk, professional review for compliance/tax/legal).
 *
 * Reuses existing primitives — ProofType (proof.ts), EvidenceConfidenceLevel
 * (M1), BoundaryValidationStatus (boundary.ts) — rather than redefining them.
 *
 * Pure + deterministic.
 */

import { ProofType } from "@/domain/execution/proof";
import { EvidenceConfidenceLevel } from "@/domain/business-impact/recommendation-business-impact";
import { BoundaryValidationStatus, isBoundaryValidationPassed } from "@/domain/execution/boundary";
import {
  BusinessFunction,
  assertBusinessFunction,
  requiresProfessionalReview,
} from "@/domain/owner-guidance/business-function";

export type GuidancePriority = "EMERGENCY" | "HIGH" | "MEDIUM" | "LOW";

export interface GuidanceObject {
  guidanceId: string;
  workspaceId: string;
  ownerActionId: string;
  recommendationId: string;
  businessFunction: BusinessFunction[];
  archetype: string | null;
  priority: GuidancePriority;
  reasonNow: string;
  exactStep: string;
  sequenceNumber: number;
  assignedRole: string;
  assignedPerson?: string;
  deadline: string;
  /** Whether a proof is required. When false, `noProofReason` must justify it. */
  proofRequired: boolean;
  proofType?: ProofType;
  noProofReason?: string;
  expectedOutcome: string;
  confidence: EvidenceConfidenceLevel;
  missingData: string[];
  blockedActions: string[];
  actionsToAvoid: string[];
  escalationRule: string;
  rollbackTrigger: string;
  ownerApprovalRequired: boolean;
  professionalReviewRequired: boolean;
  learningEligibilityRule: string;
  /** Set when this step is employee-facing (assigned to a non-owner role). */
  employeeFacing: boolean;
  /** Boundary validation status for employee-facing steps. */
  boundaryStatus?: BoundaryValidationStatus;
}

function blank(s: string | undefined | null): boolean {
  return typeof s !== "string" || s.trim().length === 0;
}

/**
 * Validate a guidance object against the Module 41 hard rules. Returns the list of
 * violations (empty when valid). Does not throw.
 */
export function validateGuidanceObject(g: GuidanceObject): string[] {
  const v: string[] = [];

  if (blank(g.workspaceId)) v.push("missing_workspace_id");
  if (blank(g.reasonNow)) v.push("missing_reason_now");
  if (blank(g.exactStep)) v.push("missing_exact_step");
  if (blank(g.expectedOutcome)) v.push("missing_expected_outcome");
  if (blank(g.escalationRule)) v.push("missing_escalation_rule");
  if (blank(g.rollbackTrigger)) v.push("missing_rollback_trigger");

  // Business function is required (≥1 valid value).
  try {
    assertBusinessFunction(g.businessFunction, g.guidanceId || "guidance");
  } catch {
    v.push("missing_business_function");
  }

  // Proof: required, OR explicitly waived with a reason.
  if (g.proofRequired) {
    if (!g.proofType) v.push("missing_proof_type");
  } else if (blank(g.noProofReason)) {
    v.push("missing_no_proof_reason");
  }

  // Employee-facing steps require a PASSED boundary validation.
  if (g.employeeFacing) {
    if (g.boundaryStatus === undefined || !isBoundaryValidationPassed(g.boundaryStatus)) {
      v.push("employee_guidance_requires_boundary_validation");
    }
  }

  // Compliance/tax/legal-sensitive functions require a professional-review flag.
  if (requiresProfessionalReview(Array.isArray(g.businessFunction) ? g.businessFunction : [])
      && !g.professionalReviewRequired) {
    v.push("professional_review_required_not_flagged");
  }

  // High-risk priority must require owner approval.
  if ((g.priority === "EMERGENCY" || g.priority === "HIGH") && !g.ownerApprovalRequired) {
    v.push("high_risk_guidance_requires_owner_approval");
  }

  // Weak/insufficient-confidence guidance cannot be assigned EMERGENCY priority
  // unless the missing data driving the uncertainty is explicitly named.
  if (
    (g.confidence === EvidenceConfidenceLevel.WEAK
      || g.confidence === EvidenceConfidenceLevel.INSUFFICIENT)
    && g.priority === "EMERGENCY"
    && g.missingData.length === 0
  ) {
    v.push("weak_confidence_emergency_requires_named_missing_data");
  }

  return v;
}

export function isGuidanceValid(g: GuidanceObject): boolean {
  return validateGuidanceObject(g).length === 0;
}

export class InvalidGuidanceError extends Error {
  readonly code = "INVALID_GUIDANCE";
  readonly violations: string[];
  constructor(ref: string, violations: string[]) {
    super(`Guidance ${ref} invalid: ${violations.join(", ")}.`);
    this.name = "InvalidGuidanceError";
    this.violations = violations;
  }
}

/** Guard: throws InvalidGuidanceError when the guidance object breaks a hard rule. */
export function assertValidGuidance(g: GuidanceObject): void {
  const violations = validateGuidanceObject(g);
  if (violations.length > 0) throw new InvalidGuidanceError(g.guidanceId || "guidance", violations);
}
