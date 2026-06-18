import { describe, it, expect } from "vitest";
import {
  createAiTrace,
  addTraceEvent,
  toPublicTraceView,
  toPublicTraceEventView,
  getTraceForWorkspace,
  summarizeFullLoopTrace,
  validateCreateAiTraceInput,
  validateAddTraceEventInput,
  type CreateAiTraceInput,
  type AddTraceEventInput,
  type OwnerAiTrace,
} from "../../../domain/owner-mode/ai-observability-trace";

const WS = "ws-trace-001";
const BIZ = "biz-trace-001";
const OTHER_WS = "ws-other-999";

function baseTraceInput(overrides?: Partial<CreateAiTraceInput>): CreateAiTraceInput {
  return {
    traceId: "trace-001",
    workspaceId: WS,
    businessId: BIZ,
    userId: "user-001",
    module: "recommendation",
    createdAt: "2026-06-18T10:00:00Z",
    ...overrides,
  };
}

function baseEventInput(overrides?: Partial<AddTraceEventInput>): AddTraceEventInput {
  return {
    eventId: "evt-001",
    traceId: "trace-001",
    workspaceId: WS,
    eventType: "input_received",
    timestamp: "2026-06-18T10:00:01Z",
    createdAt: "2026-06-18T10:00:01Z",
    ...overrides,
  };
}

function buildFullLoopTrace(): OwnerAiTrace {
  const allEventTypes = [
    "input_received",
    "input_quality_assessed",
    "diagnosis_generated",
    "recommendation_generated",
    "recommendation_verified",
    "owner_decision_recorded",
    "action_created",
    "evidence_submitted",
    "evidence_verified",
    "outcome_reported",
    "harm_recorded",
    "adjudication_completed",
    "causal_attribution_completed",
    "reassessment_created",
    "learning_eligibility_decided",
    "dashboard_updated",
  ] as const;

  let trace = createAiTrace(baseTraceInput());
  allEventTypes.forEach((eventType, i) => {
    trace = addTraceEvent(trace, baseEventInput({
      eventId: `evt-${String(i).padStart(3, "0")}`,
      eventType,
      timestamp: `2026-06-18T10:${String(i).padStart(2, "0")}:00Z`,
    }));
  });
  return trace;
}

// ─── createAiTrace ────────────────────────────────────────────────────────────

describe("createAiTrace", () => {
  it("creates a valid trace with empty events", () => {
    const trace = createAiTrace(baseTraceInput());
    expect(trace.traceId).toBe("trace-001");
    expect(trace.workspaceId).toBe(WS);
    expect(trace.businessId).toBe(BIZ);
    expect(trace.userId).toBe("user-001");
    expect(trace.module).toBe("recommendation");
    expect(trace.events).toHaveLength(0);
  });

  it("throws when workspaceId is empty", () => {
    expect(() => createAiTrace(baseTraceInput({ workspaceId: "" }))).toThrow();
  });

  it("throws when traceId is missing", () => {
    expect(() => createAiTrace(baseTraceInput({ traceId: "" }))).toThrow();
  });

  it("throws when businessId is missing", () => {
    expect(() => createAiTrace(baseTraceInput({ businessId: "" }))).toThrow();
  });

  it("throws when userId is missing", () => {
    expect(() => createAiTrace(baseTraceInput({ userId: "" }))).toThrow();
  });

  it("throws when module is missing", () => {
    expect(() => createAiTrace(baseTraceInput({ module: "" }))).toThrow();
  });

  it("throws when createdAt is missing", () => {
    expect(() => createAiTrace(baseTraceInput({ createdAt: "" }))).toThrow();
  });
});

// ─── validateCreateAiTraceInput ───────────────────────────────────────────────

