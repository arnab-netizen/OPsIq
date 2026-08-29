/**
 * POST /api/onboarding/workspace — legacy-onboarding-misuse guard (DB-backed).
 *
 * Public signup owns initial-workspace creation. This route must now refuse
 * to create a second workspace for an actor who already has one (closing the
 * "onboarding creates Workspace B" defect), while still working as the
 * explicit recovery path for a genuinely zero-workspace account — and when
 * it does create a workspace, it must also grant a matching UserRoleAssignment
 * (the pre-fix route created a WorkspaceMembership with no role assignment at
 * all, leaving the new workspace's own creator with zero capabilities in it).
 *
 * `withCanonicalEnforcement` is mocked to a pass-through (same pattern as
 * src/__tests__/api/owner/tender/screen.test.ts) so this test exercises the
 * route's own logic against a real database, not the auth/session wrapper.
 */
import { describe, it, expect, afterEach } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";

vi.mock("@/lib/canonical-route-enforcement", () => ({
  withCanonicalEnforcement: (handler: (ctx: unknown) => unknown) => handler,
}));

function ctx(actorId: string, body: Record<string, unknown>) {
  return {
    verifiedActorId: actorId,
    request: { json: async () => body },
  };
}

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] POST /api/onboarding/workspace — recovery guard", () => {
  const cleanupUserIds: string[] = [];
  const cleanupWorkspaceIds: string[] = [];

  afterEach(async () => {
    if (cleanupUserIds.length > 0) {
      await db.userRoleAssignment.deleteMany({ where: { userId: { in: cleanupUserIds } } });
      await db.workspaceMembership.deleteMany({ where: { userId: { in: cleanupUserIds } } });
    }
    // The recovery route emits an audit event referencing the actor/workspace;
    // both FKs must be cleared before the rows they reference.
    await db.auditEvent.deleteMany({
      where: {
        OR: [
          { actorId: { in: cleanupUserIds.length > 0 ? cleanupUserIds : [""] } },
          { workspaceId: { in: cleanupWorkspaceIds.length > 0 ? cleanupWorkspaceIds : [""] } },
        ],
      },
    });
    if (cleanupWorkspaceIds.length > 0) {
      await db.workspace.deleteMany({ where: { id: { in: cleanupWorkspaceIds } } });
    }
    if (cleanupUserIds.length > 0) {
      await db.user.deleteMany({ where: { id: { in: cleanupUserIds } } });
    }
    cleanupUserIds.length = 0;
    cleanupWorkspaceIds.length = 0;
  });

  async function makeUser(): Promise<string> {
    const userId = randomUUID();
    await db.user.create({
      data: { id: userId, email: `${userId}@example.com`, isActive: true, updatedAt: new Date() },
    });
    cleanupUserIds.push(userId);
    return userId;
  }

  it("[db] an actor with an existing active membership cannot create a second workspace", async () => {
    const { POST } = await import("@/app/api/onboarding/workspace/route");
    const actorId = await makeUser();

    const firstWorkspace = await db.workspace.create({
      data: { id: randomUUID(), name: "Existing WS", slug: `existing-${randomUUID().slice(0, 8)}`, isActive: true },
    });
    cleanupWorkspaceIds.push(firstWorkspace.id);
    await db.workspaceMembership.create({
      data: { workspaceId: firstWorkspace.id, userId: actorId, role: "owner", isActive: true },
    });

    await expect(
      POST(
        ctx(actorId, {
          name: "Second Workspace",
          slug: `second-${randomUUID().slice(0, 8)}`,
        }) as never
      )
    ).rejects.toMatchObject({ name: "ConflictError", statusCode: 409 });

    const memberships = await db.workspaceMembership.findMany({ where: { userId: actorId } });
    expect(memberships).toHaveLength(1);
    expect(memberships[0].workspaceId).toBe(firstWorkspace.id);
  });

  it("[db] a zero-workspace actor can recover: workspace + membership + role assignment all created", async () => {
    const { POST } = await import("@/app/api/onboarding/workspace/route");
    const actorId = await makeUser();
    const slug = `recovered-${randomUUID().slice(0, 8)}`;

    const result = (await POST(
      ctx(actorId, { name: "Recovered Workspace", slug }) as never
    )) as { workspaceId: string; slug: string };

    cleanupWorkspaceIds.push(result.workspaceId);
    expect(result.slug).toBe(slug);

    const membership = await db.workspaceMembership.findFirst({
      where: { userId: actorId, workspaceId: result.workspaceId },
    });
    expect(membership?.isActive).toBe(true);

    const roleAssignment = await db.userRoleAssignment.findFirst({
      where: { userId: actorId, isActive: true },
    });
    expect(roleAssignment?.scope).toBe("workspace");
    expect(roleAssignment?.scopeId).toBe(result.workspaceId);
  });
});
