/**
 * Beta workspace cap — real-Postgres concurrency proof (DB-backed).
 *
 * This is the half of the cap's coverage that beta-cap.test.ts's mocked
 * fake-tx cannot prove: that two GENUINELY concurrent signup transactions,
 * racing against a real Postgres database, cannot both succeed once the cap
 * is reached. A mocked test can only prove the boundary arithmetic is
 * correct; only a real database can prove pg_advisory_xact_lock actually
 * serializes the concurrent transactions rather than letting both read the
 * same pre-increment count.
 *
 * PUBLIC_BETA_WORKSPACE_CAP is read once at module load (correct for a real
 * process, whose env is static for its lifetime) — this test sets it to a
 * small number and uses vi.resetModules() plus a dynamic re-import so the
 * whole signup -> beta.ts -> beta-cap.ts chain picks up the overridden value,
 * rather than the default of 50 (which would make a real concurrency proof
 * impractically slow to seed).
 */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { db } from "@/lib/db";
import { randomUUID } from "crypto";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";

const mockCookieSet = vi.fn();
vi.mock("next/headers", () => ({
  cookies: vi.fn().mockResolvedValue({ set: mockCookieSet }),
}));

const TEST_CAP = 2;

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] public-beta workspace cap — real concurrency", () => {
  const createdEmails: string[] = [];
  const seededWorkspaceIds: string[] = [];
  const originalCapEnv = process.env.PUBLIC_BETA_WORKSPACE_CAP;

  beforeEach(() => {
    process.env.PUBLIC_BETA_WORKSPACE_CAP = String(TEST_CAP);
    vi.resetModules();
  });

  afterEach(async () => {
    if (originalCapEnv === undefined) delete process.env.PUBLIC_BETA_WORKSPACE_CAP;
    else process.env.PUBLIC_BETA_WORKSPACE_CAP = originalCapEnv;
    vi.resetModules();

    if (seededWorkspaceIds.length > 0) {
      await db.workspace.deleteMany({ where: { id: { in: seededWorkspaceIds } } });
      seededWorkspaceIds.length = 0;
    }
    if (createdEmails.length === 0) return;
    const users = await db.user.findMany({ where: { email: { in: createdEmails } } });
    const userIds = users.map((u: { id: string }) => u.id);
    if (userIds.length > 0) {
      await db.userRoleAssignment.deleteMany({ where: { userId: { in: userIds } } });
      const memberships = await db.workspaceMembership.findMany({ where: { userId: { in: userIds } } });
      const workspaceIds = memberships.map((m: { workspaceId: string }) => m.workspaceId);
      await db.workspaceMembership.deleteMany({ where: { userId: { in: userIds } } });
      await db.auditEvent.deleteMany({
        where: { OR: [{ actorId: { in: userIds } }, { workspaceId: { in: workspaceIds.length > 0 ? workspaceIds : [""] } }] },
      });
      if (workspaceIds.length > 0) await db.workspace.deleteMany({ where: { id: { in: workspaceIds } } });
      await db.user.deleteMany({ where: { id: { in: userIds } } });
    }
    createdEmails.length = 0;
  });

  /** Seed N pre-existing PUBLIC_BETA-tagged workspaces directly, simulating prior real signups without going through the route N times. */
  async function seedExistingBetaWorkspaces(count: number) {
    for (let i = 0; i < count; i++) {
      const id = randomUUID();
      seededWorkspaceIds.push(id);
      await db.workspace.create({
        data: { id, name: `Preexisting Beta ${i}`, slug: `preexisting-beta-${id.slice(0, 8)}`, signupSource: "PUBLIC_BETA" },
      });
    }
  }

  function signupRequest(email: string): Request {
    return new Request("http://localhost/api/auth/signup", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email,
        password: "password123",
        workspaceName: "Race Co",
        acceptTerms: true,
        acceptPrivacy: true,
        acceptBetaNotice: true,
      }),
    });
  }

  it("[db] one slot remaining: two concurrent signups both racing for it produce exactly one success", async () => {
    await seedExistingBetaWorkspaces(TEST_CAP - 1); // exactly one slot left

    const { POST } = await import("@/app/api/auth/signup/route");
    const emailA = `cap-race-a-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
    const emailB = `cap-race-b-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
    createdEmails.push(emailA, emailB);

    const [resA, resB] = await Promise.all([
      POST(signupRequest(emailA) as never),
      POST(signupRequest(emailB) as never),
    ]);

    const statuses = [resA.status, resB.status].sort();
    // Exactly one 201 (succeeded) and one 403 (cap reached) — never two 201s.
    expect(statuses).toEqual([201, 403]);

    const totalBetaWorkspaces = await db.workspace.count({ where: { signupSource: "PUBLIC_BETA" } });
    expect(totalBetaWorkspaces).toBe(TEST_CAP);
  });

  it("[db] cap already reached: a fresh signup is refused and creates no new workspace", async () => {
    await seedExistingBetaWorkspaces(TEST_CAP);

    const { POST } = await import("@/app/api/auth/signup/route");
    const email = `cap-full-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
    createdEmails.push(email);

    const res = await POST(signupRequest(email) as never);
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.reason).toBe("beta_cap_reached");

    const users = await db.user.findMany({ where: { email } });
    expect(users).toHaveLength(0);
    const totalBetaWorkspaces = await db.workspace.count({ where: { signupSource: "PUBLIC_BETA" } });
    expect(totalBetaWorkspaces).toBe(TEST_CAP);
  });

  it("[db] N concurrent signups against a cap of 2, starting from zero, admit exactly 2", async () => {
    const { POST } = await import("@/app/api/auth/signup/route");
    const emails = Array.from({ length: 5 }, (_, i) => `cap-flood-${i}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`);
    createdEmails.push(...emails);

    const results = await Promise.all(emails.map((email) => POST(signupRequest(email) as never)));
    const succeeded = results.filter((r) => r.status === 201);
    const refused = results.filter((r) => r.status === 403);
    expect(succeeded).toHaveLength(TEST_CAP);
    expect(refused).toHaveLength(emails.length - TEST_CAP);

    const totalBetaWorkspaces = await db.workspace.count({ where: { signupSource: "PUBLIC_BETA" } });
    expect(totalBetaWorkspaces).toBe(TEST_CAP);
  });
});
