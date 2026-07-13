/**
 * Anthropic provider adapter — unit tests (no network, no key).
 *
 * Mirrors the OpenAI provider test suite: injectable fetchImpl + clock,
 * fail-closed (AI_UNAVAILABLE without key / on error), retry logic, JSON-parse
 * failure, token accounting, model-tier routing.
 */
import { describe, it, expect } from "vitest";
import { AnthropicProvider } from "@/services/ai/anthropic-provider";
import { buildAiContext } from "@/services/ai/context-builder";
import type { AiRequest } from "@/services/ai/provider";

const ctx = (items: Parameters<typeof buildAiContext>[0]["items"] = []) =>
  buildAiContext({
    workspaceId: "ws-anthropic-test",
    taskType: "MISSING_QUESTION_GENERATION",
    riskLevel: "LOW_CONTENT",
    items,
  });

function req(overrides: Partial<AiRequest["options"]> = {}): AiRequest {
  return {
    context: ctx(),
    promptVersion: "v1",
    schemaVersion: "v1",
    options: {
      modelTier: "cheap",
      temperature: 0,
      maxTokens: 512,
      timeoutMs: 5000,
      maxRetries: 1,
      ...overrides,
    },
  };
}

function fakeResponse(status: number, jsonBody: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => jsonBody,
  } as unknown as Response;
}

function anthropicResponse(text: string, inputTokens = 10, outputTokens = 20): unknown {
  return {
    content: [{ type: "text", text }],
    usage: { input_tokens: inputTokens, output_tokens: outputTokens },
    model: "claude-haiku-4-5-20251001",
  };
}

const VALID_JSON = JSON.stringify({ taskType: "MISSING_QUESTION_GENERATION", questions: [], citedEvidenceIds: [] });

// ── Fail-closed: no key ────────────────────────────────────────────────────

describe("AnthropicProvider — fail-closed (no key)", () => {
  it("returns AI_UNAVAILABLE when no API key is configured", async () => {
    const saved = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    const p = new AnthropicProvider({ apiKey: undefined });
    const r = await p.generate(req());
    if (saved !== undefined) process.env.ANTHROPIC_API_KEY = saved;
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("AI_UNAVAILABLE");
      expect(r.modelProvider).toBe("anthropic");
      expect(r.detail).toMatch(/ANTHROPIC_API_KEY/);
    }
  });

  it("prefers injected apiKey over env var", async () => {
    let called = false;
    const fetchImpl = async () => {
      called = true;
      return fakeResponse(200, anthropicResponse(VALID_JSON));
    };
    const p = new AnthropicProvider({ apiKey: "test-key", fetchImpl });
    await p.generate(req());
    expect(called).toBe(true);
  });
});

// ── provider.name ─────────────────────────────────────────────────────────

describe("AnthropicProvider — name", () => {
  it("has name 'anthropic'", () => {
    const p = new AnthropicProvider({ apiKey: "k" });
    expect(p.name).toBe("anthropic");
  });
});

// ── HTTP transport ────────────────────────────────────────────────────────

