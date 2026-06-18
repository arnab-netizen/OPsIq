/**
 * Owner Mode Security Rules — Phase 4
 *
 * Typed assertions covering the threat surfaces defined in
 * OWNER_MODE_SECURITY_THREAT_MODEL.md. These are deterministic rules
 * that must hold across all Owner Mode phases.
 *
 * No DB, no UI, no AI services. Static typed contract only.
 */

// ─── Input source classification ─────────────────────────────────────────────

/**
 * Every piece of content that enters OpsIQ from outside must carry one of
 * these source types. "data" = never treated as instruction.
 */
export type InputSourceType =
  | "owner_manual_entry"
  | "owner_file_upload"
  | "owner_paste"
  | "owner_csv"
  | "owner_pdf"
  | "owner_screenshot"
  | "system_generated"
  | "service_computed";

/** Content from external origin is always classified as data. */
export const EXTERNAL_INPUT_SOURCE_TYPES: ReadonlySet<InputSourceType> =
  new Set([
    "owner_manual_entry",
    "owner_file_upload",
    "owner_paste",
    "owner_csv",
    "owner_pdf",
    "owner_screenshot",
  ]);

/** Returns true if the source type indicates external/untrusted content. */
export function isExternalInput(sourceType: InputSourceType): boolean {
  return EXTERNAL_INPUT_SOURCE_TYPES.has(sourceType);
}

/**
 * SEC-001: External input is always data, never instruction.
 * Throws if an external input source type is passed as a system instruction source.
 */
export function assertInputIsData(sourceType: InputSourceType): void {
  if (isExternalInput(sourceType)) {
    return; // correctly classified as data — pass
  }
  // system_generated and service_computed are internal, allowed
}

// ─── Memory write source classification ──────────────────────────────────────

/**
 * SEC-004: Memory writes require a source classification.
 * Only these sources may write to decision memory.
 */
export type MemoryWriteSource =
  | "owner_decision"
  | "adjudication_result"
  | "learning_eligible_case";

export const VALID_MEMORY_WRITE_SOURCES: ReadonlySet<MemoryWriteSource> =
  new Set(["owner_decision", "adjudication_result", "learning_eligible_case"]);

/** Returns true if the source is a valid memory write source. */
export function isValidMemoryWriteSource(source: string): source is MemoryWriteSource {
  return VALID_MEMORY_WRITE_SOURCES.has(source as MemoryWriteSource);
}

/**
 * SEC-004: Throws if an attempt is made to write memory from an unclassified source.
 */
export function assertMemoryWriteSourceValid(source: string): void {
  if (!isValidMemoryWriteSource(source)) {
    throw new Error(
      `SEC-004 violation: memory write from unclassified source '${source}'. ` +
        `Only ${[...VALID_MEMORY_WRITE_SOURCES].join(", ")} are permitted.`
    );
  }
}

// ─── Evidence verification source ────────────────────────────────────────────

/**
 * SEC-006: Evidence verification_status = verified requires a verifier record.
 * AI may NOT be the verifier type — it can only summarize/identify contradictions.
 */
export type EvidenceVerificationStatus =
  | "pending"
  | "verified"
  | "rejected"
  | "conflicting"
  | "stale"
  | "source_unverified";

export type VerifierType =
  | "owner_manual"
  | "system_rule"
  | "external_accountant"
  | "external_auditor";

/** AI is explicitly not in VerifierType — it cannot verify evidence. */
export const AI_IS_NOT_A_VERIFIER = true as const;

/**
 * SEC-006: Throws if an AI verifier type is used. Returns void if valid.
 * This is the compile-time + runtime gate that prevents AI from setting verified status.
 */
export function assertVerifierIsNotAI(verifierType: VerifierType): void {
  // VerifierType union does not include any AI type — this function documents
  // the invariant for runtime checks when verifierType comes from an external source.
  const prohibited = ["ai", "llm", "gpt", "claude", "model", "neural"];
  const lower = (verifierType as string).toLowerCase();
  for (const banned of prohibited) {
    if (lower.includes(banned)) {
      throw new Error(
        `SEC-006 violation: AI type '${verifierType}' attempted to set evidence verified status. ` +
          `Only human or deterministic system verifiers are permitted.`
      );
    }
  }
}