describe("validateCreateAiTraceInput", () => {
  it("returns no errors for valid input", () => {
    expect(validateCreateAiTraceInput(baseTraceInput())).toHaveLength(0);
  });

  it("returns error for missing traceId", () => {
    const errors = validateCreateAiTraceInput(baseTraceInput({ traceId: "" }));
    expect(errors).toContain("traceId is required");
  });

  it("returns error for missing businessId", () => {
    const errors = validateCreateAiTraceInput(baseTraceInput({ businessId: "" }));
    expect(errors).toContain("businessId is required");
  });

  it("returns error for missing userId", () => {
    const errors = validateCreateAiTraceInput(baseTraceInput({ userId: "" }));
    expect(errors).toContain("userId is required");
  });

  it("returns error for missing module", () => {
    const errors = validateCreateAiTraceInput(baseTraceInput({ module: "  " }));
    expect(errors).toContain("module is required");
  });
});

// ─── addTraceEvent ────────────────────────────────────────────────────────────

describe("addTraceEvent", () => {
  it("adds a single event to trace", () => {
    const trace = createAiTrace(baseTraceInput());
    const updated = addTraceEvent(trace, baseEventInput());
    expect(updated.events).toHaveLength(1);
    expect(updated.events[0].eventType).toBe("input_received");
  });

  it("appends multiple events in order", () => {
    let trace = createAiTrace(baseTraceInput());
    trace = addTraceEvent(trace, baseEventInput({ eventId: "e1", eventType: "input_received" }));
    trace = addTraceEvent(trace, baseEventInput({ eventId: "e2", eventType: "diagnosis_generated" }));
    trace = addTraceEvent(trace, baseEventInput({ eventId: "e3", eventType: "recommendation_generated" }));
    expect(trace.events).toHaveLength(3);
    expect(trace.events[0].eventType).toBe("input_received");
    expect(trace.events[1].eventType).toBe("diagnosis_generated");
    expect(trace.events[2].eventType).toBe("recommendation_generated");
  });

  it("stores riskFlags on the event", () => {
    const trace = createAiTrace(baseTraceInput());
    const updated = addTraceEvent(trace, baseEventInput({
      riskFlags: [{ code: "LOW_CONFIDENCE", severity: "medium", description: "Confidence below 60%" }],
    }));
    expect(updated.events[0].riskFlags).toHaveLength(1);
    expect(updated.events[0].riskFlags[0].code).toBe("LOW_CONFIDENCE");
  });

  it("stores blockedGates on the event", () => {
    const trace = createAiTrace(baseTraceInput());
    const updated = addTraceEvent(trace, baseEventInput({
      blockedGates: [{ gateName: "evidence_required", reason: "No evidence yet", blockedAt: "2026-06-18T10:00:00Z" }],
    }));
    expect(updated.events[0].blockedGates).toHaveLength(1);
    expect(updated.events[0].blockedGates[0].gateName).toBe("evidence_required");
  });

  it("stores model metadata on event", () => {
    const trace = createAiTrace(baseTraceInput());
    const updated = addTraceEvent(trace, baseEventInput({
      eventType: "diagnosis_generated",
      modelProvider: "anthropic",
      modelName: "claude-sonnet",
      modelVersion: "4.6",
      promptTemplateVersion: "diag-v2",
      rulesetVersion: "r1.3",
      retrievalContextVersion: "ctx-001",
    }));
    const evt = updated.events[0];
    expect(evt.modelProvider).toBe("anthropic");
    expect(evt.modelName).toBe("claude-sonnet");
    expect(evt.modelVersion).toBe("4.6");
    expect(evt.promptTemplateVersion).toBe("diag-v2");
    expect(evt.rulesetVersion).toBe("r1.3");
    expect(evt.retrievalContextVersion).toBe("ctx-001");
  });

  it("stores latencyMs on event", () => {
    const trace = createAiTrace(baseTraceInput());
    const updated = addTraceEvent(trace, baseEventInput({ latencyMs: 342 }));
    expect(updated.events[0].latencyMs).toBe(342);
  });

  it("stores errorCode on event", () => {
    const trace = createAiTrace(baseTraceInput());
    const updated = addTraceEvent(trace, baseEventInput({ errorCode: "TIMEOUT" }));
    expect(updated.events[0].errorCode).toBe("TIMEOUT");
  });

  it("stores inputsSummary without raw values", () => {
    const trace = createAiTrace(baseTraceInput());
    const updated = addTraceEvent(trace, baseEventInput({
      inputsSummary: {
        fieldNames: ["revenue", "gross_margin"],
        fieldCount: 7,
        estimatedFieldCount: 1,
        staleFieldCount: 0,
      },
    }));
    const summary = updated.events[0].inputsSummary!;
    expect(summary.fieldNames).toContain("revenue");
    expect(summary.fieldCount).toBe(7);
    expect(summary.estimatedFieldCount).toBe(1);
  });

  it("throws when traceId does not match", () => {
    const trace = createAiTrace(baseTraceInput());
    expect(() =>
      addTraceEvent(trace, baseEventInput({ traceId: "different-trace" }))
    ).toThrow("Trace ID mismatch");
  });

  it("throws when workspaceId does not match", () => {
    const trace = createAiTrace(baseTraceInput());
    expect(() =>
      addTraceEvent(trace, baseEventInput({ workspaceId: OTHER_WS }))
    ).toThrow("Workspace mismatch");
  });

  it("throws when eventId is empty", () => {
    const trace = createAiTrace(baseTraceInput());
    expect(() =>
      addTraceEvent(trace, baseEventInput({ eventId: "" }))
    ).toThrow();
  });

  it("throws when confidenceScore is below 0", () => {
    const trace = createAiTrace(baseTraceInput());
    expect(() =>
      addTraceEvent(trace, baseEventInput({ confidenceScore: -1 }))
    ).toThrow();
  });

  it("throws when confidenceScore is above 100", () => {
    const trace = createAiTrace(baseTraceInput());
    expect(() =>
      addTraceEvent(trace, baseEventInput({ confidenceScore: 101 }))
    ).toThrow();
  });

  it("accepts confidenceScore at boundaries 0 and 100", () => {
    let trace = createAiTrace(baseTraceInput());
    trace = addTraceEvent(trace, baseEventInput({ eventId: "e1", confidenceScore: 0 }));
    trace = addTraceEvent(trace, baseEventInput({ eventId: "e2", confidenceScore: 100 }));
    expect(trace.events[0].confidenceScore).toBe(0);
    expect(trace.events[1].confidenceScore).toBe(100);
  });

  it("throws when latencyMs is negative", () => {
    const trace = createAiTrace(baseTraceInput());
    expect(() =>
      addTraceEvent(trace, baseEventInput({ latencyMs: -5 }))
    ).toThrow();
  });

  it("does not mutate the original trace object", () => {
    const trace = createAiTrace(baseTraceInput());
    const updated = addTraceEvent(trace, baseEventInput());
    expect(trace.events).toHaveLength(0);
    expect(updated.events).toHaveLength(1);
  });
});

