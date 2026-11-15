/**
 * Seed the owner-pilot browser businesses into the E2E owner workspace. Run AFTER
 * `scripts/seed-owner-scenarios.ts` (which creates the loginable E2E owner + workspace + role).
 *
 * Each pilot business carries a distinct businessType (so the onboarding/guidance profile mapping
 * differs by type) and ONLY the universal financial minimum (so the type-specific required input is
 * still missing). The weak business has no financial data (low confidence + missing-data state).
 *
 * Deterministic IDs come from tests/browser/owner-pilot-fixtures.ts so the specs select without
 * scraping. Reuses the existing E2E owner identity — no new credentials.
 */
// Fail closed unless DATABASE_URL is a guarded test database (see scripts/lib/assert-test-database.ts).
import "./lib/assert-test-database";
import { randomUUID } from "crypto";
import { E2E_OWNER, E2E_WORKSPACE_ID } from "../tests/browser/e2e-fixtures";
import { PILOT_BUSINESSES } from "../tests/browser/owner-pilot-fixtures";
import { PrismaPg } from "@prisma/adapter-pg";
import type { PrismaClient as PrismaClientType } from "../src/generated/prisma/client";

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL not set");

  const { PrismaClient } = await import("../src/generated/prisma/client");
  const { Pool } = await import("pg");
  const pool = new Pool({ connectionString: databaseUrl });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) }) as PrismaClientType;

  const now = new Date();
  const periodEnd = now;
  const periodStart = new Date(now.getTime() - 30 * 86_400_000);

  for (const b of PILOT_BUSINESSES) {
    await prisma.ownerBusiness.upsert({
      where: { id: b.id },
      update: { name: b.label, businessType: b.businessType, operatingModel: b.operatingModel },
      create: {
        id: b.id,
        workspaceId: E2E_WORKSPACE_ID,
        name: b.label,
        businessType: b.businessType,
        operatingModel: b.operatingModel,
        location: "India",
        currency: "INR",
        createdBy: E2E_OWNER.userId,
        // Backdate so the pilot businesses sort AFTER the scenario businesses (listBusinesses orders by
        // createdAt desc). This keeps the /owner default-selected business a scenario business, so the
        // existing whole-business-plan specs (13/14) that read the default business are unaffected.
        createdAt: new Date("2020-01-01T00:00:00Z"),
      },
    });

    // Universal financial minimum ONLY (revenue/expenses/cash) — type-specific input stays missing.
    if (b.hasFinancialMinimum) {
      await prisma.ownerFinancialSnapshot.upsert({
        where: { id: financeId(b.id) },
        update: { revenue: 450000, costOfGoods: 240000, cashOnHand: 80000, periodEnd },
        create: {
          id: financeId(b.id),
          workspaceId: E2E_WORKSPACE_ID,
          businessId: b.id,
          periodStart,
          periodEnd,
          currency: "INR",
          revenue: 450000,
          costOfGoods: 240000,
          cashOnHand: 80000,
          dataConfidenceScore: 50,
          missingCriticalData: [],
        },
      });
    } else {
      // Weak business — remove any prior finance snapshot so confidence stays low.
      await prisma.ownerFinancialSnapshot.deleteMany({ where: { workspaceId: E2E_WORKSPACE_ID, businessId: b.id } });
    }
    // Clear any prior confirmed intakes so the manual-entry browser flow starts from a clean state.
    await prisma.ownerDataIntake.deleteMany({ where: { workspaceId: E2E_WORKSPACE_ID, businessId: b.id } });

    console.log(`[seed-owner-pilot] ${b.businessType} -> business ${b.id} (financialMinimum=${b.hasFinancialMinimum})`);
  }

  await pool.end();
}

function financeId(businessId: string): string {
  // Deterministic, per-business UUID for the single finance snapshot (…aa0N → …f10N).
  return businessId.replace("aa0", "f10");
}

void randomUUID;

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
