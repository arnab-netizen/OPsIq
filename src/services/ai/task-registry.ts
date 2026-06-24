/**
 * Owner Mode Governed AI Copilot — Task Registry + Context Policy (Phase AI-2).
 *
 * One canonical, declarative map of every AI task class: its purpose, risk tier,
 * allowed/forbidden inputs, required deterministic preconditions, model routing,
 * fallback, human-approval requirement, and audit obligation. Pure data + helpers;
 * no provider, no I/O. The copilot/validator read this; nothing here calls a model.
 *
 * Governing invariant encoded here: NO task may mutate state, approve decisions,
 * verify outcomes, or create learning — every task is `stateMutation: "none"` and
 * the high-risk ones additionally require downstream human approval.
 */
import type { AiRiskLevel, AiTaskType } from "./provider";

export interface AiTaskDefinition {
  taskType: AiTaskType;
  purpose: string;
  riskLevel: AiRiskLevel;
  /** Provenance kinds the context builder may include for this task. */
  allowedInputKinds: ReadonlyArray<
    "app_policy" | "deterministic_score" | "business_fact" | "owner_note" | "operator_note" | "imported_content" | "missing_data"
  >;
  /** Inputs that must never be placed in this task's context. */
  forbiddenInputs: ReadonlyArray<string>;
  /** Deterministic gates that must be satisfied/loaded before the call is allowed. */
  requiredPreconditions: ReadonlyArray<string>;
  /** AI may never mutate state — always "none". Recorded explicitly for audit. */
  stateMutation: "none";
  /** Whether the task's output, if acted upon, requires owner approval downstream. */
  requiresOwnerApproval: boolean;
  modelTier: "cheap" | "strong";
  temperature: number;
  maxTokens: number;
  timeoutMs: number;
  maxRetries: number;
  /** What happens when the provider is unavailable/invalid — never fabricate. */
  fallback: "deterministic_path" | "skip_silently" | "surface_unavailable";
  /** Whether every call must be written to the AI ledger (always true). */
  auditRequired: true;
}

const T = (d: AiTaskDefinition): AiTaskDefinition => d;

