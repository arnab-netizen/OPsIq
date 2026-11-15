/**
 * Seed deterministic data for Phase 5 Startup Mode E2E spec (56).
 *
 * All IDs are fixed — script is idempotent (upsert). Run AFTER seed-e2e-owner.ts.
 *
 * Creates:
 *  1. OwnerStartupSession (CONTEXT_CAPTURE status)
 *  2. StartupIdeaRecord (linked to session, UNSCREENED)
 *
 * Fields are derived directly from schema.prisma OwnerStartupSession and
 * StartupIdeaRecord models — only columns that exist in the schema are set.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
// Fail closed unless DATABASE_URL is a guarded test database (see scripts/lib/assert-test-database.ts).
import "./lib/assert-test-database";
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
  // Schema required (no default): workspaceId, actorId, intake
  // Schema optional with defaults: status (DRAFT), entryPath (HAVE_IDEA), profileVersion (0)
  await (prisma as any).ownerStartupSession.upsert({
    where: { id: E2E_PHASE5_SESSION_ID },
    update: {
      status: "CONTEXT_CAPTURE",
      sessionLabel: "E2E Phase 5 Test Session",
    },
    create: {
      id: E2E_PHASE5_SESSION_ID,
      workspaceId: E2E_WORKSPACE_ID,
      actorId: E2E_OWNER.userId,
      sessionLabel: "E2E Phase 5 Test Session",
      entryPath: "HAVE_IDEA",
      status: "CONTEXT_CAPTURE",
      profileVersion: 1,
      intake: {
        capitalAvailable: 50000,
        ownerHoursPerWeek: 20,
        riskTolerance: "MEDIUM",
        location: "Australia",
        cashReserveMonths: 6,
        minimumMonthlyIncome: 3000,
        skills: ["sales"],
      },
    },
  });

  // ─── 2. StartupIdeaRecord ─────────────────────────────────────────────────
  // Use raw SQL for the upsert to guarantee field mapping correctness regardless
  // of Prisma client generation state. The (prisma as any) cast bypasses type
  // checks and can silently skip unknown fields.
  await pool.query(
    `INSERT INTO startup_idea_record (
       id, session_id, workspace_id, name, industry, origin_type, screening_status, accepted, version
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (id) DO UPDATE SET
       screening_status = 'UNSCREENED',
       screening_data = NULL,
       accepted = false,
       current_business_model_version_id = NULL,
       current_economic_model_version_id = NULL,
       current_readiness_id = NULL`,
    [
      E2E_PHASE5_IDEA_ID,
      E2E_PHASE5_SESSION_ID,
      E2E_WORKSPACE_ID,
      "Mobile Car Detailing",
      "Automotive Services",
      "OWNER_ENTERED",
      "UNSCREENED",
      false,
      1,
    ]
  );

  console.log("✅ Phase 5 E2E seed complete");
  await prisma.$disconnect();
  pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
