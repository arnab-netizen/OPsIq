/**
 * Model/Prompt/Ruleset Versioning and Change Control — Phase 28
 *
 * Prevents invisible changes to the AI support layer from degrading deterministic advice.
 * All version changes must be recorded, regression-checked (if high risk),
 * and feature-flagged before rollout.
 */

import { assertWorkspaceScopedQuery } from "./security-rules";

// ─── Version Types ────────────────────────────────────────────────────────────

export type VersionType =
  | "model"
  | "prompt_template"
  | "ruleset"
  | "evaluation";

export type VersionRiskLevel = "low" | "medium" | "high" | "critical";

export type RegressionResult =
  | "passed"
  | "failed"
  | "partial"
  | "skipped"
  | "pending";

// ─── Core Structures ──────────────────────────────────────────────────────────

/**
 * owner_model_change_log — records every change to model, prompt, ruleset, or evaluation.
 * Covers all four "version type" columns in one table for auditability.
 */
export interface OwnerModelChangeLog {
  id: string;
  versionType: VersionType;
  versionName: string;
  previousVersion: string;
  newVersion: string;
  changeReason: string;
  riskLevel: VersionRiskLevel;
  /** Whether a regression suite run was required before this change */
  regressionRequired: boolean;
  regressionResult: RegressionResult;
  featureFlag: string;
  rollbackPlan: string;
  /** Human approver ID — AI cannot approve its own version changes */
  approvedBy: string;
  createdAt: string;
}

/**
 * owner_prompt_template_versions — tracks each versioned prompt template.
 */
export interface OwnerPromptTemplateVersion {
  id: string;
  templateName: string;
  version: string;
  previousVersion?: string;
  module: string;
  changeReason: string;
  riskLevel: VersionRiskLevel;
  regressionRequired: boolean;
  regressionResult: RegressionResult;
  featureFlag: string;
  rollbackPlan: string;
  approvedBy: string;
  createdAt: string;
}

/**
 * owner_ruleset_versions — tracks each versioned ruleset.
 */
export interface OwnerRulesetVersion {
  id: string;
  rulesetName: string;
  version: string;
  previousVersion?: string;
  scope: string;
  changeReason: string;
  riskLevel: VersionRiskLevel;
  regressionRequired: boolean;
  regressionResult: RegressionResult;
  featureFlag: string;
  rollbackPlan: string;
  approvedBy: string;
  createdAt: string;
}

/**
 * owner_evaluation_versions — tracks each versioned evaluation suite.
 */
export interface OwnerEvaluationVersion {
  id: string;
  evaluationName: string;
  version: string;
  previousVersion?: string;
  coveredVersionTypes: VersionType[];
  changeReason: string;
  riskLevel: VersionRiskLevel;
  regressionRequired: boolean;
  regressionResult: RegressionResult;
  featureFlag: string;
  rollbackPlan: string;
  approvedBy: string;
  createdAt: string;
}

// ─── Input Types ──────────────────────────────────────────────────────────────

export interface RecordVersionChangeInput {
  id: string;
  workspaceId: string;
  versionType: VersionType;
  versionName: string;
  previousVersion: string;
  newVersion: string;
  changeReason: string;
  riskLevel: VersionRiskLevel;
  regressionRequired: boolean;
  regressionResult: RegressionResult;
  featureFlag: string;
  rollbackPlan: string;
  approvedBy: string;
  createdAt: string;
}

export interface CreatePromptTemplateVersionInput {
  id: string;
  workspaceId: string;
  templateName: string;
  version: string;
  previousVersion?: string;
  module: string;
  changeReason: string;
  riskLevel: VersionRiskLevel;
  regressionRequired: boolean;
  regressionResult: RegressionResult;
  featureFlag: string;
  rollbackPlan: string;
  approvedBy: string;
  createdAt: string;
}

export interface CreateRulesetVersionInput {
  id: string;
  workspaceId: string;
  rulesetName: string;
  version: string;
  previousVersion?: string;
  scope: string;
  changeReason: string;
  riskLevel: VersionRiskLevel;
  regressionRequired: boolean;
  regressionResult: RegressionResult;
  featureFlag: string;
  rollbackPlan: string;
  approvedBy: string;
  createdAt: string;
}

// ─── Validation Rules ─────────────────────────────────────────────────────────

// VERSION-RULE-1: high/critical risk changes always require regression
// VERSION-RULE-2: rollback plan is always required (non-empty)
// VERSION-RULE-3: approvedBy is always required — AI cannot approve its own changes
// VERSION-RULE-4: featureFlag is required — all changes must be flag-gated

const HIGH_RISK_LEVELS: ReadonlySet<VersionRiskLevel> = new Set(["high", "critical"]);

export function regressionIsRequired(riskLevel: VersionRiskLevel): boolean {
  return HIGH_RISK_LEVELS.has(riskLevel);
}

