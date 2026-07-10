/**
 * Phase 6E — workspace-enforcement narrow-select hardening (CONFIRMED_MEDIUM, drift resilience).
 *
 * `enforceWorkspaceScoping` verified workspace + membership with bare/default `findUnique` reads that
 * pull every column of `workspaces` / `workspace_memberships`. Under production schema drift (a newer
 * nullable column present in the Prisma schema but missing from the deployed DB) a default select
 * throws Prisma P2022 and this critical enforcement path 500s. The fix narrows the selects to only the
 * consumed fields (`workspace.isActive`; `membership.role`/`isActive`) — drift-safe and
 * behavior-preserving.
 *
 * These tests exercise the REAL `enforceWorkspaceScoping` against a REAL database (only the session
 * source `getSession` is stubbed — it is not the unit under test). They assert the enforcement
 * allow/deny outcomes are unchanged and, indirectly, that the narrowed reads return the fields the
 * decision needs.
 */

import { describe, it, expect, beforeAll, afterAll, vi, type Mock } from "vitest";
import { randomUUID } from "crypto";
import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";

vi.mock("@/services/auth", () => ({ getSession: vi.fn() }));
import { getSession } from "@/services/auth";
import { enforceWorkspaceScoping, hasPermission, canOverride } from "@/middleware/workspace-enforcement";
import { ForbiddenError } from "@/infra/errors";

const req = {} as NextRequest;
const asSession = (userId: string | null) =>
  (getSession as unknown as Mock).mockResolvedValue(userId ? { user: { id: userId } } : null);

describe("Phase 6E — workspace-enforcement pure permission policy (unchanged)", () => {
  it("admin has override; operator/reviewer do not", () => {
    expect(canOverride("admin")).toBe(true);
    expect(canOverride("operator")).toBe(false);
    expect(canOverride("reviewer")).toBe(false);
  });
  it("hasPermission enforces role→action matrix and fails closed on unknown role/action", () => {
    expect(hasPermission("admin", "override")).toBe(true);
    expect(hasPermission("operator", "override")).toBe(false);
    expect(hasPermission("reviewer", "approve")).toBe(true);
    expect(hasPermission("ghost", "read")).toBe(false);
  });
  it("rejects an invalid workspace-id format with a governed ForbiddenError (before any DB/session)", async () => {
    await expect(enforceWorkspaceScoping(req, "not-a-uuid")).rejects.toBeInstanceOf(ForbiddenError);
  });
  it("returns null when there is no session", async () => {
    asSession(null);
    await expect(enforceWorkspaceScoping(req, randomUUID())).resolves.toBeNull();
  });
});

describe.skipIf(!SHOULD_RUN_DB_TESTS)(
  "[db] Phase 6E — enforceWorkspaceScoping allow/deny against a real database (narrow selects)",
  () => {
    const stamp = randomUUID().substring(0, 8);
    const workspaceId = randomUUID();
    const inactiveWorkspaceId = randomUUID();
    const adminId = randomUUID();
    const viewerId = randomUUID();
    const inactiveMemberId = randomUUID();
    const nonMemberId = randomUUID();

    beforeAll(async () => {
      await db.workspace.create({ data: { id: workspaceId, name: "6E Enf WS", slug: `p6e-enf-${stamp}`, isActive: true } });
      await db.workspace.create({ data: { id: inactiveWorkspaceId, name: "6E Enf WS Off", slug: `p6e-enfoff-${stamp}`, isActive: false } });
      for (const [id, tag] of [[adminId, "adm"], [viewerId, "vwr"], [inactiveMemberId, "inm"], [nonMemberId, "non"]] as const) {
        await db.user.create({ data: { id, email: `p6e-enf-${tag}-${stamp}@test.local`, isActive: true, updatedAt: new Date() } });
      }
      await db.workspaceMembership.create({ data: { workspaceId, userId: adminId, role: "admin", isActive: true, addedBy: adminId } });
      await db.workspaceMembership.create({ data: { workspaceId, userId: viewerId, role: "viewer", isActive: true, addedBy: adminId } });
      await db.workspaceMembership.create({ data: { workspaceId, userId: inactiveMemberId, role: "admin", isActive: false, addedBy: adminId } });
      // an ACTIVE admin of the ACTIVE workspace, but we will query them against the INACTIVE workspace
      await db.workspaceMembership.create({ data: { workspaceId: inactiveWorkspaceId, userId: adminId, role: "admin", isActive: true, addedBy: adminId } });
    });

    afterAll(async () => {
      try {
        await db.workspaceMembership.deleteMany({ where: { workspaceId: { in: [workspaceId, inactiveWorkspaceId] } } });
        await db.user.deleteMany({ where: { id: { in: [adminId, viewerId, inactiveMemberId, nonMemberId] } } });
        await db.workspace.deleteMany({ where: { id: { in: [workspaceId, inactiveWorkspaceId] } } });
      } catch {
        // best-effort cleanup (ephemeral CI database)
      }
    });

    it("[db] active admin member of an active workspace is allowed, role returned", async () => {
      asSession(adminId);
      await expect(enforceWorkspaceScoping(req, workspaceId)).resolves.toEqual({ userId: adminId, role: "admin" });
    });

    it("[db] active viewer member is allowed with their role (enforcement is membership, not permission)", async () => {
      asSession(viewerId);
      await expect(enforceWorkspaceScoping(req, workspaceId)).resolves.toEqual({ userId: viewerId, role: "viewer" });
    });

    it("[db] inactive membership is denied (null)", async () => {
      asSession(inactiveMemberId);
      await expect(enforceWorkspaceScoping(req, workspaceId)).resolves.toBeNull();
    });

    it("[db] a non-member is denied (null)", async () => {
      asSession(nonMemberId);
      await expect(enforceWorkspaceScoping(req, workspaceId)).resolves.toBeNull();
    });

    it("[db] an inactive workspace is denied even for an active admin member (no bypass)", async () => {
      asSession(adminId);
      await expect(enforceWorkspaceScoping(req, inactiveWorkspaceId)).resolves.toBeNull();
    });
  }
);
