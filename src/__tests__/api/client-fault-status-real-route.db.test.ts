/**
 * A client mistake is a 4xx, never a 500 — REAL routes + REAL canonical-route-enforcement, Postgres.
 *
 * Root cause: route handlers (and the services they call) rejected a client mistake — missing header, invalid body,
 * a body that fails its zod schema, an unknown id, a duplicate submission, a request in the wrong state — by throwing
 * a plain `Error` or letting a raw `ZodError` escape. The canonical wrapper only treats an AppError (statusCode +
 * code) as an owner-safe client error, so each of these surfaced as the generic 500 "Something went wrong on our
 * side", told the client to retry a request that can never succeed, and hid the real reason. They now throw the
 * existing ValidationError / NotFoundError / ConflictError / InvalidStateTransitionError / PlanLimitError, and zod
 * input parsing goes through the existing parseOrThrow helper (only `{path, message}` pairs reach the client).
 *
 * Only @/services/auth is mocked; workspace membership is a real row.
 *
 * Run: TEST_WITH_DB=true npx vitest run src/__tests__/api/client-fault-status-real-route.db.test.ts --maxWorkers=1
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { randomUUID } from "crypto";
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { listUserNotifications } from "@/services/notifications/notification-service";
import { getQuotaUsage, getSubscriptionTier, getTierConfig, Capability } from "@/services/entitlement";
import { listWebhooks } from "@/services/webhooks.service";
import { CAPABILITIES } from "@/domain/constants/capabilities";

let mockActorId = randomUUID();
let mockWorkspaceId = randomUUID();

vi.mock("@/services/auth", () => {
  const session = () => ({
    user: { id: mockActorId, email: "client-fault-qa@example.com", name: "Client Fault QA", isActive: true },
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

type Init = { method?: string; headers?: Record<string, string>; body?: unknown };
const req = (path: string, init: Init = {}) =>
  new NextRequest(`https://example.com${path}`, {
    method: init.method ?? "POST",
    headers: { "content-type": "application/json", ...(init.headers ?? {}) },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
const params = (p: Record<string, string> = {}) => ({ params: Promise.resolve(p) });
/** Idempotency keys issued by a test, so the records they create are removed afterwards. */
let issuedKeys: string[] = [];
/** Plans seeded by a test (removed after its subscription and billing account). */
let seededPlanIds: string[] = [];
const idemKey = () => {
  const k = randomUUID();
  issuedKeys.push(k);
  return k;
};

const GENERIC_500 = "Something went wrong on our side. Nothing was saved. Please try again.";
/** Schema internals that must never be echoed in the client-facing message. */
const SCHEMA_INTERNALS = /"issues"|"code":"invalid_|"expected":|ZodError|\[\{"/;

