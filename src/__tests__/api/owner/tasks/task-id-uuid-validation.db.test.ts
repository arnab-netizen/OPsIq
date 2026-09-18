/**
 * Owner task-ID routes — malformed-UUID governance, REAL routes + REAL Postgres.
 * `[db]`-gated (TEST_WITH_DB=true).
 *
 * LIVE-PROVEN FAILURE (production): the Tasks page's "+ New Task" CTA links to
 * /owner/tasks/new. Next's dynamic sibling /owner/tasks/[taskId] matched "new" as a taskId and
 * called GET /api/owner/tasks/new, which passed "new" straight into
 * `db.delegatedTask.findFirst({ where: { id: taskId, ... } })` — a UUID-backed column — and Postgres
 * threw `invalid input syntax for type uuid: "new"`. That raw Prisma exception was unclassified, so
 * canonical-route-enforcement.ts's own generic 500 fallback (which allowlists and forwards
 * prismaCode/prismaClientVersion/driverAdapterErrorMessage for diagnostics — see its own doc
 * comment) surfaced those Prisma-shaped internals directly to the client.
 *
 * FIX: every owner task-ID route now validates `params.taskId` against `uuidSchema` before ANY
 * database access, via the same `parseOrThrow` pattern already used elsewhere in this repo
 * (engagements/[engagementId]/route.ts). `parseOrThrow` throws `ValidationError`, a known AppError
 * subclass canonical-route-enforcement.ts already classifies as a safe 4xx — so the Prisma call
 * (and therefore the raw-error fallback path) is never reached at all for a malformed id.
 *
 * Run: TEST_WITH_DB=true npx vitest run src/__tests__/api/owner/tasks/task-id-uuid-validation.db.test.ts
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { randomUUID } from "crypto";
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";

let testActorIdForMock = randomUUID();
let testWorkspaceIdForMock = randomUUID();

// Same auth-bypass pattern as process-execution-record-outcome-route.db.test.ts.
vi.mock("@/services/auth", () => ({
  getSessionFact: vi.fn(async () => ({
    valid: true,
    session: { user: { id: testActorIdForMock, email: "test@example.com", name: "Test User", isActive: true }, sessionId: "test-session", expiresAt: new Date(Date.now() + 86400000) },
    invalidReason: undefined,
  })),
  getSession: vi.fn(async () => ({ user: { id: testActorIdForMock, email: "test@example.com", name: "Test User", isActive: true }, sessionId: "test-session", expiresAt: new Date(Date.now() + 86400000) })),
  getPolicyContextFact: vi.fn(async () => ({
    valid: true,
    policy: { userId: testActorIdForMock, roles: [{ role: "admin_or_portfolio_manager", scope: "workspace", scopeId: testWorkspaceIdForMock }], engagementMemberships: [] },
    invalidReason: undefined,
  })),
  getPolicyContext: vi.fn(async () => ({ userId: testActorIdForMock, roles: [{ role: "admin_or_portfolio_manager", scope: "workspace", scopeId: testWorkspaceIdForMock }], engagementMemberships: [] })),
}));

function makeGetRequest(path: string): NextRequest {
  return new NextRequest(`https://example.com${path}`, { headers: { "content-type": "application/json" } });
}
function makePatchRequest(path: string, body: unknown): NextRequest {
  return new NextRequest(`https://example.com${path}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}
function makePostRequest(path: string, body: unknown): NextRequest {
  return new NextRequest(`https://example.com${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}

const LEAK_PATTERNS = [/PrismaClientKnownRequestError/i, /\bP2007\b/i, /prismaClientVersion/i, /driverAdapterErrorMessage/i, /invalid input syntax for type uuid/i, /at\s+\S+\s+\(.*:\d+:\d+\)/];

function assertNoLeak(bodyText: string) {
  for (const pattern of LEAK_PATTERNS) {
    expect(bodyText).not.toMatch(pattern);
  }
}

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] Owner task-ID routes — malformed UUID governance, REAL route + REAL Postgres", () => {
  let workspaceId: string;
  let actorId: string;

  beforeEach(async () => {
    actorId = randomUUID();
    workspaceId = randomUUID();
    testActorIdForMock = actorId;
    testWorkspaceIdForMock = workspaceId;
    await db.user.create({ data: { id: actorId, email: `${actorId}@example.com`, updatedAt: new Date() } });
    await db.workspace.create({ data: { id: workspaceId, name: "WS Task ID Validation", slug: `ws-tiv-${workspaceId.substring(0, 8)}` } });
    await db.workspaceMembership.create({ data: { userId: actorId, workspaceId, role: "admin", isActive: true } });
  });

  afterEach(async () => {
    await db.delegatedTask.deleteMany({ where: { workspaceId } });
    await db.workspaceMembership.deleteMany({ where: { userId: actorId } });
    await db.workspace.deleteMany({ where: { id: workspaceId } });
    await db.user.deleteMany({ where: { id: actorId } });
  });

  it('1. GET /api/owner/tasks/new -> governed 400, never 500, never a Prisma leak (the exact live-proven CTA bug)', async () => {
    const { GET } = await import("@/app/api/owner/tasks/[taskId]/route");
    const response = await GET(makeGetRequest("/api/owner/tasks/new"), { params: Promise.resolve({ taskId: "new" }) });
    expect(response.status).not.toBe(500);
    expect(response.status).toBe(400);
    const bodyText = await response.text();
    assertNoLeak(bodyText);
  });

  it("2. GET /api/owner/tasks/garbage -> governed result, no Prisma leak", async () => {
    const { GET } = await import("@/app/api/owner/tasks/[taskId]/route");
    const response = await GET(makeGetRequest("/api/owner/tasks/garbage"), { params: Promise.resolve({ taskId: "garbage" }) });
    expect(response.status).toBe(400);
    assertNoLeak(await response.text());
  });

  it("3. PATCH /api/owner/tasks/new/status -> governed 400, never a Prisma leak", async () => {
    const { PATCH } = await import("@/app/api/owner/tasks/[taskId]/status/route");
    const response = await PATCH(makePatchRequest("/api/owner/tasks/new/status", { to: "IN_PROGRESS" }), { params: Promise.resolve({ taskId: "new" }) });
    expect(response.status).toBe(400);
    assertNoLeak(await response.text());
  });

  it("4. POST /api/owner/tasks/new/proof/submit -> governed 400, never a Prisma leak", async () => {
    const { POST } = await import("@/app/api/owner/tasks/[taskId]/proof/submit/route");
    const response = await POST(makePostRequest("/api/owner/tasks/new/proof/submit", { proofType: "short_note", fields: {} }), { params: Promise.resolve({ taskId: "new" }) });
    expect(response.status).toBe(400);
    assertNoLeak(await response.text());
  });

  it("5. POST /api/owner/tasks/new/proof/review -> governed 400, never a Prisma leak", async () => {
    const { POST } = await import("@/app/api/owner/tasks/[taskId]/proof/review/route");
    const response = await POST(makePostRequest("/api/owner/tasks/new/proof/review", { to: "ACCEPTED" }), { params: Promise.resolve({ taskId: "new" }) });
    expect(response.status).toBe(400);
    assertNoLeak(await response.text());
  });

  it("6. a well-formed but nonexistent UUID still returns a normal governed 404, not a crash", async () => {
    const { GET } = await import("@/app/api/owner/tasks/[taskId]/route");
    const missing = randomUUID();
    const response = await GET(makeGetRequest(`/api/owner/tasks/${missing}`), { params: Promise.resolve({ taskId: missing }) });
    expect(response.status).toBe(404);
    assertNoLeak(await response.text());
  });

  it("7. a foreign (real, valid) UUID from a different workspace stays workspace-safe (404, not leaked)", async () => {
    const foreignWorkspaceId = randomUUID();
    const foreignActorId = randomUUID();
    await db.user.create({ data: { id: foreignActorId, email: `${foreignActorId}@example.com`, updatedAt: new Date() } });
    await db.workspace.create({ data: { id: foreignWorkspaceId, name: "WS Foreign", slug: `ws-tiv-foreign-${foreignWorkspaceId.substring(0, 8)}` } });
    const foreignTaskId = randomUUID();
    await db.delegatedTask.create({
      data: { id: foreignTaskId, workspaceId: foreignWorkspaceId, title: "Foreign task", status: "ASSIGNED", createdByUserId: foreignActorId, updatedAt: new Date() },
    });

    const { GET } = await import("@/app/api/owner/tasks/[taskId]/route");
    const response = await GET(makeGetRequest(`/api/owner/tasks/${foreignTaskId}`), { params: Promise.resolve({ taskId: foreignTaskId }) });
    expect(response.status).toBe(404);
    const bodyText = await response.text();
    expect(bodyText).not.toContain("Foreign task");
    assertNoLeak(bodyText);

    await db.delegatedTask.deleteMany({ where: { workspaceId: foreignWorkspaceId } });
    await db.workspace.deleteMany({ where: { id: foreignWorkspaceId } });
    await db.user.deleteMany({ where: { id: foreignActorId } });
  });

  it("8. valid task detail is unchanged for a real, workspace-owned task", async () => {
    const taskId = randomUUID();
    await db.delegatedTask.create({
      data: { id: taskId, workspaceId, title: "Real task", status: "ASSIGNED", createdByUserId: actorId, updatedAt: new Date() },
    });
    const { GET } = await import("@/app/api/owner/tasks/[taskId]/route");
    const response = await GET(makeGetRequest(`/api/owner/tasks/${taskId}`), { params: Promise.resolve({ taskId }) });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.task.id).toBe(taskId);
    expect(body.task.title).toBe("Real task");
  });
});
