import "@testing-library/jest-dom";
import { beforeAll } from "vitest";
import path from "path";
import fs from "fs";

// Load .env.test first, then .env for fallback
const loadEnv = () => {
  // Try .env.test first (test-specific config)
  let envPath = path.resolve(__dirname, "../../.env.test");
  if (!fs.existsSync(envPath)) {
    // Fall back to .env
    envPath = path.resolve(__dirname, "../../.env");
  }

  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, "utf-8");
    const lines = envContent.split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const [key, ...valueParts] = trimmed.split("=");
      if (key) {
        const value = valueParts.join("=").replace(/^"(.*)"$/, "$1").trim();
        if (!process.env[key]) {
          process.env[key] = value;
        }
      }
    }
  }
};

loadEnv();

// Verify test database connection before each test file
beforeAll(async () => {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    throw new Error(
      "DATABASE_URL environment variable is not set. Tests require a database connection.\n" +
      "Ensure .env.test or .env is configured with DATABASE_URL."
    );
  }

  try {
    // Import db after env is loaded
    const { db } = await import("@/lib/db");

    // Test the connection by doing a simple query
    await db.user.count();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Test database connection failed. DATABASE_URL: ${dbUrl}\n` +
      `Error: ${message}\n` +
      `Verify database is properly initialized.`
    );
  }
});
