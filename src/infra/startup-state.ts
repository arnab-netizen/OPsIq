/**
 * EDGE-SAFE STARTUP STATE - Global State Machine
 *
 * Uses globalThis to persist state across module reloads.
 * Critical because Next.js bundles middleware separately, loading modules independently.
 *
 * ONLY startup-orchestrator.ts may mutate this state.
 * All other systems read-only.
 */

export enum StartupState {
  NOT_STARTED = "NOT_STARTED",
  STARTING = "STARTING",
  READY = "READY",
  FAILED = "FAILED",
}

// Global state using globalThis for cross-module persistence
declare global {
  var __opsiq_startup_state: StartupState | undefined;
  var __opsiq_startup_error: Error | null | undefined;
}

// Ensure variables exist (but don't reset if already set)
if (globalThis.__opsiq_startup_state === undefined) {
  globalThis.__opsiq_startup_state = StartupState.NOT_STARTED;
  globalThis.__opsiq_startup_error = null;
  console.log("[STARTUP-STATE] First initialization");
} else {
  console.log(`[STARTUP-STATE] Reloaded, preserving: ${globalThis.__opsiq_startup_state}`);
}

/**
 * Get current startup state
 */
export function getStartupState(): StartupState {
  return globalThis.__opsiq_startup_state ?? StartupState.NOT_STARTED;
}

/**
 * Check if startup is complete
 */
export function isStartupComplete(): boolean {
  const state = getStartupState();
  const globalState = globalThis.__opsiq_startup_state;
  const result = state === StartupState.READY;
  console.log(`[STARTUP-STATE] isStartupComplete: globalState=${globalState}, getState=${state}, result=${result}`);
  return result;
}

/**
 * Check if startup failed
 */
export function isStartupFailed(): boolean {
  return getStartupState() === StartupState.FAILED;
}

/**
 * Get startup error if failed
 */
export function getStartupError(): Error | null {
  return globalThis.__opsiq_startup_error ?? null;
}

/**
 * ONLY startup-orchestrator.ts may call these.
 * Enforces state machine invariants.
 */

export function setStartupState(newState: StartupState): void {
  const currentState = getStartupState();
  console.log(`[STARTUP-STATE] setStartupState: ${currentState} → ${newState}`);

  // Prevent regression: READY and FAILED are terminal
  if (currentState === StartupState.READY && newState !== StartupState.READY) {
    throw new Error(`Cannot regress from READY to ${newState}`);
  }
  if (currentState === StartupState.FAILED && newState !== StartupState.FAILED) {
    throw new Error(`Cannot regress from FAILED to ${newState}`);
  }

  // Prevent going back to STARTING
  if (currentState === StartupState.STARTING && newState === StartupState.STARTING) {
    throw new Error("Already STARTING");
  }

  globalThis.__opsiq_startup_state = newState;
  console.log(`[STARTUP-STATE] State updated: ${newState}`);
}

export function setStartupError(error: Error | null): void {
  globalThis.__opsiq_startup_error = error;
  if (error) {
    setStartupState(StartupState.FAILED);
  }
}
