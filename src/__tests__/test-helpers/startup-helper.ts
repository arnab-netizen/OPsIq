/**
 * Test helper for initializing startup status in test environment
 * Used by tests that call enforceRequest middleware
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
    // Simply set startup status to READY
    // The setStartupStatus function will retry and handle database unavailability gracefully
    await setStartupStatus("READY");
    initializedFiles.add(identifier);
    console.log(`✓ Startup status initialized for ${identifier}`);
  } catch (error) {
    // If startup status can't be set, the getStartupStatus() function
    // will return NOT_STARTED, and tests will fail accordingly
    // This is better than silently passing tests that require startup
    console.warn(`⚠ Could not initialize startup status for ${identifier}:`, (error as Error).message);
  }
}

export function resetStartupStatusInitialization(fileIdentifier?: string): void {
  const identifier = fileIdentifier || "global";
  initializedFiles.delete(identifier);
}
