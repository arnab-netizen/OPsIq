/**
 * Owner Mode Governed AI Copilot — Ledger Persistence (Phase AI-6).
 *
 * Durable mirror of the in-memory AI call ledger (copilot.ts) for real-owner-data
 * trial readiness. Each accepted/rejected governed AI call is snapshotted as ONE
 * row in the existing `AuditEvent` table (eventName = "ai.call_recorded"). No new
 * table and no schema change: AuditEvent already carries a workspace-scoped, indexed,
 * internal-visibility JSON payload, which is exactly what a per-call audit record needs.
 *
 * Governance invariants preserved:
 *  - AI stays ADVISORY. This module only records what a call did; it never approves,
 *    verifies, mutates business state, or creates learning.
 *  - Workspace isolation: every write carries workspaceId; every read is workspace-scoped
 *    (the Prisma workspace-enforcement middleware fails closed otherwise).
 *  - Secret/raw-data safety: only hashes, references (ids), enums, and metadata are stored —
 *    never API keys, never raw model output, never raw business content. A defensive
 *    secret scan fails closed before any write.
 *  - Internal-only: rows are visibility="internal" and actorType="system"; there is no
 *    operator/client read path. The read helpers below are owner/admin/internal only.
 */
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { logger } from "@/infra/logger";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import type { AiValidatorStatus } from "./validator";
import { setAiCallLedgerSink, type AiCallLedgerEntry, type AiCallLedgerSink } from "./copilot";

export const AI_CALL_RECORDED_EVENT = AUDIT_EVENTS.AI_CALL_RECORDED;

/**
 * Patterns that must NEVER reach durable storage. The ledger entry already holds only
 * hashes/ids/metadata, but this is a fail-closed backstop in case a future field leaks
 * a credential into e.g. a failure reason.
 */
const SECRET_PATTERNS: ReadonlyArray<RegExp> = [
  /sk-[A-Za-z0-9]{8,}/, // OpenAI-style API key
  /\bBearer\s+[A-Za-z0-9._-]{12,}/i, // bearer token
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/, // PEM private key
  /AKIA[0-9A-Z]{16}/, // AWS access key id
];

/** Throws if the serialized payload appears to contain a secret/credential. */
export function assertNoSecrets(payload: Record<string, unknown>): void {
  const serialized = JSON.stringify(payload);
  for (const pattern of SECRET_PATTERNS) {
    if (pattern.test(serialized)) {
      throw new Error(
        "AI ledger persistence blocked: payload appears to contain a secret/credential"
      );
    }
  }
}

/**
 * The single combined `validatorResult` encodes the pipeline's first failure. Split it
 * back into the two distinct governance stages the trial schema asks for:
 *  - validator_result: structural/schema-validation stage outcome
 *  - guardrail_result: post-schema guardrail-scan stage outcome (NOT_RUN when schema/
 *    provider short-circuited before the guardrails could run)
 */
export function splitValidatorResults(validatorResult: AiValidatorStatus): {
  validatorResult: string;
  guardrailResult: string;
} {
  if (validatorResult === "AI_UNAVAILABLE") {
    return { validatorResult: "AI_UNAVAILABLE", guardrailResult: "NOT_RUN" };
  }
  if (validatorResult === "REJECTED_SCHEMA_INVALID") {
    return { validatorResult: "REJECTED_SCHEMA_INVALID", guardrailResult: "NOT_RUN" };
  }
  // Schema passed → guardrails ran; validatorResult reflects the guardrail outcome
  // (ACCEPTED, or a REJECTED_* guardrail class).
  return { validatorResult: "PASSED", guardrailResult: validatorResult };
}

/** The exact `AuditEvent` create-data for one AI call. Real columns only. */
export interface AiCallAuditData {
  id: string;
  eventName: string;
  actorType: string;
  entityType: string;
  entityId: string | null;
  correlationId: string;
  visibility: string;
  occurredAt: Date;
  workspaceId: string;
  payload: string;
}

/**
 * Pure mapper: ledger entry → AuditEvent create-data. The structured per-call record
 * lives in `payload` (JSON string, parsed back by the db read-extension). Fail-closed
 * on secrets. No DB access — unit-testable in isolation.
 */
