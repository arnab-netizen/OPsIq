/**
 * S7-DC8: AI provider factory tests.
 *
 * Proves:
 * 1. resolveAiProvider() returns UnavailableAiProvider when OPENAI_API_KEY absent
 * 2. Injected provider (tests) bypasses singleton
 * 3. UnavailableAiProvider returns AI_UNAVAILABLE (never throws)
 * 4. MockAiProvider returns controlled output for eval harness
 */

import { describe, it, expect, afterEach } from "vitest";
import { resolveAiProvider, _resetAiProviderForTest } from "@/services/ai/resolve-provider";
import { UnavailableAiProvider, MockAiProvider } from "@/services/ai/provider";
import type { AiContext, AiRequest } from "@/services/ai/provider";

afterEach(() => {
  _resetAiProviderForTest();
  delete process.env.OPENAI_API_KEY;
});

const minimalContext: AiContext = {
  workspaceId: "ws-test",
  taskType: "INTAKE_EXTRACT",
  riskLevel: "LOW_CONTENT",
  items: [],
  allowedEvidenceIds: [],
  gates: {},
};

const minimalRequest: AiRequest = {
  context: minimalContext,
  outputContract: "{}",
  options: {
    modelTier: "cheap",
    temperature: 0,
    maxTokens: 100,
    maxRetries: 0,
    timeoutMs: 5000,
  },
};

describe("S7-DC8: resolveAiProvider factory", () => {
  it("returns UnavailableAiProvider when no OPENAI_API_KEY", () => {
    delete process.env.OPENAI_API_KEY;
    const provider = resolveAiProvider();
    expect(provider).toBeInstanceOf(UnavailableAiProvider);
  });

  it("injected provider is returned as-is (bypasses cache)", () => {
    const mock = new MockAiProvider({ kind: "unavailable" });
    const provider = resolveAiProvider({ provider: mock });
    expect(provider).toBe(mock);
  });

  it("returns same singleton on repeated calls", () => {
    delete process.env.OPENAI_API_KEY;
    const a = resolveAiProvider();
    const b = resolveAiProvider();
    expect(a).toBe(b);
  });

  it("_resetAiProviderForTest clears the singleton", () => {
    delete process.env.OPENAI_API_KEY;
    const a = resolveAiProvider();
    _resetAiProviderForTest();
    const b = resolveAiProvider();
    expect(a).not.toBe(b);
  });
});

describe("S7-DC8: UnavailableAiProvider behavior", () => {
  it("returns AI_UNAVAILABLE without throwing", async () => {
    const provider = new UnavailableAiProvider();
    const result = await provider.generate(minimalRequest);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("AI_UNAVAILABLE");
  });

  it("never throws even with malformed request", async () => {
    const provider = new UnavailableAiProvider();
    const result = await provider.generate({} as AiRequest);
    expect(result.ok).toBe(false);
  });
});

describe("S7-DC8: MockAiProvider behavior", () => {
  it("returns controlled raw output in raw mode", async () => {
    const expectedOutput = { taskType: "INTAKE_EXTRACT", candidateFacts: [] };
    const provider = new MockAiProvider({ kind: "raw", raw: expectedOutput });
    const result = await provider.generate(minimalRequest);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.raw).toEqual(expectedOutput);
    }
  });

  it("returns AI_UNAVAILABLE in unavailable mode", async () => {
    const provider = new MockAiProvider({ kind: "unavailable" });
    const result = await provider.generate(minimalRequest);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("AI_UNAVAILABLE");
  });
});
