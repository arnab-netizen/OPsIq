/**
 * Shared AI provider factory (S7-DC8).
 *
 * Single call site resolution: reads env vars once, returns the correct
 * provider. All route handlers and services must use this instead of
 * instantiating providers directly.
 *
 * Priority:
 *   1. OPENAI_API_KEY present → OpenAiProvider (configurable models via env)
 *   2. ANTHROPIC_API_KEY present → AnthropicProvider (Claude models)
 *   3. Neither key → UnavailableAiProvider (deterministic fallback, advisory-only)
 *
 * Model env vars (OpenAI):
 *   OPENAI_CHEAP_MODEL    — default: "gpt-4o-mini"
 *   OPENAI_STRONG_MODEL   — default: "gpt-4o"
 *
 * Model env vars (Anthropic):
 *   ANTHROPIC_CHEAP_MODEL  — default: "claude-haiku-4-5-20251001"
 *   ANTHROPIC_STRONG_MODEL — default: "claude-sonnet-5"
 *
 * Tests inject a MockAiProvider via the optional deps argument — never via
 * env var manipulation.
 */

import type { AiProvider } from "./provider";
import { UnavailableAiProvider } from "./provider";
import { OpenAiProvider } from "./openai-provider";
import { AnthropicProvider } from "./anthropic-provider";

export interface ResolveProviderDeps {
  /** Injected in tests only. */
  provider?: AiProvider;
}

let _cachedProvider: AiProvider | null = null;

/**
 * Return the singleton AI provider for this process.
 * Deps injection bypasses the cache (tests only).
 */
export function resolveAiProvider(deps: ResolveProviderDeps = {}): AiProvider {
  if (deps.provider) return deps.provider;
  if (_cachedProvider) return _cachedProvider;

  const openaiKey = process.env.OPENAI_API_KEY;
  if (openaiKey && openaiKey.trim().length > 0) {
    _cachedProvider = new OpenAiProvider({
      apiKey: openaiKey.trim(),
      modelCheap: process.env.OPENAI_CHEAP_MODEL ?? "gpt-4o-mini",
      modelStrong: process.env.OPENAI_STRONG_MODEL ?? "gpt-4o",
    });
    return _cachedProvider;
  }

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (anthropicKey && anthropicKey.trim().length > 0) {
    _cachedProvider = new AnthropicProvider({
      apiKey: anthropicKey.trim(),
      modelCheap: process.env.ANTHROPIC_CHEAP_MODEL ?? "claude-haiku-4-5-20251001",
      modelStrong: process.env.ANTHROPIC_STRONG_MODEL ?? "claude-sonnet-5",
    });
    return _cachedProvider;
  }

  _cachedProvider = new UnavailableAiProvider();
  return _cachedProvider;
}

/** Reset cached provider (tests only). */
export function _resetAiProviderForTest(): void {
  _cachedProvider = null;
}
