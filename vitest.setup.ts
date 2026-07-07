import { vi, afterEach, beforeAll } from "vitest";
import dotenv from "dotenv";
import path from "path";
import "@testing-library/jest-dom/vitest";

// Load test environment first
dotenv.config({ path: path.resolve(process.cwd(), ".env.test") });

// Fallback: ensure test database is configured
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "postgresql://user:password@localhost:5432/opsiq_dev?schema=public";
}

// OAuth token encryption fails closed without a key (AES-256-GCM, no insecure
// fallback). Configure a synthetic, NON-secret 32-byte key for tests so
// encrypt/decrypt round-trips (storeOAuthToken/retrieveOAuthToken, sync-manager)
// work. Tests that assert the fail-closed behaviour override or unset this
// locally within their own try/finally, so this default does not mask them.
if (!process.env.OAUTH_TOKEN_ENCRYPTION_KEY) {
  process.env.OAUTH_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
}

// Ensure database is initialized before tests run (only if TEST_WITH_DB=true)
beforeAll(async () => {
  if (process.env.TEST_WITH_DB !== "true") {
    return; // Skip DB initialization if not in DB test mode
  }
  try {
    const { getDbInstance } = await import("./src/lib/db");
    await getDbInstance();
  } catch (error) {
    console.error("Failed to initialize database in test setup:", error);
    throw error;
  }
});

afterEach(() => {
  // Clean up mocks after each test
  vi.clearAllMocks();
});
