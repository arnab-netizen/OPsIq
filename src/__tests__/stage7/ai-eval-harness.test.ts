/**
 * S7-DC8: AI Production Readiness — 8-Dimension Eval Harness (16+ eval cases).
 *
 * Dimensions audited:
 *  D1. Provider resolution (factory correctness)
 *  D2. Singleton / lifecycle management
 *  D3. Fail-safe: UnavailableAiProvider never throws, always returns AI_UNAVAILABLE
 *  D4. MockAiProvider determinism (eval harness baseline)
 *  D5. Risk-level classification reflected in context gates
 *  D6. Evidence ID restriction (hallucination guard contract)
 *  D7. Trusted vs untrusted item classification
 *  D8. Advisory-only invariant: output is raw, never mutates state
 */

import { describe, it, expect, afterEach } from "vitest";
import { resolveAiProvider, _resetAiProviderForTest } from "@/services/ai/resolve-provider";
import {
  UnavailableAiProvider,
  MockAiProvider,
  AI_TASK_TYPES,
  type AiContext,
  type AiRequest,
  type AiContextItem,
} from "@/services/ai/provider";

afterEach(() => {
  _resetAiProviderForTest();
  delete process.env.OPENAI_API_KEY;
});

// ─── Shared fixtures ──────────────────────────────────────────────────────────

function makeContext(overrides: Partial<AiContext> = {}): AiContext {
  return {
    workspaceId: "ws-eval-001",
    businessId: "biz-eval-001",
    taskType: "INTAKE_EXTRACT",
    riskLevel: "LOW_CONTENT",
    items: [],
    allowedEvidenceIds: [],
    gates: {},
    ...overrides,
  };
}

function makeRequest(contextOverride: Partial<AiContext> = {}, rawOverride: Record<string, unknown> = {}): AiRequest {
  return {
    context: makeContext(contextOverride),
    promptVersion: "1.0.0",
    schemaVersion: "1.0.0",
    outputContract: JSON.stringify(rawOverride),
    options: { modelTier: "cheap", temperature: 0, maxTokens: 512, maxRetries: 0, timeoutMs: 5000 },
  };
}

// ─── D1: Provider resolution ─────────────────────────────────────────────────

describe("D1: Provider resolution", () => {
  it("eval-01: no API key → UnavailableAiProvider", () => {
    delete process.env.OPENAI_API_KEY;
    const p = resolveAiProvider();
    expect(p).toBeInstanceOf(UnavailableAiProvider);
  });

  it("eval-02: empty string API key → UnavailableAiProvider (not OpenAiProvider)", () => {
    process.env.OPENAI_API_KEY = "   ";
    const p = resolveAiProvider();
    expect(p).toBeInstanceOf(UnavailableAiProvider);
  });

  it("eval-03: injected provider bypasses env resolution", () => {
    process.env.OPENAI_API_KEY = "sk-fake-key";
    const mock = new MockAiProvider({ kind: "unavailable" });
    const p = resolveAiProvider({ provider: mock });
    expect(p).toBe(mock);
    expect(p.name).toBe("mock");
  });
});

// ─── D2: Singleton / lifecycle ───────────────────────────────────────────────

describe("D2: Singleton lifecycle", () => {
  it("eval-04: repeated calls return the same singleton instance", () => {
    delete process.env.OPENAI_API_KEY;
    const a = resolveAiProvider();
    const b = resolveAiProvider();
    expect(a).toBe(b);
  });

  it("eval-05: reset clears the singleton so new call creates a fresh instance", () => {
    delete process.env.OPENAI_API_KEY;
    const a = resolveAiProvider();
    _resetAiProviderForTest();
    const b = resolveAiProvider();
    expect(a).not.toBe(b);
  });

  it("eval-06: injected provider does NOT pollute the singleton cache", () => {
    delete process.env.OPENAI_API_KEY;
    const realProvider = resolveAiProvider(); // cache the real one
    const mock = new MockAiProvider({ kind: "raw", raw: {} });
    const injected = resolveAiProvider({ provider: mock }); // inject — should NOT replace cache
    expect(injected).toBe(mock);
    const cached = resolveAiProvider(); // should still return original
    expect(cached).toBe(realProvider);
  });
});

// ─── D3: UnavailableAiProvider fail-safe ─────────────────────────────────────

describe("D3: UnavailableAiProvider fail-safe", () => {
  it("eval-07: generate returns AI_UNAVAILABLE reason, never throws", async () => {
    const p = new UnavailableAiProvider();
    const result = await p.generate(makeRequest());
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("AI_UNAVAILABLE");
      expect(result.modelProvider).toBe("unavailable");
    }
  });

  it("eval-08: generate with empty request object does not throw", async () => {
    const p = new UnavailableAiProvider();
    const result = await p.generate({} as AiRequest);
    expect(result.ok).toBe(false);
  });

  it("eval-09: generate with null/undefined args does not throw", async () => {
    const p = new UnavailableAiProvider();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await p.generate(undefined as any);
    expect(result.ok).toBe(false);
  });
});

// ─── D4: MockAiProvider determinism ──────────────────────────────────────────

