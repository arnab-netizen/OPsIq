/**
 * Owner Mode Governed AI Copilot — Provider Boundary (Phase AI-1).
 *
 * Provider-agnostic port so the rest of the app never depends on a concrete LLM
 * vendor. OpenAI (and any future provider) is implemented behind this interface
 * later (Phase AI-16). For now only a deterministic MockAiProvider and an
 * UnavailableAiProvider exist — no SDK dependency, no API key, no network.
 *
 * Hard governance invariants (enforced downstream, never here): AI output is
 * ADVISORY ONLY. A provider can NEVER mutate business state, approve decisions,
 * verify outcomes, or create learning. It returns raw structured text that the
 * copilot validates and the deterministic services adjudicate.
 */

/** Canonical AI task classes (full set declared once; AI-1 implements only the LOW-risk one). */
export const AI_TASK_TYPES = [
  "INTAKE_EXTRACT",
  "EVIDENCE_SUMMARY",
  "MISSING_QUESTION_GENERATION",
  "DIAGNOSIS_REVIEW",
  "RECOMMENDATION_REDTEAM",
  "OWNER_PROPOSED_ACTION_REDTEAM",
  "SCENARIO_EXPLAIN",
  "EXECUTION_COACH",
  "OPERATOR_CHECKLIST",
  "CUSTOMER_MESSAGE_DRAFT",
  "OUTCOME_REVIEW",
  "KNOWLEDGE_NOTE_DRAFT",
  "OWNER_BRIEFING",
  "AI_EVALUATION",
] as const;
export type AiTaskType = (typeof AI_TASK_TYPES)[number];

/** Risk tiers (Decision-OS §9). Drives model tier + approval requirements. */
export type AiRiskLevel =
  | "LOW_CONTENT"
  | "MEDIUM_OPERATIONAL"
  | "HIGH_DECISION"
  | "HIGH_OUTCOME"
  | "HIGH_LEARNING";

/** Provenance of a single context item handed to the model. */
export type AiContextItemKind =
  | "app_policy" // trusted system instruction / deterministic rule
  | "deterministic_score" // trusted computed value (data quality, survival, etc.)
  | "business_fact" // a stored/calculated fact
  | "owner_note" // UNTRUSTED owner free text
  | "operator_note" // UNTRUSTED operator free text
  | "imported_content" // UNTRUSTED uploaded/OCR/CSV text
  | "missing_data"; // an explicit gap

export interface AiContextItem {
  kind: AiContextItemKind;
  label: string;
  value?: string | number | null;
  /** Evidence/source id the model is permitted to cite (only these may appear in output). */
  evidenceId?: string;
  /** Trusted = app policy / deterministic. Untrusted = owner/operator/imported DATA, never instructions. */
  trusted: boolean;
}

/** Minimal, workspace/business/task-scoped, source-classified context. Built by context-builder. */
export interface AiContext {
  workspaceId: string;
  businessId?: string;
  taskType: AiTaskType;
  riskLevel: AiRiskLevel;
  items: AiContextItem[];
  /** The closed set of evidence ids the model may cite. Anything else in output = hallucination. */
  allowedEvidenceIds: string[];
  /** Deterministic gate snapshot the AI must not contradict/bypass (advisory context only). */
  gates: {
    diagnosisPermission?: string;
    survivalStatus?: string;
    confidenceCap?: number;
    requiresOwnerApproval?: boolean;
  };
}

export interface AiRequest {
  context: AiContext;
  promptVersion: string;
  schemaVersion: string;
  /**
   * Plain-language description of the exact JSON shape the model must return.
   * The provider appends it to the prompt so structured output is schema-valid.
   * It is a SHAPE hint only — it never carries business data or instructions to
   * cross a governance boundary (the deterministic validator still adjudicates).
   */
  outputContract?: string;
  /** Model routing knobs; the boundary records them, providers honour them. */
  options: {
    modelTier: "cheap" | "strong";
    temperature: number;
    maxTokens: number;
    timeoutMs: number;
    maxRetries: number;
  };
}

export type AiProviderResult =
  | {
      ok: true;
      /** Raw structured payload (parsed/validated by the copilot, never trusted as-is). */
      raw: unknown;
      modelProvider: string;
      modelName: string;
      latencyMs: number;
      tokensUsed?: number;
      retryCount: number;
    }
  | {
      ok: false;
      reason: "AI_UNAVAILABLE";
      modelProvider: string;
      detail: string;
      retryCount: number;
    };

export interface AiProvider {
  readonly name: string;
  generate(req: AiRequest): Promise<AiProviderResult>;
}

/**
 * Default provider when no key/config is present. ALWAYS returns AI_UNAVAILABLE —
 * the system must degrade to its deterministic path, never to fabricated output.
 */
export class UnavailableAiProvider implements AiProvider {
  readonly name = "unavailable";
  async generate(): Promise<AiProviderResult> {
    return {
      ok: false,
      reason: "AI_UNAVAILABLE",
      modelProvider: this.name,
      detail: "No AI provider configured (mock/live not wired).",
      retryCount: 0,
    };
  }
}

/** Behaviours the deterministic mock can simulate so guardrail tests have something to reject. */
export type MockBehaviour =
  | { kind: "valid"; raw: unknown }
  | { kind: "unavailable"; detail?: string }
  | { kind: "raw"; raw: unknown }; // arbitrary raw payload (e.g. hallucinated/injected) for tests

/**
 * Deterministic, no-network mock provider. Returns whatever payload the test/caller
 * configures. Never calls out. Used to prove the schema + validator guardrails before
 * any live provider exists.
 */
export class MockAiProvider implements AiProvider {
  readonly name = "mock";
  constructor(private readonly behaviour: MockBehaviour) {}

  async generate(): Promise<AiProviderResult> {
    if (this.behaviour.kind === "unavailable") {
      return {
        ok: false,
        reason: "AI_UNAVAILABLE",
        modelProvider: this.name,
        detail: this.behaviour.detail ?? "mock unavailable",
        retryCount: 0,
      };
    }
    return {
      ok: true,
      raw: this.behaviour.raw,
      modelProvider: this.name,
      modelName: "mock-deterministic",
      latencyMs: 0,
      tokensUsed: 0,
      retryCount: 0,
    };
  }
}
