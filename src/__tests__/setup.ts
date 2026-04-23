import "@testing-library/jest-dom";
import { beforeAll } from "vitest";

// Verify test database connection before running tests
beforeAll(async () => {
  const dbUrl = process.env.DATABASE_URL || "file:./test.db";
  const dbType = dbUrl.startsWith("file:") ? "SQLite" : "PostgreSQL";

  try {
    console.log(`Verifying ${dbType} test database connection...`);
    const { db } = await import("@/lib/db");

    // Test the connection by doing a simple query
    await db.user.count();
    console.log(`${dbType} test database connection verified`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Test database connection failed (${dbType}). DATABASE_URL: ${dbUrl}\n` +
      `Error: ${message}`
    );
  }
});
