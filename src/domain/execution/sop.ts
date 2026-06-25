/**
 * Personalized SOP / workflow engine (Slice 16, pure logic).
 *
 * Two layers: a generic `BaseWorkflowTemplate` and a business-specific
 * `PersonalizedWorkflowInstance`. Employees only ever see personalized instances
 * (never base templates), and only an employee-safe projection (no owner-only
 * profit/cash metric or business context). An SOP is marked LOW_CONFIDENCE /
 * NEEDS_OWNER_INPUT — never presented as certain — when business-specific
 * essentials (role, proof, escalation, expected outcome, trigger, owner boundary)
 * are missing.
 */

export enum SopConfidence {
  HIGH = "HIGH",
  MEDIUM = "MEDIUM",
  LOW_CONFIDENCE = "LOW_CONFIDENCE",
  NEEDS_OWNER_INPUT = "NEEDS_OWNER_INPUT",
}

export interface SopStep {
  order: number;
  instruction: string;
}

export interface BaseWorkflowTemplate {
  kind: "BASE";
  baseTemplateId: string;
  businessArchetype: string;
  title: string;
  defaultSteps: SopStep[];
  defaultProofRequirements: string[];
  defaultEscalationRules: string[];
  allowedRoles: string[];
  forbiddenRoles: string[];
  outcomeMetric: string;
}

export interface PersonalizedWorkflowInstance {
  kind: "PERSONALIZED";
  sopId: string;
  version: number;
  baseTemplateId: string;
  workspaceId: string;
  businessArchetype: string;
  /** Owner-only business context (diagnosis/notes) — never shown to employees. */
  businessContext: string | null;
  triggerCondition: string | null;
  role: string | null;
  allowedRoles: string[];
  forbiddenRoles: string[];
  steps: SopStep[];
  proofRequirements: string[];
  acceptableProofExamples: string[];
  rejectionReasons: string[];
  escalationRules: string[];
  ownerBoundaryId: string | null;
  customerCommunicationRules: string | null;
  capacityAssumptions: string | null;
  expectedOutcome: string | null;
  /** Owner-only metric — excluded from the employee view. */
  profitOrCashMetric: string | null;
  confidence: SopConfidence;
  missingData: string[];
  approvedByOwnerId: string | null;
  isActive: boolean;
}

export interface SopCompleteness {
  confidence: SopConfidence;
  missingData: string[];
}

/**
 * Assess SOP completeness. Missing business-specific essentials downgrade
 * confidence; an SOP missing several is NEEDS_OWNER_INPUT (never presented as
 * certain).
 */
export function assessSopCompleteness(
  sop: Pick<
    PersonalizedWorkflowInstance,
    | "role"
    | "proofRequirements"
    | "escalationRules"
    | "expectedOutcome"
    | "triggerCondition"
    | "ownerBoundaryId"
  >
): SopCompleteness {
  const missing: string[] = [];
  if (!sop.role) missing.push("role");
  if (!sop.proofRequirements || sop.proofRequirements.length === 0) missing.push("proof");
  if (!sop.escalationRules || sop.escalationRules.length === 0) missing.push("escalation");
  if (!sop.expectedOutcome) missing.push("expectedOutcome");
  if (!sop.triggerCondition) missing.push("trigger");
  if (!sop.ownerBoundaryId) missing.push("ownerBoundary");

  let confidence: SopConfidence;
  if (missing.length === 0) confidence = SopConfidence.HIGH;
  else if (missing.length >= 3) confidence = SopConfidence.NEEDS_OWNER_INPUT;
  else confidence = SopConfidence.LOW_CONFIDENCE;

  return { confidence, missingData: missing };
}

export interface PersonalizationContext {
  workspaceId: string;
  businessContext?: string | null;
  triggerCondition?: string | null;
  role?: string | null;
  ownerBoundaryId?: string | null;
  customerCommunicationRules?: string | null;
  capacityAssumptions?: string | null;
  expectedOutcome?: string | null;
  profitOrCashMetric?: string | null;
  acceptableProofExamples?: string[];
  rejectionReasons?: string[];
}

