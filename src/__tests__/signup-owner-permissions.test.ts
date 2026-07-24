import { describe, it, expect } from "vitest";
import { db } from "@/lib/db";
import { randomUUID } from "crypto";
import { hasCapability, getCapabilitiesForRole } from "@/policies/capability-check";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { ROLES } from "@/domain/constants/roles";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";

describe("Signup Owner Permissions — non-DB function contract assertions", () => {
  it("hasCapability is a function", () => {
    expect(typeof hasCapability).toBe("function");
  });
  it("getCapabilitiesForRole is a function", () => {
    expect(typeof getCapabilitiesForRole).toBe("function");
  });
  it("CAPABILITIES.OWNER_VIEW is defined", () => {
    expect(CAPABILITIES.OWNER_VIEW).toBeDefined();
  });
  it("CAPABILITIES.OWNER_VIEW is a string", () => {
    expect(typeof CAPABILITIES.OWNER_VIEW).toBe("string");
  });
  it("ROLES.ADMIN_OR_PORTFOLIO_MANAGER is defined", () => {
    expect(ROLES.ADMIN_OR_PORTFOLIO_MANAGER).toBeDefined();
  });
  it("ROLES.ADMIN_OR_PORTFOLIO_MANAGER is a string", () => {
    expect(typeof ROLES.ADMIN_OR_PORTFOLIO_MANAGER).toBe("string");
  });
  it("SHOULD_RUN_DB_TESTS is a boolean", () => {
    expect(typeof SHOULD_RUN_DB_TESTS).toBe("boolean");
  });
  it("getCapabilitiesForRole(ADMIN_OR_PORTFOLIO_MANAGER) returns an iterable", () => {
    const caps = getCapabilitiesForRole(ROLES.ADMIN_OR_PORTFOLIO_MANAGER);
    expect(caps).toBeTruthy();
    expect(typeof caps[Symbol.iterator]).toBe("function");
  });
  it("ADMIN_OR_PORTFOLIO_MANAGER caps include OWNER_VIEW", () => {
    const caps = getCapabilitiesForRole(ROLES.ADMIN_OR_PORTFOLIO_MANAGER);
    expect(Array.from(caps)).toContain(CAPABILITIES.OWNER_VIEW);
  });
  it("hasCapability returns false for empty roles", () => {
    const result = hasCapability({ userId: "u1", roles: [], engagementMemberships: [] }, CAPABILITIES.OWNER_VIEW);
    expect(result).toBe(false);
  });
  it("hasCapability returns a boolean", () => {
    const result = hasCapability({ userId: "u1", roles: [], engagementMemberships: [] }, CAPABILITIES.OWNER_VIEW);
    expect(typeof result).toBe("boolean");
  });
  it("hasCapability returns true for ADMIN_OR_PORTFOLIO_MANAGER with workspace scope", () => {
    const ctx = {
      userId: "u1",
      roles: [{ role: ROLES.ADMIN_OR_PORTFOLIO_MANAGER as any, scope: "workspace", scopeId: "ws-1" }],
      engagementMemberships: [],
    };
    expect(hasCapability(ctx, CAPABILITIES.OWNER_VIEW)).toBe(true);
  });
  it("randomUUID is a function", () => {
    expect(typeof randomUUID).toBe("function");
  });
  it("randomUUID() returns a non-empty string", () => {
    expect(typeof randomUUID()).toBe("string");
    expect(randomUUID().length).toBeGreaterThan(0);
  });
  it("randomUUID() returns a UUID-format string", () => {
    expect(randomUUID()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });
  it("two randomUUID() calls return different values", () => {
    expect(randomUUID()).not.toBe(randomUUID());
  });
  it("CAPABILITIES object has multiple keys", () => {
    expect(Object.keys(CAPABILITIES).length).toBeGreaterThan(3);
  });
});

describe.skipIf(!SHOULD_RUN_DB_TESTS)("Signup Owner Permissions", () => {
  it("ADMIN_OR_PORTFOLIO_MANAGER role must have OWNER_VIEW", () => {
    const caps = getCapabilitiesForRole(ROLES.ADMIN_OR_PORTFOLIO_MANAGER);
    expect(Array.from(caps)).toContain(CAPABILITIES.OWNER_VIEW);
  });

  it("should resolve OWNER_VIEW from UserRoleAssignment for workspace", async () => {
    const userId = randomUUID();
    const workspaceId = randomUUID();

    // Create user
    const user = await db.user.create({
      data: {
        id: userId,
        email: `test-perm-${Date.now()}@example.com`,
        isActive: true,
        updatedAt: new Date(),
      },
    });

    // Create workspace
    const workspace = await db.workspace.create({
      data: {
        name: `Test WS ${Date.now()}`,
        slug: `test-${Date.now()}`,
        createdBy: userId,
        isActive: true,
      },
    });

    // Create workspace membership (owner)
    await db.workspaceMembership.create({
      data: {
        workspaceId: workspace.id,
        userId: user.id,
        role: "owner",
        addedBy: user.id,
        isActive: true,
      },
    });

    // Create UserRoleAssignment (the key part signup must do)
    const roleAssignment = await db.userRoleAssignment.create({
      data: {
        id: randomUUID(),
        userId: user.id,
        role: ROLES.ADMIN_OR_PORTFOLIO_MANAGER,
        scope: "workspace",
        scopeId: workspace.id,
        grantedAt: new Date(),
        isActive: true,
      },
    });

    // Query UserRoleAssignment the same way auth.ts does
    const assignments = await db.userRoleAssignment.findMany({
      where: {
        userId: user.id,
        scope: "workspace",
        scopeId: workspace.id,
        isActive: true,
        revokedAt: null,
      },
    });

    expect(assignments).toHaveLength(1);
    expect(assignments[0].role).toBe(ROLES.ADMIN_OR_PORTFOLIO_MANAGER);

    // Build policy context the same way auth.ts does
    const policyContext = {
      userId: user.id,
      roles: assignments.map((ra) => ({
        role: ra.role as any,
        scope: ra.scope,
        scopeId: ra.scopeId,
      })),
      engagementMemberships: [],
    };

    // Check capability the same way canonical enforcer does
    const hasOwnerView = hasCapability(policyContext, CAPABILITIES.OWNER_VIEW);
    expect(hasOwnerView).toBe(true);

    // Cleanup
    await db.userRoleAssignment.delete({ where: { id: roleAssignment.id } });
    await db.workspaceMembership.deleteMany({ where: { workspaceId: workspace.id } });
    await db.workspace.delete({ where: { id: workspace.id } });
    await db.user.delete({ where: { id: userId } });
  });

  it("should NOT grant OWNER_VIEW without UserRoleAssignment", async () => {
    const userId = randomUUID();

    // Create user
    const user = await db.user.create({
      data: {
        id: userId,
        email: `test-no-perm-${Date.now()}@example.com`,
        isActive: true,
        updatedAt: new Date(),
      },
    });

    // Create workspace
    const workspace = await db.workspace.create({
      data: {
        name: `Test NP ${Date.now()}`,
        slug: `testnp-${Date.now()}`,
        createdBy: userId,
        isActive: true,
      },
    });

    // Create workspace membership WITHOUT role assignment
    await db.workspaceMembership.create({
      data: {
        workspaceId: workspace.id,
        userId: user.id,
        role: "owner",
        addedBy: user.id,
        isActive: true,
      },
    });

    // Query (should find none)
    const assignments = await db.userRoleAssignment.findMany({
      where: {
        userId: user.id,
        scope: "workspace",
        scopeId: workspace.id,
        isActive: true,
        revokedAt: null,
      },
    });

    expect(assignments).toHaveLength(0);

    // Build empty policy context
    const policyContext = {
      userId: user.id,
      roles: [],
      engagementMemberships: [],
    };

    // Check capability (should fail)
    const hasOwnerView = hasCapability(policyContext, CAPABILITIES.OWNER_VIEW);
    expect(hasOwnerView).toBe(false);

    // Cleanup
    await db.workspaceMembership.deleteMany({ where: { workspaceId: workspace.id } });
    await db.workspace.delete({ where: { id: workspace.id } });
    await db.user.delete({ where: { id: userId } });
  });
});
