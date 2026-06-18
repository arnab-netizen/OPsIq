import { assertWorkspaceScopedQuery } from "./security-rules";

export type BenefitType =
  | "revenue"
  | "profit"
  | "cash"
  | "margin"
  | "retention"
  | "conversion"
  | "productivity"
  | "risk_reduction"
  | "cost_reduction"
  | "quality_improvement";

export type BenefitStatus =
  | "pending"
  | "on_track"
  | "realized"
  | "partially_realized"
  | "not_realized"
  | "deferred";

export type ReviewCadence = "weekly" | "fortnightly" | "monthly" | "quarterly";

export type ProgressStatus =
  | "on_track"
  | "behind"
  | "at_risk"
  | "realized"
  | "not_realized";

export const BENEFIT_STATUS_TRANSITIONS: Readonly<
  Record<BenefitStatus, ReadonlyArray<BenefitStatus>>
> = {
  pending: ["on_track", "deferred", "not_realized"],
  on_track: ["realized", "partially_realized", "deferred"],
  realized: [],
  partially_realized: ["realized", "not_realized"],
  not_realized: [],
  deferred: ["pending", "not_realized"],
};

export interface BenefitInput {
  workspaceId: string;
  businessId: string;
  recommendationId?: string;
  actionId?: string;
  expectedBusinessBenefit: string;
  benefitType: BenefitType;
  baseline?: number;
  target?: number;
  targetUnit?: string;
  benefitOwner: string;
  realizationDate?: Date;
  reviewCadence?: ReviewCadence;
}

export interface BenefitReviewInput {
  workspaceId: string;
  benefitId: string;
  actualValueAtReview?: number;
  progressStatus: ProgressStatus;
  reviewNotes?: string;
  reviewedBy: string;
}

export interface BenefitRealizationInput {
  workspaceId: string;
  benefitId: string;
  actualBenefit?: number;
  benefitStatus: BenefitStatus;
  reasonNotRealized?: string;
}

export interface BenefitValidationResult {
  valid: boolean;
  violations: string[];
}

export interface BenefitRealizationValidationResult {
  valid: boolean;
  violations: string[];
}

export function validateBenefit(input: BenefitInput): BenefitValidationResult {
  assertWorkspaceScopedQuery({ workspaceId: input.workspaceId });

  const violations: string[] = [];

  // BEN-RULE-1
  if (!input.expectedBusinessBenefit || input.expectedBusinessBenefit.length < 10) {
    violations.push(
      "expectedBusinessBenefit must be at least 10 characters (BEN-RULE-1)"
    );
  }

  // BEN-RULE-2
  if (!input.benefitOwner || input.benefitOwner.trim() === "") {
    violations.push("benefitOwner must be non-empty (BEN-RULE-2)");
  }

  // BEN-RULE-3
  if (input.target !== undefined && input.baseline === undefined) {
    violations.push("baseline required when target is set (BEN-RULE-3)");
  }

  // BEN-RULE-4
  if (
    input.target !== undefined &&
    input.baseline !== undefined &&
    input.target === input.baseline
  ) {
    violations.push("target must differ from baseline (BEN-RULE-4)");
  }

  return { valid: violations.length === 0, violations };
}

export function validateBenefitRealization(
  input: BenefitRealizationInput
): BenefitRealizationValidationResult {
  assertWorkspaceScopedQuery({ workspaceId: input.workspaceId });

  const violations: string[] = [];

  // BEN-RULE-5
  if (
    input.benefitStatus === "not_realized" &&
    (!input.reasonNotRealized || input.reasonNotRealized.trim().length < 10)
  ) {
    violations.push(
      "reasonNotRealized required when status is not_realized (BEN-RULE-5)"
    );
  }

  // BEN-RULE-6
  if (
    input.benefitStatus === "partially_realized" &&
    (!input.reasonNotRealized || input.reasonNotRealized.trim().length < 10)
  ) {
    violations.push(
      "reasonNotRealized required when status is partially_realized (BEN-RULE-6)"
    );
  }

  // BEN-RULE-7
  if (input.benefitStatus === "realized" && input.actualBenefit === undefined) {
    violations.push("actualBenefit required when status is realized (BEN-RULE-7)");
  }

  return { valid: violations.length === 0, violations };
}

export function isBenefitStatusTransitionAllowed(
  from: BenefitStatus,
  to: BenefitStatus
): boolean {
  return (BENEFIT_STATUS_TRANSITIONS[from] as ReadonlyArray<BenefitStatus>).includes(to);
}

export function computeBenefitRealizationRate(
  baseline: number,
  target: number,
  actual: number
): number {
  if (target === baseline) return 0;
  const rate = Math.round(((actual - baseline) / (target - baseline)) * 100);
  return Math.min(200, Math.max(0, rate));
}