export function validateRecordVersionChangeInput(input: RecordVersionChangeInput): string[] {
  assertWorkspaceScopedQuery({ workspaceId: input.workspaceId });
  const errors: string[] = [];

  if (!input.id || input.id.trim().length === 0) {
    errors.push("id is required");
  }
  if (!input.versionName || input.versionName.trim().length === 0) {
    errors.push("versionName is required");
  }
  if (!input.previousVersion || input.previousVersion.trim().length === 0) {
    errors.push("previousVersion is required (use 'initial' for first version)");
  }
  if (!input.newVersion || input.newVersion.trim().length === 0) {
    errors.push("newVersion is required");
  }
  if (input.previousVersion === input.newVersion) {
    errors.push("newVersion must differ from previousVersion");
  }
  if (!input.changeReason || input.changeReason.trim().length === 0) {
    errors.push("changeReason is required");
  }
  // VERSION-RULE-1
  if (regressionIsRequired(input.riskLevel) && !input.regressionRequired) {
    errors.push(
      `regressionRequired must be true for risk level "${input.riskLevel}" (VERSION-RULE-1)`
    );
  }
  // VERSION-RULE-2
  if (!input.rollbackPlan || input.rollbackPlan.trim().length === 0) {
    errors.push("rollbackPlan is required (VERSION-RULE-2)");
  }
  // VERSION-RULE-3
  if (!input.approvedBy || input.approvedBy.trim().length === 0) {
    errors.push("approvedBy is required — AI cannot approve its own version changes (VERSION-RULE-3)");
  }
  // VERSION-RULE-4
  if (!input.featureFlag || input.featureFlag.trim().length === 0) {
    errors.push("featureFlag is required — all version changes must be flag-gated (VERSION-RULE-4)");
  }
  if (!input.createdAt || input.createdAt.trim().length === 0) {
    errors.push("createdAt is required");
  }
  return errors;
}

export function validateCreatePromptTemplateVersionInput(
  input: CreatePromptTemplateVersionInput
): string[] {
  assertWorkspaceScopedQuery({ workspaceId: input.workspaceId });
  const errors: string[] = [];
  if (!input.id || input.id.trim().length === 0) errors.push("id is required");
  if (!input.templateName || input.templateName.trim().length === 0) errors.push("templateName is required");
  if (!input.version || input.version.trim().length === 0) errors.push("version is required");
  if (!input.module || input.module.trim().length === 0) errors.push("module is required");
  if (!input.changeReason || input.changeReason.trim().length === 0) errors.push("changeReason is required");
  if (regressionIsRequired(input.riskLevel) && !input.regressionRequired) {
    errors.push(`regressionRequired must be true for risk level "${input.riskLevel}" (VERSION-RULE-1)`);
  }
  if (!input.rollbackPlan || input.rollbackPlan.trim().length === 0) errors.push("rollbackPlan is required (VERSION-RULE-2)");
  if (!input.approvedBy || input.approvedBy.trim().length === 0) errors.push("approvedBy is required (VERSION-RULE-3)");
  if (!input.featureFlag || input.featureFlag.trim().length === 0) errors.push("featureFlag is required (VERSION-RULE-4)");
  if (!input.createdAt || input.createdAt.trim().length === 0) errors.push("createdAt is required");
  return errors;
}

export function validateCreateRulesetVersionInput(input: CreateRulesetVersionInput): string[] {
  assertWorkspaceScopedQuery({ workspaceId: input.workspaceId });
  const errors: string[] = [];
  if (!input.id || input.id.trim().length === 0) errors.push("id is required");
  if (!input.rulesetName || input.rulesetName.trim().length === 0) errors.push("rulesetName is required");
  if (!input.version || input.version.trim().length === 0) errors.push("version is required");
  if (!input.scope || input.scope.trim().length === 0) errors.push("scope is required");
  if (!input.changeReason || input.changeReason.trim().length === 0) errors.push("changeReason is required");
  if (regressionIsRequired(input.riskLevel) && !input.regressionRequired) {
    errors.push(`regressionRequired must be true for risk level "${input.riskLevel}" (VERSION-RULE-1)`);
  }
  if (!input.rollbackPlan || input.rollbackPlan.trim().length === 0) errors.push("rollbackPlan is required (VERSION-RULE-2)");
  if (!input.approvedBy || input.approvedBy.trim().length === 0) errors.push("approvedBy is required (VERSION-RULE-3)");
  if (!input.featureFlag || input.featureFlag.trim().length === 0) errors.push("featureFlag is required (VERSION-RULE-4)");
  if (!input.createdAt || input.createdAt.trim().length === 0) errors.push("createdAt is required");
  return errors;
}

// ─── Factories ────────────────────────────────────────────────────────────────