describe("AnthropicProvider — HTTP transport", () => {
  it("sends POST to /v1/messages with anthropic-version header", async () => {
    let capturedUrl = "";
    let capturedHeaders: Record<string, string> = {};
    const fetchImpl = async (url: string, init: RequestInit) => {
      capturedUrl = url;
      capturedHeaders = init.headers as Record<string, string>;
      return fakeResponse(200, anthropicResponse(VALID_JSON));
    };
    const p = new AnthropicProvider({ apiKey: "sk-test", fetchImpl });
    await p.generate(req());
    expect(capturedUrl).toContain("/messages");
    expect(capturedHeaders["anthropic-version"]).toBe("2023-06-01");
    expect(capturedHeaders["x-api-key"]).toBe("sk-test");
    expect(capturedHeaders["content-type"]).toBe("application/json");
  });

  it("uses custom baseUrl when provided", async () => {
    let capturedUrl = "";
    const fetchImpl = async (url: string) => {
      capturedUrl = url;
      return fakeResponse(200, anthropicResponse(VALID_JSON));
    };
    const p = new AnthropicProvider({ apiKey: "k", baseUrl: "https://my-proxy.example.com/v1", fetchImpl });
    await p.generate(req());
    expect(capturedUrl).toBe("https://my-proxy.example.com/v1/messages");
  });

  it("sends model in request body", async () => {
    let sentBody: Record<string, unknown> = {};
    const fetchImpl = async (_url: string, init: RequestInit) => {
      sentBody = JSON.parse(init.body as string);
      return fakeResponse(200, anthropicResponse(VALID_JSON));
    };
    const p = new AnthropicProvider({ apiKey: "k", fetchImpl });
    await p.generate(req());
    expect(sentBody).toHaveProperty("model");
    expect(sentBody).toHaveProperty("max_tokens");
    expect(sentBody).toHaveProperty("messages");
    expect(sentBody).toHaveProperty("system");
  });

  it("sends system as top-level field, messages array with user turn only", async () => {
    let sentBody: Record<string, unknown> = {};
    const fetchImpl = async (_url: string, init: RequestInit) => {
      sentBody = JSON.parse(init.body as string);
      return fakeResponse(200, anthropicResponse(VALID_JSON));
    };
    const p = new AnthropicProvider({ apiKey: "k", fetchImpl });
    await p.generate(req());
    expect(typeof sentBody.system).toBe("string");
    const messages = sentBody.messages as Array<{ role: string }>;
    expect(messages.every((m) => m.role === "user")).toBe(true);
    // System prompt not inside messages array
    expect(messages.some((m) => m.role === "system")).toBe(false);
  });
});

// ── Model tier routing ────────────────────────────────────────────────────

describe("AnthropicProvider — model tier routing", () => {
  it("uses haiku (cheap) by default", async () => {
    let sentBody: Record<string, unknown> = {};
    const fetchImpl = async (_url: string, init: RequestInit) => {
      sentBody = JSON.parse(init.body as string);
      return fakeResponse(200, anthropicResponse(VALID_JSON));
    };
    const p = new AnthropicProvider({ apiKey: "k", fetchImpl });
    await p.generate(req({ modelTier: "cheap" }));
    expect(sentBody.model).toBe("claude-haiku-4-5-20251001");
  });

  it("uses sonnet-5 (strong) by default", async () => {
    let sentBody: Record<string, unknown> = {};
    const fetchImpl = async (_url: string, init: RequestInit) => {
      sentBody = JSON.parse(init.body as string);
      return fakeResponse(200, anthropicResponse(VALID_JSON));
    };
    const p = new AnthropicProvider({ apiKey: "k", fetchImpl });
    await p.generate(req({ modelTier: "strong" }));
    expect(sentBody.model).toBe("claude-sonnet-5");
  });

  it("respects custom modelCheap override", async () => {
    let sentBody: Record<string, unknown> = {};
    const fetchImpl = async (_url: string, init: RequestInit) => {
      sentBody = JSON.parse(init.body as string);
      return fakeResponse(200, anthropicResponse(VALID_JSON));
    };
    const p = new AnthropicProvider({ apiKey: "k", modelCheap: "claude-custom-cheap", fetchImpl });
    await p.generate(req({ modelTier: "cheap" }));
    expect(sentBody.model).toBe("claude-custom-cheap");
  });

  it("respects custom modelStrong override", async () => {
    let sentBody: Record<string, unknown> = {};
    const fetchImpl = async (_url: string, init: RequestInit) => {
      sentBody = JSON.parse(init.body as string);
      return fakeResponse(200, anthropicResponse(VALID_JSON));
    };
    const p = new AnthropicProvider({ apiKey: "k", modelStrong: "claude-custom-strong", fetchImpl });
    await p.generate(req({ modelTier: "strong" }));
    expect(sentBody.model).toBe("claude-custom-strong");
  });
});

