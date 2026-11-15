/**
 * Seed a dedicated BC probe business into the E2E owner workspace so spec 46 can assert
 * a specific derived condition value from known seed data.
 *
 * Creates:
 *  - ownerBusiness (id: E2E_BC_PROBE_BUSINESS_ID) in E2E_WORKSPACE_ID
 *  - ownerCashflowSnapshot (FK prerequisite for the cycle)
 *  - ownerCashflowCycle with cashflowState="CRITICAL"
 *    → drives cashPressureLevel="CRITICAL" in deriveBusinessConditionSignals()
 *
 * Intentionally does NOT seed workspace-scoped workload/capacity snapshots to avoid
 * interfering with scenario-based specs (47-51) that rely on per-scenario capacity state.
 *
 * Run AFTER seed-owner-scenarios.ts so this script's records have more recent createdAt
 * timestamps and are returned first by findFirst({ orderBy: { createdAt: desc } }).
 */
// Fail closed unless DATABASE_URL is a guarded test database (see scripts/lib/assert-test-database.ts).
import "./lib/assert-test-database";
import { randomUUID } from "crypto";
import { E2E_OWNER, E2E_WORKSPACE_ID, E2E_BC_PROBE_BUSINESS_ID } from "../tests/browser/e2e-fixtures";
import { PrismaPg } from "@prisma/adapter-pg";
import type { PrismaClient as PrismaClientType } from "../src/generated/prisma/client";

const CF_SNAPSHOT_ID = "30000000-0000-0000-0001-0000000000bc";
const CF_CYCLE_ID    = "30000000-0000-0000-0002-0000000000bc";

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL not set");

  const { PrismaClient } = await import("../src/generated/prisma/client");
  const { Pool } = await import("pg");
  const pool = new Pool({ connectionString: databaseUrl });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) }) as PrismaClientType;

  const now = new Date();
  const periodStart = new Date(now.getTime() - 30 * 86_400_000);

  // BC probe business
  await prisma.ownerBusiness.upsert({
    where: { id: E2E_BC_PROBE_BUSINESS_ID },
    update: { name: "BC Probe (E2E)" },
    create: {
      id: E2E_BC_PROBE_BUSINESS_ID,
      workspaceId: E2E_WORKSPACE_ID,
      name: "BC Probe (E2E)",
      businessType: "laundry_dry_cleaning",
      location: "Kolkata",
      currency: "INR",
      createdBy: E2E_OWNER.userId,
    },
  });
  console.log(`[seed-bc-probe] business ${E2E_BC_PROBE_BUSINESS_ID} upserted`);

  // Cashflow snapshot — FK prerequisite for the cycle
  await prisma.ownerCashflowSnapshot.upsert({
    where: { id: CF_SNAPSHOT_ID },
    update: {},
    create: {
      id: CF_SNAPSHOT_ID,
      workspaceId: E2E_WORKSPACE_ID,
      businessId: E2E_BC_PROBE_BUSINESS_ID,
      periodStart,
      periodEnd: now,
      currency: "INR",
      cashInHand: 200,
      bankBalance: 0,
      receivables: 0,
      receivablesOverdue: 90000,
      payables: 85000,
      dataConfidenceScore: 0.9,
      missingCriticalData: [],
    },
  });
  console.log(`[seed-bc-probe] cashflow snapshot ${CF_SNAPSHOT_ID} upserted`);

  // Cashflow cycle — cashflowState=CRITICAL drives cashPressureLevel=CRITICAL
  // Created with now() timestamp → most recent in workspace → returned by findFirst({ where: { workspaceId } })
  await prisma.ownerCashflowCycle.upsert({
    where: { id: CF_CYCLE_ID },
    update: { cashflowState: "CRITICAL", generatedAt: now },
    create: {
      id: CF_CYCLE_ID,
      workspaceId: E2E_WORKSPACE_ID,
      businessId: E2E_BC_PROBE_BUSINESS_ID,
      snapshotId: CF_SNAPSHOT_ID,
      sequenceNumber: 1,
      status: "active",
      healthScore: 0.02,
      dangerScore: 0.99,
      opportunityScore: 0.0,
      dataConfidenceScore: 0.9,
      cashflowState: "CRITICAL",
      generatedAt: now,
    },
  });
  console.log(`[seed-bc-probe] cashflow cycle ${CF_CYCLE_ID} upserted (cashflowState=CRITICAL)`);
  console.log(`[seed-bc-probe] → cashPressureLevel will derive to "CRITICAL" in Now View`);

  await pool.end();
}

void randomUUID; // keep import live

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
