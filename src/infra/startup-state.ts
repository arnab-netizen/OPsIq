/**
 * EDGE-SAFE STARTUP STATE
 *
 * This module contains ONLY the global startup state machine.
 * It has ZERO dependencies on Node.js modules or Prisma.
 * Middleware can import this safely.
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

export let currentStartupState = StartupState.NOT_STARTED;
export let startupError: Error | null = null;

/**
 * State machine rules (enforced by type):
 * - FAILED is terminal (cannot regress)
 * - READY is terminal (cannot regress)
 * - Cannot go from READY/FAILED to STARTING
 * - Cannot be in multiple states
 * - Error only set when FAILED
 */

export function getStartupState(): StartupState {
  return currentStartupState;
}

export function isStartupComplete(): boolean {
  return currentStartupState === StartupState.READY;
}

export function isStartupFailed(): boolean {
  return currentStartupState === StartupState.FAILED;
}

export function getStartupError(): Error | null {
  return startupError;
}

/**
 * ONLY startup-orchestrator.ts may call these.
 * Enforces state machine invariants.
 */

export function setStartupState(newState: StartupState): void {
  // Prevent regression: READY and FAILED are terminal
  if (currentStartupState === StartupState.READY && newState !== StartupState.READY) {
    throw new Error(`Cannot regress from READY to ${newState}`);
  }
  if (currentStartupState === StartupState.FAILED && newState !== StartupState.FAILED) {
    throw new Error(`Cannot regress from FAILED to ${newState}`);
  }

  // Prevent going back to STARTING
  if (currentStartupState === StartupState.STARTING && newState === StartupState.STARTING) {
    throw new Error("Already STARTING");
  }

  currentStartupState = newState;
}

export function setStartupError(error: Error | null): void {
  startupError = error;
  if (error) {
    currentStartupState = StartupState.FAILED;
  }
}
