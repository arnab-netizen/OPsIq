/**
 * Two-tenant hostile regression suite [db] — open-beta hardening.
 *
 * Registers two independent beta users/workspaces (A and B) via the REAL
 * POST /api/auth/signup route (with the three mandatory consent fields),
 * verifies + mints a session for each exactly as POST /api/auth/verify-email
 * would have (see signup-owner-capability-scoping.db.test.ts for the
 * established in-memory cookie-jar pattern this file reuses), then drives
 * REAL owner-mode route handlers directly (no HTTP layer) to prove that:
 *
 *   1. A cannot read B's data via a real owner-mode route B has data in.
 *   2. B cannot read A's data (symmetric).
 *   3. A foreign workspaceId injected into a QUERY STRING param has no
 *      effect — the canonical enforcement layer never reads it.
 *   4. A foreign workspaceId injected into a JSON BODY field has no effect.
 *   5. A foreign workspaceId injected into the `x-workspace-id` HEADER has
 *      no effect — this is the DYNAMIC/runtime counterpart to the existing
 *      STATIC source-inspection test in
 *      cross-tenant-workspace-header.test.ts (which only proves route
 *      source code never reads that header; this proves it empirically
 *      against real routes with real live sessions).
 *   6. Audit events emitted for A's actions are only ever visible when
 *      queried scoped to A's workspace, never B's (via queryAuditEvents).
 *   7. Resolving A's session always yields A's own verifiedWorkspaceId and
 *      verifiedActorId, never B's, regardless of any other request input —
 *      asserted directly against `ctx` fields via a minimal
 *      withCanonicalEnforcement-wrapped test handler, not merely inferred
 *      from response bodies.
 *
 * Surfaces used: GET/POST /api/owner/goals, GET/POST /api/owner/tasks (both
 * real, unmodified, canonically-enforced owner-mode routes with genuine
 * workspace-scoped persistence) — chosen because between them they cover a
 * GET-with-query-params route, a POST-with-JSON-body route, and audited
 * mutations. There is no file-upload/attachment surface in this codebase
 * exercised by a plain owner-mode route in a way that would add a materially
 * different guarantee over goals/tasks, so sub-claim coverage is limited to
 * these two representative surfaces per the task's own guidance to prefer
 * accuracy over inventing a surface.
 *
 * Requires TEST_WITH_DB=true.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { queryAuditEvents } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";

const SESSION_COOKIE_NAME = "opsiq_session";

// Shared in-memory cookie jar, swapped between "acting as A" and "acting as
// B" — same technique as signup-owner-capability-scoping.db.test.ts.
const jar: { token: string | undefined } = { token: undefined };

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name === SESSION_COOKIE_NAME && jar.token ? { value: jar.token } : undefined),
    set: (_name: string, value: string) => {
      jar.token = value;
    },
  }),
}));

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] cross-tenant hostile regression: two live workspaces", () => {
  let userA = "";
  let wsA = "";
  let tokenA = "";
  let userB = "";
  let wsB = "";
  let tokenB = "";

  async function signupAndActivate(workspaceName: string, emailPrefix: string) {
    const { POST } = await import("@/app/api/auth/signup/route");
    const email = `${emailPrefix}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
    const req = new Request("http://localhost/api/auth/signup", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email,
        password: "password123",
        workspaceName,
        acceptTerms: true,
        acceptPrivacy: true,
        acceptBetaNotice: true,
      }),
    });
    const res = await (POST(req as never) as Promise<Response>);
    expect(res.status).toBe(201);
    const json = await res.json();
    const userId = json.user.id as string;
    const workspaceId = json.workspace.id as string;

    // Simulate "this account already redeemed its verification link" —
    // exactly the state POST /api/auth/verify-email would have produced.
    const sessionToken = `hostile-${emailPrefix}-${randomUUID()}`;
    await db.user.update({ where: { id: userId }, data: { emailVerifiedAt: new Date() } });
    await db.session.create({
      data: {
        id: randomUUID(),
        userId,
        token: sessionToken,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });
    return { userId, workspaceId, sessionToken };
  }

  function actingAs(token: string): void {
    jar.token = token;
  }

  function getRequest(path: string, extraHeaders?: Record<string, string>): NextRequest {
    return new NextRequest(`https://example.com${path}`, {
      method: "GET",
      headers: extraHeaders,
    });
  }

  function postRequest(path: string, body: Record<string, unknown>, extraHeaders?: Record<string, string>): NextRequest {
    return new NextRequest(`https://example.com${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", ...extraHeaders },
      body: JSON.stringify(body),
    });
  }

  async function getGoals() {
    const { GET } = await import("@/app/api/owner/goals/route");
    const res = await GET(getRequest("/api/owner/goals"), { params: Promise.resolve({}) } as never);
    return { status: res.status, json: await res.json() };
  }

  async function getTasks(path = "/api/owner/tasks", headers?: Record<string, string>) {
    const { GET } = await import("@/app/api/owner/tasks/route");
    const res = await GET(getRequest(path, headers), { params: Promise.resolve({}) } as never);
    return { status: res.status, json: await res.json() };
  }

  async function postGoal(body: Record<string, unknown>, headers?: Record<string, string>) {
    const { POST } = await import("@/app/api/owner/goals/route");
    const res = await POST(postRequest("/api/owner/goals", body, headers), { params: Promise.resolve({}) } as never);
    return { status: res.status, json: await res.json() };
  }

  async function postTask(body: Record<string, unknown>) {
    const { POST } = await import("@/app/api/owner/tasks/route");
    const res = await POST(postRequest("/api/owner/tasks", body), { params: Promise.resolve({}) } as never);
    return { status: res.status, json: await res.json() };
  }

  beforeAll(async () => {
    const a = await signupAndActivate("Hostile Tenant A", "hostile-a");
    userA = a.userId;
    wsA = a.workspaceId;
    tokenA = a.sessionToken;

    const b = await signupAndActivate("Hostile Tenant B", "hostile-b");
    userB = b.userId;
    wsB = b.workspaceId;
    tokenB = b.sessionToken;

    // Seed each tenant with its own private data via the REAL POST routes,
    // acting as that tenant's own genuine session.
    actingAs(tokenA);
    const goalA = await postGoal({
      targetType: "PROFIT",
      targetAmount: 111111,
      // Explicit currency: these workspaces have no business to inherit one from (BIV-06).
      targetCurrency: "INR",
      targetDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
    });
    expect(goalA.status).toBe(201);
    const taskA = await postTask({ title: "A's private task" });
    expect(taskA.status).toBe(201);

    actingAs(tokenB);
    const goalB = await postGoal({
      targetType: "REVENUE",
      targetAmount: 222222,
      // Explicit currency: these workspaces have no business to inherit one from (BIV-06).
      targetCurrency: "INR",
      targetDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
    });
    expect(goalB.status).toBe(201);
    const taskB = await postTask({ title: "B's private task" });
    expect(taskB.status).toBe(201);
  });

  afterAll(async () => {
    jar.token = undefined;
    const workspaceIds = [wsA, wsB].filter(Boolean);
    const userIds = [userA, userB].filter(Boolean);
    if (workspaceIds.length > 0) {
      await db.auditEvent.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
      await db.ownerGoal.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
      await db.delegatedTask.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
    }
    if (userIds.length > 0) {
      await db.session.deleteMany({ where: { userId: { in: userIds } } });
      await db.userRoleAssignment.deleteMany({ where: { userId: { in: userIds } } });
      await db.workspaceMembership.deleteMany({ where: { userId: { in: userIds } } });
    }
    if (workspaceIds.length > 0) {
      await db.workspace.deleteMany({ where: { id: { in: workspaceIds } } });
    }
    if (userIds.length > 0) {
      await db.user.deleteMany({ where: { id: { in: userIds } } });
    }
  });

  it("[1] A cannot read B's data via real owner-mode routes (goals, tasks)", async () => {
    actingAs(tokenA);

    const goals = await getGoals();
    expect(goals.status).toBe(200);
    expect(goals.json.goal?.targetAmount).toBe(111111);
    expect(goals.json.goal?.targetAmount).not.toBe(222222);

    const tasks = await getTasks();
    expect(tasks.status).toBe(200);
    expect(tasks.json.count).toBe(1);
    expect(tasks.json.tasks[0].title).toBe("A's private task");
    expect(tasks.json.tasks.some((t: { title: string }) => t.title === "B's private task")).toBe(false);
  });

  it("[2] B cannot read A's data via real owner-mode routes (symmetric)", async () => {
    actingAs(tokenB);

    const goals = await getGoals();
    expect(goals.status).toBe(200);
    expect(goals.json.goal?.targetAmount).toBe(222222);
    expect(goals.json.goal?.targetAmount).not.toBe(111111);

    const tasks = await getTasks();
    expect(tasks.status).toBe(200);
    expect(tasks.json.count).toBe(1);
    expect(tasks.json.tasks[0].title).toBe("B's private task");
    expect(tasks.json.tasks.some((t: { title: string }) => t.title === "A's private task")).toBe(false);
  });

  it("[3] a foreign workspaceId injected into the QUERY STRING has no effect on a real, live request", async () => {
    actingAs(tokenA);
    // A makes a real, authenticated request to her own endpoint, but tries
    // to smuggle B's workspace via a query string param.
    const tasks = await getTasks(`/api/owner/tasks?workspaceId=${wsB}&status=`);
    expect(tasks.status).toBe(200);
    expect(tasks.json.count).toBe(1);
    expect(tasks.json.tasks[0].title).toBe("A's private task");
  });

  it("[4] a foreign workspaceId injected into the JSON BODY has no effect on a real, live request", async () => {
    actingAs(tokenA);
    // Extra, schema-unrecognized `workspaceId` field alongside legitimate
    // goal fields. parseRequestBody (src/lib/validation.ts) rejects ANY
    // unknown field on a plain ZodObject schema outright — createGoalSchema
    // does not declare `workspaceId`, so this request never even reaches the
    // point where a workspace scope could be applied. That is a STRONGER
    // guarantee than silent stripping: the injection attempt is flatly
    // refused, and it is impossible for it to land under B (or anywhere).
    const rejected = await postGoal({
      targetType: "REVENUE",
      targetAmount: 999999,
      // Explicit currency: these workspaces have no business to inherit one from (BIV-06).
      targetCurrency: "INR",
      targetDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      workspaceId: wsB,
    });
    expect(rejected.status).toBe(400);

    // No goal with this payload's amount exists anywhere — not under B, not
    // under A, not under any workspace — the request was rejected before any
    // write was attempted.
    const leaked = await db.ownerGoal.findFirst({ where: { targetAmount: 999999 } });
    expect(leaked).toBeNull();

    // A legitimate request with the SAME fields minus the foreign
    // workspaceId succeeds and is scoped to A's own verified workspace, not
    // B's — confirming the route works correctly once the injected field is
    // removed, and that ctx.verifiedWorkspaceId (never a body field) is what
    // determines the scope.
    const created = await postGoal({
      targetType: "REVENUE",
      targetAmount: 999999,
      // Explicit currency: these workspaces have no business to inherit one from (BIV-06).
      targetCurrency: "INR",
      targetDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
    });
    expect(created.status).toBe(201);
    const goalId = created.json.goalId as string;

    const row = await db.ownerGoal.findUnique({ where: { id: goalId } });
    expect(row?.workspaceId).toBe(wsA);
    expect(row?.workspaceId).not.toBe(wsB);

    // B never sees it.
    actingAs(tokenB);
    const bGoals = await getGoals();
    expect(bGoals.json.goal?.targetAmount).not.toBe(999999);

    // A does (it superseded her earlier active goal).
    actingAs(tokenA);
    const aGoals = await getGoals();
    expect(aGoals.json.goal?.targetAmount).toBe(999999);
  });

  it("[5] a foreign workspaceId injected into the x-workspace-id HEADER has no effect on a real, live request (dynamic runtime proof)", async () => {
    actingAs(tokenA);
    const tasks = await getTasks("/api/owner/tasks", { "x-workspace-id": wsB });
    expect(tasks.status).toBe(200);
    expect(tasks.json.count).toBe(1);
    expect(tasks.json.tasks[0].title).toBe("A's private task");
    expect(tasks.json.tasks.some((t: { title: string }) => t.title === "B's private task")).toBe(false);
  });

  it("[6] audit events for A's actions are only ever queryable scoped to A's workspace, never B's", async () => {
    const aEvents = await queryAuditEvents({ workspaceId: wsA, eventName: AUDIT_EVENTS.OWNER_GOAL_CREATED });
    expect(aEvents.length).toBeGreaterThan(0);
    expect(aEvents.every((e: { actorId: string | null }) => e.actorId === userA)).toBe(true);
    expect(aEvents.some((e: { actorId: string | null }) => e.actorId === userB)).toBe(false);

    const bEvents = await queryAuditEvents({ workspaceId: wsB, eventName: AUDIT_EVENTS.OWNER_GOAL_CREATED });
    expect(bEvents.length).toBeGreaterThan(0);
    expect(bEvents.every((e: { actorId: string | null }) => e.actorId === userB)).toBe(true);
    expect(bEvents.some((e: { actorId: string | null }) => e.actorId === userA)).toBe(false);

    // Querying A's workspace for TASK_ASSIGNED events must never surface B's task-assignment event.
    const aTaskEvents = await queryAuditEvents({ workspaceId: wsA, eventName: AUDIT_EVENTS.TASK_ASSIGNED });
    expect(aTaskEvents.every((e: { actorId: string | null }) => e.actorId === userA)).toBe(true);
  });

  it("[7] resolving A's session always yields A's own verifiedWorkspaceId/actorId, never B's, regardless of other request input", async () => {
    const captured: { workspaceId?: string; actorId?: string }[] = [];
    const probe = withCanonicalEnforcement(
      async (ctx: CanonicalAuthContext) => {
        captured.push({ workspaceId: ctx.verifiedWorkspaceId, actorId: ctx.verifiedActorId });
        return { ok: true };
      },
      { requireCapabilities: [CAPABILITIES.OWNER_VIEW], requireWorkspace: true }
    );

    actingAs(tokenA);
    // A real, live session for A, with a foreign workspaceId smuggled into
    // the header AND the query string simultaneously.
    const req = new NextRequest(`https://example.com/api/owner/__probe?workspaceId=${wsB}`, {
      method: "GET",
      headers: { "x-workspace-id": wsB },
    });
    const res = await probe(req, { params: Promise.resolve({}) });
    expect(res.status).toBe(200);
    expect(captured).toHaveLength(1);
    expect(captured[0].actorId).toBe(userA);
    expect(captured[0].actorId).not.toBe(userB);
    expect(captured[0].workspaceId).toBe(wsA);
    expect(captured[0].workspaceId).not.toBe(wsB);
  });
});