// ─── validateAddTraceEventInput ───────────────────────────────────────────────

describe("validateAddTraceEventInput", () => {
  it("returns no errors for valid input", () => {
    expect(validateAddTraceEventInput(baseEventInput())).toHaveLength(0);
  });

  it("returns error for missing eventId", () => {
    expect(validateAddTraceEventInput(baseEventInput({ eventId: "" }))).toContain("eventId is required");
  });

  it("returns error for missing traceId", () => {
    expect(validateAddTraceEventInput(baseEventInput({ traceId: "" }))).toContain("traceId is required");
  });

  it("returns error for missing timestamp", () => {
    expect(validateAddTraceEventInput(baseEventInput({ timestamp: "" }))).toContain("timestamp is required");
  });

  it("returns error when confidenceScore out of range", () => {
    expect(validateAddTraceEventInput(baseEventInput({ confidenceScore: 150 }))).toContain(
      "confidenceScore must be 0–100"
    );
  });

  it("returns error for negative latencyMs", () => {
    expect(validateAddTraceEventInput(baseEventInput({ latencyMs: -1 }))).toContain(
      "latencyMs must be non-negative"
    );
  });
});

// ─── toPublicTraceEventView ───────────────────────────────────────────────────

describe("toPublicTraceEventView", () => {
  it("returns public-safe fields only", () => {
    const trace = createAiTrace(baseTraceInput());
    const updated = addTraceEvent(trace, baseEventInput({
      eventType: "diagnosis_generated",
      modelProvider: "anthropic",
      modelName: "claude-sonnet",
      modelVersion: "4.6",
      promptTemplateVersion: "diag-v2",
      rulesetVersion: "r1.3",
      retrievalContextVersion: "ctx-001",
      latencyMs: 200,
    }));
    const view = toPublicTraceEventView(updated.events[0]);
    expect(view.eventType).toBe("diagnosis_generated");
    expect(view.latencyMs).toBe(200);
    // Internal AI fields must NOT appear on the public view
    expect((view as Record<string, unknown>).modelProvider).toBeUndefined();
    expect((view as Record<string, unknown>).modelName).toBeUndefined();
    expect((view as Record<string, unknown>).modelVersion).toBeUndefined();
    expect((view as Record<string, unknown>).promptTemplateVersion).toBeUndefined();
    expect((view as Record<string, unknown>).rulesetVersion).toBeUndefined();
    expect((view as Record<string, unknown>).retrievalContextVersion).toBeUndefined();
  });

  it("includes riskFlags in public view", () => {
    const trace = createAiTrace(baseTraceInput());
    const updated = addTraceEvent(trace, baseEventInput({
      riskFlags: [{ code: "STALE_DATA", severity: "low", description: "Field is 45 days old" }],
    }));
    const view = toPublicTraceEventView(updated.events[0]);
    expect(view.riskFlags).toHaveLength(1);
    expect(view.riskFlags[0].code).toBe("STALE_DATA");
  });

  it("includes blockedGates in public view", () => {
    const trace = createAiTrace(baseTraceInput());
    const updated = addTraceEvent(trace, baseEventInput({
      blockedGates: [{ gateName: "owner_verification", reason: "Pending", blockedAt: "2026-06-18T10:00:00Z" }],
    }));
    const view = toPublicTraceEventView(updated.events[0]);
    expect(view.blockedGates).toHaveLength(1);
  });

  it("does not include inputsSummary in public event view", () => {
    const trace = createAiTrace(baseTraceInput());
    const updated = addTraceEvent(trace, baseEventInput({
      inputsSummary: { fieldNames: ["revenue"], fieldCount: 1, estimatedFieldCount: 0, staleFieldCount: 0 },
    }));
    const view = toPublicTraceEventView(updated.events[0]);
    expect((view as Record<string, unknown>).inputsSummary).toBeUndefined();
  });

  it("does not include decisionMade in public event view", () => {
    const trace = createAiTrace(baseTraceInput());
    const updated = addTraceEvent(trace, baseEventInput({ decisionMade: "recommend_marketing_increase" }));
    const view = toPublicTraceEventView(updated.events[0]);
    expect((view as Record<string, unknown>).decisionMade).toBeUndefined();
  });
});

