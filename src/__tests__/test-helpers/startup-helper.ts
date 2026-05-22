/**
 * Test helper for initializing startup status in test environment
 * Used by tests that call enforceRequest middleware
 */

import { resetStartupStatus, setStartupStatus } from "@/services/startup-status";

let startupStatusInitialized = false;

export async function ensureStartupStatusReady(): Promise<void> {
  if (startupStatusInitialized) {
    return;
  }

  try {
    await resetStartupStatus();
    await setStartupStatus("READY");
    startupStatusInitialized = true;
  } catch (error) {
    // If startup status can't be set, the getStartupStatus() function
    // will return NOT_STARTED, which is acceptable for some tests
    console.warn("⚠ Could not initialize startup status:", (error as Error).message);
  }
}

export function resetStartupStatusInitialization(): void {
  startupStatusInitialized = false;
}