// ── Success path ──────────────────────────────────────────────────────────

describe("AnthropicProvider — success path", () => {
  it("returns ok=true with parsed JSON payload", async () => {
    const payload = { questions: [{ q: "test" }], citedEvidenceIds: [] };
    const fetchImpl = async () => fakeResponse(200, anthropicResponse(JSON.stringify(payload)));
    const p = new AnthropicProvider({ apiKey: "k", fetchImpl });
    const r = await p.generate(req());
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.raw).toEqual(payload);
      expect(r.modelProvider).toBe("anthropic");
      expect(typeof r.modelName).toBe("string");
      expect(r.retryCount).toBe(0);
    }
  });

  it("sums input + output tokens for tokensUsed", async () => {
    const fetchImpl = async () => fakeResponse(200, anthropicResponse(VALID_JSON, 15, 25));
    const p = new AnthropicProvider({ apiKey: "k", fetchImpl });
    const r = await p.generate(req());
    if (r.ok) {
      expect(r.tokensUsed).toBe(40); // 15 + 25
    }
  });

  it("measures latencyMs using injected clock", async () => {
    let t = 1000;
    const clock = () => (t += 50); // each call advances by 50ms
    const fetchImpl = async () => fakeResponse(200, anthropicResponse(VALID_JSON));
    const p = new AnthropicProvider({ apiKey: "k", fetchImpl, clock });
    const r = await p.generate(req());
    if (r.ok) {
      expect(r.latencyMs).toBeGreaterThan(0);
    }
  });
});

// ── Error handling ────────────────────────────────────────────────────────

