#!/usr/bin/env node
/**
 * Verify demo user role assignment state
 */

import { db, getDbInstance } from "@/lib/db";

async function checkDemoUserState() {
  console.log("\n📋 Checking demo user role assignment state...\n");

  await getDbInstance();

  try {
    // Find demo user
    const user = await db.user.findUnique({
      where: { email: "operator@demo.local" },
    });

    console.log(`User found: ${user ? "✓" : "✗"}`);
    if (user) {
      console.log(`  ID: ${user.id}`);
      console.log(`  Email: ${user.email}`);
    } else {
      console.log("  ✗ Demo user not found - seed must be run first");
      process.exit(1);
    }

    // Find demo workspace
    const workspace = await db.workspace.findFirst({
      where: { name: "Demo Workspace" },
    });

    console.log(`\nWorkspace found: ${workspace ? "✓" : "✗"}`);
    if (workspace) {
      console.log(`  ID: ${workspace.id}`);
      console.log(`  Name: ${workspace.name}`);

      // Validate UUID format
      const uuidRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
      console.log(`  UUID-like: ${uuidRegex.test(workspace.id) ? "✓" : "✗"}`);
    } else {
      console.log("  ✗ Demo workspace not found");
      process.exit(1);
    }

    // Check workspace membership
    const membership = await db.workspaceMembership.findUnique({
      where: { workspaceId_userId: { workspaceId: workspace.id, userId: user.id } },
    });

    console.log(`\nWorkspace membership found: ${membership ? "✓" : "✗"}`);
    if (membership) {
      console.log(`  Role: ${membership.role}`);
      console.log(`  Active: ${membership.isActive ? "✓" : "✗"}`);
    } else {
      console.log("  ✗ Membership not found");
    }

    // Check UserRoleAssignment
    const roleAssignments = await db.userRoleAssignment.findMany({
      where: {
        userId: user.id,
        scope: "workspace",
        scopeId: workspace.id,
      },
    });

    console.log(`\nUserRoleAssignment entries: ${roleAssignments.length}`);
    if (roleAssignments.length > 0) {
      for (const ra of roleAssignments) {
        console.log(`  ✓ Role: ${ra.role}`);
        console.log(`    Active: ${ra.isActive ? "✓" : "✗"}`);
        console.log(`    Granted: ${ra.grantedAt}`);
      }
    } else {
      console.log("  ✗ No UserRoleAssignment entries found");
    }

    // Check if user has ENGAGEMENT_VIEW capability via role
    if (roleAssignments.length > 0) {
      const adminRoles = roleAssignments.filter(
        (ra) => ra.role === "admin_or_portfolio_manager" && ra.isActive
      );
      console.log(
        `\nHas admin_or_portfolio_manager role: ${adminRoles.length > 0 ? "✓" : "✗"}`
      );
      if (adminRoles.length > 0) {
        console.log(
          "  ✓ admin_or_portfolio_manager role includes engagement:view capability"
        );
      }
    }

    console.log("\n");
  } catch (error) {
    console.error("Error:", error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

checkDemoUserState().catch((error) => {
  console.error("Error:", error.message);
  process.exit(1);
});
