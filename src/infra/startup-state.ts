/**
 * EDGE-SAFE STARTUP STATE
 *
 * This module contains ONLY global state flags.
 * It has ZERO dependencies on Node.js modules or Prisma.
 * Middleware can import this safely.
 */

export let startupComplete = false;
export let startupError: Error | null = null;

export function isStartupComplete(): boolean {
  return startupComplete;
}

export function getStartupError(): Error | null {
  return startupError;
}

export function setStartupComplete(value: boolean): void {
  startupComplete = value;
}

export function setStartupError(error: Error | null): void {
  startupError = error;
}
