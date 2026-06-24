/**
 * Owner Mode Governed AI Copilot — Orchestrator + in-memory Call Ledger (Phase AI-1/AI-6).
 *
 * Single governed entry point: build request → provider → schema-validate → guardrail
 * validate → record an auditable ledger entry → return an ADVISORY result. The copilot
 * never mutates business state, approves decisions, verifies outcomes, or creates
 * learning; it returns suggestions for the deterministic services + owner to adjudicate.
 *
 * The ledger is in-memory for AI-1 (no DB). It records references/hashes, never raw
 * sensitive content and never secrets. Phase AI-6 can persist via the existing audit
 * event / ai-observability-trace mechanisms.
 */
import type { ZodType } from "zod";
import {
  missingQuestionOutputSchema,
  type MissingQuestionOutput,
} from "./schemas";
import {
  validateAiOutput,
  type AiValidationResult,
  type AiValidatorStatus,
} from "./validator";
import type { AiContext, AiProvider, AiRequest, AiRiskLevel, AiTaskType } from "./provider";

// ── In-memory AI call ledger (Decision-OS §H) ────────────────────────────────
export interface AiCallLedgerEntry {
  aiCallId: string;
  workspaceId: string;
  businessId?: string;
  taskType: AiTaskType;
  riskLevel: AiRiskLevel;
  modelProvider: string;
  modelName: string;
  promptVersion: string;
  schemaVersion: string;
  /** Deterministic hash of the (workspace-scoped) input context — never the raw content. */
  inputContextHash: string;
  /** Closed set of evidence/source ids the call was allowed to cite — references only. */
  sourceIds: string[];
  /** Hash of the raw model payload — never the raw content itself. */
  outputHash: string;
  validatorResult: AiValidatorStatus;
  accepted: boolean;
  latencyMs: number;
  tokensUsed?: number;
  /** Provider cost estimate, when the provider reports it. */
  costEstimate?: number;
  retryCount: number;
  failureReason?: string;
  /** Governed-record references, set only when the call is tied to one (advisory linkage only). */
  decisionId?: string;
  actionId?: string;
  outcomeId?: string;
  createdAt: string;
}

const LEDGER: AiCallLedgerEntry[] = [];
export function getAiCallLedger(): ReadonlyArray<AiCallLedgerEntry> {
  return LEDGER;
}
export function clearAiCallLedger(): void {
  LEDGER.length = 0;
}

/**
 * Optional persistence sink. When registered (by the runtime/trial bootstrap), every
 * recorded ledger entry is mirrored to durable storage (the AuditEvent table) for
 * real-owner-data trial readiness. The advisory AI path NEVER blocks on or fails
 * because of the sink — persistence is an audit mirror, not a gate. Unset by default
 * so keyless unit tests stay DB-free.
 */
export type AiCallLedgerSink = (entry: AiCallLedgerEntry) => void;
let ledgerSink: AiCallLedgerSink | null = null;
export function setAiCallLedgerSink(sink: AiCallLedgerSink | null): void {
  ledgerSink = sink;
}

/** Deterministic FNV-1a hash so the ledger can reference output without storing it. */
function hashPayload(value: unknown): string {
  const s = JSON.stringify(value) ?? "null";
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return `fnv1a_${h.toString(16).padStart(8, "0")}`;
}

let callCounter = 0;
function nextCallId(): string {
  callCounter += 1;
  return `aicall_${callCounter.toString(36)}`;
}

export interface AiCopilotResult<T> {
  status: AiValidatorStatus;
  accepted: boolean;
  /** Present only when accepted; never trusted as evidence, never auto-applied. */
  output: T | null;
  validation: AiValidationResult | null;
  ledgerEntry: AiCallLedgerEntry;
  reasons: string[];
}

export interface RunTaskOptions {
  promptVersion?: string;
  schemaVersion?: string;
  clock?: () => string;
  modelTier?: "cheap" | "strong";
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  maxRetries?: number;
}

