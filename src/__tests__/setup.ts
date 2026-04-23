import "@testing-library/jest-dom";
import { beforeAll } from "vitest";
import path from "path";
import fs from "fs";

// Load .env if it exists
const loadEnv = () => {
  const envPath = path.resolve(__dirname, "../../.env");
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

// Verify database connection before running tests
beforeAll(async () => {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    throw new Error(
      "DATABASE_URL environment variable is not set. Tests require a working PostgreSQL database.\n" +
      "Set DATABASE_URL in .env or environment."
    );
  }

  try {
    console.log("Verifying database connection...");
    // Import db after env is loaded
    const { db } = await import("@/lib/db");

    // Test the connection by doing a simple query
    await db.user.count();
    console.log("Database connection verified");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Database connection failed. Tests require a working PostgreSQL database at: ${dbUrl}\n` +
      `Error: ${message}`
    );
  }
});

