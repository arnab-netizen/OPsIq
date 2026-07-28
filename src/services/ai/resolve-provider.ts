/**
 * Shared AI provider factory (S7-DC8).
 *
 * Single call site resolution: reads env vars once, returns the correct
 * provider. All route handlers and services must use this instead of
 * instantiating providers directly.
 *
 * Priority:
 *   1. OPENAI_API_KEY present → OpenAiProvider (configurable models via env)
 *   2. No key → UnavailableAiProvider (deterministic fallback, advisory-only)
 *
 * Model env vars:
 *   OPENAI_CHEAP_MODEL   — default: "gpt-4o-mini"
 *   OPENAI_STRONG_MODEL  — default: "gpt-4o"
 *
 * Tests inject a MockAiProvider via the optional deps argument — never via
 * env var manipulation.
 */

import type { AiProvider } from "./provider";
import { UnavailableAiProvider } from "./provider";
import { OpenAiProvider } from "./openai-provider";

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

  const apiKey = process.env.OPENAI_API_KEY;
  if (apiKey && apiKey.trim().length > 0) {
    _cachedProvider = new OpenAiProvider({
      apiKey: apiKey.trim(),
      modelCheap: process.env.OPENAI_CHEAP_MODEL ?? "gpt-4o-mini",
      modelStrong: process.env.OPENAI_STRONG_MODEL ?? "gpt-4o",
    });
  } else {
    _cachedProvider = new UnavailableAiProvider();
  }

  return _cachedProvider;
}

/** Reset cached provider (tests only). */
export function _resetAiProviderForTest(): void {
  _cachedProvider = null;
}
