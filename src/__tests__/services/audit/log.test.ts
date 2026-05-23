import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { logDecision } from "@/services/audit/log";
import type { AuditRecord } from "@/domain/audit/types";

// ============================================================================
// TEST SUITE: Audit Log Service
// ============================================================================

describe("Audit Log Service - logDecision()", () => {
  let consoleSpy: unknown;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  // ========== Basic Functionality ==========

  it("logs a valid audit record", () => {
    const record: AuditRecord = {
      id: "audit-001",
      timestamp: "2026-05-11T10:30:00Z",
      inputSnapshot: '{"action":"create"}',
      outputSnapshot: '{"status":"completed"}',
      ruleId: "rule-123",
    };

    logDecision(record);

    expect(consoleSpy).toHaveBeenCalledOnce();
    expect(consoleSpy).toHaveBeenCalledWith(JSON.stringify(record));
  });

  it("outputs JSON string representation", () => {
    const record: AuditRecord = {
      id: "audit-002",
      timestamp: "2026-05-11T11:00:00Z",
      inputSnapshot: '{"input":"data"}',
      outputSnapshot: '{"result":"success"}',
      ruleId: "rule-456",
    };

    logDecision(record);

    const logged = consoleSpy.mock.calls[0][0];
    expect(typeof logged).toBe("string");
    expect(JSON.parse(logged)).toEqual(record);
  });

  it("calls console.log exactly once", () => {
    const record: AuditRecord = {
      id: "audit-003",
      timestamp: "2026-05-11T12:00:00Z",
      inputSnapshot: "{}",
      outputSnapshot: "{}",
      ruleId: "rule-789",
    };

    logDecision(record);

    expect(consoleSpy).toHaveBeenCalledTimes(1);
  });

  // ========== Field Validation ==========

  it("preserves all required fields in output", () => {
    const record: AuditRecord = {
      id: "audit-004",
      timestamp: "2026-05-11T13:00:00Z",
      inputSnapshot: '{"field":"input"}',
      outputSnapshot: '{"field":"output"}',
      ruleId: "rule-abc",
    };

    logDecision(record);

    const logged = consoleSpy.mock.calls[0][0];
    const parsed = JSON.parse(logged);

    expect(parsed).toHaveProperty("id", "audit-004");
    expect(parsed).toHaveProperty("timestamp", "2026-05-11T13:00:00Z");
    expect(parsed).toHaveProperty(
      "inputSnapshot",
      '{"field":"input"}'
    );
    expect(parsed).toHaveProperty(
      "outputSnapshot",
      '{"field":"output"}'
    );
    expect(parsed).toHaveProperty("ruleId", "rule-abc");
  });

  it("logs records with empty string fields", () => {
    const record: AuditRecord = {
      id: "audit-005",
      timestamp: "",
      inputSnapshot: "",
      outputSnapshot: "",
      ruleId: "",
    };

    logDecision(record);

    const logged = JSON.parse(consoleSpy.mock.calls[0][0]);
    expect(logged.id).toBe("audit-005");
    expect(logged.timestamp).toBe("");
    expect(logged.inputSnapshot).toBe("");
  });

  it("logs records with special characters in fields", () => {
    const record: AuditRecord = {
      id: "audit-006",
      timestamp: "2026-05-11T14:00:00Z",
      inputSnapshot: '{"text":"He said \\"Hello\\""}',
      outputSnapshot: '{"result":"Line1\\nLine2"}',
      ruleId: "rule-@special#123",
    };

    logDecision(record);

    const logged = JSON.parse(consoleSpy.mock.calls[0][0]);
    expect(logged.inputSnapshot).toContain('\\"Hello\\"');
    expect(logged.outputSnapshot).toContain("\\n");
  });

  // ========== JSON Serialization ==========

  it("produces valid JSON output", () => {
    const record: AuditRecord = {
      id: "audit-007",
      timestamp: "2026-05-11T15:00:00Z",
      inputSnapshot: '{"nested":{"deep":{"value":"test"}}}',
      outputSnapshot: '{"array":[1,2,3]}',
      ruleId: "rule-json",
    };

    logDecision(record);

    const logged = consoleSpy.mock.calls[0][0];
    expect(() => JSON.parse(logged)).not.toThrow();
  });

  it("preserves JSON structure in snapshots", () => {
    const inputData = { user: "john", action: "create" };
    const outputData = { status: "completed", id: 123 };

    const record: AuditRecord = {
      id: "audit-008",
      timestamp: "2026-05-11T16:00:00Z",
      inputSnapshot: JSON.stringify(inputData),
      outputSnapshot: JSON.stringify(outputData),
      ruleId: "rule-structure",
    };

    logDecision(record);

    const logged = JSON.parse(consoleSpy.mock.calls[0][0]);
    expect(JSON.parse(logged.inputSnapshot)).toEqual(inputData);
    expect(JSON.parse(logged.outputSnapshot)).toEqual(outputData);
  });

  it("handles large JSON payloads", () => {
    const largeInput = JSON.stringify({
      data: Array(1000)
        .fill(null)
        .map((_, i) => ({ id: i, value: `item-${i}` })),
    });

    const record: AuditRecord = {
      id: "audit-009",
      timestamp: "2026-05-11T17:00:00Z",
      inputSnapshot: largeInput,
      outputSnapshot: '{"processed":true}',
      ruleId: "rule-large",
    };

    logDecision(record);

    const logged = consoleSpy.mock.calls[0][0];
    expect(logged.length).toBeGreaterThan(1000);
    expect(() => JSON.parse(logged)).not.toThrow();
  });

  // ========== Timestamp Handling ==========

  it("preserves ISO 8601 timestamps", () => {
    const timestamps = [
      "2026-05-11T10:30:00Z",
      "2026-05-11T10:30:00+00:00",
      "2026-05-11T10:30:00.123Z",
    ];

    timestamps.forEach((timestamp) => {
      consoleSpy.mockClear();

      const record: AuditRecord = {
        id: "audit-ts",
        timestamp,
        inputSnapshot: "{}",
        outputSnapshot: "{}",
        ruleId: "rule-ts",
      };

      logDecision(record);

      const logged = JSON.parse(consoleSpy.mock.calls[0][0]);
      expect(logged.timestamp).toBe(timestamp);
    });
  });

  it("handles historical timestamps", () => {
    const record: AuditRecord = {
      id: "audit-historic",
      timestamp: "2000-01-01T00:00:00Z",
      inputSnapshot: "{}",
      outputSnapshot: "{}",
      ruleId: "rule-historic",
    };

    logDecision(record);

    const logged = JSON.parse(consoleSpy.mock.calls[0][0]);
    expect(logged.timestamp).toBe("2000-01-01T00:00:00Z");
  });

  // ========== ID Handling ==========

  it("preserves audit record IDs exactly", () => {
    const ids = [
      "audit-001",
      "uuid-123e4567-e89b-12d3-a456-426614174000",
      "audit_underscore",
      "audit-with-dashes-123",
    ];

    ids.forEach((id) => {
      consoleSpy.mockClear();

      const record: AuditRecord = {
        id,
        timestamp: "2026-05-11T18:00:00Z",
        inputSnapshot: "{}",
        outputSnapshot: "{}",
        ruleId: "rule-id",
      };

      logDecision(record);

      const logged = JSON.parse(consoleSpy.mock.calls[0][0]);
      expect(logged.id).toBe(id);
    });
  });

  // ========== Determinism & Consistency ==========

  it("produces identical output for identical input", () => {
    const record: AuditRecord = {
      id: "audit-det",
      timestamp: "2026-05-11T19:00:00Z",
      inputSnapshot: '{"test":"data"}',
      outputSnapshot: '{"result":"ok"}',
      ruleId: "rule-det",
    };

    const outputs: string[] = [];
    for (let i = 0; i < 5; i++) {
      consoleSpy.mockClear();
      logDecision(record);
      outputs.push(consoleSpy.mock.calls[0][0]);
    }

    // All outputs should be identical
    expect(outputs.every((o) => o === outputs[0])).toBe(true);
  });

  it("produces consistent JSON regardless of invocation", () => {
    const record: AuditRecord = {
      id: "audit-consistency",
      timestamp: "2026-05-11T20:00:00Z",
      inputSnapshot: '{"key":"value"}',
      outputSnapshot: '{"status":"active"}',
      ruleId: "rule-consistency",
    };

    const results: string[] = [];
    for (let i = 0; i < 3; i++) {
      consoleSpy.mockClear();
      logDecision(record);
      results.push(JSON.stringify(JSON.parse(consoleSpy.mock.calls[0][0])));
    }

    // All parsed and re-stringified results should be identical
    expect(results[0]).toBe(results[1]);
    expect(results[1]).toBe(results[2]);
  });

  // ========== Edge Cases ==========

  it("handles records with numeric-string IDs", () => {
    const record: AuditRecord = {
      id: "12345",
      timestamp: "2026-05-11T21:00:00Z",
      inputSnapshot: "{}",
      outputSnapshot: "{}",
      ruleId: "67890",
    };

    logDecision(record);

    const logged = JSON.parse(consoleSpy.mock.calls[0][0]);
    expect(logged.id).toBe("12345");
    expect(logged.ruleId).toBe("67890");
  });

  it("handles records with very long field values", () => {
    const longString = "x".repeat(10000);

    const record: AuditRecord = {
      id: "audit-long",
      timestamp: "2026-05-11T22:00:00Z",
      inputSnapshot: longString,
      outputSnapshot: longString,
      ruleId: "rule-long",
    };

    logDecision(record);

    const logged = JSON.parse(consoleSpy.mock.calls[0][0]);
    expect(logged.inputSnapshot.length).toBe(10000);
    expect(logged.outputSnapshot.length).toBe(10000);
  });

  it("handles records with Unicode characters", () => {
    const record: AuditRecord = {
      id: "audit-unicode",
      timestamp: "2026-05-11T23:00:00Z",
      inputSnapshot: '{"text":"Hello 世界 🌍"}',
      outputSnapshot: '{"emoji":"😀👍🎉"}',
      ruleId: "rule-unicode",
    };

    logDecision(record);

    const logged = JSON.parse(consoleSpy.mock.calls[0][0]);
    expect(logged.inputSnapshot).toContain("世界");
    expect(logged.outputSnapshot).toContain("😀");
  });

  // ========== Multi-Record Logging ==========

  it("handles multiple sequential logs independently", () => {
    const records: AuditRecord[] = [
      {
        id: "audit-seq-1",
        timestamp: "2026-05-12T00:00:00Z",
        inputSnapshot: '{"seq":1}',
        outputSnapshot: '{"result":1}',
        ruleId: "rule-1",
      },
      {
        id: "audit-seq-2",
        timestamp: "2026-05-12T01:00:00Z",
        inputSnapshot: '{"seq":2}',
        outputSnapshot: '{"result":2}',
        ruleId: "rule-2",
      },
      {
        id: "audit-seq-3",
        timestamp: "2026-05-12T02:00:00Z",
        inputSnapshot: '{"seq":3}',
        outputSnapshot: '{"result":3}',
        ruleId: "rule-3",
      },
    ];

    // Log all records without clearing between calls
    records.forEach((record) => {
      logDecision(record);
    });

    // Verify each call separately
    expect(consoleSpy).toHaveBeenCalledTimes(3);
    records.forEach((record, index) => {
      const logged = JSON.parse(consoleSpy.mock.calls[index][0]);
      expect(logged.id).toBe(`audit-seq-${index + 1}`);
      expect(JSON.parse(logged.inputSnapshot).seq).toBe(index + 1);
    });
  });

  // ========== Real-World Scenarios ==========

  it("logs decision creation record", () => {
    const record: AuditRecord = {
      id: "audit-decision-create",
      timestamp: "2026-05-12T03:00:00Z",
      inputSnapshot: JSON.stringify({
        decisionId: "dec-123",
        title: "Launch new product",
        confidence: 0.85,
        impactLevel: "high",
      }),
      outputSnapshot: JSON.stringify({
        status: "created",
        id: "dec-123",
        createdAt: "2026-05-12T03:00:00Z",
      }),
      ruleId: "decision.created",
    };

    logDecision(record);

    const logged = JSON.parse(consoleSpy.mock.calls[0][0]);
    expect(logged.ruleId).toBe("decision.created");
    expect(JSON.parse(logged.inputSnapshot).decisionId).toBe("dec-123");
  });

  it("logs action update record", () => {
    const record: AuditRecord = {
      id: "audit-action-update",
      timestamp: "2026-05-12T04:00:00Z",
      inputSnapshot: JSON.stringify({
        actionId: "act-456",
        status: "in_progress",
        updatedBy: "user-789",
      }),
      outputSnapshot: JSON.stringify({
        actionId: "act-456",
        status: "in_progress",
        updatedAt: "2026-05-12T04:00:00Z",
      }),
      ruleId: "action.updated",
    };

    logDecision(record);

    const logged = JSON.parse(consoleSpy.mock.calls[0][0]);
    expect(logged.ruleId).toBe("action.updated");
  });

  it("logs experiment completion record", () => {
    const record: AuditRecord = {
      id: "audit-exp-complete",
      timestamp: "2026-05-12T05:00:00Z",
      inputSnapshot: JSON.stringify({
        experimentId: "exp-999",
        successMetric: 0.92,
        sampleSize: 500,
      }),
      outputSnapshot: JSON.stringify({
        experimentId: "exp-999",
        status: "completed",
        ROI: 1.5,
      }),
      ruleId: "experiment.completed",
    };

    logDecision(record);

    const logged = JSON.parse(consoleSpy.mock.calls[0][0]);
    expect(logged.ruleId).toBe("experiment.completed");
  });

  // ========== Error Scenarios (No Errors Expected) ==========

  it("successfully logs without throwing errors", () => {
    const record: AuditRecord = {
      id: "audit-safe",
      timestamp: "2026-05-12T06:00:00Z",
      inputSnapshot: '{"data":"test"}',
      outputSnapshot: '{"result":"success"}',
      ruleId: "rule-safe",
    };

    expect(() => logDecision(record)).not.toThrow();
    expect(consoleSpy).toHaveBeenCalled();
  });

  it("handles rapid sequential logging", () => {
    const records: AuditRecord[] = Array(100)
      .fill(null)
      .map((_, i) => ({
        id: `audit-${i}`,
        timestamp: "2026-05-12T07:00:00Z",
        inputSnapshot: JSON.stringify({ index: i }),
        outputSnapshot: JSON.stringify({ processed: i }),
        ruleId: `rule-${i % 10}`,
      }));

    expect(() => {
      records.forEach((record) => logDecision(record));
    }).not.toThrow();

    expect(consoleSpy).toHaveBeenCalledTimes(100);
  });

  // ========== Output Format Verification ==========

  it("outputs newline-delimited JSON (JSONL compatible)", () => {
    const record: AuditRecord = {
      id: "audit-jsonl",
      timestamp: "2026-05-12T08:00:00Z",
      inputSnapshot: "{}",
      outputSnapshot: "{}",
      ruleId: "rule-jsonl",
    };

    logDecision(record);

    const logged = consoleSpy.mock.calls[0][0];
    expect(logged).not.toContain("\n");
    expect(() => JSON.parse(logged)).not.toThrow();
  });

  it("produces single-line JSON output", () => {
    const record: AuditRecord = {
      id: "audit-single-line",
      timestamp: "2026-05-12T09:00:00Z",
      inputSnapshot: JSON.stringify({ nested: { deep: { value: "test" } } }),
      outputSnapshot: "{}",
      ruleId: "rule-single",
    };

    logDecision(record);

    const logged = consoleSpy.mock.calls[0][0];
    const lines = logged.split("\n");
    expect(lines).toHaveLength(1);
  });
});
