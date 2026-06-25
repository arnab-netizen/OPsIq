/**
 * AI-6 — Governed AI ledger persistence (pure / no DB).
 *
 * Proves the in-memory ledger entry maps faithfully and safely onto an AuditEvent
 * record: every required field is captured, the schema-validator vs guardrail stages
 * are split correctly, accepted/rejected is recorded, optional fields are omitted when
 * absent, no secrets or raw content can reach storage, and the copilot sink mirrors
 * every recorded call. DB round-trip + workspace isolation are covered in the [db] test.
 */
import { describe, it, expect, afterEach } from "vitest";

import {
  buildAiCallAuditData,
  splitValidatorResults,
  assertNoSecrets,
  AI_CALL_RECORDED_EVENT,
} from "@/services/ai/ledger-persistence";
import {
  runMissingQuestionTask,
  clearAiCallLedger,
  setAiCallLedgerSink,
  type AiCallLedgerEntry,
} from "@/services/ai/copilot";
import { MockAiProvider } from "@/services/ai/provider";
import { buildAiContext } from "@/services/ai/context-builder";

function baseEntry(overrides: Partial<AiCallLedgerEntry> = {}): AiCallLedgerEntry {
  return {
    aiCallId: "aicall_1",
    workspaceId: "ws-1",
    businessId: "biz-1",
    taskType: "MISSING_QUESTION_GENERATION",
    riskLevel: "LOW_CONTENT",
    modelProvider: "mock",
    modelName: "mock-deterministic",
    promptVersion: "mq-v1",
    schemaVersion: "missingQuestionOutput-v1",
    inputContextHash: "fnv1a_0a1b2c3d",
    sourceIds: ["ev-dq", "ev-missing"],
    outputHash: "fnv1a_deadbeef",
    validatorResult: "ACCEPTED",
    accepted: true,
    latencyMs: 12,
    tokensUsed: 42,
    retryCount: 0,
    createdAt: "2026-06-24T00:00:00.000Z",
    ...overrides,
  };
}

describe("AI-6 ledger persistence — pure mapper", () => {
  it("maps every required field into the AuditEvent payload", () => {
    const data = buildAiCallAuditData(baseEntry());

    expect(data.eventName).toBe(AI_CALL_RECORDED_EVENT);
    expect(data.eventName).toBe("ai.call_recorded");
    expect(data.actorType).toBe("system");
    expect(data.entityType).toBe("ai_call");
    expect(data.entityId).toBeNull();
    expect(data.correlationId).toBe("aicall_1");
    expect(data.visibility).toBe("internal");
    expect(data.workspaceId).toBe("ws-1");
    expect(data.occurredAt).toEqual(new Date("2026-06-24T00:00:00.000Z"));
    expect(typeof data.id).toBe("string");

    const payload = JSON.parse(data.payload);
    expect(payload).toMatchObject({
      ai_call_id: "aicall_1",
      workspace_id: "ws-1",
      business_id: "biz-1",
      task_type: "MISSING_QUESTION_GENERATION",
      risk_level: "LOW_CONTENT",
      model_provider: "mock",
      model_name: "mock-deterministic",
      prompt_version: "mq-v1",
      schema_version: "missingQuestionOutput-v1",
      input_context_hash: "fnv1a_0a1b2c3d",
      source_ids: ["ev-dq", "ev-missing"],
      output_hash: "fnv1a_deadbeef",
      validator_result: "PASSED",
      guardrail_result: "ACCEPTED",
      accepted_or_rejected: "accepted",
      latency_ms: 12,
      token_usage: 42,
      retry_count: 0,
      created_at: "2026-06-24T00:00:00.000Z",
    });
  });

  it("records accepted vs rejected", () => {
    expect(
      JSON.parse(buildAiCallAuditData(baseEntry({ accepted: true })).payload).accepted_or_rejected
    ).toBe("accepted");
    expect(
      JSON.parse(buildAiCallAuditData(baseEntry({ accepted: false, validatorResult: "REJECTED_POLICY_VIOLATION" })).payload)
        .accepted_or_rejected
    ).toBe("rejected");
  });

  it("splits the schema-validator and guardrail stages", () => {
    expect(splitValidatorResults("AI_UNAVAILABLE")).toEqual({
      validatorResult: "AI_UNAVAILABLE",
      guardrailResult: "NOT_RUN",
    });
    expect(splitValidatorResults("REJECTED_SCHEMA_INVALID")).toEqual({
      validatorResult: "REJECTED_SCHEMA_INVALID",
      guardrailResult: "NOT_RUN",
    });
    expect(splitValidatorResults("ACCEPTED")).toEqual({
      validatorResult: "PASSED",
      guardrailResult: "ACCEPTED",
    });
    expect(splitValidatorResults("REJECTED_HALLUCINATED_EVIDENCE")).toEqual({
      validatorResult: "PASSED",
      guardrailResult: "REJECTED_HALLUCINATED_EVIDENCE",
    });
  });

  it("omits optional fields when absent and includes them when present", () => {
    const withoutOptionals = JSON.parse(
      buildAiCallAuditData(
        baseEntry({ tokensUsed: undefined, businessId: undefined })
      ).payload
    );
    expect(withoutOptionals).not.toHaveProperty("token_usage");
    expect(withoutOptionals).not.toHaveProperty("cost_estimate");
    expect(withoutOptionals).not.toHaveProperty("decision_id");
    expect(withoutOptionals).not.toHaveProperty("failure_reason");
    expect(withoutOptionals.business_id).toBeNull();

    const withOptionals = JSON.parse(
      buildAiCallAuditData(
        baseEntry({
          tokensUsed: 99,
          costEstimate: 0.0012,
          decisionId: "dec-1",
          actionId: "act-1",
          outcomeId: "out-1",
          accepted: false,
          validatorResult: "REJECTED_CONFIDENCE_OVERCLAIM",
          failureReason: "output overclaims confidence/certainty",
        })
      ).payload
    );
    expect(withOptionals).toMatchObject({
      token_usage: 99,
      cost_estimate: 0.0012,
      decision_id: "dec-1",
      action_id: "act-1",
      outcome_id: "out-1",
      failure_reason: "output overclaims confidence/certainty",
      validator_result: "PASSED",
      guardrail_result: "REJECTED_CONFIDENCE_OVERCLAIM",
    });
  });

  it("fails closed if a secret would reach storage", () => {
    expect(() => assertNoSecrets({ failure_reason: "leaked sk-ABCDEFGH1234567890 key" })).toThrow(
      /secret/i
    );
    expect(() =>
      buildAiCallAuditData(baseEntry({ failureReason: "boom sk-ABCDEFGH1234567890" }))
    ).toThrow(/secret/i);
    // A normal guardrail reason is fine.
    expect(() =>
      buildAiCallAuditData(baseEntry({ failureReason: "cited evidence not in context: ev-x" }))
    ).not.toThrow();
  });

  it("stored payload contains no raw OpenAI-style key pattern", () => {
    const dump = buildAiCallAuditData(baseEntry()).payload;
    expect(dump).not.toMatch(/sk-[A-Za-z0-9]/);
  });
});

