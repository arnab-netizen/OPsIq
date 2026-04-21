import { beforeAll, afterAll } from "vitest";
import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

const testDbPath = path.join(process.cwd(), "prisma", "test.db");

beforeAll(async () => {
  // Clean up old test database
  if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
  }

  // Create schema for SQLite and generate client
  const schemaPath = path.join(process.cwd(), "prisma", "schema.sqlite.prisma");
  if (!fs.existsSync(schemaPath)) {
    console.error("SQLite schema not found at", schemaPath);
    process.exit(1);
  }

  // Run migrations on test database with SQLite schema
  try {
    execSync(
      `npx prisma db push --schema=${schemaPath} --accept-data-loss`,
      {
        cwd: process.cwd(),
        stdio: "pipe",
        env: {
          ...process.env,
          DATABASE_URL: `file:./prisma/test.db`,
          NODE_ENV: "test",
        },
      }
    );
    console.log("✓ Test database initialized");
  } catch (e) {
    console.error("Failed to initialize test database - continuing with mock DB");
    // Continue without database - will use mock DB
  }
});

afterAll(() => {
  if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
  }
});
