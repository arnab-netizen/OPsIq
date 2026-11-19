/**
 * GET/PATCH /api/notifications/[id] — not-found and cross-workspace are the SAME 404 (tenant non-disclosure).
 * REAL route + REAL canonical-route-enforcement, Postgres membership; only @/services/auth is mocked.
 *
 * Root cause: an unknown id threw a plain Error (→ unknown 500) while another workspace's notification threw
 * UnauthorizedError("Access denied") (→ 401). Two different answers disclosed that the id exists elsewhere, and
 * 401 told an authenticated client to re-authenticate. Both now throw NotFoundError("Notification", id).
 *
 * Run: TEST_WITH_DB=true npx vitest run src/__tests__/api/notification-detail-not-found-real-route.db.test.ts --maxWorkers=1
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { randomUUID } from "crypto";
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import {
  sendNotification,
  getNotification,
  NotificationChannel,
  NotificationType,
} from "@/services/notifications/notification-service";

let mockActorId = randomUUID();
let mockWorkspaceId = randomUUID();

vi.mock("@/services/auth", () => {
  const session = () => ({
    user: { id: mockActorId, email: "notif-qa@example.com", name: "Notif QA", isActive: true },
    sessionId: "test-session",
    expiresAt: new Date(Date.now() + 86400000),
  });
  const policy = () => ({
    userId: mockActorId,
    roles: [{ role: "system_admin", scope: "workspace", scopeId: mockWorkspaceId }],
    engagementMemberships: [],
  });
  return {
    getSessionFact: vi.fn(async () => ({ valid: true, session: session(), invalidReason: undefined })),
    getSession: vi.fn(async () => session()),
    getPolicyContextFact: vi.fn(async () => ({ valid: true, policy: policy(), invalidReason: undefined })),
    getPolicyContext: vi.fn(async () => policy()),
  };
});

const req = (method: "GET" | "PATCH", id: string) =>
  new NextRequest(`https://example.com/api/notifications/${id}`, { method });

/** The client-visible part of an error response, minus the per-request correlation id. */
async function errorShape(res: Response) {
  const body = await res.json();
  delete body.correlationId;
  return { status: res.status, body };
}

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] /api/notifications/[id] — 404 for unknown and cross-workspace alike", () => {
  let actorId: string;
  let workspaceA: string;
  let workspaceB: string;

  beforeEach(async () => {
    actorId = randomUUID();
    workspaceA = randomUUID();
    workspaceB = randomUUID();
    mockActorId = actorId;
    mockWorkspaceId = workspaceA;
    await db.user.create({ data: { id: actorId, email: `${actorId}@example.com`, updatedAt: new Date() } });
    await db.workspace.create({ data: { id: workspaceA, name: "Notif WS A", slug: `ntf-a-${workspaceA.slice(0, 8)}` } });
    await db.workspace.create({ data: { id: workspaceB, name: "Notif WS B", slug: `ntf-b-${workspaceB.slice(0, 8)}` } });
    await db.workspaceMembership.create({ data: { userId: actorId, workspaceId: workspaceA, role: "admin", isActive: true } });
  });

  afterEach(async () => {
    await db.auditEvent.deleteMany({ where: { actorId } });
    await db.workspaceMembership.deleteMany({ where: { userId: actorId } });
    await db.workspace.deleteMany({ where: { id: { in: [workspaceA, workspaceB] } } });
    await db.user.deleteMany({ where: { id: actorId } });
  });

  const seed = (workspaceId: string) =>
    sendNotification({
      workspaceId,
      recipientId: actorId,
      actorId,
      type: NotificationType.DECISION_NEEDED,
      channels: [NotificationChannel.IN_APP],
      subject: "Decision needed",
      body: "Approve the supplier change",
      sendAt: new Date(),
    });

  it("own notification: GET 200 and PATCH 200", async () => {
    const own = await seed(workspaceA);
    const { GET, PATCH } = await import("@/app/api/notifications/[id]/route");
    const got = await GET(req("GET", own.id), { params: Promise.resolve({ id: own.id }) });
    expect(got.status).toBe(200);
    expect((await got.json()).notification.id).toBe(own.id);
    expect((await PATCH(req("PATCH", own.id), { params: Promise.resolve({ id: own.id }) })).status).toBe(200);
  });

  it("GET: another workspace's notification is indistinguishable from an unknown id (404, same body)", async () => {
    const foreign = await seed(workspaceB);
    const unknownId = `notif_${randomUUID()}`;
    const { GET } = await import("@/app/api/notifications/[id]/route");

    const unknown = await errorShape(await GET(req("GET", unknownId), { params: Promise.resolve({ id: unknownId }) }));
    const cross = await errorShape(await GET(req("GET", foreign.id), { params: Promise.resolve({ id: foreign.id }) }));

    expect(unknown.status).toBe(404);
    expect(cross.status).toBe(404);
    expect(unknown.body.error).toBe(`Notification not found: ${unknownId}`);
    expect(cross.body.error).toBe(`Notification not found: ${foreign.id}`);
    // Identical apart from the caller-supplied id itself.
    expect({ ...cross.body, error: undefined }).toEqual({ ...unknown.body, error: undefined });
    expect(JSON.stringify(cross.body)).not.toMatch(/denied|forbidden|workspace/i);
  });

  it("PATCH: another workspace's notification is a 404 and is NOT modified", async () => {
    const foreign = await seed(workspaceB);
    const updatedBefore = (await getNotification(foreign.id))!.updatedAt.getTime();
    const { PATCH } = await import("@/app/api/notifications/[id]/route");
    const res = await PATCH(req("PATCH", foreign.id), { params: Promise.resolve({ id: foreign.id }) });
    expect(res.status).toBe(404);
    expect((await getNotification(foreign.id))!.updatedAt.getTime()).toBe(updatedBefore);
  });
});