// ─── toPublicTraceView ────────────────────────────────────────────────────────

describe("toPublicTraceView", () => {
  it("returns correct eventCount", () => {
    const trace = buildFullLoopTrace();
    const view = toPublicTraceView(trace);
    expect(view.eventCount).toBe(16);
  });

  it("returns correct blockedGateCount", () => {
    let trace = createAiTrace(baseTraceInput());
    trace = addTraceEvent(trace, baseEventInput({
      eventId: "e1",
      blockedGates: [
        { gateName: "gate-a", reason: "r", blockedAt: "t" },
        { gateName: "gate-b", reason: "r", blockedAt: "t" },
      ],
    }));
    trace = addTraceEvent(trace, baseEventInput({
      eventId: "e2",
      eventType: "diagnosis_generated",
      blockedGates: [{ gateName: "gate-c", reason: "r", blockedAt: "t" }],
    }));
    const view = toPublicTraceView(trace);
    expect(view.blockedGateCount).toBe(3);
  });

  it("includes workspaceId and businessId", () => {
    const trace = createAiTrace(baseTraceInput());
    const view = toPublicTraceView(trace);
    expect(view.workspaceId).toBe(WS);
    expect(view.businessId).toBe(BIZ);
  });

  it("does not include userId in public view", () => {
    const trace = createAiTrace(baseTraceInput());
    const view = toPublicTraceView(trace);
    expect((view as Record<string, unknown>).userId).toBeUndefined();
  });
});

