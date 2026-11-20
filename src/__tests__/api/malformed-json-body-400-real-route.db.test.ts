/**
 * A malformed / empty JSON request body is HTTP 400 — REAL routes + REAL canonical-route-enforcement, Postgres.
 *
 * Root cause: ~45 wrapped routes read the body with `ctx.request.json()` directly. On a malformed or empty body the
 * platform parser throws a SyntaxError, which the canonical wrapper classifies as an unknown 500 ("Something went
 * wrong on our side"), blaming the server for a client mistake. The wrapper now hands handlers a request whose
 * `json()` raises the existing ValidationError("Invalid JSON in request body") — the same message parseRequestBody
 * already uses — so every such route is a 400 with a generic message; no parser detail reaches the client.
 *
 * Only @/services/auth is mocked; workspace membership is a real row.
 *
 * Run: TEST_WITH_DB=true npx vitest run src/__tests__/api/malformed-json-body-400-real-route.db.test.ts --maxWorkers=1
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { randomUUID } from "crypto";
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { listUserNotifications } from "@/services/notifications/notification-service";
import { getQuotaUsage } from "@/services/entitlement";
import { listWebhooks } from "@/services/webhooks.service";

let mockActorId = randomUUID();
let mockWorkspaceId = randomUUID();

vi.mock("@/services/auth", () => {
  const session = () => ({
    user: { id: mockActorId, email: "json-qa@example.com", name: "JSON QA", isActive: true },
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

const rawPost = (path: string, rawBody: string) =>
  new NextRequest(`https://example.com${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: rawBody,
  });

const MALFORMED = '{"type": "action", oops';
const PARSER_DETAIL = /Unexpected|position|JSON at|end of JSON|SyntaxError|token/i;

async function expectGeneric400(res: Response) {
  expect(res.status).toBe(400);
  const text = await res.text();
  const body = JSON.parse(text);
  expect(body.error).toBe("Invalid JSON in request body");
  expect(body.classification).toBe("handler_invocation_validation_error");
  expect(text).not.toMatch(PARSER_DETAIL);
}

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] malformed JSON body → 400 (real routes, real wrapper)", () => {
  let actorId: string;
  let workspaceId: string;

  beforeEach(async () => {
    actorId = randomUUID();
    workspaceId = randomUUID();
    mockActorId = actorId;
    mockWorkspaceId = workspaceId;
    await db.user.create({ data: { id: actorId, email: `${actorId}@example.com`, updatedAt: new Date() } });
    await db.workspace.create({ data: { id: workspaceId, name: "JSON WS", slug: `json-${workspaceId.slice(0, 8)}` } });
    await db.workspaceMembership.create({ data: { userId: actorId, workspaceId, role: "admin", isActive: true } });
  });

  afterEach(async () => {
    await db.auditEvent.deleteMany({ where: { actorId } });
    await db.workspaceMembership.deleteMany({ where: { userId: actorId } });
    await db.workspace.deleteMany({ where: { id: workspaceId } });
    await db.user.deleteMany({ where: { id: actorId } });
  });

  it("POST /api/verify: malformed body → 400 generic message", async () => {
    const { POST } = await import("@/app/api/verify/route");
    await expectGeneric400(await POST(rawPost("/api/verify", MALFORMED), { params: Promise.resolve({}) }));
  });

  it("POST /api/notifications: malformed body → 400, no notification created", async () => {
    const { POST } = await import("@/app/api/notifications/route");
    await expectGeneric400(await POST(rawPost("/api/notifications", MALFORMED), { params: Promise.resolve({}) }));
    expect((await listUserNotifications(workspaceId, actorId)).total).toBe(0);
  });

  it("POST /api/entitlement/quota: malformed and empty bodies → 400, quota usage unchanged", async () => {
    const { POST } = await import("@/app/api/entitlement/quota/route");
    const before = getQuotaUsage(workspaceId, actorId);
    await expectGeneric400(await POST(rawPost("/api/entitlement/quota", MALFORMED), { params: Promise.resolve({}) }));
    await expectGeneric400(await POST(rawPost("/api/entitlement/quota", ""), { params: Promise.resolve({}) }));
    expect(getQuotaUsage(workspaceId, actorId)).toEqual(before);
  });

  it("POST /api/webhooks/subscribe (catches the parse error itself): → 400, nothing registered or audited", async () => {
    const { POST } = await import("@/app/api/webhooks/subscribe/route");
    await expectGeneric400(await POST(rawPost("/api/webhooks/subscribe", MALFORMED), { params: Promise.resolve({}) }));
    expect(await listWebhooks(workspaceId)).toHaveLength(0);
    expect(await db.auditEvent.count({ where: { workspaceId } })).toBe(0);
  });

  it("a well-formed body still reaches the handler (valid JSON is unaffected)", async () => {
    const { POST } = await import("@/app/api/entitlement/quota/route");
    const res = await POST(rawPost("/api/entitlement/quota", JSON.stringify({ type: "action" })), { params: Promise.resolve({}) });
    expect(res.status).toBe(200);
    expect(getQuotaUsage(workspaceId, actorId).actionsCreated).toBe(1);
  });
});
