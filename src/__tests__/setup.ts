import "@testing-library/jest-dom";
import { beforeAll } from "vitest";

// Verify test database connection before running tests
beforeAll(async () => {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    throw new Error(
      "DATABASE_URL environment variable is not set. Tests require a PostgreSQL database connection.\n" +
      "Configure DATABASE_URL in your environment to a PostgreSQL test database."
    );
  }

  try {
    console.log("Verifying test database connection...");
    const { db } = await import("@/lib/db");

    // Test the connection by doing a simple query
    await db.user.count();
    console.log("Test database connection verified");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Test database connection failed. DATABASE_URL: ${dbUrl}\n` +
      `Error: ${message}\n` +
      `Ensure PostgreSQL is running and the test database is accessible.`
    );
  }
});