async function expectClientError(res: Response, status: number, message?: string | RegExp) {
  const text = await res.text();
  expect(res.status, text).toBe(status);
  const body = JSON.parse(text) as { error: string; fieldErrors?: Array<{ path: string; message: string }> };
  expect(body.error).not.toBe(GENERIC_500);
  expect(body.error).not.toMatch(SCHEMA_INTERNALS);
  if (typeof message === "string") expect(body.error).toBe(message);
  else if (message) expect(body.error).toMatch(message);
  return body;
}

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] client mistakes → 4xx (real routes, real wrapper)", () => {
  let actorId: string;
  let workspaceId: string;

  beforeEach(async () => {
    actorId = randomUUID();
    workspaceId = randomUUID();
    mockActorId = actorId;
    mockWorkspaceId = workspaceId;
    await db.user.create({ data: { id: actorId, email: `${actorId}@example.com`, updatedAt: new Date() } });
    await db.workspace.create({ data: { id: workspaceId, name: "Client Fault WS", slug: `cf-${workspaceId.slice(0, 8)}` } });
    await db.workspaceMembership.create({ data: { userId: actorId, workspaceId, role: "admin", isActive: true } });
  });

  afterEach(async () => {
    await db.operatorItem.deleteMany({ where: { workspaceId } });
    await db.subscription.deleteMany({ where: { billingAccount: { workspaceId } } });
    await db.billingAccount.deleteMany({ where: { workspaceId } });
    await db.plan.deleteMany({ where: { id: { in: seededPlanIds } } });
    seededPlanIds = [];
    await db.alert.deleteMany({ where: { workspaceId } });
    await db.idempotencyRecord.deleteMany({ where: { idempotencyKey: { in: issuedKeys } } });
    issuedKeys = [];
    await db.auditEvent.deleteMany({ where: { workspaceId } });
    await db.auditEvent.deleteMany({ where: { actorId } });
    await db.workspaceMembership.deleteMany({ where: { userId: actorId } });
    await db.workspace.deleteMany({ where: { id: workspaceId } });
    await db.user.deleteMany({ where: { id: actorId } });
  });

  // ── webhooks ────────────────────────────────────────────────────────────────
  it("POST /api/webhooks/subscribe: valid JSON failing the schema → 400 with field errors, no zod issues echoed, nothing registered", async () => {
    const { POST } = await import("@/app/api/webhooks/subscribe/route");
    const body = await expectClientError(await POST(req("/api/webhooks/subscribe", { body: { url: 42 } }), params()), 400, "Validation failed");
    expect(body.fieldErrors?.length).toBeGreaterThan(0);
    for (const fe of body.fieldErrors ?? []) expect(Object.keys(fe).sort()).toEqual(["message", "path"]);
    expect(await listWebhooks(workspaceId)).toHaveLength(0);
    expect(await db.auditEvent.count({ where: { workspaceId } })).toBe(0);
  });

  it("POST /api/webhooks/[id]/test: unknown webhook id → 404; schema-invalid body → 400", async () => {
    const { POST } = await import("@/app/api/webhooks/[id]/test/route");
    const id = randomUUID();
    await expectClientError(await POST(req(`/api/webhooks/${id}/test`, { body: {} }), params({ id })), 404);
    await expectClientError(await POST(req(`/api/webhooks/${id}/test`, { body: { data: "not-an-object" } }), params({ id })), 400, "Validation failed");
  });

  // ── verify ──────────────────────────────────────────────────────────────────
  it("POST /api/verify: missing inputs / decisionHash → 400", async () => {
    const { POST } = await import("@/app/api/verify/route");
    await expectClientError(await POST(req("/api/verify", { body: {} }), params()), 400, "Invalid inputs: must be an object");
    await expectClientError(await POST(req("/api/verify", { body: { inputs: {} } }), params()), 400, "Invalid decisionHash: must be a string");
  });

  // ── actions ─────────────────────────────────────────────────────────────────
  it("POST /api/actions: missing Idempotency-Key header → 400, nothing written", async () => {
    const { POST } = await import("@/app/api/actions/route");
    await expectClientError(await POST(req("/api/actions", { body: {} }), params()), 400, "Idempotency-Key header required");
    expect(await db.auditEvent.count({ where: { workspaceId } })).toBe(0);
  });

  // ── notifications ───────────────────────────────────────────────────────────
  it("POST /api/notifications: body failing the schema → 400 with field errors, no notification created", async () => {
    const { POST } = await import("@/app/api/notifications/route");
    const body = await expectClientError(await POST(req("/api/notifications", { body: { recipientId: actorId } }), params()), 400, "Validation failed");
    expect(body.fieldErrors?.length).toBeGreaterThan(0);
    expect((await listUserNotifications(workspaceId, actorId)).total).toBe(0);
  });

  it("GET /api/notifications: out-of-range limit → 400", async () => {
    const { GET } = await import("@/app/api/notifications/route");
    await expectClientError(await GET(req("/api/notifications?limit=0", { method: "GET" }), params()), 400, "Validation failed");
  });

  it("GET and PATCH /api/notifications/[id] without an id → 400", async () => {
    const { GET, PATCH } = await import("@/app/api/notifications/[id]/route");
    await expectClientError(await GET(req("/api/notifications/x", { method: "GET" }), params()), 400, "Notification ID is required");
    await expectClientError(await PATCH(req("/api/notifications/x", { method: "PATCH" }), params()), 400, "Notification ID is required");
  });

  // ── entitlement ─────────────────────────────────────────────────────────────
  it("POST /api/entitlement/quota: body failing the schema → 400, quota usage unchanged", async () => {
    const { POST } = await import("@/app/api/entitlement/quota/route");
    const before = getQuotaUsage(workspaceId, actorId);
    await expectClientError(await POST(req("/api/entitlement/quota", { body: { type: "bogus" } }), params()), 400, "Validation failed");
    expect(getQuotaUsage(workspaceId, actorId)).toEqual(before);
  });

  it("POST /api/entitlement: unknown capability → 400; capability outside the tier → 402", async () => {
    const { POST } = await import("@/app/api/entitlement/route");
    await expectClientError(await POST(req("/api/entitlement", { body: { capability: "bogus" } }), params()), 400, "Validation failed");
    const granted = getTierConfig(getSubscriptionTier(workspaceId)).capabilities;
    const missing = Object.values(Capability).find((c) => !granted.includes(c));
    expect(missing, "the default tier lacks at least one capability").toBeDefined();
    await expectClientError(await POST(req("/api/entitlement", { body: { capability: missing } }), params()), 402);
  });

  // ── run ─────────────────────────────────────────────────────────────────────
  it("POST /api/run: invalid financial inputs → 400; the identical submission again → 409; no decision written", async () => {
    const { POST } = await import("@/app/api/run/route");
    const payload = { revenue: "lots", cost: 10, confidence: 0.8, revenueChange: 1, costChange: 1, recommendationId: randomUUID() };
    await expectClientError(await POST(req("/api/run", { body: payload }), params()), 400, /revenue and cost must be numbers/);
    await expectClientError(await POST(req("/api/run", { body: payload }), params()), 409, /Duplicate request detected/);
    expect(await db.operatorItem.count({ where: { workspaceId } })).toBe(0);
  });

  // ── operator ────────────────────────────────────────────────────────────────
  it("POST /api/operator: missing idempotency-key → 400; missing id → 400", async () => {
    const { POST } = await import("@/app/api/operator/route");
    await expectClientError(await POST(req("/api/operator", { body: { id: randomUUID() } }), params()), 400, "idempotency-key header required");
    await expectClientError(
      await POST(req("/api/operator", { headers: { "idempotency-key": idemKey() }, body: {} }), params()),
      400,
      "Missing required field: id"
    );
  });

  // ── audit / scenario / entity ───────────────────────────────────────────────
  it("GET /api/audit: fromDate after toDate → 400; non-numeric limit → 400", async () => {
    const { GET } = await import("@/app/api/audit/route");
    await expectClientError(
      await GET(req("/api/audit?fromDate=2026-02-01&toDate=2026-01-01", { method: "GET" }), params()),
      400,
      "fromDate must be before toDate"
    );
    await expectClientError(await GET(req("/api/audit?limit=abc", { method: "GET" }), params()), 400, "Invalid limit");
  });

  it("POST /api/scenario: non-numeric inputs → 400", async () => {
    const { POST } = await import("@/app/api/scenario/route");
    await expectClientError(await POST(req("/api/scenario", { body: { baseRevenue: "x" } }), params()), 400, /must be numbers/);
  });

  it("POST /api/entity: missing fields → 400; unknown type → 400", async () => {
    const { POST } = await import("@/app/api/entity/route");
    await expectClientError(await POST(req("/api/entity", { body: {} }), params()), 400, "Missing required fields: name, type");
    await expectClientError(await POST(req("/api/entity", { body: { name: "A", type: "planet" } }), params()), 400, /Invalid type/);
  });

  // ── decisions ───────────────────────────────────────────────────────────────
  it("POST /api/decisions/[decisionId]/evaluate: a non-pending decision → 409, decision unchanged", async () => {
    const { POST } = await import("@/app/api/decisions/[decisionId]/evaluate/route");
    const decisionId = randomUUID();
    await db.operatorItem.create({
      data: {
        id: decisionId,
        workspaceId,
        problem: "p",
        action: "a",
        impactExpected: 1,
        impactLow: 1,
        impactHigh: 1,
        confidence: 0.5,
        priorityScore: 1,
        status: "done",
      },
    });
    await expectClientError(await POST(req(`/api/decisions/${decisionId}/evaluate`), params({ decisionId })), 409, /Only pending decisions can be evaluated/);
    expect((await db.operatorItem.findUnique({ where: { id: decisionId } }))?.status).toBe("done");
  });

  it("POST /api/decisions/create: invalid single decision → 400; empty bulk list → 400; nothing written", async () => {
    const { POST } = await import("@/app/api/decisions/create/route");
    // The route's plan gate (assertCapability) reads a real subscription: seed one granting decision creation.
    const planId = randomUUID();
    const billingAccountId = randomUUID();
    await db.plan.create({
      data: {
        id: planId,
        name: `cf-plan-${workspaceId.slice(0, 8)}`,
        priceMonthly: 0,
        priceYearly: 0,
        active: true,
        updatedAt: new Date(),
        planCapabilities: { create: { id: randomUUID(), key: CAPABILITIES.DECISION_CREATE, limit: null } },
      },
    });
    await db.billingAccount.create({
      data: { id: billingAccountId, workspaceId, provider: "stripe", providerCustomerId: `cf_${workspaceId.slice(0, 8)}`, status: "active", updatedAt: new Date() },
    });
    await db.subscription.create({
      data: {
        id: randomUUID(),
        billingAccountId,
        planId,
        status: "active",
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 86400000),
        updatedAt: new Date(),
      },
    });
    seededPlanIds.push(planId);
    const headers = { "idempotency-key": idemKey() };
    await expectClientError(
      await POST(req("/api/decisions/create", { headers, body: { title: "", type: "t", impact: 1, confidence: 0.5 } }), params()),
      400,
      "Decision title is required"
    );
    await expectClientError(
      await POST(req("/api/decisions/create", { headers: { "idempotency-key": idemKey() }, body: { decisions: [] } }), params()),
      400,
      "At least one decision is required"
    );
    expect(await db.operatorItem.count({ where: { workspaceId } })).toBe(0);
  });

  it("POST /api/decisions/[decisionId]/reject: body failing the schema → 400 with field errors", async () => {
    const { POST } = await import("@/app/api/decisions/[decisionId]/reject/route");
    const decisionId = randomUUID();
    const body = await expectClientError(
      await POST(req(`/api/decisions/${decisionId}/reject`, { headers: { "idempotency-key": idemKey() }, body: { reason: "short" } }), params({ decisionId })),
      400,
      "Validation failed"
    );
    expect(body.fieldErrors?.map((f) => f.path).sort()).toEqual(["engagementId", "reason"]);
  });

  // ── growth / owner alerts / business impact ─────────────────────────────────
  it("POST /api/growth/offers: body failing the schema → 400 with field errors", async () => {
    const { POST } = await import("@/app/api/growth/offers/route");
    const body = await expectClientError(await POST(req("/api/growth/offers", { body: { name: "" } }), params()), 400, "Validation failed");
    expect(body.fieldErrors?.some((f) => f.path === "name" && f.message === "Offer name is required")).toBe(true);
  });

  it("POST /api/owner/alerts: body failing the schema → 400, no alert created", async () => {
    const { POST } = await import("@/app/api/owner/alerts/route");
    await expectClientError(await POST(req("/api/owner/alerts", { body: { type: "nope" } }), params()), 400, "Validation failed");
    expect(await db.alert.count({ where: { workspaceId } })).toBe(0);
  });

  it("PATCH /api/owner/alerts/[id]/read: unknown alert → 404", async () => {
    const { PATCH } = await import("@/app/api/owner/alerts/[id]/read/route");
    const id = randomUUID();
    await expectClientError(await PATCH(req(`/api/owner/alerts/${id}/read`, { method: "PATCH" }), params({ id })), 404);
  });

  it("GET /api/business-impact/decision/[id]: unknown decision → 404", async () => {
    const { GET } = await import("@/app/api/business-impact/decision/[id]/route");
    const id = randomUUID();
    await expectClientError(await GET(req(`/api/business-impact/decision/${id}`, { method: "GET" }), params({ id })), 404);
  });
});
