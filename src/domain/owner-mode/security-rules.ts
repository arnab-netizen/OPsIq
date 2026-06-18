/**
 * Security rules for Owner Mode domain operations.
 * Enforces workspace scoping, input classification, memory write source validation,
 * AI-as-non-verifier invariant, and learning eligibility gate.
 */

// ─── Workspace Scoping (SEC-007/008) ─────────────────────────────────────────

export interface WorkspaceScopedQuery {
  workspaceId: string;
}

export function assertWorkspaceScopedQuery(query: WorkspaceScopedQuery): void {
  if (!query.workspaceId || (query.workspaceId as unknown) === null || query.workspaceId.trim() === "") {
    throw new Error(
      "SEC-007/008: WorkspaceScopedQuery violation — workspaceId is required and must not be empty"
    );
  }
}

// ─── Input Source Classification (SEC-001) ────────────────────────────────────

export type InputSourceType =
  | "owner_manual_entry"
  | "owner_file_upload"
  | "owner_paste"
  | "owner_csv"
  | "owner_pdf"
  | "owner_screenshot"
  | "system_generated"
  | "service_computed";

export const EXTERNAL_INPUT_SOURCE_TYPES: ReadonlySet<InputSourceType> = new Set([
  "owner_manual_entry",
  "owner_file_upload",
  "owner_paste",
  "owner_csv",
  "owner_pdf",
  "owner_screenshot",
]);

export function isExternalInput(sourceType: InputSourceType): boolean {
  return EXTERNAL_INPUT_SOURCE_TYPES.has(sourceType);
}

/**
 * Asserts that this input source is classified as data, not instruction.
 * All external inputs are data only — they cannot alter system behaviour.
 */
export function assertInputIsData(sourceType: InputSourceType): void {
  if (!EXTERNAL_INPUT_SOURCE_TYPES.has(sourceType)) {
    throw new Error(
      `SEC-001: Input source "${sourceType}" is not classified as an external data source`
    );
  }
  // External inputs are data only — no throw needed
}

// ─── Memory Write Source (SEC-004) ────────────────────────────────────────────

export type MemoryWriteSource =
  | "owner_decision"
  | "adjudication_result"
  | "learning_eligible_case";

export const VALID_MEMORY_WRITE_SOURCES: ReadonlySet<string> = new Set([
  "owner_decision",
  "adjudication_result",
  "learning_eligible_case",
]);

export function isValidMemoryWriteSource(source: string): boolean {
  return VALID_MEMORY_WRITE_SOURCES.has(source);
}

export function assertMemoryWriteSourceValid(source: string): void {
  if (!VALID_MEMORY_WRITE_SOURCES.has(source)) {
    throw new Error(
      `SEC-004: Memory write source "${source}" is not a permitted source. ` +
      `Permitted: owner_decision, adjudication_result, learning_eligible_case`
    );
  }
}

// ─── AI Is Not A Verifier (SEC-006) ──────────────────────────────────────────

export type VerifierType =
  | "owner_manual"
  | "system_rule"
  | "external_accountant"
  | "external_auditor";

/** Compile-time invariant: AI is never a verifier. */
export const AI_IS_NOT_A_VERIFIER = true as const;

const AI_TERMS = ["ai", "llm", "gpt", "claude", "model", "neural"] as const;

export function assertVerifierIsNotAI(verifierType: VerifierType): void {
  const lower = (verifierType as string).toLowerCase();
  for (const term of AI_TERMS) {
    if (lower.includes(term)) {
      throw new Error(
        `SEC-006: Verifier type "${verifierType}" contains AI term "${term}". ` +
        `AI must never be used as a verifier.`
      );
    }
  }
}

// ─── Learning Eligibility Gate (SEC-005) ─────────────────────────────────────

export interface LearningEligibilityGateInput {
  has_adjudication_record: boolean;
  has_causal_attribution_record: boolean;
  has_harm_check_record: boolean;
  has_execution_log: boolean;
}

export type LearningEligibilityGateResult =
  | "eligible_pending_human_review"
  | "learning_rejected";

export function evaluateLearningEligibility(
  input: LearningEligibilityGateInput
): LearningEligibilityGateResult {
  if (
    input.has_adjudication_record &&
    input.has_causal_attribution_record &&
    input.has_harm_check_record &&
    input.has_execution_log
  ) {
    return "eligible_pending_human_review";
  }
  return "learning_rejected";
}

// ─── Owner Note Classification (SEC-003) ─────────────────────────────────────

/**
 * Owner notes are always stored as text. They cannot bypass gates,
 * alter status transitions, or trigger learning admission.
 */
export function classifyOwnerNote(_note: string): "stored_as_text" {
  return "stored_as_text";
}

// ─── Security Rule Registry ───────────────────────────────────────────────────

export interface SecurityRule {
  id: string;
  description: string;
  enforcement: string;
  severity: "critical" | "high" | "medium";
}

export const SECURITY_RULES: ReadonlyArray<SecurityRule> = [
  {
    id: "SEC-001",
    description: "Uploaded/pasted content is data, never instruction",
    enforcement: "assertInputIsData enforces all external input is classified as data only",
    severity: "high",
  },
  {
    id: "SEC-003",
    description: "Owner notes cannot bypass gates",
    enforcement: "classifyOwnerNote always returns stored_as_text regardless of content",
    severity: "high",
  },
  {
    id: "SEC-004",
    description: "Memory writes require source classification",
    enforcement: "assertMemoryWriteSourceValid enforces only permitted write sources",
    severity: "high",
  },
  {
    id: "SEC-005",
    description: "Learning eligibility requires verified source path",
    enforcement: "evaluateLearningEligibility requires all 4 deterministic records",
    severity: "critical",
  },
  {
    id: "SEC-006",
    description: "AI is not a verifier — evidence verification requires human confirmation",
    enforcement: "assertVerifierIsNotAI blocks any verifier type containing AI terms",
    severity: "high",
  },
  {
    id: "SEC-007",
    description: "Wrong workspace cannot access evidence",
    enforcement: "assertWorkspaceScopedQuery enforced at every domain entry point",
    severity: "critical",
  },
  {
    id: "SEC-008",
    description: "Wrong workspace cannot access outcome or learning records",
    enforcement: "assertWorkspaceScopedQuery enforced at every domain entry point",
    severity: "critical",
  },
  {
    id: "SEC-009",
    description: "AI cannot control status transitions",
    enforcement: "Status machines are deterministic data structures with no AI involvement",
    severity: "high",
  },
];

export function getSecurityRule(id: string): SecurityRule | undefined {
  return SECURITY_RULES.find((r) => r.id === id);
}

export function getCriticalSecurityRules(): SecurityRule[] {
  return SECURITY_RULES.filter((r) => r.severity === "critical");
}
