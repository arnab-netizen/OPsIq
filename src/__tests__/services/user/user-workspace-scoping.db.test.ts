/**
 * [db]-gated Wave 8 (BROKEN-SVC-2) proof — the User service no longer queries the non-existent `User.workspaceId`
 * column / `email_workspaceId` compound. Users are workspace-scoped via the `WorkspaceMembership` relation, and
 * version-checked writes use relation-scoped `updateMany` + a count assert. Drives the REAL un-mocked service:
 *   - getUserById / listUsers return a workspace's members via the membership relation, and exclude cross-workspace
 *   - updateUser succeeds; a stale version → OptimisticLockError; a foreign workspace → NotFound
 *   - deactivateUser flips isActive, revokes the user's active sessions (userId-scoped), and no longer throws;
 *     reactivateUser flips back
 *   - createUser creates a global user (no throw); duplicate email → Conflict
 * Requires TEST_WITH_DB=true.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { getUserById, listUsers, updateUser, deactivateUser, reactivateUser, createUser } from "@/services/user";
import { NotFoundError, OptimisticLockError, ConflictError } from "@/infra/errors";
import type { CanonicalAuthContext } from "@/lib/canonical-route-enforcement";

interface WS { wsId: string; actorId: string; }

const A: WS = { wsId: randomUUID(), actorId: randomUUID() };
const B: WS = { wsId: randomUUID(), actorId: randomUUID() };
const targetUser = randomUUID();

function ctx(actorId: string): CanonicalAuthContext {
  return { verifiedActorId: actorId, session: { user: { id: actorId } } } as unknown as CanonicalAuthContext;
}
const mkUser = (id: string, email: string) => db.user.create({ data: { id, email, isActive: true, updatedAt: new Date() } });
const mkMembership = (userId: string, workspaceId: string) => db.workspaceMembership.create({ data: { userId, workspaceId, role: "member", isActive: true } });

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] Wave 8 — User service workspace scoping via WorkspaceMembership relation", () => {
  beforeEach(async () => {
    for (const w of [A, B]) {
      await db.workspace.create({ data: { id: w.wsId, name: `WS ${w.wsId.substring(0, 6)}`, slug: `u8-${w.wsId.substring(0, 8)}` } });
      await mkUser(w.actorId, `actor-${w.actorId}@example.com`);
      await mkMembership(w.actorId, w.wsId);
    }
    // Target user is a member of workspace A only.
    await mkUser(targetUser, `target-${targetUser}@example.com`);
    await mkMembership(targetUser, A.wsId);
  });
  afterEach(async () => {
    await db.session.deleteMany({ where: { userId: targetUser } }).catch(() => undefined);
    await db.workspaceMembership.deleteMany({ where: { workspaceId: { in: [A.wsId, B.wsId] } } }).catch(() => undefined);
    await db.auditEvent.deleteMany({ where: { entityId: targetUser } }).catch(() => undefined);
    await db.user.deleteMany({ where: { id: { in: [A.actorId, B.actorId, targetUser] } } }).catch(() => undefined);
    await db.user.deleteMany({ where: { email: { contains: "u8-new-" } } }).catch(() => undefined);
    await db.workspace.deleteMany({ where: { id: { in: [A.wsId, B.wsId] } } }).catch(() => undefined);
  });

  it("[db] getUserById returns a member for its workspace and excludes cross-workspace (isolation)", async () => {
    const u = await getUserById(targetUser, A.wsId);
    expect(u.id).toBe(targetUser);
    await expect(getUserById(targetUser, B.wsId)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("[db] listUsers returns only the workspace's members", async () => {
    const listA = await listUsers(A.wsId, {});
    expect(listA.users.map((u) => u.id)).toContain(targetUser);
    const listB = await listUsers(B.wsId, {});
    expect(listB.users.map((u) => u.id)).not.toContain(targetUser);
  });

  it("[db] updateUser succeeds; stale version → OptimisticLockError; foreign workspace → NotFound", async () => {
    await updateUser(targetUser, { name: "Renamed", version: 1 }, ctx(A.actorId), A.wsId);
    const after = await getUserById(targetUser, A.wsId);
    expect(after.name).toBe("Renamed");
    await expect(updateUser(targetUser, { name: "X", version: 1 }, ctx(A.actorId), A.wsId)).rejects.toBeInstanceOf(OptimisticLockError);
    await expect(updateUser(targetUser, { name: "Y", version: 2 }, ctx(B.actorId), B.wsId)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("[db] deactivateUser flips isActive + revokes the user's active sessions, then reactivate flips back", async () => {
    const sessionId = randomUUID();
    await db.session.create({ data: { id: sessionId, userId: targetUser, token: `tok-${sessionId}`, expiresAt: new Date(Date.now() + 3600_000) } });
    await deactivateUser(targetUser, 1, ctx(A.actorId), A.wsId);
    const deactivated = await db.user.findUnique({ where: { id: targetUser }, select: { isActive: true } });
    expect(deactivated?.isActive).toBe(false);
    const session = await db.session.findUnique({ where: { id: sessionId }, select: { revokedAt: true } });
    expect(session?.revokedAt).not.toBeNull();
    // reactivate (version is now 2 after deactivate incremented it)
    await reactivateUser(targetUser, 2, ctx(A.actorId), A.wsId);
    const reactivated = await db.user.findUnique({ where: { id: targetUser }, select: { isActive: true } });
    expect(reactivated?.isActive).toBe(true);
  });

  it("[db] createUser creates a global user (no throw); a duplicate email → Conflict", async () => {
    const email = `u8-new-${randomUUID()}@example.com`;
    const created = await createUser({ email }, ctx(A.actorId), A.wsId);
    expect(created.id).toBeTruthy();
    const row = await db.user.findUnique({ where: { email }, select: { id: true } });
    expect(row?.id).toBe(created.id);
    // Same globally-unique email from a different workspace (distinct idempotency key) → real Conflict, not replay.
    await expect(createUser({ email }, ctx(B.actorId), B.wsId)).rejects.toBeInstanceOf(ConflictError);
  });
});
