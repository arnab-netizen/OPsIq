/**
 * A cached idempotent outcome is bound to the workspace as well as the actor, against a real database.
 *
 * Root cause proven here: the caller binding hashed the workspace only when a caller passed it, and
 * withIdempotency (POST /api/actions, /api/deliverables, /api/users) and ~25 route callers passed only the
 * actor. The same user reusing a key and body in a second workspace was served the first workspace's cached
 * result. The fix passes the verified workspace at those callers.
 *
 * Run: TEST_WITH_DB=true npx vitest run src/__tests__/api/idempotency-workspace-scope.db.test.ts --maxWorkers=1
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";

const ids = vi.hoisted(() => ({ actorId: "", workspaceId: "" }));

vi.mock("@/services/auth", () => {
  const session = () => ({
    user: { id: ids.actorId, email: "idem@example.com", name: "Idempotency", isActive: true },
    sessionId: "idem-session",
    expiresAt: new Date(Date.now() + 86_400_000),
  });
  const policy = () => ({
    userId: ids.actorId,
    // decision:create is granted only by system_admin in ROLE_CAPABILITIES.
    roles: [{ role: "system_admin", scope: "workspace", scopeId: ids.workspaceId }],
    engagementMemberships: [],
  });
  return {
    getSessionFact: vi.fn(async () => ({ valid: true, session: session(), invalidReason: undefined })),
    getSession: vi.fn(async () => session()),
    getPolicyContextFact: vi.fn(async () => ({ valid: true, policy: policy(), invalidReason: undefined })),
    getPolicyContext: vi.fn(async () => policy()),
  };
});

import { withIdempotency } from "@/infra/idempotency";
import { tenantFixtures } from "./support/idempotency-route-harness";

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] idempotency: the same user and key in another workspace never gets the first workspace's result", () => {
  const stamp = randomUUID().slice(0, 8);
  const fx = tenantFixtures(stamp);
  const freshTenant = fx.freshTenant;

  beforeAll(async () => {
    await db.$queryRaw`SELECT 1`;
  });

  afterAll(async () => {
    await fx.cleanup();
  });

  it("withIdempotency bound to { actor, workspace }: workspace B never receives workspace A's cached result", async () => {
    const a = await freshTenant(5);
    const wsB = randomUUID();
    await db.workspace.create({ data: { id: wsB, name: "Second workspace", slug: `idem-b-${stamp}` } });
    await db.workspaceMembership.create({ data: { userId: a.actorId, workspaceId: wsB, role: "admin", isActive: true } });
    try {
      const key = `ws-${stamp}`;
      const inA = await withIdempotency(key, "ws.proof", async () => ({ workspace: a.workspaceId }), { same: "body" }, { actorId: a.actorId, workspaceId: a.workspaceId });
      expect(inA.result).toEqual({ workspace: a.workspaceId });

      let ranInB = false;
      const inB = withIdempotency(key, "ws.proof", async () => { ranInB = true; return { workspace: wsB }; }, { same: "body" }, { actorId: a.actorId, workspaceId: wsB });
      await expect(inB).rejects.toMatchObject({ statusCode: 400 });
      expect(ranInB).toBe(false);

      const replayA = await withIdempotency(key, "ws.proof", async () => ({ workspace: "re-run" }), { same: "body" }, { actorId: a.actorId, workspaceId: a.workspaceId });
      expect(replayA).toEqual({ isNew: false, result: { workspace: a.workspaceId } });
    } finally {
      await db.workspaceMembership.deleteMany({ where: { workspaceId: wsB } });
      await db.workspace.deleteMany({ where: { id: wsB } });
    }
  }, 60_000);
});
