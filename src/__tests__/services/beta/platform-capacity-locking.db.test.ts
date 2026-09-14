/**
 * Real-Postgres proof that signup admission and admin capacity/mode updates
 * share the SAME pg_advisory_xact_lock and therefore cannot race each other
 * into an inconsistent state. Exact ordering under test (see
 * platform-settings.service.ts's module doc and reservePublicBetaCapacity):
 * BEGIN -> LOCK -> READ SETTINGS -> READ COUNT -> VALIDATE -> WRITE -> COMMIT.
 *
 * "signup vs signup" under the legacy env fallback is already covered by
 * beta-cap-race.db.test.ts; this file covers the three scenarios that need a
 * real, DB-authoritative PlatformSetting row: signup vs capacity decrease,
 * signup vs capacity increase, and admin update vs admin update.
 */
import { describe, it, expect, afterEach, beforeEach, beforeAll, afterAll, vi } from "vitest";
import { db } from "@/lib/db";
import { randomUUID } from "crypto";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { updatePlatformSettings } from "@/services/beta/platform-settings.service";

const mockCookieSet = vi.fn();
vi.mock("next/headers", () => ({
  cookies: vi.fn().mockResolvedValue({ set: mockCookieSet }),
}));

function signupRequest(email: string): Request {
  return new Request("http://localhost/api/auth/signup", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email,
      password: "password123",
      workspaceName: "Lock Race Co",
      acceptTerms: true,
      acceptPrivacy: true,
      acceptBetaNotice: true,
    }),
  });
}

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] platform capacity — shared advisory lock", () => {
  const createdEmails: string[] = [];
  const seededWorkspaceIds: string[] = [];
  // AuditEvent.actorId carries a real FK to users.id — platform-setting
  // change events are pre-workspace, so they now genuinely persist (see
  // Administration V1's pre-workspace-audit-durability fix); real User rows
  // must exist for these actor ids.
  const ADMIN_1 = "22222222-2222-4222-8222-222222222221";
  const ADMIN_2 = "22222222-2222-4222-8222-222222222222";

  beforeAll(async () => {
    await db.user.upsert({
      where: { id: ADMIN_1 },
      update: {},
      create: { id: ADMIN_1, email: `lockrace-admin1-${ADMIN_1}@example.com`, updatedAt: new Date() },
    });
    await db.user.upsert({
      where: { id: ADMIN_2 },
      update: {},
      create: { id: ADMIN_2, email: `lockrace-admin2-${ADMIN_2}@example.com`, updatedAt: new Date() },
    });
  });

  afterAll(async () => {
    await db.auditEvent.deleteMany({ where: { actorId: { in: [ADMIN_1, ADMIN_2] } } }).catch(() => undefined);
    await db.user.deleteMany({ where: { id: { in: [ADMIN_1, ADMIN_2] } } }).catch(() => undefined);
  });

  beforeEach(async () => {
    // Ensure no leftover row from a previous run/file.
    await db.platformSetting.deleteMany({ where: { id: "global" } });
  });

  afterEach(async () => {
    await db.platformSetting.deleteMany({ where: { id: "global" } });
    if (seededWorkspaceIds.length > 0) {
      await db.workspace.deleteMany({ where: { id: { in: seededWorkspaceIds } } });
      seededWorkspaceIds.length = 0;
    }
    if (createdEmails.length > 0) {
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
    }
  });

  async function seedSettings(admissionMode: string, capacityLimit: number) {
    await db.platformSetting.create({
      data: { id: "global", admissionMode, capacityLimit, updatedBy: "test-seed" },
    });
  }

  async function seedExistingBetaWorkspaces(count: number) {
    for (let i = 0; i < count; i++) {
      const id = randomUUID();
      seededWorkspaceIds.push(id);
      await db.workspace.create({
        data: { id, name: `Preexisting ${i}`, slug: `preexisting-${id.slice(0, 8)}`, signupSource: "PUBLIC_BETA" },
      });
    }
  }

  it("[db] signup vs capacity decrease: final state never has count exceeding the final limit", async () => {
    await seedSettings("OPEN_BETA", 5);
    await seedExistingBetaWorkspaces(4); // one slot left at limit=5

    const { POST } = await import("@/app/api/auth/signup/route");
    const email = `lockrace-dec-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
    createdEmails.push(email);

    const [signupRes, decreaseRes] = await Promise.allSettled([
      POST(signupRequest(email) as never),
      updatePlatformSettings({ actorId: ADMIN_1, capacityLimit: 4 }),
    ]);

    const finalCount = await db.workspace.count({ where: { signupSource: { in: ["PUBLIC_BETA", "CONTROLLED_BETA_INVITE"] } } });
    const finalSettings = await db.platformSetting.findUniqueOrThrow({ where: { id: "global" } });
    // The core invariant, true under EITHER lock ordering: if the decrease
    // wins the lock first, it sees count=4 and allows newLimit=4, and the
    // signup then correctly refuses at limit=4/count=4. If the signup wins
    // first, it admits (count becomes 5), and the decrease then correctly
    // refuses (newLimit=4 < utilization=5). Either way, capacity is never
    // oversubscribed.
    expect(finalCount).toBeLessThanOrEqual(finalSettings.capacityLimit);
    void signupRes;
    void decreaseRes;
  });

  it("[db] signup vs capacity increase: a signup racing a concurrent increase never oversubscribes the (possibly-new) limit", async () => {
    await seedSettings("OPEN_BETA", 1);
    await seedExistingBetaWorkspaces(1); // already at limit=1

    const { POST } = await import("@/app/api/auth/signup/route");
    const email = `lockrace-inc-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
    createdEmails.push(email);

    const [signupRes] = await Promise.all([
      POST(signupRequest(email) as never),
      updatePlatformSettings({ actorId: ADMIN_1, capacityLimit: 2 }),
    ]);

    const finalCount = await db.workspace.count({ where: { signupSource: { in: ["PUBLIC_BETA", "CONTROLLED_BETA_INVITE"] } } });
    const finalSettings = await db.platformSetting.findUniqueOrThrow({ where: { id: "global" } });
    expect(finalCount).toBeLessThanOrEqual(finalSettings.capacityLimit);
    // Whichever ran first: either the signup was refused under the old
    // limit=1 (count stays 1) or admitted under the new limit=2 (count
    // becomes 2) — both are correct; a torn read producing count=2 under a
    // still-1 limit, or any other combination violating the invariant above,
    // is what this test guards against.
    expect(signupRes.status === 201 || signupRes.status === 403).toBe(true);
  });

  it("[db] admin update vs admin update: two concurrent capacity writes serialize cleanly — both succeed in some order, final row is exactly one of the two target values with no corruption", async () => {
    await seedSettings("OPEN_BETA", 10);

    const results = await Promise.allSettled([
      updatePlatformSettings({ actorId: ADMIN_1, capacityLimit: 20 }),
      updatePlatformSettings({ actorId: ADMIN_2, capacityLimit: 30 }),
    ]);

    const finalSettings = await db.platformSetting.findUniqueOrThrow({ where: { id: "global" } });
    // The advisory lock fully serializes both writes (each reads `current`
    // fresh from INSIDE its own locked transaction, so there is no stale
    // read for the optimistic version check to catch) — both legitimately
    // succeed, one after the other; the final value is whichever committed
    // last, never a blended/corrupted value.
    expect([20, 30]).toContain(finalSettings.capacityLimit);
    expect(finalSettings.version).toBe(2); // two real, sequential increments from the seeded row
    expect(results.every((r) => r.status === "fulfilled")).toBe(true);
  });

  it("[db] admin capacity update is refused below current utilization, even under the shared lock", async () => {
    await seedSettings("OPEN_BETA", 10);
    await seedExistingBetaWorkspaces(5);

    await expect(updatePlatformSettings({ actorId: ADMIN_1, capacityLimit: 4 })).rejects.toThrow();
    const finalSettings = await db.platformSetting.findUniqueOrThrow({ where: { id: "global" } });
    expect(finalSettings.capacityLimit).toBe(10); // unchanged
  });
});
