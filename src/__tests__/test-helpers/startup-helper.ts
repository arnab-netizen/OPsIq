/**
 * Test helper for initializing startup status in test environment
 * Used by tests that call enforceRequest middleware
 *
 * Note: This is a best-effort helper. If database isn't available,
 * tests will still run but may fail due to startup status checks.
 */

import { setStartupStatus } from "@/services/startup-status";

// Track per-test-file to allow startup status initialization in each describe block
const initializedFiles = new Set<string>();

export async function ensureStartupStatusReady(fileIdentifier?: string): Promise<void> {
  const identifier = fileIdentifier || "global";

  if (initializedFiles.has(identifier)) {
    return; // Already initialized in this test file
  }

  try {
    // Set startup status to READY - best effort
    // If database is unavailable, setStartupStatus will fail gracefully
    // and getStartupStatus() will return NOT_STARTED for those tests
    await setStartupStatus("READY");
    initializedFiles.add(identifier);
  } catch (error) {
    // Silently fail - tests using this helper will see NOT_STARTED
    // and fail with appropriate database connectivity errors
    initializedFiles.add(identifier); // Mark as "attempted" so we don't retry
  }
}

export function resetStartupStatusInitialization(fileIdentifier?: string): void {
  const identifier = fileIdentifier || "global";
  initializedFiles.delete(identifier);
}