/** Build a (not-yet-active) personalized instance from a base template + context. */
export function personalizeWorkflow(
  base: BaseWorkflowTemplate,
  sopId: string,
  ctx: PersonalizationContext
): PersonalizedWorkflowInstance {
  const draft: Omit<PersonalizedWorkflowInstance, "confidence" | "missingData"> = {
    kind: "PERSONALIZED",
    sopId,
    version: 1,
    baseTemplateId: base.baseTemplateId,
    workspaceId: ctx.workspaceId,
    businessArchetype: base.businessArchetype,
    businessContext: ctx.businessContext ?? null,
    triggerCondition: ctx.triggerCondition ?? null,
    role: ctx.role ?? null,
    allowedRoles: base.allowedRoles,
    forbiddenRoles: base.forbiddenRoles,
    steps: base.defaultSteps,
    proofRequirements: base.defaultProofRequirements,
    acceptableProofExamples: ctx.acceptableProofExamples ?? [],
    rejectionReasons: ctx.rejectionReasons ?? [],
    escalationRules: base.defaultEscalationRules,
    ownerBoundaryId: ctx.ownerBoundaryId ?? null,
    customerCommunicationRules: ctx.customerCommunicationRules ?? null,
    capacityAssumptions: ctx.capacityAssumptions ?? null,
    expectedOutcome: ctx.expectedOutcome ?? null,
    profitOrCashMetric: ctx.profitOrCashMetric ?? null,
    approvedByOwnerId: null,
    isActive: false,
  };
  const completeness = assessSopCompleteness(draft);
  return { ...draft, ...completeness };
}

/** Create the next immutable SOP version (does not mutate `previous`). */
export function nextSopVersion(
  previous: PersonalizedWorkflowInstance,
  changes: Partial<PersonalizationContext>
): PersonalizedWorkflowInstance {
  const merged: PersonalizedWorkflowInstance = {
    ...previous,
    ...("role" in changes ? { role: changes.role ?? null } : {}),
    ...("triggerCondition" in changes ? { triggerCondition: changes.triggerCondition ?? null } : {}),
    ...("expectedOutcome" in changes ? { expectedOutcome: changes.expectedOutcome ?? null } : {}),
    ...("ownerBoundaryId" in changes ? { ownerBoundaryId: changes.ownerBoundaryId ?? null } : {}),
    version: previous.version + 1,
    approvedByOwnerId: null,
    isActive: false,
  };
  const completeness = assessSopCompleteness(merged);
  return { ...merged, ...completeness };
}

export class SopVisibilityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SopVisibilityError";
  }
}

export interface EmployeeSopView {
  sopId: string;
  version: number;
  role: string | null;
  allowedRoles: string[];
  steps: SopStep[];
  proofRequirements: string[];
  acceptableProofExamples: string[];
  rejectionReasons: string[];
  escalationRules: string[];
  customerCommunicationRules: string | null;
  expectedOutcome: string | null;
}

/**
 * Employee-safe projection. Throws if given a base template (employees may never
 * see base templates). Excludes owner-only fields (businessContext,
 * profitOrCashMetric, ownerBoundaryId).
 */
export function toEmployeeSopView(
  sop: PersonalizedWorkflowInstance | BaseWorkflowTemplate
): EmployeeSopView {
  if (sop.kind !== "PERSONALIZED") {
    throw new SopVisibilityError("Employees may not view base workflow templates directly.");
  }
  return {
    sopId: sop.sopId,
    version: sop.version,
    role: sop.role,
    allowedRoles: sop.allowedRoles,
    steps: sop.steps,
    proofRequirements: sop.proofRequirements,
    acceptableProofExamples: sop.acceptableProofExamples,
    rejectionReasons: sop.rejectionReasons,
    escalationRules: sop.escalationRules,
    customerCommunicationRules: sop.customerCommunicationRules,
    expectedOutcome: sop.expectedOutcome,
  };
}
