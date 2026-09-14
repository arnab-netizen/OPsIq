/**
 * [db] POST /api/auth/signup — admission-mode behavior against the real
 * route, with a real DB-backed PlatformSetting row (DB-authoritative, not
 * legacy fallback). Complements beta-cap.test.ts's mocked mode-boundary
 * tests and beta-cap-race.db.test.ts's legacy-fallback concurrency tests.
 *
 * Run: TEST_WITH_DB=true npx vitest run src/__tests__/api/auth/signup-admission-modes.db.test.ts
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";

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
      workspaceName: "Mode Test Co",
      acceptTerms: true,
      acceptPrivacy: true,
      acceptBetaNotice: true,
    }),
  });
}

function betaRequestBody(email: string) {
  return new Request("http://localhost/api/beta-requests", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": `10.0.0.${Math.floor(Math.random() * 250)}` },
    body: JSON.stringify({ email }),
  });
}

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] admission modes — real signup route, DB-authoritative settings", () => {
  const createdEmails: string[] = [];

  beforeEach(async () => {
    await db.platformSetting.deleteMany({ where: { id: "global" } });
  });

  afterEach(async () => {
    await db.platformSetting.deleteMany({ where: { id: "global" } });
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

  it("[db] CLOSED: signup is refused and no request/beta-request row is created", async () => {
    await db.platformSetting.create({ data: { id: "global", admissionMode: "CLOSED", capacityLimit: 50, updatedBy: "seed" } });
    const { POST } = await import("@/app/api/auth/signup/route");
    const email = `closed-signup-${Date.now()}@example.com`;
    createdEmails.push(email);

    const res = await POST(signupRequest(email) as never);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.reason).toBe("beta_disabled");
    const users = await db.user.findMany({ where: { email } });
    expect(users).toHaveLength(0);
  });

  it("[db] CLOSED: beta-request submission is ALSO refused", async () => {
    await db.platformSetting.create({ data: { id: "global", admissionMode: "CLOSED", capacityLimit: 50, updatedBy: "seed" } });
    const { POST } = await import("@/app/api/beta-requests/route");
    const email = `closed-request-${Date.now()}@example.com`;

    const res = await POST(betaRequestBody(email) as never);
    expect(res.status).toBe(403);
    const row = await db.betaRequest.findUnique({ where: { email } });
    expect(row).toBeNull();
    if (row) await db.betaRequest.delete({ where: { email } }).catch(() => undefined);
  });

  it("[db] WAITLIST: beta-request submission is allowed, but signup is refused", async () => {
    await db.platformSetting.create({ data: { id: "global", admissionMode: "WAITLIST", capacityLimit: 50, updatedBy: "seed" } });
    const email = `waitlist-${Date.now()}@example.com`;
    createdEmails.push(email);

    const { POST: submitBetaRequest } = await import("@/app/api/beta-requests/route");
    const requestRes = await submitBetaRequest(betaRequestBody(email) as never);
    expect(requestRes.status).toBe(200);
    const row = await db.betaRequest.findUnique({ where: { email } });
    expect(row).not.toBeNull();

    const { POST: signup } = await import("@/app/api/auth/signup/route");
    const signupRes = await signup(signupRequest(email) as never);
    expect(signupRes.status).toBe(403);
    const users = await db.user.findMany({ where: { email } });
    expect(users).toHaveLength(0);

    await db.betaRequest.delete({ where: { email } }).catch(() => undefined);
  });

  it("[db] WAITLIST: even an INVITED request cannot sign up — mode overrides individual invited status", async () => {
    await db.platformSetting.create({ data: { id: "global", admissionMode: "WAITLIST", capacityLimit: 50, updatedBy: "seed" } });
    const email = `waitlist-invited-${Date.now()}@example.com`;
    createdEmails.push(email);
    await db.betaRequest.create({ data: { id: crypto.randomUUID(), email, status: "INVITED", invitedAt: new Date() } });

    const { POST: signup } = await import("@/app/api/auth/signup/route");
    const res = await signup(signupRequest(email) as never);
    expect(res.status).toBe(403);

    await db.betaRequest.delete({ where: { email } }).catch(() => undefined);
  });

  it("[db] OPEN_BETA: an uninvited email can sign up, subject to capacity", async () => {
    await db.platformSetting.create({ data: { id: "global", admissionMode: "OPEN_BETA", capacityLimit: 50, updatedBy: "seed" } });
    const email = `open-beta-${Date.now()}@example.com`;
    createdEmails.push(email);

    const { POST } = await import("@/app/api/auth/signup/route");
    const res = await POST(signupRequest(email) as never);
    expect(res.status).toBe(201);
    const workspace = await db.workspace.findFirst({ where: { createdBy: (await db.user.findUnique({ where: { email } }))?.id } });
    expect(workspace?.signupSource).toBe("PUBLIC_BETA"); // not invited -> PUBLIC_BETA, not CONTROLLED_BETA_INVITE
  });

  it("[db] INVITE_ONLY: an invited signup is tagged CONTROLLED_BETA_INVITE, not PUBLIC_BETA", async () => {
    await db.platformSetting.create({ data: { id: "global", admissionMode: "INVITE_ONLY", capacityLimit: 50, updatedBy: "seed" } });
    const email = `invite-only-tagged-${Date.now()}@example.com`;
    createdEmails.push(email);
    await db.betaRequest.create({ data: { id: crypto.randomUUID(), email, status: "INVITED", invitedAt: new Date() } });

    const { POST } = await import("@/app/api/auth/signup/route");
    const res = await POST(signupRequest(email) as never);
    expect(res.status).toBe(201);
    const user = await db.user.findUnique({ where: { email } });
    const workspace = await db.workspace.findFirst({ where: { createdBy: user?.id } });
    expect(workspace?.signupSource).toBe("CONTROLLED_BETA_INVITE");

    await db.betaRequest.delete({ where: { email } }).catch(() => undefined);
  });
});
