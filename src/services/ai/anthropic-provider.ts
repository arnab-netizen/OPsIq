/**
 * Owner Mode Governed AI Copilot — Anthropic Provider Adapter.
 *
 * Concrete live provider using Claude Messages API (api.anthropic.com/v1/messages).
 * Mirrors the OpenAI adapter pattern: provider-agnostic port, injectable fetch/clock,
 * fail-closed (no ANTHROPIC_API_KEY → AI_UNAVAILABLE), untrusted items fenced as DATA.
 *
 * Model defaults: cheap = claude-haiku-4-5-20251001, strong = claude-sonnet-5.
 * Anthropic's API uses a top-level `system` field (not a chat message with role=system)
 * and structured output is requested via the prompt outputContract — no native JSON mode.
 * JSON parse failure → AI_UNAVAILABLE, never fabricated output.
 */
import type { AiProvider, AiProviderResult, AiRequest, AiContext } from "./provider";
import { renderContextMessages } from "./openai-provider";

type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export interface AnthropicProviderConfig {
  apiKey?: string;
  modelCheap?: string;
  modelStrong?: string;
  baseUrl?: string;
  /** Injected for tests; defaults to global fetch. */
  fetchImpl?: FetchLike;
  /** Injected for tests; defaults to () => Date.now(). */
  clock?: () => number;
}

const ANTHROPIC_VERSION = "2023-06-01";
const ANTHROPIC_DEFAULT_BASE = "https://api.anthropic.com/v1";

/**
 * Convert the generic context rendering (system + user messages) into the
 * Anthropic Messages API format: a top-level `system` string plus a `messages`
 * array containing only user/assistant turns.
 */
function toAnthropicMessages(
  context: AiContext,
  outputContract?: string
): { system: string; messages: Array<{ role: "user"; content: string }> } {
  const rendered = renderContextMessages(context, outputContract);
  const systemMsg = rendered.find((m) => m.role === "system");
  const userMsg = rendered.find((m) => m.role === "user");
  return {
    system: systemMsg?.content ?? "",
    messages: [{ role: "user", content: userMsg?.content ?? "" }],
  };
}

export class AnthropicProvider implements AiProvider {
  readonly name = "anthropic";
  constructor(private readonly cfg: AnthropicProviderConfig = {}) {}

  private key(): string | undefined {
    return this.cfg.apiKey ?? process.env.ANTHROPIC_API_KEY;
  }

  async generate(req: AiRequest): Promise<AiProviderResult> {
    const key = this.key();
    if (!key) {
      return {
        ok: false,
        reason: "AI_UNAVAILABLE",
        modelProvider: this.name,
        detail: "ANTHROPIC_API_KEY not set — live AI disabled, deterministic path used.",
        retryCount: 0,
      };
    }

    const fetchImpl: FetchLike = this.cfg.fetchImpl ?? (globalThis.fetch as FetchLike);
    const now = this.cfg.clock ?? (() => Date.now());
    const model =
      req.options.modelTier === "strong"
        ? this.cfg.modelStrong ?? "claude-sonnet-5"
        : this.cfg.modelCheap ?? "claude-haiku-4-5-20251001";
    const url = `${this.cfg.baseUrl ?? ANTHROPIC_DEFAULT_BASE}/messages`;
    const { system, messages } = toAnthropicMessages(req.context, req.outputContract);

    const body = JSON.stringify({
      model,
      max_tokens: req.options.maxTokens,
      temperature: req.options.temperature,
      system,
      messages,
    });

    const maxRetries = Math.max(0, req.options.maxRetries);
    let lastDetail = "unknown error";
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const start = now();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), req.options.timeoutMs);
      try {
        const resp = await fetchImpl(url, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-api-key": key,
            "anthropic-version": ANTHROPIC_VERSION,
          },
          body,
          signal: controller.signal,
        });
        clearTimeout(timer);
        if (!resp.ok) {
          lastDetail = `Anthropic HTTP ${resp.status}`;
          continue; // retry
        }
        const json = (await resp.json()) as {
          content?: Array<{ type: string; text?: string }>;
          usage?: { input_tokens?: number; output_tokens?: number };
        };
        const textBlock = json.content?.find((b) => b.type === "text");
        const content = textBlock?.text;
        if (!content) {
          lastDetail = "Anthropic returned no content";
          continue;
        }
        let raw: unknown;
        try {
          raw = JSON.parse(content);
        } catch {
          lastDetail = "Anthropic returned non-JSON content";
          continue;
        }
        const tokensUsed =
          (json.usage?.input_tokens ?? 0) + (json.usage?.output_tokens ?? 0) || undefined;
        return {
          ok: true,
          raw,
          modelProvider: this.name,
          modelName: model,
          latencyMs: now() - start,
          tokensUsed,
          retryCount: attempt,
        };
      } catch (err) {
        clearTimeout(timer);
        lastDetail = "fetch failed";
        if (err instanceof Error) lastDetail = err.message;
      }
    }

    return {
      ok: false,
      reason: "AI_UNAVAILABLE",
      modelProvider: this.name,
      detail: `Anthropic call failed after ${maxRetries + 1} attempt(s): ${lastDetail}`,
      retryCount: maxRetries,
    };
  }
}
