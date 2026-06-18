import { assertWorkspaceScopedQuery } from "./security-rules";

export type OwnerDecisionStatus =
  | "accepted"
  | "rejected"
  | "modified"
  | "deferred"
  | "needs_more_data"
  | "needs_human_review";

export const OWNER_DECISION_STATUS_TRANSITIONS: Readonly<
  Record<OwnerDecisionStatus, ReadonlyArray<OwnerDecisionStatus>>
> = {
  needs_more_data: ["accepted", "rejected", "modified", "deferred", "needs_human_review"],
  needs_human_review: ["accepted", "rejected", "modified", "deferred"],
  accepted: [], // terminal — triggers action creation
  rejected: [], // terminal — no action
  modified: ["accepted", "rejected", "deferred"],
  deferred: ["accepted", "rejected", "modified", "needs_more_data"],
};

export interface DecisionInput {
  workspaceId: string;
  businessId: string;
  recommendationId: string;
  ownerUserId: string;
  decisionStatus: OwnerDecisionStatus;
  decisionReason: string;
  riskLevel: string; // "low" | "medium" | "high" | "critical"
  verificationStatus: string; // from VerificationStatus
  modifiedDescription?: string;
  deferredUntil?: Date;
  approvalRequiredBy?: string;
  approvedBy?: string;
  approvedAt?: Date;
}

export interface DecisionRightsInput {
  workspaceId: string;
  decisionOwner: string;
  executionOwner?: string;
  reviewOwner?: string;
  benefitOwner?: string;
  riskOwner?: string;
  approvalRequiredBy?: string;
}

export interface DecisionValidationResult {
  valid: boolean;
  violations: string[];
  allowsActionCreation: boolean;
  requiresApprovalFields: boolean;
}

export function validateOwnerDecision(input: DecisionInput): DecisionValidationResult {
  assertWorkspaceScopedQuery({ workspaceId: input.workspaceId });

  const violations: string[] = [];
  let allowsActionCreation = false;
  let requiresApprovalFields = false;

  // DEC-RULE-1: decisionReason must be >= 10 chars
  if (!input.decisionReason || input.decisionReason.trim().length < 10) {
    violations.push("decisionReason must be at least 10 characters (DEC-RULE-1)");
  }

  // DEC-RULE-4: unsafe_to_recommend verification blocks all decisions
  if (input.verificationStatus === "unsafe_to_recommend") {
    violations.push(
      "Cannot capture decision on unsafe recommendation (DEC-RULE-4)"
    );
  }

  // DEC-RULE-5: high/critical risk requires approvalRequiredBy
  if (input.riskLevel === "high" || input.riskLevel === "critical") {
    requiresApprovalFields = true;
    if (!input.approvalRequiredBy || input.approvalRequiredBy.trim() === "") {
      violations.push("High-risk recommendation requires approvalRequiredBy (DEC-RULE-5)");
    }
  }

  // DEC-RULE-6: modified status requires non-empty modifiedDescription
  if (input.decisionStatus === "modified") {
    if (
      !input.modifiedDescription ||
      input.modifiedDescription.trim().length < 10
    ) {
      violations.push("Modified decision requires modifiedDescription (DEC-RULE-6)");
    }
  }

  const valid = violations.length === 0;

  // DEC-RULE-2: rejected → no action creation
  // DEC-RULE-3: deferred → no action creation
  // Only accepted or modified (with no violations) allows action creation
  if (valid && (input.decisionStatus === "accepted" || input.decisionStatus === "modified")) {
    allowsActionCreation = true;
  }

  return { valid, violations, allowsActionCreation, requiresApprovalFields };
}

export function validateDecisionRights(input: DecisionRightsInput): {
  valid: boolean;
  violations: string[];
} {
  assertWorkspaceScopedQuery({ workspaceId: input.workspaceId });

  const violations: string[] = [];

  // DR-RULE-1: decisionOwner must be non-empty
  if (!input.decisionOwner || input.decisionOwner.trim() === "") {
    violations.push("decisionOwner is required (DR-RULE-1)");
  }

  return { valid: violations.length === 0, violations };
}

export function assertAllowsActionCreation(decision: DecisionValidationResult): void {
  if (!decision.allowsActionCreation) {
    const detail =
      decision.violations.length > 0
        ? ` Violations: ${decision.violations.join("; ")}`
        : "";
    throw new Error(
      `Action creation is not allowed for this decision.${detail}`
    );
  }
}

export function isOwnerDecisionStatusTransitionAllowed(
  from: OwnerDecisionStatus,
  to: OwnerDecisionStatus
): boolean {
  return OWNER_DECISION_STATUS_TRANSITIONS[from].includes(to);
}