function record(entry: AiCallLedgerEntry): AiCallLedgerEntry {
  LEDGER.push(entry);
  if (ledgerSink) {
    try {
      ledgerSink(entry);
    } catch {
      // Persistence is an audit MIRROR; an advisory AI call must never fail because
      // the sink threw. The in-memory ledger remains the authoritative in-process record.
    }
  }
  return entry;
}

/**
 * Generic governed task runner (AI-4/5/6). Same pipeline as the specific runners:
 * provider → schema validate → guardrail validate → ledger → advisory result. Every
 * implemented task funnels through here so the governance is enforced in ONE place.
 * `extract` returns the model-authored text to scan (excluding sample/example fields)
 * and the evidence ids the model claims to have cited.
 */
export async function runGovernedAiTask<T>(
  provider: AiProvider,
  context: AiContext,
  schema: ZodType<T>,
  extract: (parsed: T) => { scannableText: string; citedEvidenceIds: string[] },
  opts: RunTaskOptions & { promptVersion: string; schemaVersion: string; outputContract?: string }
): Promise<AiCopilotResult<T>> {
  const now = (opts.clock ?? (() => new Date().toISOString()))();
  const base = {
    aiCallId: nextCallId(),
    workspaceId: context.workspaceId,
    businessId: context.businessId,
    taskType: context.taskType,
    riskLevel: context.riskLevel,
    promptVersion: opts.promptVersion,
    schemaVersion: opts.schemaVersion,
    inputContextHash: hashPayload(context),
    sourceIds: [...context.allowedEvidenceIds],
    createdAt: now,
  };

  const request: AiRequest = {
    context,
    promptVersion: opts.promptVersion,
    schemaVersion: opts.schemaVersion,
    outputContract: opts.outputContract,
    options: {
      modelTier: opts.modelTier ?? "cheap",
      temperature: opts.temperature ?? 0,
      maxTokens: opts.maxTokens ?? 1200,
      timeoutMs: opts.timeoutMs ?? 25000,
      maxRetries: opts.maxRetries ?? 1,
    },
  };

  const res = await provider.generate(request);
  if (!res.ok) {
    const ledgerEntry = record({
      ...base, modelProvider: res.modelProvider, modelName: "n/a", outputHash: "n/a",
      validatorResult: "AI_UNAVAILABLE", accepted: false, latencyMs: 0, retryCount: res.retryCount, failureReason: res.detail,
    });
    return { status: "AI_UNAVAILABLE", accepted: false, output: null, validation: null, ledgerEntry, reasons: [res.detail] };
  }

  const parsed = schema.safeParse(res.raw);
  if (!parsed.success) {
    const ledgerEntry = record({
      ...base, modelProvider: res.modelProvider, modelName: res.modelName, outputHash: hashPayload(res.raw),
      validatorResult: "REJECTED_SCHEMA_INVALID", accepted: false, latencyMs: res.latencyMs, tokensUsed: res.tokensUsed,
      retryCount: res.retryCount, failureReason: "schema validation failed",
    });
    return {
      status: "REJECTED_SCHEMA_INVALID", accepted: false, output: null, validation: null, ledgerEntry,
      reasons: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
    };
  }

  const { scannableText, citedEvidenceIds } = extract(parsed.data);
  const validation = validateAiOutput({ scannableText, citedEvidenceIds }, context);

  const ledgerEntry = record({
    ...base, modelProvider: res.modelProvider, modelName: res.modelName, outputHash: hashPayload(res.raw),
    validatorResult: validation.status, accepted: validation.accepted, latencyMs: res.latencyMs, tokensUsed: res.tokensUsed,
    retryCount: res.retryCount, failureReason: validation.accepted ? undefined : validation.reasons.join("; "),
  });

  return {
    status: validation.status, accepted: validation.accepted,
    output: validation.accepted ? parsed.data : null, validation, ledgerEntry, reasons: validation.reasons,
  };
}

/** JSON shape hint sent to the live model so structured output is schema-valid. */
const MISSING_QUESTION_OUTPUT_CONTRACT =
  `{ "taskType": "MISSING_QUESTION_GENERATION", "questions": [ { "question": string, ` +
  `"whyItMatters": string, "confidenceCapAffected": boolean, "decisionUnlocked": string, ` +
  `"roughEstimateAcceptable": boolean, "exampleAnswer": string, "priority": "high"|"medium"|"low" } ], ` +
  `"citedEvidenceIds": string[], "notes": string }. ` +
  `Ask 1-5 questions (prefer 3). Questions only — never assert a fact or a number.`;

