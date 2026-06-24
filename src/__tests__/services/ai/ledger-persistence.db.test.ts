/**
 * AI-6 — Governed AI ledger persistence ([db], runs only with TEST_WITH_DB=true).
 *
 * Proves the durable path end-to-end against PostgreSQL:
 *  - an accepted and a rejected AI call round-trip through the AuditEvent table,
 *  - the copilot sink persists every recorded call,
 *  - workspace isolation holds (a workspace cannot read another's AI ledger, and an
 *    unscoped read is blocked fail-closed),
 *  - no secret/credential is ever stored.
 *
 * Uses synthetic UUID workspaces and the deterministic MockAiProvider — no real
 * business data, no network, no API key.
 */
import { describe, it, expect } from "vitest";
import { randomUUID } from "crypto";

import { db } from "@/lib/db";
import {
  persistAiCallLedgerEntry,
  getPersistedAiCallLedger,
  countPersistedAiCalls,
  createAuditEventLedgerSink,
  flushAiLedgerPersistence,
  AI_CALL_RECORDED_EVENT,
} from "@/services/ai/ledger-persistence";
import {
  runMissingQuestionTask,
  clearAiCallLedger,
  getAiCallLedger,
  setAiCallLedgerSink,
  type AiCallLedgerEntry,
} from "@/services/ai/copilot";
import { MockAiProvider } from "@/services/ai/provider";
import { buildAiContext } from "@/services/ai/context-builder";

function entry(workspaceId: string, overrides: Partial<AiCallLedgerEntry> = {}): AiCallLedgerEntry {
  return {
    aiCallId: `aicall_${randomUUID().slice(0, 8)}`,
    workspaceId,
    businessId: "biz-sample",
    taskType: "MISSING_QUESTION_GENERATION",
    riskLevel: "LOW_CONTENT",
    modelProvider: "mock",
    modelName: "mock-deterministic",
    promptVersion: "mq-v1",
    schemaVersion: "missingQuestionOutput-v1",
    inputContextHash: "fnv1a_0a1b2c3d",
    sourceIds: ["ev-dq"],
    outputHash: "fnv1a_deadbeef",
    validatorResult: "ACCEPTED",
    accepted: true,
    latencyMs: 5,
    tokensUsed: 10,
    retryCount: 0,
    createdAt: "2026-06-24T00:00:00.000Z",
    ...overrides,
  };
}

const VALID_MQ_RAW = {
  taskType: "MISSING_QUESTION_GENERATION",
  questions: [
    {
      question: "What is your average monthly revenue?",
      whyItMatters: "It anchors every downstream diagnosis.",
      confidenceCapAffected: true,
      decisionUnlocked: "cashflow review",
      roughEstimateAcceptable: true,
      exampleAnswer: "about 4 lakh",
      priority: "high",
    },
  ],
  citedEvidenceIds: [],
  notes: "advisory only",
};

describe("[db] AI-6 ledger persistence", () => {
  // NOTE: audit_events is a permanent, governed audit trail — these tests deliberately
  // do NOT delete what they write (destructive deletes of governed audit records are
  // forbidden). Each test uses a fresh random-UUID workspace, so runs never interfere;
  // on CI the postgres:16 instance is ephemeral and discarded after the run.

  it("[db] round-trips an accepted and a rejected call through AuditEvent", async () => {
    const ws = randomUUID();
    await persistAiCallLedgerEntry(entry(ws, { aiCallId: "aicall_acc", accepted: true, validatorResult: "ACCEPTED" }));
    await persistAiCallLedgerEntry(
      entry(ws, {
        aiCallId: "aicall_rej",
        accepted: false,
        validatorResult: "AI_UNAVAILABLE",
        modelName: "n/a",
        outputHash: "n/a",
        failureReason: "simulated outage",
        createdAt: "2026-06-24T00:00:01.000Z",
      })
    );

    const rows = await getPersistedAiCallLedger(ws);
    expect(rows).toHaveLength(2);

    const [first, second] = rows;
    expect(first.ai_call_id).toBe("aicall_acc");
    expect(first.accepted_or_rejected).toBe("accepted");
    expect(first.validator_result).toBe("PASSED");
    expect(first.guardrail_result).toBe("ACCEPTED");
    expect(first.workspace_id).toBe(ws);
    expect(first.source_ids).toEqual(["ev-dq"]);

    expect(second.ai_call_id).toBe("aicall_rej");
    expect(second.accepted_or_rejected).toBe("rejected");
    expect(second.validator_result).toBe("AI_UNAVAILABLE");
    expect(second.guardrail_result).toBe("NOT_RUN");
    expect(second.failure_reason).toBe("simulated outage");

    // Secret-safety: nothing key-like was stored.
    expect(JSON.stringify(rows)).not.toMatch(/sk-[A-Za-z0-9]/);

    expect(await countPersistedAiCalls(ws)).toBe(2);
  });

  it("[db] the copilot sink persists every recorded call", async () => {
    const ws = randomUUID();
    setAiCallLedgerSink(createAuditEventLedgerSink());
    clearAiCallLedger();
    try {
      const context = buildAiContext({
        workspaceId: ws,
        businessId: "biz-sink",
        taskType: "MISSING_QUESTION_GENERATION",
        riskLevel: "LOW_CONTENT",
        items: [
          { kind: "deterministic_score", label: "data_quality", value: 42, trusted: true, evidenceId: "ev-dq" },
        ],
      });
      const result = await runMissingQuestionTask(new MockAiProvider({ kind: "valid", raw: VALID_MQ_RAW }), context);
      expect(result.status).toBe("ACCEPTED");

      await flushAiLedgerPersistence();

      const rows = await getPersistedAiCallLedger(ws);
      expect(rows).toHaveLength(1);
      expect(rows[0].ai_call_id).toBe(getAiCallLedger()[0].aiCallId);
      expect(rows[0].accepted_or_rejected).toBe("accepted");
      expect(rows[0].input_context_hash).toMatch(/^fnv1a_/);
    } finally {
      setAiCallLedgerSink(null);
      clearAiCallLedger();
    }
  });

  it("[db] enforces workspace isolation", async () => {
    const wsA = randomUUID();
    const wsB = randomUUID();
    await persistAiCallLedgerEntry(entry(wsA, { aiCallId: "aicall_iso" }));

    // wsB cannot see wsA's AI ledger.
    expect(await getPersistedAiCallLedger(wsB)).toHaveLength(0);
    expect(await countPersistedAiCalls(wsB)).toBe(0);
    expect(await countPersistedAiCalls(wsA)).toBe(1);

    // An unscoped read is blocked fail-closed by the workspace-enforcement middleware.
    await expect(
      db.auditEvent.findMany({ where: { eventName: AI_CALL_RECORDED_EVENT } })
    ).rejects.toThrow(/WORKSPACE ISOLATION VIOLATION/);
  });
});
