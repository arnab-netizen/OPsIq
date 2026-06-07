/**
 * Server Instrumentation Hook
 * Runs automatically when the Next.js server starts
 *
 * Triggers startup checks so that the application state machine
 * is ready before the first request arrives.
 */

import { classifyOperatorError } from "@/lib/operator-error-governance";
import { initObservability, captureError } from "@/infra/observability";

export async function register() {
  // Initialise observability first (fail-open) so failures below are captured.
  await initObservability("server");

  if (process.env.NEXT_RUNTIME === "nodejs") {
    // Dynamic import in Node context only
    const { ensureStartupComplete } = await import("@/infra/startup-orchestrator");
    const { getStartupState, StartupState } = await import("@/infra/startup-state");

    try {
      console.log("🚀 [INSTRUMENTATION] Triggering startup checks...");
      await ensureStartupComplete();
      const state = getStartupState();
      console.log(`✓ [INSTRUMENTATION] Server startup complete. State: ${state}`);
    } catch (error) {
      const msg = classifyOperatorError(error instanceof Error ? error : new Error(String(error)), { context: "load" }).operatorMessage;
      console.error(`✗ [INSTRUMENTATION] Startup failed: ${msg}`);
      // Don't exit - allow requests to fail gracefully
    }
  }
}

/**
 * Next.js central hook for errors thrown while handling a request. Captures
 * every route/server failure (auth, diagnosis, dashboard, etc.) in one place
 * without editing individual route handlers. Categorized + PII-safe.
 */
export function onRequestError(
  error: unknown,
  request: { path?: string; method?: string },
  context: { routePath?: string }
): void {
  const route = context?.routePath || request?.path;
  captureError(error, { route });
}