// ─── getTraceForWorkspace ─────────────────────────────────────────────────────

describe("getTraceForWorkspace", () => {
  it("returns public trace view for matching workspace", () => {
    const trace = createAiTrace(baseTraceInput());
    const view = getTraceForWorkspace(trace, WS);
    expect(view.workspaceId).toBe(WS);
  });

  it("throws when requesting workspace does not match trace workspace", () => {
    const trace = createAiTrace(baseTraceInput());
    expect(() => getTraceForWorkspace(trace, OTHER_WS)).toThrow("Access denied");
  });

  it("throws when requestingWorkspaceId is empty", () => {
    const trace = createAiTrace(baseTraceInput());
    expect(() => getTraceForWorkspace(trace, "")).toThrow();
  });
});

// ─── summarizeFullLoopTrace ───────────────────────────────────────────────────

describe("summarizeFullLoopTrace", () => {
  it("shows complete=true when all 16 events are present", () => {
    const trace = buildFullLoopTrace();
    const summary = summarizeFullLoopTrace(trace);
    expect(summary.complete).toBe(true);
    expect(summary.eventsMissing).toHaveLength(0);
    expect(summary.eventsPresent).toHaveLength(16);
  });

  it("identifies missing events", () => {
    let trace = createAiTrace(baseTraceInput());
    trace = addTraceEvent(trace, baseEventInput({ eventId: "e1", eventType: "input_received" }));
    trace = addTraceEvent(trace, baseEventInput({ eventId: "e2", eventType: "diagnosis_generated" }));
    const summary = summarizeFullLoopTrace(trace);
    expect(summary.complete).toBe(false);
    expect(summary.eventsPresent).toContain("input_received");
    expect(summary.eventsPresent).toContain("diagnosis_generated");
    expect(summary.eventsMissing).toContain("recommendation_generated");
    expect(summary.eventsMissing).toContain("dashboard_updated");
  });

  it("counts total events correctly", () => {
    const trace = buildFullLoopTrace();
    const summary = summarizeFullLoopTrace(trace);
    expect(summary.totalEvents).toBe(16);
  });

  it("reports blockedGateCount across all events", () => {
    let trace = createAiTrace(baseTraceInput());
    trace = addTraceEvent(trace, baseEventInput({
      eventId: "e1",
      blockedGates: [
        { gateName: "g1", reason: "r1", blockedAt: "t" },
        { gateName: "g2", reason: "r2", blockedAt: "t" },
      ],
    }));
    const summary = summarizeFullLoopTrace(trace);
    expect(summary.blockedGateCount).toBe(2);
  });

  it("detects hasError when any event has an errorCode", () => {
    let trace = createAiTrace(baseTraceInput());
    trace = addTraceEvent(trace, baseEventInput({ errorCode: "UPSTREAM_TIMEOUT" }));
    const summary = summarizeFullLoopTrace(trace);
    expect(summary.hasError).toBe(true);
  });

  it("hasError is false when no events have errorCode", () => {
    const trace = buildFullLoopTrace();
    const summary = summarizeFullLoopTrace(trace);
    expect(summary.hasError).toBe(false);
  });

  it("correctly reports eventsPresent in order", () => {
    const trace = buildFullLoopTrace();
    const summary = summarizeFullLoopTrace(trace);
    expect(summary.eventsPresent[0]).toBe("input_received");
    expect(summary.eventsPresent[15]).toBe("dashboard_updated");
  });
});

// ─── All 16 event types ───────────────────────────────────────────────────────