export const AI_TASK_REGISTRY: Readonly<Record<AiTaskType, AiTaskDefinition>> = {
  INTAKE_EXTRACT: T({
    taskType: "INTAKE_EXTRACT",
    purpose: "Extract candidate (unverified) facts from messy owner input.",
    riskLevel: "MEDIUM_OPERATIONAL",
    allowedInputKinds: ["app_policy", "owner_note", "imported_content", "missing_data"],
    forbiddenInputs: ["private_learning_internals", "other_workspace_data", "secrets"],
    requiredPreconditions: ["workspace_scope"],
    stateMutation: "none",
    requiresOwnerApproval: true, // candidate facts need owner confirmation
    modelTier: "cheap",
    temperature: 0,
    maxTokens: 1200,
    timeoutMs: 25000,
    maxRetries: 1,
    fallback: "surface_unavailable",
    auditRequired: true,
  }),
  EVIDENCE_SUMMARY: T({
    taskType: "EVIDENCE_SUMMARY",
    purpose: "Summarize linked evidence without adding new claims.",
    riskLevel: "LOW_CONTENT",
    allowedInputKinds: ["app_policy", "deterministic_score", "business_fact", "missing_data"],
    forbiddenInputs: ["private_learning_internals", "other_workspace_data", "secrets"],
    requiredPreconditions: ["workspace_scope"],
    stateMutation: "none",
    requiresOwnerApproval: false,
    modelTier: "cheap",
    temperature: 0,
    maxTokens: 800,
    timeoutMs: 20000,
    maxRetries: 1,
    fallback: "skip_silently",
    auditRequired: true,
  }),
  MISSING_QUESTION_GENERATION: T({
    taskType: "MISSING_QUESTION_GENERATION",
    purpose: "Propose the smallest set of highest-value missing-data questions.",
    riskLevel: "LOW_CONTENT",
    allowedInputKinds: ["app_policy", "deterministic_score", "business_fact", "missing_data"],
    forbiddenInputs: ["private_learning_internals", "other_workspace_data", "secrets"],
    requiredPreconditions: ["workspace_scope", "data_quality_snapshot"],
    stateMutation: "none",
    requiresOwnerApproval: false,
    modelTier: "cheap",
    temperature: 0,
    maxTokens: 800,
    timeoutMs: 20000,
    maxRetries: 1,
    fallback: "deterministic_path",
    auditRequired: true,
  }),
  DIAGNOSIS_REVIEW: T({
    taskType: "DIAGNOSIS_REVIEW",
    purpose: "Second-opinion review/challenge of a deterministic diagnosis.",
    riskLevel: "HIGH_DECISION",
    allowedInputKinds: ["app_policy", "deterministic_score", "business_fact", "missing_data"],
    forbiddenInputs: ["private_learning_internals", "other_workspace_data", "secrets"],
    requiredPreconditions: ["workspace_scope", "diagnosis_present", "data_quality_snapshot"],
    stateMutation: "none",
    requiresOwnerApproval: true,
    modelTier: "strong",
    temperature: 0,
    maxTokens: 1500,
    timeoutMs: 30000,
    maxRetries: 1,
    fallback: "deterministic_path",
    auditRequired: true,
  }),
  RECOMMENDATION_REDTEAM: T({
    taskType: "RECOMMENDATION_REDTEAM",
    purpose: "Adversarially challenge a recommendation (risks, downside, alternatives).",
    riskLevel: "HIGH_DECISION",
    allowedInputKinds: ["app_policy", "deterministic_score", "business_fact", "missing_data"],
    forbiddenInputs: ["private_learning_internals", "other_workspace_data", "secrets"],
    requiredPreconditions: ["workspace_scope", "recommendation_present", "financial_survival_snapshot"],
    stateMutation: "none",
    requiresOwnerApproval: true,
    modelTier: "strong",
    temperature: 0,
    maxTokens: 1500,
    timeoutMs: 30000,
    maxRetries: 1,
    fallback: "deterministic_path",
    auditRequired: true,
  }),
  OWNER_PROPOSED_ACTION_REDTEAM: T({
    taskType: "OWNER_PROPOSED_ACTION_REDTEAM",
    purpose: "Red-team an owner-proposed action ('should I do this?'). Advisory only.",
    riskLevel: "HIGH_DECISION",
    allowedInputKinds: ["app_policy", "deterministic_score", "business_fact", "owner_note", "missing_data"],
    forbiddenInputs: ["private_learning_internals", "other_workspace_data", "secrets"],
    requiredPreconditions: ["workspace_scope", "financial_survival_snapshot", "unit_economics_snapshot"],
    stateMutation: "none",
    requiresOwnerApproval: true,
    modelTier: "strong",
    temperature: 0,
    maxTokens: 1500,
    timeoutMs: 30000,
    maxRetries: 1,
    fallback: "deterministic_path",
    auditRequired: true,
  }),
  SCENARIO_EXPLAIN: T({
    taskType: "SCENARIO_EXPLAIN",
    purpose: "Explain deterministic scenario outputs in plain language; never invent numbers.",
    riskLevel: "MEDIUM_OPERATIONAL",
    allowedInputKinds: ["app_policy", "deterministic_score", "business_fact", "missing_data"],
    forbiddenInputs: ["private_learning_internals", "other_workspace_data", "secrets"],
    requiredPreconditions: ["workspace_scope", "scenario_present"],
    stateMutation: "none",
    requiresOwnerApproval: false,
    modelTier: "cheap",
    temperature: 0,
    maxTokens: 1000,
    timeoutMs: 25000,
    maxRetries: 1,
    fallback: "deterministic_path",
    auditRequired: true,
  }),
  EXECUTION_COACH: T({
    taskType: "EXECUTION_COACH",
    purpose: "Draft an execution checklist for an OWNER-APPROVED action only.",
    riskLevel: "MEDIUM_OPERATIONAL",
    allowedInputKinds: ["app_policy", "business_fact", "missing_data"],
    forbiddenInputs: ["private_learning_internals", "strategic_reasoning", "other_workspace_data", "secrets"],
    requiredPreconditions: ["workspace_scope", "action_owner_approved"],
    stateMutation: "none",
    requiresOwnerApproval: false, // gated by action already being approved
    modelTier: "cheap",
    temperature: 0.1,
    maxTokens: 1200,
    timeoutMs: 25000,
    maxRetries: 1,
    fallback: "skip_silently",
    auditRequired: true,
  }),
  OPERATOR_CHECKLIST: T({
    taskType: "OPERATOR_CHECKLIST",
    purpose: "Draft an operator-facing checklist/script for an approved action; no strategy.",
    riskLevel: "MEDIUM_OPERATIONAL",
    allowedInputKinds: ["app_policy", "business_fact", "missing_data"],
    forbiddenInputs: ["private_learning_internals", "strategic_reasoning", "other_workspace_data", "secrets"],
    requiredPreconditions: ["workspace_scope", "action_owner_approved"],
    stateMutation: "none",
    requiresOwnerApproval: false,
    modelTier: "cheap",
    temperature: 0.1,
    maxTokens: 1000,
    timeoutMs: 25000,
    maxRetries: 1,
    fallback: "skip_silently",
    auditRequired: true,
  }),
  CUSTOMER_MESSAGE_DRAFT: T({
    taskType: "CUSTOMER_MESSAGE_DRAFT",
    purpose: "Draft a customer message for an approved action; no unauthorized promises.",
    riskLevel: "MEDIUM_OPERATIONAL",
    allowedInputKinds: ["app_policy", "business_fact", "missing_data"],
    forbiddenInputs: ["private_learning_internals", "other_workspace_data", "secrets"],
    requiredPreconditions: ["workspace_scope", "action_owner_approved"],
    stateMutation: "none",
    requiresOwnerApproval: true, // owner reviews outbound customer text
    modelTier: "cheap",
    temperature: 0.2,
    maxTokens: 800,
    timeoutMs: 25000,
    maxRetries: 1,
    fallback: "skip_silently",
    auditRequired: true,
  }),
  OUTCOME_REVIEW: T({
    taskType: "OUTCOME_REVIEW",
    purpose: "Review outcome context + confounders. AI may NOT verify outcomes alone.",
    riskLevel: "HIGH_OUTCOME",
    allowedInputKinds: ["app_policy", "deterministic_score", "business_fact", "missing_data"],
    forbiddenInputs: ["private_learning_internals", "other_workspace_data", "secrets"],
    requiredPreconditions: ["workspace_scope", "outcome_present", "action_completed"],
    stateMutation: "none",
    requiresOwnerApproval: true,
    modelTier: "strong",
    temperature: 0,
    maxTokens: 1200,
    timeoutMs: 30000,
    maxRetries: 1,
    fallback: "deterministic_path",
    auditRequired: true,
  }),
  KNOWLEDGE_NOTE_DRAFT: T({
    taskType: "KNOWLEDGE_NOTE_DRAFT",
    purpose: "Draft a knowledge note; never promotes learning. Deterministic gate decides.",
    riskLevel: "HIGH_LEARNING",
    allowedInputKinds: ["app_policy", "deterministic_score", "business_fact", "missing_data"],
    forbiddenInputs: ["other_workspace_data", "secrets"],
    requiredPreconditions: ["workspace_scope", "verified_outcome", "attribution_sufficient"],
    stateMutation: "none",
    requiresOwnerApproval: true,
    modelTier: "strong",
    temperature: 0,
    maxTokens: 1200,
    timeoutMs: 30000,
    maxRetries: 1,
    fallback: "skip_silently",
    auditRequired: true,
  }),
  OWNER_BRIEFING: T({
    taskType: "OWNER_BRIEFING",
    purpose: "Evidence-bound owner briefing; links to records, never invents facts.",
    riskLevel: "MEDIUM_OPERATIONAL",
    allowedInputKinds: ["app_policy", "deterministic_score", "business_fact", "missing_data"],
    forbiddenInputs: ["private_learning_internals", "other_workspace_data", "secrets"],
    requiredPreconditions: ["workspace_scope"],
    stateMutation: "none",
    requiresOwnerApproval: false,
    modelTier: "cheap",
    temperature: 0,
    maxTokens: 1500,
    timeoutMs: 30000,
    maxRetries: 1,
    fallback: "deterministic_path",
    auditRequired: true,
  }),
  AI_EVALUATION: T({
    taskType: "AI_EVALUATION",
    purpose: "Internal evaluation harness task (offline scoring). Never owner-facing.",
    riskLevel: "LOW_CONTENT",
    allowedInputKinds: ["app_policy", "deterministic_score", "business_fact", "missing_data"],
    forbiddenInputs: ["other_workspace_data", "secrets"],
    requiredPreconditions: ["workspace_scope"],
    stateMutation: "none",
    requiresOwnerApproval: false,
    modelTier: "strong",
    temperature: 0,
    maxTokens: 1500,
    timeoutMs: 30000,
    maxRetries: 1,
    fallback: "skip_silently",
    auditRequired: true,
  }),
};

export function getAiTaskDefinition(taskType: AiTaskType): AiTaskDefinition {
  return AI_TASK_REGISTRY[taskType];
}

/** Tasks whose acted-upon output requires owner approval downstream. */
export function taskRequiresOwnerApproval(taskType: AiTaskType): boolean {
  return AI_TASK_REGISTRY[taskType].requiresOwnerApproval;
}