describe("AI-6 ledger persistence — copilot sink mirrors every recorded call", () => {
  afterEach(() => {
    setAiCallLedgerSink(null);
    clearAiCallLedger();
  });

  it("invokes the registered sink with the same entry the call returned", async () => {
    clearAiCallLedger();
    const captured: AiCallLedgerEntry[] = [];
    setAiCallLedgerSink((entry) => captured.push(entry));

    const provider = new MockAiProvider({
      kind: "valid",
      raw: {
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
      },
    });

    const context = buildAiContext({
      workspaceId: "ws-sink",
      businessId: "biz-sink",
      taskType: "MISSING_QUESTION_GENERATION",
      riskLevel: "LOW_CONTENT",
      items: [
        { kind: "deterministic_score", label: "data_quality", value: 42, trusted: true, evidenceId: "ev-dq" },
      ],
    });

    const result = await runMissingQuestionTask(provider, context);

    expect(result.status).toBe("ACCEPTED");
    expect(captured).toHaveLength(1);
    expect(captured[0]).toBe(result.ledgerEntry);
    expect(captured[0].inputContextHash).toMatch(/^fnv1a_/);
    expect(captured[0].sourceIds).toContain("ev-dq");

    // The captured entry maps cleanly to an AuditEvent record with no secrets.
    const data = buildAiCallAuditData(captured[0]);
    expect(data.workspaceId).toBe("ws-sink");
    expect(JSON.parse(data.payload).accepted_or_rejected).toBe("accepted");
  });

  it("a throwing sink never breaks the advisory AI call", async () => {
    clearAiCallLedger();
    setAiCallLedgerSink(() => {
      throw new Error("sink exploded");
    });
    const provider = new MockAiProvider({ kind: "unavailable", detail: "simulated outage" });
    const context = buildAiContext({
      workspaceId: "ws-sink",
      taskType: "MISSING_QUESTION_GENERATION",
      riskLevel: "LOW_CONTENT",
      items: [],
    });
    const result = await runMissingQuestionTask(provider, context);
    // Advisory path still returns its governed result despite the sink throwing.
    expect(result.status).toBe("AI_UNAVAILABLE");
    expect(result.output).toBeNull();
  });
});