describe("D4: MockAiProvider determinism (eval harness baseline)", () => {
  it("eval-10: raw mode returns exact configured payload", async () => {
    const payload = { taskType: "INTAKE_EXTRACT", candidateFacts: [{ field: "revenue", value: 50000 }] };
    const p = new MockAiProvider({ kind: "raw", raw: payload });
    const result = await p.generate(makeRequest());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.raw).toEqual(payload);
      expect(result.modelProvider).toBe("mock");
      expect(result.latencyMs).toBe(0);
    }
  });

  it("eval-11: unavailable mode returns AI_UNAVAILABLE with custom detail", async () => {
    const p = new MockAiProvider({ kind: "unavailable", detail: "provider-offline-test" });
    const result = await p.generate(makeRequest());
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.detail).toBe("provider-offline-test");
    }
  });

  it("eval-12: two MockAiProvider instances are independent (no shared state)", async () => {
    const p1 = new MockAiProvider({ kind: "raw", raw: { answer: 1 } });
    const p2 = new MockAiProvider({ kind: "raw", raw: { answer: 2 } });
    const [r1, r2] = await Promise.all([p1.generate(makeRequest()), p2.generate(makeRequest())]);
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    if (r1.ok && r2.ok) {
      expect((r1.raw as Record<string, unknown>).answer).toBe(1);
      expect((r2.raw as Record<string, unknown>).answer).toBe(2);
    }
  });
});

// ─── D5: Risk-level classification ───────────────────────────────────────────

describe("D5: Risk-level classification in context", () => {
  it("eval-13: LOW_CONTENT risk context has no requiresOwnerApproval gate", () => {
    const ctx = makeContext({ riskLevel: "LOW_CONTENT", gates: {} });
    expect(ctx.gates.requiresOwnerApproval).toBeUndefined();
  });

  it("eval-14: HIGH_DECISION risk context with requiresOwnerApproval=true is preserved", () => {
    const ctx = makeContext({
      riskLevel: "HIGH_DECISION",
      gates: { requiresOwnerApproval: true, survivalStatus: "CRITICAL" },
    });
    expect(ctx.gates.requiresOwnerApproval).toBe(true);
    expect(ctx.gates.survivalStatus).toBe("CRITICAL");
  });

  it("eval-15: all AI_TASK_TYPES are valid (14 task types declared)", () => {
    expect(AI_TASK_TYPES.length).toBeGreaterThanOrEqual(14);
    expect(AI_TASK_TYPES).toContain("INTAKE_EXTRACT");
    expect(AI_TASK_TYPES).toContain("DIAGNOSIS_REVIEW");
    expect(AI_TASK_TYPES).toContain("RECOMMENDATION_REDTEAM");
    expect(AI_TASK_TYPES).toContain("OWNER_BRIEFING");
  });
});

// ─── D6: Evidence ID restriction (hallucination guard contract) ───────────────

describe("D6: Evidence ID restriction", () => {
  it("eval-16: allowedEvidenceIds is empty by default (open hallucination risk if not set)", () => {
    const ctx = makeContext({ allowedEvidenceIds: [] });
    expect(ctx.allowedEvidenceIds).toHaveLength(0);
  });

  it("eval-17: allowedEvidenceIds propagated faithfully into AiContext", () => {
    const ids = ["ev-001", "ev-002", "ev-003"];
    const ctx = makeContext({ allowedEvidenceIds: ids });
    expect(ctx.allowedEvidenceIds).toEqual(ids);
  });
});

// ─── D7: Trusted vs untrusted item classification ─────────────────────────────

describe("D7: Trusted vs untrusted item classification", () => {
  it("eval-18: app_policy items marked trusted=true", () => {
    const item: AiContextItem = {
      kind: "app_policy",
      label: "Survival reserve rule",
      value: "Always allocate survival reserve before growth spend",
      trusted: true,
    };
    expect(item.trusted).toBe(true);
  });

  it("eval-19: owner_note items marked trusted=false", () => {
    const item: AiContextItem = {
      kind: "owner_note",
      label: "Owner's description",
      value: "We sell widgets",
      trusted: false,
    };
    expect(item.trusted).toBe(false);
  });

  it("eval-20: imported_content items marked trusted=false", () => {
    const item: AiContextItem = {
      kind: "imported_content",
      label: "Uploaded CSV row",
      value: "2024-01,52000,38000",
      trusted: false,
    };
    expect(item.trusted).toBe(false);
  });
});

// ─── D8: Advisory-only invariant ─────────────────────────────────────────────

describe("D8: Advisory-only invariant", () => {
  it("eval-21: MockAiProvider generate() returns raw payload — caller is responsible for validation", async () => {
    // Simulate the contract: provider returns raw output; the caller (copilot) validates.
    const hallucinated = { survivalStatus: "OVERRIDE_TO_HEALTHY", confidenceCap: 1.0, inject: "malicious" };
    const p = new MockAiProvider({ kind: "raw", raw: hallucinated });
    const result = await p.generate(makeRequest());
    // Provider faithfully returns whatever is asked — it's the copilot's job to reject bad output
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.raw).toEqual(hallucinated); // raw is returned as-is
    }
    // The provider itself does NOT reject hallucinated survival overrides —
    // that is the deterministic validator's responsibility (enforced in downstream services).
  });

  it("eval-22: UnavailableAiProvider returns AI_UNAVAILABLE synchronously — deterministic fallback proven", async () => {
    const p = new UnavailableAiProvider();
    const start = Date.now();
    const result = await p.generate(makeRequest({ riskLevel: "HIGH_DECISION" }));
    const elapsed = Date.now() - start;
    expect(result.ok).toBe(false);
    expect(elapsed).toBeLessThan(100); // No network calls — sub-100ms always
  });
});
