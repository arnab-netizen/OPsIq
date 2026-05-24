import { vi, beforeEach, afterEach, beforeAll } from "vitest";
import dotenv from "dotenv";
import path from "path";
import "@testing-library/jest-dom/vitest";

// Load test environment first
dotenv.config({ path: path.resolve(process.cwd(), ".env.test") });

// Fallback: ensure test database is configured
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "postgresql://user:password@localhost:5432/opsiq_dev?schema=public";
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

// Clear Prisma client cache between tests for isolation
beforeEach(() => {
  // Each test should get a fresh db context
  const globalForPrisma = globalThis as unknown as {
    prisma: any | undefined;
    prismaPromise: Promise<any> | undefined;
  };
  // Keep the connection alive but clear test-specific state
});

afterEach(() => {
  // Clean up mocks after each test
  vi.clearAllMocks();
});
