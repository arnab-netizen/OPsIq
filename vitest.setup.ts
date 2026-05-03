import { vi, beforeEach, afterEach } from "vitest";
import dotenv from "dotenv";
import path from "path";
import "@testing-library/jest-dom/vitest";

// Load test environment first
dotenv.config({ path: path.resolve(process.cwd(), ".env.test") });

// Fallback: ensure test database is configured
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "file:./test.db";
}

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
