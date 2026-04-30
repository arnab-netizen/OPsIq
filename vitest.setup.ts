import { vi } from "vitest";
import dotenv from "dotenv";
import path from "path";

// Load test environment first
dotenv.config({ path: path.resolve(process.cwd(), ".env.test") });

// Fallback: ensure test database is configured
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "file:./test.db";
}
