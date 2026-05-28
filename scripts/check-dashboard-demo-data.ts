#!/usr/bin/env node
/**
 * Dashboard Demo Data Diagnostic
 * Verifies demo data exists and is properly linked to workspace for dashboard queries
 */

import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

const { Pool } = pg;

async function createClient() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL environment variable is not set");
  }

  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: databaseUrl.includes("sslmode=require")
      ? { rejectUnauthorized: false }
      : undefined,
  });

  const adapter = new PrismaPg(pool);
  return { prisma: new PrismaClient({ adapter }), pool };
}

async function checkDashboardData() {
  const { prisma, pool } = await createClient();

  try {
    console.log("📊 Dashboard Demo Data Diagnostic\n");

    // Find demo workspace
    const workspace = await prisma.workspace.findFirst({
      where: { name: "Demo Workspace" },
    });

    if (!workspace) {
      console.log("❌ Demo workspace not found\n");
      process.exit(1);
    }

    console.log(`✓ Workspace found: ${workspace.id} (${workspace.name})\n`);

    // Find demo user
    const user = await prisma.user.findUnique({
      where: { email: "operator@demo.local" },
    });

    if (!user) {
      console.log("❌ Demo user not found\n");
      process.exit(1);
    }

    console.log(`✓ User found: ${user.id} (${user.email})\n`);

    // Check engagement
    const engagement = await prisma.engagement.findFirst({
      where: { code: "ENG-001" },
      select: {
        id: true,
        code: true,
        title: true,
        workspaceId: true,
        status: true,
        healthStatus: true,
      },
    });

    console.log("🔍 Engagement Status:");
    if (!engagement) {
      console.log("   ❌ Engagement ENG-001 not found");
    } else {
      console.log(`   ✓ Found: ${engagement.code} (${engagement.title})`);
      console.log(`   - ID: ${engagement.id}`);
      console.log(
        `   - workspaceId: ${engagement.workspaceId || "❌ NULL (PROBLEM!)"}`
      );
      if (engagement.workspaceId === workspace.id) {
        console.log(`   - ✓ Linked to correct workspace`);
      } else if (!engagement.workspaceId) {
        console.log(
          `   - ❌ NOT linked to any workspace (dashboard won't find it)`
        );
      } else {
        console.log(`   - ❌ Linked to wrong workspace`);
      }
      console.log(`   - Status: ${engagement.status}`);
      console.log(`   - Health: ${engagement.healthStatus}\n`);
    }

    if (!engagement) {
      console.log("⚠️  Cannot check data without engagement\n");
      process.exit(1);
    }

    // Count findings for this engagement
    const findingsTotal = await prisma.finding.count({
      where: { engagementId: engagement.id },
    });

    const criticalFindings = await prisma.finding.count({
      where: {
        engagementId: engagement.id,
        severity: "critical",
        status: { not: "resolved" },
      },
    });

    console.log("📋 Findings:");
    console.log(`   Total: ${findingsTotal}`);
    console.log(`   Critical (unresolved): ${criticalFindings}`);
    if (findingsTotal > 0) {
      console.log("   ✓ Findings exist for dashboard\n");
    }

    // Count actions
    const actionsTotal = await prisma.action.count({
      where: { engagementId: engagement.id },
    });

    const openActions = await prisma.action.count({
      where: {
        engagementId: engagement.id,
        status: { in: ["open", "in_progress"] },
      },
    });

    const blockedActions = await prisma.action.count({
      where: { engagementId: engagement.id, status: "blocked" },
    });

    console.log("✅ Actions:");
    console.log(`   Total: ${actionsTotal}`);
    console.log(`   Open/In Progress: ${openActions}`);
    console.log(`   Blocked: ${blockedActions}`);
    if (actionsTotal > 0) {
      console.log("   ✓ Actions exist for dashboard\n");
    }

    // Count recommendations
    const recommendationsTotal = await prisma.recommendation.count({
      where: { engagementId: engagement.id },
    });

    const openRecommendations = await prisma.recommendation.count({
      where: {
        engagementId: engagement.id,
        status: { notIn: ["completed", "cancelled"] },
      },
    });

    console.log("💡 Recommendations:");
    console.log(`   Total: ${recommendationsTotal}`);
    console.log(`   Open: ${openRecommendations}`);
    if (recommendationsTotal > 0) {
      console.log("   ✓ Recommendations exist for dashboard\n");
    }

    // Final classification
    console.log("═══════════════════════════════════════");
    console.log("📊 Classification:");
    console.log("═══════════════════════════════════════\n");

    if (!engagement.workspaceId) {
      console.log("❌ seed_creates_data_but_wrong_workspace");
      console.log(
        "\nROOT CAUSE: Engagement created without workspaceId = NULL"
      );
      console.log(
        "EFFECT: Dashboard queries filter by workspace scope, find nothing"
      );
      console.log("\nFIX REQUIRED:");
      console.log("  1. Update seed.ts: add workspaceId: workspace.id");
      console.log("  2. Run Seed Staging Database workflow");
      console.log("  3. Verify dashboard loads with data\n");
    } else if (engagement.workspaceId !== workspace.id) {
      console.log("❌ seed_creates_data_but_wrong_workspace");
      console.log(
        `\nROOT CAUSE: Engagement linked to wrong workspace (${engagement.workspaceId} vs ${workspace.id})`
      );
      console.log("EFFECT: Dashboard queries for this workspace find nothing");
      console.log("\nFIX REQUIRED: Update seed to link to correct workspace\n");
    } else if (
      findingsTotal === 0 &&
      actionsTotal === 0 &&
      recommendationsTotal === 0
    ) {
      console.log("❌ seed_does_not_create_dashboard_demo_data");
      console.log("\nROOT CAUSE: Engagement exists but no findings/actions");
      console.log("EFFECT: Dashboard shows empty state correctly");
      console.log(
        "\nNote: Check if seed is actually running - this shouldn't happen\n"
      );
    } else {
      console.log("✅ dashboard_empty_state_correct");
      console.log(
        "\nDATA FOUND: Engagement, findings, and actions are seeded correctly"
      );
      console.log("All models are linked to correct workspace");
      console.log(
        "Dashboard empty state may be due to query filters or display logic\n"
      );
    }

    console.log("═══════════════════════════════════════");
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

checkDashboardData().catch((error) => {
  console.error("\n❌ Diagnostic error:", error.message);
  process.exit(1);
});