describe("all 16 trace event types", () => {
  const allTypes = [
    "input_received",
    "input_quality_assessed",
    "diagnosis_generated",
    "recommendation_generated",
    "recommendation_verified",
    "owner_decision_recorded",
    "action_created",
    "evidence_submitted",
    "evidence_verified",
    "outcome_reported",
    "harm_recorded",
    "adjudication_completed",
    "causal_attribution_completed",
    "reassessment_created",
    "learning_eligibility_decided",
    "dashboard_updated",
  ] as const;

  allTypes.forEach((eventType, i) => {
    it(`accepts event type: ${eventType}`, () => {
      const trace = createAiTrace(baseTraceInput());
      const updated = addTraceEvent(trace, baseEventInput({
        eventId: `evt-${i}`,
        eventType,
      }));
      expect(updated.events[0].eventType).toBe(eventType);
    });
  });
});

// ─── Model/ruleset version recorded when applicable ──────────────────────────

describe("model and ruleset versioning", () => {
  it("records model version when provided", () => {
    const trace = createAiTrace(baseTraceInput());
    const updated = addTraceEvent(trace, baseEventInput({
      eventType: "recommendation_generated",
      modelProvider: "anthropic",
      modelName: "claude-opus",
      modelVersion: "4.8",
    }));
    expect(updated.events[0].modelProvider).toBe("anthropic");
    expect(updated.events[0].modelName).toBe("claude-opus");
    expect(updated.events[0].modelVersion).toBe("4.8");
  });

  it("records promptTemplateVersion when provided", () => {
    const trace = createAiTrace(baseTraceInput());
    const updated = addTraceEvent(trace, baseEventInput({
      promptTemplateVersion: "rec-prompt-v3.1",
    }));
    expect(updated.events[0].promptTemplateVersion).toBe("rec-prompt-v3.1");
  });

  it("records rulesetVersion when provided", () => {
    const trace = createAiTrace(baseTraceInput());
    const updated = addTraceEvent(trace, baseEventInput({
      rulesetVersion: "ruleset-2026-06",
    }));
    expect(updated.events[0].rulesetVersion).toBe("ruleset-2026-06");
  });

  it("records retrievalContextVersion when provided", () => {
    const trace = createAiTrace(baseTraceInput());
    const updated = addTraceEvent(trace, baseEventInput({
      retrievalContextVersion: "ctx-snapshot-001",
    }));
    expect(updated.events[0].retrievalContextVersion).toBe("ctx-snapshot-001");
  });

  it("model fields are undefined when not provided", () => {
    const trace = createAiTrace(baseTraceInput());
    const updated = addTraceEvent(trace, baseEventInput());
    const evt = updated.events[0];
    expect(evt.modelProvider).toBeUndefined();
    expect(evt.modelName).toBeUndefined();
    expect(evt.modelVersion).toBeUndefined();
    expect(evt.promptTemplateVersion).toBeUndefined();
    expect(evt.rulesetVersion).toBeUndefined();
    expect(evt.retrievalContextVersion).toBeUndefined();
  });
});

// ─── Blocked gate in trace ────────────────────────────────────────────────────

describe("blocked gate recording", () => {
  it("blocked gate appears in trace event and summary", () => {
    let trace = createAiTrace(baseTraceInput());
    trace = addTraceEvent(trace, baseEventInput({
      eventType: "learning_eligibility_decided",
      blockedGates: [
        {
          gateName: "evidence_verification_required",
          reason: "Evidence not yet verified by owner",
          blockedAt: "2026-06-18T10:05:00Z",
        },
      ],
    }));
    const summary = summarizeFullLoopTrace(trace);
    expect(summary.blockedGateCount).toBe(1);
    const view = toPublicTraceView(trace);
    expect(view.blockedGateCount).toBe(1);
    expect(view.events[0].blockedGates[0].gateName).toBe("evidence_verification_required");
  });

  it("multiple blocked gates across events are counted correctly", () => {
    let trace = createAiTrace(baseTraceInput());
    trace = addTraceEvent(trace, baseEventInput({
      eventId: "e1",
      eventType: "evidence_verified",
      blockedGates: [
        { gateName: "g1", reason: "r", blockedAt: "t" },
        { gateName: "g2", reason: "r", blockedAt: "t" },
        { gateName: "g3", reason: "r", blockedAt: "t" },
      ],
    }));
    trace = addTraceEvent(trace, baseEventInput({
      eventId: "e2",
      eventType: "outcome_reported",
      blockedGates: [{ gateName: "g4", reason: "r", blockedAt: "t" }],
    }));
    const summary = summarizeFullLoopTrace(trace);
    expect(summary.blockedGateCount).toBe(4);
  });
});

