/**
 * Seed deterministic data for Phase 5 Startup Mode E2E spec (56).
 *
 * All IDs are fixed — script is idempotent (upsert). Run AFTER seed-e2e-owner.ts.
 *
 * Creates:
 *  1. OwnerStartupSession (SCREENING status)
 *  2. StartupIdeaRecord (linked to session, with screeningStatus ADVANCE)
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  E2E_WORKSPACE_ID,
  E2E_PHASE5_SESSION_ID,
  E2E_PHASE5_IDEA_ID,
  E2E_OWNER,
} from "../tests/browser/e2e-fixtures";
import { PrismaPg } from "@prisma/adapter-pg";
import type { PrismaClient as PrismaClientType } from "../src/generated/prisma/client";

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL not set");

  const { PrismaClient } = await import("../src/generated/prisma/client");
  const { Pool } = await import("pg");
  const pool = new Pool({ connectionString: databaseUrl });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) }) as PrismaClientType;

  // ─── 1. OwnerStartupSession ───────────────────────────────────────────────────
  await (prisma as any).ownerStartupSession.upsert({
    where: { id: E2E_PHASE5_SESSION_ID },
    create: {
      id: E2E_PHASE5_SESSION_ID,
      workspaceId: E2E_WORKSPACE_ID,
      ownerId: E2E_OWNER.userId,
      status: "SCREENING",
      entryPath: "HAVE_IDEA",
      sessionPurpose: "E2E test session",
      profileVersion: 1,
      profileData: {
        geography: "AU",
        industry: "Food & Beverage",
        targetCustomer: "Local families",
        ownerHoursPerWeek: 20,
        capitalAvailableCents: 5000000,
        riskTolerance: "MEDIUM",
        requiresLicence: false,
        hasConnectors: false,
        ownerExclusions: [],
      },
      createdAt: new Date("2026-07-20T00:00:00Z"),
      updatedAt: new Date("2026-07-20T00:00:00Z"),
    },
    update: {
      status: "SCREENING",
      updatedAt: new Date(),
    },
  });

  // ─── 2. StartupIdeaRecord ─────────────────────────────────────────────────────
  await (prisma as any).startupIdeaRecord.upsert({
    where: { id: E2E_PHASE5_IDEA_ID },
    create: {
      id: E2E_PHASE5_IDEA_ID,
      workspaceId: E2E_WORKSPACE_ID,
      startupSessionId: E2E_PHASE5_SESSION_ID,
      name: "Food Delivery Service",
      industry: "Food & Beverage",
      screeningStatus: "ADVANCE",
      screeningReasons: ["Strong demand signal", "Owner has relevant experience"],
      screeningConstraints: [],
      version: 1,
      createdAt: new Date("2026-07-20T00:00:00Z"),
      updatedAt: new Date("2026-07-20T00:00:00Z"),
    },
    update: {
      screeningStatus: "ADVANCE",
      updatedAt: new Date(),
    },
  });

  console.log("Phase 5 E2E seed complete.");
  await prisma.$disconnect();
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