export function recordVersionChange(input: RecordVersionChangeInput): OwnerModelChangeLog {
  const errors = validateRecordVersionChangeInput(input);
  if (errors.length > 0) {
    throw new Error(`Invalid version change input: ${errors.join("; ")}`);
  }
  return {
    id: input.id,
    versionType: input.versionType,
    versionName: input.versionName,
    previousVersion: input.previousVersion,
    newVersion: input.newVersion,
    changeReason: input.changeReason,
    riskLevel: input.riskLevel,
    regressionRequired: input.regressionRequired,
    regressionResult: input.regressionResult,
    featureFlag: input.featureFlag,
    rollbackPlan: input.rollbackPlan,
    approvedBy: input.approvedBy,
    createdAt: input.createdAt,
  };
}

export function createPromptTemplateVersion(
  input: CreatePromptTemplateVersionInput
): OwnerPromptTemplateVersion {
  const errors = validateCreatePromptTemplateVersionInput(input);
  if (errors.length > 0) {
    throw new Error(`Invalid prompt template version input: ${errors.join("; ")}`);
  }
  return {
    id: input.id,
    templateName: input.templateName,
    version: input.version,
    previousVersion: input.previousVersion,
    module: input.module,
    changeReason: input.changeReason,
    riskLevel: input.riskLevel,
    regressionRequired: input.regressionRequired,
    regressionResult: input.regressionResult,
    featureFlag: input.featureFlag,
    rollbackPlan: input.rollbackPlan,
    approvedBy: input.approvedBy,
    createdAt: input.createdAt,
  };
}

export function createRulesetVersion(input: CreateRulesetVersionInput): OwnerRulesetVersion {
  const errors = validateCreateRulesetVersionInput(input);
  if (errors.length > 0) {
    throw new Error(`Invalid ruleset version input: ${errors.join("; ")}`);
  }
  return {
    id: input.id,
    rulesetName: input.rulesetName,
    version: input.version,
    previousVersion: input.previousVersion,
    scope: input.scope,
    changeReason: input.changeReason,
    riskLevel: input.riskLevel,
    regressionRequired: input.regressionRequired,
    regressionResult: input.regressionResult,
    featureFlag: input.featureFlag,
    rollbackPlan: input.rollbackPlan,
    approvedBy: input.approvedBy,
    createdAt: input.createdAt,
  };
}

// ─── Pre-Change Checklist ─────────────────────────────────────────────────────

export interface PreChangeChecklistInput {
  riskLevel: VersionRiskLevel;
  regressionSuiteRun: boolean;
  outputsCompared: boolean;
  genericitnessChecked: boolean;
  safetyOverridesChecked: boolean;
  ownerConstraintsChecked: boolean;
  tenantIsolationChecked: boolean;
  featureFlagDefined: boolean;
  rollbackPlanDefined: boolean;
}

export interface PreChangeChecklistResult {
  approved: boolean;
  blockers: string[];
}

/**
 * Pre-change checklist that MUST pass before any model/prompt/ruleset change is deployed.
 * Enforces VERSION-RULE-1 through VERSION-RULE-4 at the process level.
 */
export function runPreChangeChecklist(
  input: PreChangeChecklistInput
): PreChangeChecklistResult {
  const blockers: string[] = [];

  if (regressionIsRequired(input.riskLevel) && !input.regressionSuiteRun) {
    blockers.push("Regression suite must be run before high/critical risk changes");
  }
  if (!input.outputsCompared) {
    blockers.push("Outputs must be compared between old and new version");
  }
  if (!input.genericitnessChecked) {
    blockers.push("Genericness of AI outputs must be checked");
  }
  if (!input.safetyOverridesChecked) {
    blockers.push("Safety overrides must be verified still active after change");
  }
  if (!input.ownerConstraintsChecked) {
    blockers.push("Owner constraints must be verified still enforced after change");
  }
  if (!input.tenantIsolationChecked) {
    blockers.push("Tenant isolation must be verified after change");
  }
  if (!input.featureFlagDefined) {
    blockers.push("Feature flag must be defined before rollout (VERSION-RULE-4)");
  }
  if (!input.rollbackPlanDefined) {
    blockers.push("Rollback plan must be defined before change (VERSION-RULE-2)");
  }

  return {
    approved: blockers.length === 0,
    blockers,
  };
}

// ─── Output Trace Version Attachment ─────────────────────────────────────────

export interface VersionedOutputTrace {
  traceId: string;
  outputId: string;
  modelVersion?: string;
  promptTemplateVersion?: string;
  rulesetVersion?: string;
  evaluationVersion?: string;
  capturedAt: string;
}

export function attachVersionToOutputTrace(
  traceId: string,
  outputId: string,
  versions: {
    modelVersion?: string;
    promptTemplateVersion?: string;
    rulesetVersion?: string;
    evaluationVersion?: string;
  },
  capturedAt: string
): VersionedOutputTrace {
  if (!traceId || traceId.trim().length === 0) {
    throw new Error("traceId is required");
  }
  if (!outputId || outputId.trim().length === 0) {
    throw new Error("outputId is required");
  }
  if (!capturedAt || capturedAt.trim().length === 0) {
    throw new Error("capturedAt is required");
  }
  return {
    traceId,
    outputId,
    ...versions,
    capturedAt,
  };
}
