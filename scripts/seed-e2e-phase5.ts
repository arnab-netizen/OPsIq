/**
 * Seed deterministic data for Phase 5 Startup Mode E2E spec (56).
 *
 * All IDs are fixed — script is idempotent (upsert). Run AFTER seed-e2e-owner.ts.
 *
 * Creates:
 *  1. OwnerStartupSession (CONTEXT_CAPTURE status)
 *  2. StartupIdeaRecord (linked to session)
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

  // ─── 1. OwnerStartupSession ───────────────────────────────────────────────
  await (prisma as any).ownerStartupSession.upsert({
    where: { id: E2E_PHASE5_SESSION_ID },
    update: {},
    create: {
      id: E2E_PHASE5_SESSION_ID,
      workspaceId: E2E_WORKSPACE_ID,
      actorId: E2E_OWNER.userId,
      sessionLabel: "E2E Phase 5 Test Session",
      status: "CONTEXT_CAPTURE",
      entryPath: "HAVE_IDEA",
      profileVersion: 1,
      intake: { capitalAvailable: 50000, ownerHoursPerWeek: 20, riskTolerance: "MEDIUM", location: "Australia", cashReserveMonths: 6, minimumMonthlyIncome: 3000, skills: ["sales"] },
    },
  });

  // ─── 2. StartupIdeaRecord ─────────────────────────────────────────────────
  await (prisma as any).startupIdeaRecord.upsert({
    where: { id: E2E_PHASE5_IDEA_ID },
    update: {},
    create: {
      id: E2E_PHASE5_IDEA_ID,
      workspaceId: E2E_WORKSPACE_ID,
      sessionId: E2E_PHASE5_SESSION_ID,
      name: "Mobile Car Detailing",
      industry: "Automotive Services",
      startupCostEstimate: 8000,
      monthlyRevenueEstimate: 5000,
      version: 1,
      originType: "OWNER_ENTERED",
      screeningStatus: "PENDING",
    },
  });

  console.log("✅ Phase 5 E2E seed complete");
  await prisma.$disconnect();
  pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
