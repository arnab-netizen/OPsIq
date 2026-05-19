#!/usr/bin/env ts-node

/**
 * Seed Staging Database
 *
 * Creates deterministic test data for staging validation.
 * All IDs and data are reproducible across runs.
 *
 * Usage:
 *   npx ts-node scripts/seed-staging.ts
 */

import { PrismaClient } from "@prisma/client";
import * as crypto from "crypto";

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
});

// Deterministic UUID generation from seed string
function deterministicUUID(seed: string): string {
  const hash = crypto.createHash("sha256").update(seed).digest();
  const bytes = hash.slice(0, 16);

  // Set version to 5 (SHA-1)
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

async function seedDatabase() {
  console.log("[SEED] Starting staging database seed...");

  try {
    // Create test workspaces
    console.log("[SEED] Creating test workspaces...");
    const workspace1Id = deterministicUUID("staging:workspace:1");
    const workspace2Id = deterministicUUID("staging:workspace:2");

    await prisma.workspaces.createMany({
      data: [
        {
          id: workspace1Id,
          name: "Test Workspace 1",
          description: "Staging test workspace 1",
          tier: "PROFESSIONAL",
          status: "ACTIVE",
        },
        {
          id: workspace2Id,
          name: "Test Workspace 2",
          description: "Staging test workspace 2",
          tier: "ENTERPRISE",
          status: "ACTIVE",
        },
      ],
      skipDuplicates: true,
    });

    console.log(`[SEED] ✓ Created 2 workspaces`);

    // Create test users
    console.log("[SEED] Creating test users...");
    const user1Id = deterministicUUID("staging:user:1");
    const user2Id = deterministicUUID("staging:user:2");
    const user3Id = deterministicUUID("staging:user:3");

    await prisma.users.createMany({
      data: [
        {
          id: user1Id,
          email: "test1@staging.local",
          name: "Test User 1",
          password_hash: "hashed_password_1",
          status: "ACTIVE",
        },
        {
          id: user2Id,
          email: "test2@staging.local",
          name: "Test User 2",
          password_hash: "hashed_password_2",
          status: "ACTIVE",
        },
        {
          id: user3Id,
          email: "test3@staging.local",
          name: "Test User 3",
          password_hash: "hashed_password_3",
          status: "ACTIVE",
        },
      ],
      skipDuplicates: true,
    });

    console.log(`[SEED] ✓ Created 3 test users`);

    // Create workspace memberships
    console.log("[SEED] Creating workspace memberships...");
    await prisma.workspace_memberships.createMany({
      data: [
        {
          workspace_id: workspace1Id,
          user_id: user1Id,
          role: "OWNER",
          is_active: true,
          added_at: new Date(),
        },
        {
          workspace_id: workspace1Id,
          user_id: user2Id,
          role: "MEMBER",
          is_active: true,
          added_at: new Date(),
        },
        {
          workspace_id: workspace2Id,
          user_id: user3Id,
          role: "OWNER",
          is_active: true,
          added_at: new Date(),
        },
      ],
      skipDuplicates: true,
    });

    console.log(`[SEED] ✓ Created workspace memberships`);

    // Create test clients
    console.log("[SEED] Creating test clients...");
    const client1Id = deterministicUUID("staging:client:1");
    const client2Id = deterministicUUID("staging:client:2");

    await prisma.client_accounts.createMany({
      data: [
        {
          id: client1Id,
          workspace_id: workspace1Id,
          name: "Test Client 1",
          industry: "TECHNOLOGY",
          status: "ACTIVE",
          created_at: new Date(),
        },
        {
          id: client2Id,
          workspace_id: workspace1Id,
          name: "Test Client 2",
          industry: "FINANCE",
          status: "ACTIVE",
          created_at: new Date(),
        },
      ],
      skipDuplicates: true,
    });

    console.log(`[SEED] ✓ Created 2 test clients`);

    // Create test engagements
    console.log("[SEED] Creating test engagements...");
    const engagement1Id = deterministicUUID("staging:engagement:1");
    const engagement2Id = deterministicUUID("staging:engagement:2");

    await prisma.engagements.createMany({
      data: [
        {
          id: engagement1Id,
          workspace_id: workspace1Id,
          client_id: client1Id,
          code: "ENG-001",
          title: "Test Engagement 1",
          service_tier: "CORE",
          engagement_mode: "ADVISORY",
          status: "ACTIVE",
          health_status: "HEALTHY",
          intervention_mode: "DIRECT",
          intervention_phase: "ASSESSMENT",
          version: 1,
          visibility: "PRIVATE",
        },
        {
          id: engagement2Id,
          workspace_id: workspace1Id,
          client_id: client2Id,
          code: "ENG-002",
          title: "Test Engagement 2",
          service_tier: "PREMIUM",
          engagement_mode: "TRANSFORMATION",
          status: "ACTIVE",
          health_status: "AT_RISK",
          intervention_mode: "INDIRECT",
          intervention_phase: "EXECUTION",
          version: 1,
          visibility: "PRIVATE",
        },
      ],
      skipDuplicates: true,
    });

    console.log(`[SEED] ✓ Created 2 test engagements`);

    // Create startup status
    console.log("[SEED] Creating startup status...");
    await prisma.startup_status.deleteMany();
    await prisma.startup_status.create({
      data: {
        id: deterministicUUID("startup:status"),
        status: "READY",
        error: null,
        updated_at: new Date(),
      },
    });

    console.log(`[SEED] ✓ Startup status set to READY`);

    console.log("[SEED] ✓ Seed complete");
    return true;
  } catch (error) {
    console.error("[SEED] ✗ Seed failed:", error);
    return false;
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  const success = await seedDatabase();
  if (!success) {
    process.exit(1);
  }
  process.exit(0);
}

main().catch((error) => {
  console.error("[SEED] Fatal error:", error);
  process.exit(1);
});
