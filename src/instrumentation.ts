/**
 * Server Instrumentation Hook
 * Runs automatically when the Next.js server starts
 *
 * Triggers startup checks so that the application state machine
 * is ready before the first request arrives.
 */

import { classifyOperatorError } from "@/lib/operator-error-governance";

export async function register() {
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
