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

  // Run Prisma db push to initialize test database with real schema
  try {
    execSync(
      `npx prisma db push --schema=${schemaPath} --accept-data-loss`,
      {
        cwd: process.cwd(),
        stdio: "inherit",
        env: {
          ...process.env,
          DATABASE_URL: `file:./prisma/test.db`,
          NODE_ENV: "test",
        },
      }
    );
    console.log("✓ Real SQLite test database initialized");

    // Create test users to satisfy foreign key constraints
    const { db } = await import("../lib/db");
    const testActorIds = ["real-safety-test"];

    // Add all actor IDs used in tests
    for (let i = 0; i < 20; i++) {
      testActorIds.push(`actor-${i}`);
    }
    testActorIds.push("real-safety-test-different");

    for (const actorId of testActorIds) {
      try {
        await db.user.create({
          data: {
            id: actorId,
            email: `${actorId}@test.example.com`,
            isActive: true,
          },
        });
      } catch (e) {
        // Ignore duplicate key errors
      }
    }
    console.log("✓ Test users created for FK constraints");
  } catch (e) {
    console.error("Failed to initialize test database:", e);
    throw e;
  }
});

afterAll(() => {
  if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
  }
});