/**
 * MISSING_QUESTION_GENERATION (LOW_CONTENT). The only task implemented in AI-1.
 * Returns advisory questions; an AI_UNAVAILABLE/invalid/guardrail-rejected call
 * yields `output: null` and the owner simply proceeds on the deterministic path.
 */
export async function runMissingQuestionTask(
  provider: AiProvider,
  context: AiContext,
  opts: RunTaskOptions = {}
): Promise<AiCopilotResult<MissingQuestionOutput>> {
  const now = (opts.clock ?? (() => new Date().toISOString()))();
  const promptVersion = opts.promptVersion ?? "mq-v1";
  const schemaVersion = opts.schemaVersion ?? "missingQuestionOutput-v1";

  const base = {
    aiCallId: nextCallId(),
    workspaceId: context.workspaceId,
    businessId: context.businessId,
    taskType: context.taskType,
    riskLevel: context.riskLevel,
    promptVersion,
    schemaVersion,
    inputContextHash: hashPayload(context),
    sourceIds: [...context.allowedEvidenceIds],
    createdAt: now,
  };

  const request: AiRequest = {
    context,
    promptVersion,
    schemaVersion,
    outputContract: MISSING_QUESTION_OUTPUT_CONTRACT,
    options: {
      modelTier: opts.modelTier ?? "cheap",
      temperature: opts.temperature ?? 0,
      maxTokens: opts.maxTokens ?? 800,
      timeoutMs: opts.timeoutMs ?? 20000,
      maxRetries: opts.maxRetries ?? 1,
    },
  };

  const res = await provider.generate(request);

  if (!res.ok) {
    const ledgerEntry = record({
      ...base,
      modelProvider: res.modelProvider,
      modelName: "n/a",
      outputHash: "n/a",
      validatorResult: "AI_UNAVAILABLE",
      accepted: false,
      latencyMs: 0,
      retryCount: res.retryCount,
      failureReason: res.detail,
    });
    return { status: "AI_UNAVAILABLE", accepted: false, output: null, validation: null, ledgerEntry, reasons: [res.detail] };
  }

  const parsed = missingQuestionOutputSchema.safeParse(res.raw);
  if (!parsed.success) {
    const ledgerEntry = record({
      ...base,
      modelProvider: res.modelProvider,
      modelName: res.modelName,
      outputHash: hashPayload(res.raw),
      validatorResult: "REJECTED_SCHEMA_INVALID",
      accepted: false,
      latencyMs: res.latencyMs,
      tokensUsed: res.tokensUsed,
      retryCount: res.retryCount,
      failureReason: "schema validation failed",
    });
    return {
      status: "REJECTED_SCHEMA_INVALID",
      accepted: false,
      output: null,
      validation: null,
      ledgerEntry,
      reasons: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
    };
  }

  // Scan model-authored text — EXCLUDING exampleAnswer (sample values are allowed there).
  const scannableText = [
    parsed.data.notes ?? "",
    ...parsed.data.questions.flatMap((q) => [q.question, q.whyItMatters, q.decisionUnlocked]),
  ].join("\n");

  const validation = validateAiOutput(
    { scannableText, citedEvidenceIds: parsed.data.citedEvidenceIds },
    context
  );

  const ledgerEntry = record({
    ...base,
    modelProvider: res.modelProvider,
    modelName: res.modelName,
    outputHash: hashPayload(res.raw),
    validatorResult: validation.status,
    accepted: validation.accepted,
    latencyMs: res.latencyMs,
    tokensUsed: res.tokensUsed,
    retryCount: res.retryCount,
    failureReason: validation.accepted ? undefined : validation.reasons.join("; "),
  });

  return {
    status: validation.status,
    accepted: validation.accepted,
    output: validation.accepted ? parsed.data : null,
    validation,
    ledgerEntry,
    reasons: validation.reasons,
  };
}
