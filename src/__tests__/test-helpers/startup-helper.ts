/**
 * Test helper for initializing startup status in test environment
 * Used by tests that call enforceRequest middleware
 */

import { resetStartupStatus, setStartupStatus } from "@/services/startup-status";
import { getDbInstance } from "@/lib/db";

let startupStatusInitialized = false;

async function waitForDatabaseReady(maxAttempts = 30, delayMs = 100): Promise<void> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const db = await getDbInstance();
      await db.$queryRaw`SELECT 1`;
      return; // Database is ready
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < maxAttempts - 1) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
  }

  throw new Error(`Database not ready after ${maxAttempts * delayMs}ms: ${lastError?.message}`);
}

export async function ensureStartupStatusReady(): Promise<void> {
  if (startupStatusInitialized) {
    return;
  }

  try {
    // Wait for database to be available first
    await waitForDatabaseReady();

    // Now initialize startup status
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
