#!/usr/bin/env ts-node

/**
 * Reset Staging Database
 *
 * Deterministically resets the staging database to a clean state.
 *
 * Usage:
 *   npx ts-node scripts/reset-staging.ts [--reseed]
 *
 * Options:
 *   --reseed    Also run seed script after reset
 */

import { PrismaClient } from "../src/generated/prisma/client";
import { StagingTargetRefusal, assertLocalOrApprovedStagingTarget } from "../src/infra/staging-database-target";

// This script DELETEs every table. It goes through the Prisma client, not the Prisma CLI, so the CLI datasource guard
// never sees it: prove the target BEFORE the first statement — positively local, or an approved staging endpoint.
// (Local compose: set OPSIQ_LOCAL_DB_EXTRA_HOSTS=postgres; staging: OPSIQ_APPROVED_STAGING_ENDPOINT_IDS.)
try {
  assertLocalOrApprovedStagingTarget(process.env.DATABASE_URL, process.env);
} catch (e) {
  console.error(`[RESET] REFUSED: ${e instanceof StagingTargetRefusal ? e.message : "the database target could not be verified"} No statement was executed.`);
  process.exit(1);
}

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
});

async function resetDatabase() {
  console.log("[RESET] Starting staging database reset...");

  try {
    // Get all tables
    const tables = await prisma.$queryRaw<
      Array<{ tablename: string }>
    >`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`;

    console.log(`[RESET] Found ${tables.length} tables to clear`);

    // Disable foreign keys
    await prisma.$executeRaw`ALTER TABLE IF EXISTS audit_events DISABLE TRIGGER ALL;`;

    // Clear tables in reverse dependency order
    const tablesToClear = [
      "idempotency_records",
      "webhook_events",
      "webhook_deliveries",
      "sessions",
      "usage_events",
      "subscription_price_snapshots",
      "subscriptions",
      "billing_accounts",
      "actions",
      "recommendations",
      "recommendations_legacy",
      "decisions",
      "decision_snapshots",
      "deliverables",
      "findings",
      "evidence_items",
      "evidence_bundles",
      "evidence_bundle_items",
      "evidence",
      "risks",
      "kpi_snapshots",
      "kpis",
      "financial_baselines",
      "shock_events",
      "override_records",
      "calibration_records",
      "business_condition_profiles",
      "intervention_states",
      "stages",
      "engagements",
      "entity_links",
      "entities",
      "client_contacts",
      "client_accounts",
      "engagement_memberships",
      "canonical_events",
      "audit_events",
      "user_role_assignments",
      "workspace_memberships",
      "users",
      "workspaces",
      "plans",
      "plan_capabilities",
      "aggregate_locks",
      "ai_proposal_sandboxes",
      "scheduled_tasks",
      "snapshot_data",
      "lead_records",
      "operator_items",
      "threshold_configs",
    ];

    for (const table of tablesToClear) {
      try {
        await prisma.$executeRawUnsafe(`DELETE FROM ${table};`);
        console.log(`[RESET] ✓ Cleared ${table}`);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        if (!message.includes("does not exist")) {
          console.warn(`[RESET] ⚠ Could not clear ${table}:`, message);
        }
      }
    }

    // Re-enable foreign keys
    await prisma.$executeRaw`ALTER TABLE IF EXISTS audit_events ENABLE TRIGGER ALL;`;

    // Reset sequences
    await prisma.$executeRaw`
      DO $$
      DECLARE
        v_table text;
      BEGIN
        FOR v_table IN
          SELECT tablename FROM pg_tables
          WHERE schemaname = 'public'
        LOOP
          EXECUTE format('ALTER SEQUENCE IF EXISTS %I_id_seq RESTART WITH 1', v_table);
        END LOOP;
      END $$;
    `;

    console.log("[RESET] ✓ Database reset complete");
    return true;
  } catch (error) {
    console.error("[RESET] ✗ Reset failed:", error);
    return false;
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  const shouldReseed = process.argv.includes("--reseed");

  const success = await resetDatabase();
  if (!success) {
    process.exit(1);
  }

  if (shouldReseed) {
    console.log("[RESET] Running seed script...");
    // Import and run seed
    const seedScript = await import("./seed-staging");
    await seedScript.main();
  }

  console.log("[RESET] ✓ Staging environment ready");
  process.exit(0);
}

main().catch((error) => {
  console.error("[RESET] Fatal error:", error);
  process.exit(1);
});
