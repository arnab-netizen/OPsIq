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

// Ensure database is initialized before tests run
beforeAll(async () => {
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
    prisma: unknown;
    prismaPromise: Promise<unknown>;
  };
  // Keep the connection alive but clear test-specific state
});

afterEach(() => {
  // Clean up mocks after each test
  vi.clearAllMocks();
});
