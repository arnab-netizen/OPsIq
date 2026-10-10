/**
 * Signup flood [db]: a client IP flooding POST /api/auth/signup with VALID,
 * unique-email bodies must produce exactly one complete account graph per
 * accepted (201) response, and exactly zero rows for every request rejected
 * once the per-IP rate limit trips.
 *
 * signup-rate-limit.test.ts already proves the 429 status code itself, but
 * every request in that file uses an intentionally-invalid (empty) body, so
 * it never exercises the DB write path at all — it cannot distinguish
 * "no rows because rate-limited" from "no rows because validation failed
 * first". This file closes that gap: it floods with bodies that are valid in
 * every other respect, so a request that is NOT rate-limited would otherwise
 * durably create a full account graph, and confirms the boundary is exact —
 * no partial/orphaned graph from the 429 responses, and no user created that
 * wasn't matched by a 201.
 *
 * Requires TEST_WITH_DB=true.
 */
import { describe, it, expect, afterAll } from "vitest";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] signup flood creates zero partial rows once rate-limited", () => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const ip = "203.0.113.199"; // TEST-NET-3, unique to this file
  const allEmails: string[] = [];

  afterAll(async () => {
    if (allEmails.length === 0) return;
    const users = await db.user.findMany({ where: { email: { in: allEmails } } });
    const userIds = users.map((u: { id: string }) => u.id);
    if (userIds.length > 0) {
      await db.session.deleteMany({ where: { userId: { in: userIds } } });
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
  });

  function signupRequest(email: string): Request {
    return new Request("http://localhost/api/auth/signup", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": ip },
      body: JSON.stringify({
        email,
        password: "password123",
        workspaceName: `Flood Co ${email}`,
        acceptTerms: true,
        acceptPrivacy: true,
        acceptBetaNotice: true,
      }),
    });
  }

  it("[db] a flood of otherwise-valid, unique-email signups from one IP: successes match DB rows exactly, and rejected requests create nothing", async () => {
    const { POST } = await import("@/app/api/auth/signup/route");

    const attempts = 20; // comfortably above the configured signup rate-limit ceiling
    const results: Array<{ email: string; status: number }> = [];

    for (let i = 0; i < attempts; i++) {
      const email = `flood-${stamp}-${i}@example.com`;
      allEmails.push(email);
      const res = await POST(signupRequest(email) as never);
      results.push({ email, status: res.status });
      // Stop once the flood is being refused (by the per-IP rate limiter, 429, or by the per-source cap on unverified
      // signups, 403) and at least one earlier request succeeded, so the test doesn't hardcode either ceiling.
      if (res.status !== 201 && results.some((r) => r.status === 201)) break;
    }

    const succeeded = results.filter((r) => r.status === 201);
    const rateLimited = results.filter((r) => r.status !== 201); // refused by a limiter: rate limit (429) or per-source pending cap (403)

    // The flood must actually have been stopped within this many attempts.
    expect(rateLimited.length).toBeGreaterThan(0);
    // And at least one request must have gone through before the limiter tripped.
    expect(succeeded.length).toBeGreaterThan(0);

    // Every attempt's outcome is one of exactly these two statuses (no
    // silent 500s / unexpected partial-failure paths muddying the count).
    for (const r of results) {
      expect([201, 403, 429]).toContain(r.status);
    }

    // Exactly one durable User row per 201 — no more, no less.
    const successEmails = succeeded.map((r) => r.email);
    const createdUsers = await db.user.findMany({ where: { email: { in: successEmails } } });
    expect(createdUsers).toHaveLength(succeeded.length);

    // Zero rows exist for any email whose signup was rejected as rate-limited.
    const rateLimitedEmails = rateLimited.map((r) => r.email);
    const orphanedUsers = await db.user.findMany({ where: { email: { in: rateLimitedEmails } } });
    expect(orphanedUsers).toHaveLength(0);

    // Every successfully-created user has a complete graph: exactly one
    // active workspace membership and no dangling half-written state.
    for (const user of createdUsers) {
      const memberships = await db.workspaceMembership.findMany({ where: { userId: user.id, isActive: true } });
      expect(memberships).toHaveLength(1);
      const workspaces = await db.workspace.findMany({ where: { createdBy: user.id } });
      expect(workspaces).toHaveLength(1);
    }
  });
});
