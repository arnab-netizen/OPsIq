/**
 * Database initialization guarantee for server startup
 *
 * This module ensures getDbInstance() is called early during server startup,
 * preventing "Database not initialized" errors on first requests.
 *
 * Called automatically when imported by app routes.
 */

import { getDbInstance } from "@/lib/db";

let initPromise: Promise<unknown> | null = null;

export async function ensureDbInitialized() {
  if (!initPromise) {
    initPromise = (async () => {
      try {
        await getDbInstance();
      } catch (error) {
        // Log but don't throw - allow graceful degradation
        console.error("[DB] Failed to initialize database on startup:", error);
      }
    })();
  }
  return initPromise;
}

// Attempt initialization immediately when this module is imported
if (typeof globalThis !== "undefined") {
  ensureDbInitialized().catch((error) => {
    console.error("[DB] Database initialization error:", error);
  });
}