describe("AnthropicProvider — error handling", () => {
  it("returns AI_UNAVAILABLE on HTTP 4xx error", async () => {
    const fetchImpl = async () => fakeResponse(401, { error: { message: "Unauthorized" } });
    const p = new AnthropicProvider({ apiKey: "k", fetchImpl });
    const r = await p.generate(req({ maxRetries: 0 }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("AI_UNAVAILABLE");
  });

  it("returns AI_UNAVAILABLE on HTTP 5xx error", async () => {
    const fetchImpl = async () => fakeResponse(500, { error: "internal" });
    const p = new AnthropicProvider({ apiKey: "k", fetchImpl });
    const r = await p.generate(req({ maxRetries: 0 }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("AI_UNAVAILABLE");
  });

  it("returns AI_UNAVAILABLE when response has no content blocks", async () => {
    const fetchImpl = async () => fakeResponse(200, { content: [], usage: {} });
    const p = new AnthropicProvider({ apiKey: "k", fetchImpl });
    const r = await p.generate(req({ maxRetries: 0 }));
    expect(r.ok).toBe(false);
  });

  it("returns AI_UNAVAILABLE when content is non-JSON (fail-closed)", async () => {
    const fetchImpl = async () =>
      fakeResponse(200, anthropicResponse("This is prose, not JSON."));
    const p = new AnthropicProvider({ apiKey: "k", fetchImpl });
    const r = await p.generate(req({ maxRetries: 0 }));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("AI_UNAVAILABLE");
      expect(r.detail).toMatch(/non-JSON/);
    }
  });

  it("returns AI_UNAVAILABLE when fetch throws (network error)", async () => {
    const fetchImpl = async (): Promise<Response> => {
      throw new Error("ECONNREFUSED");
    };
    const p = new AnthropicProvider({ apiKey: "k", fetchImpl });
    const r = await p.generate(req({ maxRetries: 0 }));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("AI_UNAVAILABLE");
      expect(r.detail).toMatch(/ECONNREFUSED/);
    }
  });
});

// ── Retry logic ───────────────────────────────────────────────────────────

describe("AnthropicProvider — retry logic", () => {
  it("retries on HTTP 500 and succeeds on second attempt", async () => {
    let callCount = 0;
    const fetchImpl = async () => {
      callCount++;
      if (callCount < 2) return fakeResponse(500, {});
      return fakeResponse(200, anthropicResponse(VALID_JSON));
    };
    const p = new AnthropicProvider({ apiKey: "k", fetchImpl });
    const r = await p.generate(req({ maxRetries: 2 }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.retryCount).toBe(1);
  });

  it("exhausts retries and returns AI_UNAVAILABLE with attempt count in detail", async () => {
    let callCount = 0;
    const fetchImpl = async () => {
      callCount++;
      return fakeResponse(503, {});
    };
    const p = new AnthropicProvider({ apiKey: "k", fetchImpl });
    const r = await p.generate(req({ maxRetries: 2 }));
    expect(r.ok).toBe(false);
    expect(callCount).toBe(3); // initial + 2 retries
    if (!r.ok) {
      expect(r.detail).toMatch(/3 attempt/);
      expect(r.retryCount).toBe(2);
    }
  });

  it("does not retry when maxRetries=0 and first call fails", async () => {
    let callCount = 0;
    const fetchImpl = async () => {
      callCount++;
      return fakeResponse(500, {});
    };
    const p = new AnthropicProvider({ apiKey: "k", fetchImpl });
    await p.generate(req({ maxRetries: 0 }));
    expect(callCount).toBe(1);
  });
});

// ── Context fencing ───────────────────────────────────────────────────────

describe("AnthropicProvider — context fencing (DATA fence)", () => {
  it("includes workspace ID in user message", async () => {
    let sentBody: Record<string, unknown> = {};
    const fetchImpl = async (_url: string, init: RequestInit) => {
      sentBody = JSON.parse(init.body as string);
      return fakeResponse(200, anthropicResponse(VALID_JSON));
    };
    const c = buildAiContext({
      workspaceId: "ws-fence-test",
      taskType: "EVIDENCE_SUMMARY",
      riskLevel: "LOW_CONTENT",
      items: [],
    });
    const p = new AnthropicProvider({ apiKey: "k", fetchImpl });
    await p.generate({
      context: c,
      promptVersion: "v1",
      schemaVersion: "v1",
      options: { modelTier: "cheap", temperature: 0, maxTokens: 512, timeoutMs: 5000, maxRetries: 0 },
    });
    const messages = sentBody.messages as Array<{ content: string }>;
    const userContent = messages[0]?.content ?? "";
    expect(userContent).toContain("ws-fence-test");
  });

  it("places untrusted items in DATA section of user message", async () => {
    let sentBody: Record<string, unknown> = {};
    const fetchImpl = async (_url: string, init: RequestInit) => {
      sentBody = JSON.parse(init.body as string);
      return fakeResponse(200, anthropicResponse(VALID_JSON));
    };
    const c = buildAiContext({
      workspaceId: "ws-1",
      taskType: "EVIDENCE_SUMMARY",
      riskLevel: "LOW_CONTENT",
      items: [
        { kind: "owner_note", label: "Owner comment", value: "I think revenue is fine", trusted: false },
      ],
    });
    const p = new AnthropicProvider({ apiKey: "k", fetchImpl });
    await p.generate({
      context: c,
      promptVersion: "v1",
      schemaVersion: "v1",
      options: { modelTier: "cheap", temperature: 0, maxTokens: 512, timeoutMs: 5000, maxRetries: 0 },
    });
    const messages = sentBody.messages as Array<{ content: string }>;
    const userContent = messages[0]?.content ?? "";
    expect(userContent).toContain("DATA");
    expect(userContent).toContain("Owner comment");
  });

  it("places governance policy in system field", async () => {
    let sentBody: Record<string, unknown> = {};
    const fetchImpl = async (_url: string, init: RequestInit) => {
      sentBody = JSON.parse(init.body as string);
      return fakeResponse(200, anthropicResponse(VALID_JSON));
    };
    const p = new AnthropicProvider({ apiKey: "k", fetchImpl });
    await p.generate(req());
    expect(typeof sentBody.system).toBe("string");
    expect((sentBody.system as string).toLowerCase()).toMatch(/advisory/);
  });
});