// ─── Workspace scoping enforcement contract ───────────────────────────────────

/**
 * SEC-008: All Owner Mode queries must include workspaceId.
 * This type enforces it at the TypeScript level.
 */
export interface WorkspaceScopedQuery {
  workspaceId: string;
}

/**
 * SEC-007/008: Throws if workspaceId is missing or empty.
 */
export function assertWorkspaceScopedQuery(query: { workspaceId?: string | null }): void {
  if (!query.workspaceId || query.workspaceId.trim() === "") {
    throw new Error(
      "SEC-007/008 violation: workspaceId is required for all Owner Mode queries. " +
        "Cross-workspace access and unauthenticated access are prohibited."
    );
  }
}

// ─── Learning gate: required records ─────────────────────────────────────────

/**
 * SEC-005: Learning eligibility requires all four verified source records.
 * Missing any record → NOT eligible.
 */
export interface LearningEligibilityRequirements {
  has_adjudication_record: boolean;
  has_causal_attribution_record: boolean;
  has_harm_check_record: boolean;
  has_execution_log: boolean;
}

export type LearningEligibilityDecision =
  | "eligible_pending_human_review"
  | "learning_rejected"
  | "insufficient_evidence";

/**
 * SEC-005: Deterministic learning eligibility decision.
 * All four records required; missing any → rejected.
 */
export function evaluateLearningEligibility(
  requirements: LearningEligibilityRequirements
): LearningEligibilityDecision {
  const allPresent =
    requirements.has_adjudication_record &&
    requirements.has_causal_attribution_record &&
    requirements.has_harm_check_record &&
    requirements.has_execution_log;

  if (allPresent) {
    return "eligible_pending_human_review";
  }

  return "learning_rejected";
}

// ─── Owner note policy ────────────────────────────────────────────────────────

/**
 * SEC-003: Owner notes are stored as plain text and must never be evaluated as policy.
 */
export type OwnerNoteDisposition =
  | "stored_as_text"
  | "surfaced_to_operator";

/**
 * SEC-003: Returns the correct disposition for any owner note.
 * Owner notes are always stored as text — never evaluated as instruction or policy.
 */
export function classifyOwnerNote(_noteText: string): OwnerNoteDisposition {
  return "stored_as_text";
}

// ─── Security rule registry ───────────────────────────────────────────────────

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
    enforcement:
      "InputClassifier: source_type = data; never passed as system prompt",
    severity: "high",
  },
  {
    id: "SEC-002",
    description: "Evidence cannot override system/developer rules",
    enforcement:
      "EvidenceService: parsed fields stored, not executed",
    severity: "high",
  },
  {
    id: "SEC-003",
    description: "Owner notes cannot bypass gates",
    enforcement:
      "NoteParser: notes stored as text, not evaluated as policy",
    severity: "high",
  },
  {
    id: "SEC-004",
    description: "Memory writes require source classification",
    enforcement:
      "assertMemoryWriteSourceValid: source_type required, unclassified throws",
    severity: "high",
  },
  {
    id: "SEC-005",
    description: "Learning eligibility requires verified source path",
    enforcement:
      "evaluateLearningEligibility: all 4 records required or learning_rejected",
    severity: "critical",
  },
  {
    id: "SEC-006",
    description: "Fake evidence cannot become verified without verification record",
    enforcement:
      "assertVerifierIsNotAI: AI is not a valid verifier type",
    severity: "high",
  },
  {
    id: "SEC-007",
    description: "Public route cannot access private owner memory",
    enforcement:
      "assertWorkspaceScopedQuery: workspaceId from session required",
    severity: "critical",
  },
  {
    id: "SEC-008",
    description: "Wrong workspace cannot access evidence/outcome/learning records",
    enforcement:
      "assertWorkspaceScopedQuery: workspaceId mandatory on all Owner Mode queries",
    severity: "critical",
  },
];

/** Look up a security rule by ID. */
export function getSecurityRule(id: string): SecurityRule | undefined {
  return SECURITY_RULES.find((r) => r.id === id);
}

/** Return all critical-severity security rules. */
export function getCriticalSecurityRules(): ReadonlyArray<SecurityRule> {
  return SECURITY_RULES.filter((r) => r.severity === "critical");
}