// ─── Workspace cross-tenant isolation ────────────────────────────────────────

describe("workspace isolation", () => {
  it("trace is workspace-scoped at creation", () => {
    const trace = createAiTrace(baseTraceInput());
    expect(trace.workspaceId).toBe(WS);
  });

  it("event must belong to same workspace as trace", () => {
    const trace = createAiTrace(baseTraceInput());
    expect(() =>
      addTraceEvent(trace, baseEventInput({ workspaceId: "ws-another" }))
    ).toThrow("Workspace mismatch");
  });

  it("getTraceForWorkspace blocks cross-workspace access", () => {
    const trace = createAiTrace(baseTraceInput());
    expect(() => getTraceForWorkspace(trace, "ws-attacker")).toThrow("Access denied");
  });

  it("public trace view still contains workspaceId for routing", () => {
    const trace = createAiTrace(baseTraceInput());
    const view = getTraceForWorkspace(trace, WS);
    expect(view.workspaceId).toBe(WS);
  });
});

// ─── Public view does not expose learning data ────────────────────────────────

describe("public view does not expose internal AI/learning data", () => {
  it("userId is not in public trace view", () => {
    const trace = createAiTrace(baseTraceInput());
    const view = toPublicTraceView(trace);
    expect((view as Record<string, unknown>).userId).toBeUndefined();
  });

  it("modelProvider not in public event view", () => {
    const trace = createAiTrace(baseTraceInput());
    const updated = addTraceEvent(trace, baseEventInput({ modelProvider: "anthropic" }));
    const view = toPublicTraceView(updated);
    expect((view.events[0] as Record<string, unknown>).modelProvider).toBeUndefined();
  });

  it("promptTemplateVersion not in public event view", () => {
    const trace = createAiTrace(baseTraceInput());
    const updated = addTraceEvent(trace, baseEventInput({ promptTemplateVersion: "secret-v5" }));
    const view = toPublicTraceView(updated);
    expect((view.events[0] as Record<string, unknown>).promptTemplateVersion).toBeUndefined();
  });

  it("rulesetVersion not in public event view", () => {
    const trace = createAiTrace(baseTraceInput());
    const updated = addTraceEvent(trace, baseEventInput({ rulesetVersion: "ruleset-internal" }));
    const view = toPublicTraceView(updated);
    expect((view.events[0] as Record<string, unknown>).rulesetVersion).toBeUndefined();
  });

  it("retrievalContextVersion not in public event view", () => {
    const trace = createAiTrace(baseTraceInput());
    const updated = addTraceEvent(trace, baseEventInput({ retrievalContextVersion: "ctx-internal" }));
    const view = toPublicTraceView(updated);
    expect((view.events[0] as Record<string, unknown>).retrievalContextVersion).toBeUndefined();
  });

  it("decisionMade not in public event view", () => {
    const trace = createAiTrace(baseTraceInput());
    const updated = addTraceEvent(trace, baseEventInput({ decisionMade: "internal_strategy_x" }));
    const view = toPublicTraceView(updated);
    expect((view.events[0] as Record<string, unknown>).decisionMade).toBeUndefined();
  });

  it("inputsSummary not in public event view", () => {
    const trace = createAiTrace(baseTraceInput());
    const updated = addTraceEvent(trace, baseEventInput({
      inputsSummary: { fieldNames: ["revenue"], fieldCount: 1, estimatedFieldCount: 0, staleFieldCount: 0 },
    }));
    const view = toPublicTraceView(updated);
    expect((view.events[0] as Record<string, unknown>).inputsSummary).toBeUndefined();
  });
});
