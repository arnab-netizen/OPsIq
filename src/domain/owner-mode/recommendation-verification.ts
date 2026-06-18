import { assertWorkspaceScopedQuery } from "./security-rules";

export type VerificationStatus =
  | "pending"
  | "verified_enough"
  | "provisional"
  | "data_limited"
  | "high_risk_requires_owner_approval"
  | "unsafe_to_recommend"
  | "reassessment_required";

export const VERIFICATION_STATUS_TRANSITIONS: Readonly<Record<VerificationStatus, ReadonlyArray<VerificationStatus>>> = {
  pending: ["verified_enough", "provisional", "data_limited", "high_risk_requires_owner_approval", "unsafe_to_recommend"],
  verified_enough: ["reassessment_required"],
  provisional: ["verified_enough", "data_limited", "reassessment_required"],
  data_limited: ["provisional", "reassessment_required", "unsafe_to_recommend"],
  high_risk_requires_owner_approval: ["verified_enough", "unsafe_to_recommend", "reassessment_required"],
  unsafe_to_recommend: [],
  reassessment_required: ["pending"],
};

export interface VerificationInput {
  workspaceId: string;
  businessId: string;
  recommendationId: string;
  riskLevel: string;
  confidenceScore: number;
  evidenceSupporting: string[];
  evidenceContradicting: string[];
  missingData: string[];
  assumptionsMade: string[];
  whatWouldMakeThisWrong: string;
  violatesOwnerConstraints: boolean;
  constraintViolationDetail?: string;
  fitsWithinCashRunway: boolean;
  hasFailedBefore: boolean;
  pastFailureContext?: string;
  downsideIfWrong: string;
  stopLossCondition: string;
}

export interface OverrelianceAcknowledgementInput {
  workspaceId: string;
  recommendationId: string;
  ownerUserId: string;
  keyAssumptionAcknowledged: boolean;
  mainDownsideAcknowledged: boolean;
  stopConditionAcknowledged: boolean;
  evidenceLimitAcknowledged: boolean;
  ownerIsDecisionMaker: boolean;
}

export interface VerificationResult {
  valid: boolean;
  violations: string[];
  verificationStatus: VerificationStatus;
  requiresAntiOverrelianceAck: boolean;
  blockedReasons: string[];
}

export interface AntiOverrelianceResult {
  complete: boolean;
  missingAcknowledgements: string[];
}

export function runVerification(input: VerificationInput): VerificationResult {
  assertWorkspaceScopedQuery({ workspaceId: input.workspaceId });

  const violations: string[] = [];
  const blockedReasons: string[] = [];

  // VER-RULE-1
  if (!input.whatWouldMakeThisWrong || input.whatWouldMakeThisWrong.trim().length < 10) {
    violations.push("whatWouldMakeThisWrong must be at least 10 characters (VER-RULE-1)");
  }

  // VER-RULE-2
  if (!input.downsideIfWrong || input.downsideIfWrong.trim().length < 10) {
    violations.push("downsideIfWrong must be at least 10 characters (VER-RULE-2)");
  }

  // VER-RULE-3
  if (!input.stopLossCondition || input.stopLossCondition.trim().length < 10) {
    violations.push("stopLossCondition must be at least 10 characters (VER-RULE-3)");
  }

  // VER-RULE-4
  if (input.violatesOwnerConstraints) {
    blockedReasons.push("Violates owner constraints");
  }

  // VER-RULE-5
  if (!input.fitsWithinCashRunway) {
    blockedReasons.push("Does not fit cash runway");
  }

  // VER-RULE-7
  if (input.hasFailedBefore && (!input.pastFailureContext || input.pastFailureContext.trim().length < 10)) {
    violations.push("Past failure requires context (VER-RULE-7)");
  }

  // Status logic — highest severity first
  let verificationStatus: VerificationStatus;
  if (input.violatesOwnerConstraints) {
    verificationStatus = "unsafe_to_recommend";
  } else if (!input.fitsWithinCashRunway) {
    verificationStatus = "high_risk_requires_owner_approval";
  } else if (violations.length > 0) {
    verificationStatus = "data_limited";
  } else if (input.confidenceScore < 50) {
    verificationStatus = "provisional";
  } else if (input.riskLevel === "critical" || input.riskLevel === "high") {
    verificationStatus = "high_risk_requires_owner_approval";
  } else {
    verificationStatus = "verified_enough";
  }

  // VER-RULE-6 override to data_limited if not already more severe
  if (
    input.missingData.length > 0 &&
    input.confidenceScore < 50 &&
    verificationStatus !== "unsafe_to_recommend" &&
    verificationStatus !== "high_risk_requires_owner_approval"
  ) {
    verificationStatus = "data_limited";
  }

  const requiresAntiOverrelianceAck =
    (input.riskLevel === "medium" || input.riskLevel === "high" || input.riskLevel === "critical") &&
    verificationStatus !== "unsafe_to_recommend";

  return {
    valid: violations.length === 0,
    violations,
    verificationStatus,
    requiresAntiOverrelianceAck,
    blockedReasons,
  };
}

export function checkAntiOverrelianceComplete(input: OverrelianceAcknowledgementInput): AntiOverrelianceResult {
  const missingAcknowledgements: string[] = [];

  if (!input.keyAssumptionAcknowledged) missingAcknowledgements.push("keyAssumptionAcknowledged");
  if (!input.mainDownsideAcknowledged) missingAcknowledgements.push("mainDownsideAcknowledged");
  if (!input.stopConditionAcknowledged) missingAcknowledgements.push("stopConditionAcknowledged");
  if (!input.evidenceLimitAcknowledged) missingAcknowledgements.push("evidenceLimitAcknowledged");
  if (!input.ownerIsDecisionMaker) missingAcknowledgements.push("ownerIsDecisionMaker");

  return {
    complete: missingAcknowledgements.length === 0,
    missingAcknowledgements,
  };
}

export function assertVerificationAllowsOwnerDecision(
  verification: VerificationResult,
  ack?: AntiOverrelianceResult
): void {
  if (verification.verificationStatus === "unsafe_to_recommend") {
    throw new Error("Recommendation is unsafe to recommend and cannot proceed to owner decision");
  }

  if (verification.requiresAntiOverrelianceAck && (!ack || !ack.complete)) {
    throw new Error("Anti-overreliance acknowledgement required before owner decision");
  }

  if (!verification.valid) {
    throw new Error("Verification has unresolved violations and cannot proceed to owner decision");
  }
}

export function isVerificationStatusTransitionAllowed(
  from: VerificationStatus,
  to: VerificationStatus
): boolean {
  const allowed = VERIFICATION_STATUS_TRANSITIONS[from];
  return (allowed as ReadonlyArray<string>).includes(to);
}