export function buildAiCallAuditData(entry: AiCallLedgerEntry): AiCallAuditData {
  const { validatorResult, guardrailResult } = splitValidatorResults(entry.validatorResult);

  const payload: Record<string, unknown> = {
    ai_call_id: entry.aiCallId,
    workspace_id: entry.workspaceId,
    business_id: entry.businessId ?? null,
    task_type: entry.taskType,
    risk_level: entry.riskLevel,
    model_provider: entry.modelProvider,
    model_name: entry.modelName,
    prompt_version: entry.promptVersion,
    schema_version: entry.schemaVersion,
    input_context_hash: entry.inputContextHash,
    source_ids: entry.sourceIds,
    output_hash: entry.outputHash,
    validator_result: validatorResult,
    guardrail_result: guardrailResult,
    accepted_or_rejected: entry.accepted ? "accepted" : "rejected",
    latency_ms: entry.latencyMs,
    retry_count: entry.retryCount,
    created_at: entry.createdAt,
  };

  // Optional / "if applicable" / "if available" fields — included only when present.
  if (entry.decisionId) payload.decision_id = entry.decisionId;
  if (entry.actionId) payload.action_id = entry.actionId;
  if (entry.outcomeId) payload.outcome_id = entry.outcomeId;
  if (typeof entry.tokensUsed === "number") payload.token_usage = entry.tokensUsed;
  if (typeof entry.costEstimate === "number") payload.cost_estimate = entry.costEstimate;
  if (entry.failureReason) payload.failure_reason = entry.failureReason;

  assertNoSecrets(payload);

  return {
    id: randomUUID(),
    eventName: AI_CALL_RECORDED_EVENT,
    actorType: "system", // AI is a system actor, never a user
    entityType: "ai_call",
    entityId: null, // aiCallId is not a UUID; it lives in payload + correlationId
    correlationId: entry.aiCallId, // indexed, non-UUID string column
    visibility: "internal", // owner/admin/internal only — never operator/client-visible
    occurredAt: new Date(entry.createdAt),
    workspaceId: entry.workspaceId,
    payload: JSON.stringify(payload),
  };
}

/** Persist a single ledger entry as an AuditEvent row. */
export async function persistAiCallLedgerEntry(entry: AiCallLedgerEntry): Promise<void> {
  const data = buildAiCallAuditData(entry);
  await db.auditEvent.create({ data });
}

/** Persist many ledger entries (sequential; preserves call order). */
export async function persistAiCallLedger(
  entries: ReadonlyArray<AiCallLedgerEntry>
): Promise<void> {
  for (const entry of entries) {
    await persistAiCallLedgerEntry(entry);
  }
}

// ── Sink wiring (registered by the runtime/trial bootstrap via setAiCallLedgerSink) ──
const inFlight = new Set<Promise<unknown>>();

/**
 * Build a fire-and-forget persistence sink. Returned function never throws into the
 * advisory path: a persistence failure is logged, never propagated. In-flight writes
 * are tracked so callers/tests can await a clean flush.
 */
export function createAuditEventLedgerSink(): AiCallLedgerSink {
  return (entry: AiCallLedgerEntry) => {
    const promise = persistAiCallLedgerEntry(entry).catch((error: unknown) => {
      // Audit mirror, fail-safe: never break the advisory AI call because durable
      // persistence failed. The failure (incl. a fail-closed secret-scan rejection)
      // is recorded/observable via the governed logger, never silently dropped.
      logger.error(
        "AI ledger persistence failed",
        error instanceof Error ? error : new Error(String(error))
      );
    });
    inFlight.add(promise);
    void promise.finally(() => inFlight.delete(promise));
  };
}

/** Await all in-flight sink writes (graceful shutdown / test determinism). */
export async function flushAiLedgerPersistence(): Promise<void> {
  await Promise.allSettled([...inFlight]);
}

/**
 * Wire durable AI ledger persistence into the governed copilot. Called once by the
 * server composition root (src/instrumentation.ts) at Node startup, so every governed
 * AI call recorded thereafter is mirrored to the AuditEvent table. Idempotent — re-registers
 * the same audit-event sink. The sink is fail-safe (a persistence failure is logged and
 * observable but never breaks the advisory AI path) and fail-closed for secrets
 * (assertNoSecrets blocks any credential before a write).
 */
export function registerAiLedgerPersistence(): void {
  setAiCallLedgerSink(createAuditEventLedgerSink());
}

// ── Internal / owner-admin read paths (workspace-scoped; never operator-exposed) ──

/** One persisted AI call record, as stored in the AuditEvent payload. */
export type PersistedAiCall = Record<string, unknown>;

/**
 * Read the persisted AI call ledger for a single workspace, oldest first. Requires an
 * explicit workspaceId — workspace isolation is enforced (the middleware also fails
 * closed on any unscoped read). Internal/owner-admin use only.
 */
export async function getPersistedAiCallLedger(
  workspaceId: string
): Promise<PersistedAiCall[]> {
  if (!workspaceId) {
    throw new Error("getPersistedAiCallLedger requires a workspaceId (workspace isolation)");
  }
  const rows = await db.auditEvent.findMany({
    where: { workspaceId, eventName: AI_CALL_RECORDED_EVENT },
    orderBy: { occurredAt: "asc" },
  });
  // The db client extension parses the `payload` string back into an object on read.
  return rows.map((row: { payload: unknown }) => (row.payload ?? {}) as PersistedAiCall);
}

/** Count persisted AI calls for a workspace (workspace-scoped). */
export async function countPersistedAiCalls(workspaceId: string): Promise<number> {
  if (!workspaceId) {
    throw new Error("countPersistedAiCalls requires a workspaceId (workspace isolation)");
  }
  return db.auditEvent.count({
    where: { workspaceId, eventName: AI_CALL_RECORDED_EVENT },
  });
}
