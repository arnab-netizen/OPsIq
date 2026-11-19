import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { v4 as uuidv4 } from "uuid";
import { db } from "@/lib/db";
import { updateAction } from "@/services/action";
import { NotFoundError } from "@/infra/errors";
import type { CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";

/**
 * updateAction cross-workspace pre-read — DB proof.
 *
 * Root cause: updateAction (behind PATCH /api/actions/[actionId]) loaded the action with
 * `db.action.findUnique({ where: { id: actionId } })` — no workspace predicate — and then ran
 * the version check and the status-transition check against that foreign row BEFORE the
 * (correctly scoped) write. A member of workspace B probing workspace A's action id got
 * distinguishable outcomes that disclose A's row: "Action was modified" for a wrong version
 * (revealing existence + current version), "Invalid state transition for Action: <A's status> → x"
 * (revealing A's status), or a raw Prisma P2025 (500) when every check passed. Only a 404 is
 * acceptable for a row outside the caller's workspace.
 */
describe.skipIf(!SHOULD_RUN_DB_TESTS)("updateAction — a foreign workspace's action is NotFound, never an oracle", () => {
  const stamp = uuidv4();
  const userId = uuidv4();
  const wsA = uuidv4();
  const wsB = uuidv4();
  const clientId = uuidv4();
  const engagementA = uuidv4();
  const actionA = uuidv4();

  const ctxB = {
    verifiedActorId: userId,
    verifiedActorType: "user",
    verifiedActor: null,
    verifiedWorkspaceId: wsB,
    verifiedCapabilities: ["ACTION_UPDATE"],
    verifiedSessionSnapshot: { actorId: userId, sessionId: uuidv4(), createdAt: new Date() },
    policy: null,
  } as unknown as CanonicalAuthContext;

  beforeAll(async () => {
    await db.user.create({ data: { id: userId, email: `action-xws-${stamp}@test.local`, updatedAt: new Date() } });
    await db.workspace.create({ data: { id: wsA, name: "Action XWS A", slug: `action-xws-a-${stamp}` } });
    await db.workspace.create({ data: { id: wsB, name: "Action XWS B", slug: `action-xws-b-${stamp}` } });
    await db.clientAccount.create({ data: { id: clientId, name: "Action XWS client", createdBy: userId, updatedAt: new Date() } });
    await db.engagement.create({
      data: {
        id: engagementA, code: `ACT-XWS-${stamp}`, title: "Action XWS engagement", clientId,
        serviceTier: "tier_1", engagementMode: "strategic_planning", workspaceId: wsA, updatedAt: new Date(),
      },
    });
    await db.action.create({ data: { id: actionA, engagementId: engagementA, title: "A private action", status: "assigned", updatedAt: new Date() } });
  });

  afterAll(async () => {
    try {
      await db.action.deleteMany({ where: { id: actionA } });
      await db.engagement.deleteMany({ where: { id: engagementA } });
      await db.clientAccount.deleteMany({ where: { id: clientId } });
      await db.auditEvent.deleteMany({ where: { workspaceId: { in: [wsA, wsB] } } });
      await db.workspace.deleteMany({ where: { id: { in: [wsA, wsB] } } });
      await db.user.deleteMany({ where: { id: userId } });
    } catch {
      // best-effort cleanup
    }
  });

  const snapshot = async () =>
    db.action.findUniqueOrThrow({ where: { id: actionA }, select: { status: true, version: true, title: true } });

  it("[db] wrong version → NotFound (not a 'modified' existence/version oracle)", async () => {
    await expect(updateAction(actionA, { version: 99, title: "x" }, ctxB, wsB)).rejects.toBeInstanceOf(NotFoundError);
    expect(await snapshot()).toEqual({ status: "assigned", version: 1, title: "A private action" });
  });

  it("[db] invalid transition from A's status → NotFound (no status disclosure)", async () => {
    await expect(updateAction(actionA, { version: 1, status: "verified" }, ctxB, wsB)).rejects.toBeInstanceOf(NotFoundError);
    expect(await snapshot()).toEqual({ status: "assigned", version: 1, title: "A private action" });
  });

  it("[db] all checks passing → NotFound (not a raw Prisma 500) and nothing changes", async () => {
    await expect(updateAction(actionA, { version: 1, status: "in_progress", title: "hijacked" }, ctxB, wsB)).rejects.toBeInstanceOf(NotFoundError);
    expect(await snapshot()).toEqual({ status: "assigned", version: 1, title: "A private action" });
  });
});
