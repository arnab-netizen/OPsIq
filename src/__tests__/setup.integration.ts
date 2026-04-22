import { beforeAll, afterAll } from "vitest";
import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

const testDbPath = path.join(process.cwd(), "prisma", "test.db");

beforeAll(async () => {
  // Set DATABASE_URL for PostgreSQL test
  process.env.DATABASE_URL = "postgresql://postgres:testpass@localhost:5432/opsiq_test";
  process.env.PGPASSWORD = "testpass";

  // Use main schema (PostgreSQL)
  const schemaPath = path.join(process.cwd(), "prisma", "schema.prisma");
  if (!fs.existsSync(schemaPath)) {
    console.error("PostgreSQL schema not found at", schemaPath);
    process.exit(1);
  }

  // Run Prisma db push to initialize test database with real schema
  try {
    execSync(
      `npx prisma db push --accept-data-loss`,
      {
        cwd: process.cwd(),
        stdio: "inherit",
        env: {
          ...process.env,
          DATABASE_URL: "postgresql://postgres:testpass@localhost:5432/opsiq_test",
          PGPASSWORD: "testpass",
        },
      }
    );
    console.log("✓ Real PostgreSQL test database initialized");

    // Create test users to satisfy foreign key constraints
    const { db } = await import("../lib/db");
    const { v4: uuidv4 } = await import("uuid");

    const testActorIds: { [key: string]: string } = {
      "real-safety-test": uuidv4(),
      "real-safety-test-different": uuidv4(),
    };

    // Add all actor IDs used in tests (now 100 for concurrency test)
    for (let i = 0; i < 100; i++) {
      testActorIds[`actor-${i}`] = uuidv4();
    }

    for (const [actorId, uuid] of Object.entries(testActorIds)) {
      try {
        await db.user.create({
          data: {
            id: uuid,
            email: `${actorId}@test.example.com`,
            isActive: true,
          },
        });
        // Store the UUID mapping for later reference
        (globalThis as any).testActorUuids = (globalThis as any).testActorUuids || {};
        (globalThis as any).testActorUuids[actorId] = uuid;
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

afterAll(async () => {
  // Clean up test data
  try {
    const { db } = await import("../lib/db");
    await db.$executeRawUnsafe(`
      TRUNCATE TABLE audit_events CASCADE;
      TRUNCATE TABLE idempotency_records CASCADE;
      TRUNCATE TABLE business_condition_profiles CASCADE;
      TRUNCATE TABLE engagement_memberships CASCADE;
      TRUNCATE TABLE engagements CASCADE;
      TRUNCATE TABLE lead_records CASCADE;
      TRUNCATE TABLE client_contacts CASCADE;
      TRUNCATE TABLE client_accounts CASCADE;
      TRUNCATE TABLE user_role_assignments CASCADE;
      TRUNCATE TABLE sessions CASCADE;
      TRUNCATE TABLE users CASCADE;
    `);
    await db.$disconnect();
  } catch (e) {
    // Ignore cleanup errors
  }
});
