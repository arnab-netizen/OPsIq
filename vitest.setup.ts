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

// Ensure database is initialized and ready before tests run
beforeAll(async () => {
  try {
    const { getDbInstance } = await import("./src/lib/db");
    const db = await getDbInstance();

    // Actually test the database connection with a simple query
    // to ensure testcontainers is fully ready
    let isReady = false;
    let attempts = 0;
    const maxAttempts = 30;

    while (!isReady && attempts < maxAttempts) {
      try {
        await db.$queryRaw`SELECT 1`;
        isReady = true;
      } catch (error) {
        attempts++;
        if (attempts < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
    }

    if (!isReady) {
      throw new Error(`Database not ready after ${maxAttempts * 100}ms`);
    }
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
