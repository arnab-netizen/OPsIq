/**
 * PHASE RP2: Hostile HTTP Runtime Proofs
 *
 * Every request runs the REAL root middleware and the REAL exported App Router route handler
 * (withCanonicalEnforcement, the Stripe webhook route) in-process, against the real database.
 * Nothing on the auth path is stubbed: sessions, users, memberships and role assignments are
 * seeded rows; the session cookie travels on the request itself and the real getSession() /
 * getPolicyContext() resolve it. The only shim is the request scope for next/headers (see
 * requestScope below), which hands `cookies()` / `headers()` the SAME NextRequest being
 * dispatched, exactly as Next's router binds them.
 *
 * Stripe deliveries are signed locally with the SDK's offline HMAC helper and a test-only secret:
 * no live key, no network, no money.
 *
 * Every case pins an exact status and body, and every rejection has a positive control proving
 * the same request with sufficient authority reaches the handler, so a route that rejects
 * everything (or accepts everything) fails here.
 *
 * Lane: runtime-proof/** runs only with TEST_WITH_DB=true (vitest.config.ts).
 *
 * Former live-server mode (TEST_API_URL) is removed: the seeded sessions, the webhook secret and
 * the in-memory notification store exist only in this process, so an out-of-process server could
 * never satisfy these preconditions and would have reported failures unrelated to the behaviour
 * under test.
 */

import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { randomUUID, randomBytes } from "crypto";
import Stripe from "stripe";
import { NextRequest } from "next/server";
import { db } from "@/lib/db";

// Request scope for in-process dispatch. Next binds `cookies()` / `headers()` from next/headers to
// the in-flight request; outside its router they throw "called outside a request scope". This binds
// them to the SAME NextRequest being dispatched (its real Cookie / header values -- nothing is
// invented), per async context so concurrent requests never see each other's scope.
const requestScope = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { AsyncLocalStorage } = require("node:async_hooks") as typeof import("node:async_hooks");
  return new AsyncLocalStorage<import("next/server").NextRequest>();
});
vi.mock("next/headers", () => {
  const current = () => {
    const req = requestScope.getStore();
    if (!req) throw new Error("RP2: next/headers used outside a dispatched request scope");
    return req;
  };
  return {
    cookies: async () => current().cookies,
    headers: async () => current().headers,
  };
});
import { middleware } from "../../../middleware";

const ORIGIN = "http://localhost:3000";
const RUN = randomUUID().slice(0, 8);
const DAY = 24 * 60 * 60 * 1000;
const SESSION_COOKIE = "opsiq_session";
const DIAGNOSTIC_KEY = `rp2-diag-${randomBytes(16).toString("hex")}`;

type RouteHandler = (req: NextRequest, context: { params: Promise<Record<string, string>> }) => Promise<Response>;

/**
 * Resolve a request path to the real App Router route module and its dynamic params, mirroring
 * src/app/api/** on disk. An unmapped path is a test-authoring error and throws.
 */
const ROUTES: Array<{ pattern: RegExp; load: () => Promise<Record<string, unknown>>; params: (m: RegExpMatchArray) => Record<string, string> }> = [
  { pattern: /^\/api\/audit$/, load: () => import("@/app/api/audit/route"), params: () => ({}) },
  { pattern: /^\/api\/value\/7day$/, load: () => import("@/app/api/value/7day/route"), params: () => ({}) },
  { pattern: /^\/api\/value\/summary$/, load: () => import("@/app/api/value/summary/route"), params: () => ({}) },
  { pattern: /^\/api\/verify$/, load: () => import("@/app/api/verify/route"), params: () => ({}) },
  { pattern: /^\/api\/notifications$/, load: () => import("@/app/api/notifications/route"), params: () => ({}) },
  { pattern: /^\/api\/notifications\/preferences$/, load: () => import("@/app/api/notifications/preferences/route"), params: () => ({}) },
  { pattern: /^\/api\/notifications\/([^/]+)$/, load: () => import("@/app/api/notifications/[id]/route"), params: (m) => ({ id: m[1] }) },
  { pattern: /^\/api\/intelligence\/insights$/, load: () => import("@/app/api/intelligence/insights/route"), params: () => ({}) },
  { pattern: /^\/api\/intelligence\/patterns$/, load: () => import("@/app/api/intelligence/patterns/route"), params: () => ({}) },
  { pattern: /^\/api\/entitlement\/quota$/, load: () => import("@/app/api/entitlement/quota/route"), params: () => ({}) },
  { pattern: /^\/api\/decision\/export$/, load: () => import("@/app/api/decision/export/route"), params: () => ({}) },
  { pattern: /^\/api\/webhooks\/stripe$/, load: () => import("@/app/api/webhooks/stripe/route"), params: () => ({}) },
  { pattern: /^\/api\/health$/, load: () => import("@/app/api/health/route"), params: () => ({}) },
  { pattern: /^\/api\/readiness$/, load: () => import("@/app/api/readiness/route"), params: () => ({}) },
  { pattern: /^\/api\/liveness$/, load: () => import("@/app/api/liveness/route"), params: () => ({}) },
];

async function dispatch(req: NextRequest): Promise<Response> {
  // Real root middleware first, as Next does. It must pass /api requests through and never answer
  // them itself.
  const mw = middleware(req);
  expect(mw.headers.get("x-middleware-next")).toBe("1");

  const pathname = req.nextUrl.pathname;
  for (const route of ROUTES) {
    const m = pathname.match(route.pattern);
    if (!m) continue;
    const mod = await route.load();
    const handler = mod[req.method] as RouteHandler | undefined;
    if (typeof handler !== "function") throw new Error(`RP2: ${pathname} exports no ${req.method} handler`);
    return requestScope.run(req, () => handler(req, { params: Promise.resolve(route.params(m)) }));
  }
  throw new Error(`RP2: no route module mapped for ${req.method} ${pathname}`);
}

interface Res {
  status: number;
  // Parsed JSON body (null for an empty body). A non-JSON body throws: it is never coerced to {}.
  body: any; // eslint-disable-line @typescript-eslint/no-explicit-any -- arbitrary route JSON, asserted field by field
  text: string;
  headers: Headers;
}

/**
 * Send one request. `session` puts that token in the opsiq_session cookie; `raw` sends a body
 * verbatim (no JSON encoding); every request carries an explicit correlation id unless the caller
 * overrides or removes it, so error bodies can be pinned exactly.
 */
async function call(
  method: string,
  path: string,
  opts: { session?: string; headers?: Record<string, string>; json?: unknown; raw?: string; correlationId?: string | null } = {},
): Promise<Res & { correlationId: string | null }> {
  const correlationId = opts.correlationId === undefined ? `rp2-corr-${randomUUID()}` : opts.correlationId;
  const headers: Record<string, string> = { "content-type": "application/json", ...opts.headers };
  if (correlationId !== null) headers["x-correlation-id"] = correlationId;
  if (opts.session) headers.cookie = `${SESSION_COOKIE}=${opts.session}`;
  const body = opts.raw !== undefined ? opts.raw : opts.json !== undefined ? JSON.stringify(opts.json) : undefined;
  const res = await dispatch(new NextRequest(new URL(path, ORIGIN), { method, headers, body }));
  const text = await res.text();
  return { status: res.status, body: text === "" ? null : JSON.parse(text), text, headers: res.headers, correlationId };
}

/** The canonical wrapper's own 401: proves the auth gate (not the handler) answered. */
function expectAuthGate401(res: Res & { correlationId: string | null }) {
  expect(res.status).toBe(401);
  expect(res.body).toEqual({ error: "Unauthorized", detail: "Please authenticate", correlationId: res.correlationId });
  expect(res.headers.get("x-correlation-id")).toBe(res.correlationId);
}

/** The canonical wrapper's own capability 403 (no diagnostic key presented). */
function expectCapability403(res: Res & { correlationId: string | null }) {
  expect(res.status).toBe(403);
  expect(res.body).toEqual({ error: "Insufficient permissions", detail: "Insufficient permissions", correlationId: res.correlationId });
}

// ── Fixtures ────────────────────────────────────────────────────────────────────────────────────

const WS_A = randomUUID();
const WS_B = randomUUID();
const WS_STRIPE = randomUUID();

interface Actor { id: string; token: string; hashedPassword: string }
const actor = (): Actor => ({ id: randomUUID(), token: `rp2_${randomBytes(24).toString("hex")}`, hashedPassword: `RP2-SENTINEL-HASH-${randomBytes(12).toString("hex")}` });
const adminA = actor(); // system_admin in WS_A: every capability these routes require
const analystA = actor(); // analyst in WS_A: action:view + engagement:view, NOT audit:view / owner:view
const viewerA = actor(); // viewer in WS_A: NOT action:view
const adminB = actor(); // system_admin in WS_B
const noMembership = actor(); // valid session, no workspace membership at all
const revoked = actor(); // system_admin in WS_A, session revoked
const expired = actor(); // system_admin in WS_A, session expired
const deactivated = actor(); // system_admin in WS_A, user deactivated
const ALL_ACTORS = [adminA, analystA, viewerA, adminB, noMembership, revoked, expired, deactivated];

const ITEM_A = randomUUID();
const ITEM_B = randomUUID();
const ITEM_B_PROBLEM = `RP2 workspace-B confidential problem ${RUN}`;

// Stripe fixtures (dedicated workspace, test-only secret, offline signing).
const STRIPE_SECRET = `whsec_rp2_${RUN}`;
const PLAN_ID = randomUUID();
const ACCT_ID = randomUUID();
const SUB_ID = randomUUID();
const CUSTOMER = `cus_rp2_${RUN}`;
const STRIPE_SUB = `sub_rp2_${RUN}`;
const sdk = new Stripe("sk_test_dummy_not_a_real_key"); // only for generateTestHeaderString (pure HMAC)
let evtSeq = 0;
const nextEventId = () => `evt_rp2_${RUN}_${++evtSeq}`;
const checkoutCompleted = (id: string) =>
  JSON.stringify({
    id,
    object: "event",
    type: "checkout.session.completed",
    created: Math.floor(Date.now() / 1000),
    data: { object: { id: `cs_rp2_${RUN}_${evtSeq}`, created: Math.floor(Date.now() / 1000) - 60, customer: CUSTOMER, subscription: STRIPE_SUB, status: "complete", mode: "subscription" } },
  });
const signStripe = (payload: string, secret = STRIPE_SECRET) =>
  sdk.webhooks.generateTestHeaderString({ payload, secret, timestamp: Math.floor(Date.now() / 1000) });
const postStripe = (payload: string, signature: string) =>
  call("POST", "/api/webhooks/stripe", { raw: payload, headers: { "stripe-signature": signature } });
const webhookRows = (id: string) => db.webhookEvent.count({ where: { stripeEventId: id } });

const savedEnv = { ...process.env };

async function seedActor(a: Actor, ws: string | null, role: string | null, session: { revokedAt?: Date; expiresAt?: Date } = {}, isActive = true) {
  await db.user.create({ data: { id: a.id, email: `rp2-${a.id}@example.test`, name: `RP2 ${a.id.slice(0, 6)}`, hashedPassword: a.hashedPassword, isActive } });
  if (ws) await db.workspaceMembership.create({ data: { workspaceId: ws, userId: a.id, role: "member", isActive: true } });
  if (ws && role) await db.userRoleAssignment.create({ data: { id: randomUUID(), userId: a.id, role, scope: "workspace", scopeId: ws, isActive: true } });
  await db.session.create({
    data: { id: randomUUID(), userId: a.id, token: a.token, expiresAt: session.expiresAt ?? new Date(Date.now() + DAY), revokedAt: session.revokedAt ?? null },
  });
}

function operatorItem(id: string, workspaceId: string, owner: string, problem: string) {
  return db.operatorItem.create({
    data: { id, workspaceId, ownerUserId: owner, createdByUserId: owner, problem, action: "RP2 action", impactExpected: 10, impactLow: 5, impactHigh: 15, confidence: 0.8, priorityScore: 1 },
  });
}

/** Create an in-app notification to the sender themself through the real POST route. */
async function sendInApp(a: Actor, subject: string, extraHeaders: Record<string, string> = {}) {
  return call("POST", "/api/notifications", {
    session: a.token,
    headers: extraHeaders,
    json: { recipientId: a.id, type: "action_completed", channels: ["in_app"], subject, body: `${subject} body`, sendAt: new Date().toISOString() },
  });
}

describe("PHASE RP2: Hostile HTTP Runtime Security Proofs", () => {
  beforeAll(async () => {
    process.env.STRIPE_WEBHOOK_SECRET = STRIPE_SECRET;
    process.env.STRIPE_SECRET_KEY = "sk_test_dummy_not_a_real_key";
    process.env.OPSIQ_DIAGNOSTIC_KEY = DIAGNOSTIC_KEY;

    for (const [id, tag] of [[WS_A, "a"], [WS_B, "b"], [WS_STRIPE, "s"]] as const) {
      await db.workspace.create({ data: { id, name: `RP2 ${tag} ${RUN}`, slug: `rp2-${tag}-${RUN}` } });
    }
    await seedActor(adminA, WS_A, "system_admin");
    await seedActor(analystA, WS_A, "analyst");
    await seedActor(viewerA, WS_A, "viewer");
    await seedActor(adminB, WS_B, "system_admin");
    await seedActor(noMembership, null, null);
    await seedActor(revoked, WS_A, "system_admin", { revokedAt: new Date(Date.now() - 60_000) });
    await seedActor(expired, WS_A, "system_admin", { expiresAt: new Date(Date.now() - 60_000) });
    await seedActor(deactivated, WS_A, "system_admin", {}, false);

    await operatorItem(ITEM_A, WS_A, adminA.id, `RP2 workspace-A problem ${RUN}`);
    await operatorItem(ITEM_B, WS_B, adminB.id, ITEM_B_PROBLEM);

    await db.plan.create({ data: { id: PLAN_ID, name: `RP2 Plan ${RUN}`, priceMonthly: 1, priceYearly: 12, stripePriceId: `price_rp2_${RUN}`, active: true } });
    await db.billingAccount.create({ data: { id: ACCT_ID, workspaceId: WS_STRIPE, provider: "stripe", providerCustomerId: CUSTOMER, stripeCustomerId: CUSTOMER } });
    await db.subscription.create({
      data: { id: SUB_ID, billingAccountId: ACCT_ID, planId: PLAN_ID, status: "trialing", currentPeriodStart: new Date(Date.now() - DAY), currentPeriodEnd: new Date(Date.now() + 30 * DAY) },
    });
  });

  afterAll(async () => {
    // Audit rows are never deleted. Users referenced by an audit row as actor (FK Restrict) are
    // deactivated instead of deleted; every other fixture row is removed.
    const ids = ALL_ACTORS.map((a) => a.id);
    await db.session.deleteMany({ where: { userId: { in: ids } } });
    await db.userRoleAssignment.deleteMany({ where: { userId: { in: ids } } });
    await db.workspaceMembership.deleteMany({ where: { userId: { in: ids } } });
    await db.operatorItem.deleteMany({ where: { id: { in: [ITEM_A, ITEM_B] } } });
    await db.webhookEvent.deleteMany({ where: { stripeEventId: { startsWith: `evt_rp2_${RUN}_` } } });
    await db.subscription.deleteMany({ where: { id: SUB_ID } });
    await db.billingAccount.deleteMany({ where: { id: ACCT_ID } });
    await db.plan.deleteMany({ where: { id: PLAN_ID } });
    const auditActors = new Set(
      (await db.auditEvent.findMany({ where: { actorId: { in: ids } }, select: { actorId: true } })).map((r) => r.actorId),
    );
    await db.user.deleteMany({ where: { id: { in: ids.filter((id) => !auditActors.has(id)) } } });
    await db.user.updateMany({ where: { id: { in: [...auditActors].filter((id): id is string => id !== null) } }, data: { isActive: false } });
    process.env = { ...savedEnv };
  });

  describe("1. Missing auth -> 401 from the auth gate", () => {
    it("GET /api/audit without a session cookie -> 401 (a forged x-workspace-id grants nothing)", async () => {
      expectAuthGate401(await call("GET", "/api/audit", { headers: { "x-workspace-id": WS_A } }));
    });

    it("GET /api/value/7day without a session cookie -> 401", async () => {
      expectAuthGate401(await call("GET", "/api/value/7day", { headers: { "x-workspace-id": WS_A } }));
    });

    it("POST /api/verify without a session cookie -> 401", async () => {
      expectAuthGate401(await call("POST", "/api/verify", { json: { inputs: {}, decisionHash: "test" } }));
    });
  });

  describe("2. Invalid credentials -> 401", () => {
    it("unknown, revoked, expired and deactivated-user session cookies are all rejected; the valid cookie is accepted", async () => {
      for (const token of [`rp2_unknown_${RUN}`, revoked.token, expired.token, deactivated.token]) {
        expectAuthGate401(await call("GET", "/api/notifications", { session: token }));
      }
      const ok = await call("GET", "/api/notifications", { session: adminA.token });
      expect(ok.status).toBe(200);
      expect(ok.body.success).toBe(true);
    });

    it("a VALID session token presented as Authorization: Bearer is not a credential (auth is cookie-only)", async () => {
      expectAuthGate401(await call("GET", "/api/notifications", { headers: { Authorization: `Bearer ${adminA.token}` } }));
    });
  });

  describe("3. Missing capability -> 403 canonical_permission_denied", () => {
    // Former target /api/entitlement/check-capability does not exist in src/app/api; the
    // capability contract is proven on real capability-gated routes instead.
    it("analyst (no audit:view) on GET /api/audit -> 403; diagnostic key reveals the exact missing capability; admin -> 200", async () => {
      expectCapability403(await call("GET", "/api/audit", { session: analystA.token }));

      const diag = await call("GET", "/api/audit", { session: analystA.token, headers: { "x-opsiq-diagnostic-key": DIAGNOSTIC_KEY } });
      expect(diag.status).toBe(403);
      expect(diag.body).toMatchObject({
        classification: "canonical_permission_denied",
        stage: "authorization",
        requiredCapabilities: ["audit:view"],
        missingCapabilities: ["audit:view"],
        capabilityDecisionSource: "withCanonicalEnforcement",
      });

      const ok = await call("GET", "/api/audit", { session: adminA.token });
      expect(ok.status).toBe(200);
      expect(Array.isArray(ok.body.events)).toBe(true);
    });

    it("viewer (no action:view) cannot send a notification: 403 and no notification.sent audit row; analyst (has action:view) can", async () => {
      const before = await db.auditEvent.count({ where: { workspaceId: WS_A, eventName: "notification.sent", actorId: viewerA.id } });
      expectCapability403(await sendInApp(viewerA, `rp2 viewer ${RUN}`));
      expect(await db.auditEvent.count({ where: { workspaceId: WS_A, eventName: "notification.sent", actorId: viewerA.id } })).toBe(before);

      const ok = await sendInApp(analystA, `rp2 analyst ${RUN}`);
      expect(ok.status).toBe(200);
      expect(ok.body.notification.workspaceId).toBe(WS_A);
    });

    it("valid session without any workspace membership -> 403 workspace_context_invalid", async () => {
      const res = await call("GET", "/api/notifications", { session: noMembership.token });
      expect(res.status).toBe(403);
      expect(res.body).toMatchObject({ classification: "workspace_context_invalid", stage: "workspace_membership_lookup", correlationId: res.correlationId });
    });
  });

  describe("4. Workspace spoofing -> header ignored, scope is server-derived", () => {
    it("x-workspace-id naming another workspace neither re-scopes a write nor exposes that workspace's record", async () => {
      const subject = `rp2 spoof ${RUN}`;
      const sent = await sendInApp(adminA, subject, { "x-workspace-id": WS_B });
      expect(sent.status).toBe(200);
      expect(sent.body.notification.workspaceId).toBe(WS_A);
      const audit = await db.auditEvent.findFirst({ where: { eventName: "notification.sent", entityId: sent.body.notification.id } });
      expect(audit?.workspaceId).toBe(WS_A);

      const list = await call("GET", "/api/notifications", { session: adminA.token, headers: { "x-workspace-id": WS_B } });
      expect(list.status).toBe(200);
      expect(list.body.notifications.map((n: { subject: string }) => n.subject)).toContain(subject);
      for (const n of list.body.notifications) expect(n.workspaceId).toBe(WS_A);

      const theirs = await sendInApp(adminB, `rp2 ws-b private ${RUN}`);
      expect(theirs.status).toBe(200);
      const theirId = theirs.body.notification.id as string;
      // Owner positive control: the record exists and its own workspace can read it.
      const own = await call("GET", `/api/notifications/${theirId}`, { session: adminB.token });
      expect(own.status).toBe(200);
      expect(own.body.notification.id).toBe(theirId);
      // Spoofed header claiming WS_B: the workspace-scoped lookup finds nothing -> tenant-safe 404
      // (#708: indistinguishable from a non-existent id). Only the caller-supplied id is echoed;
      // no field of the other workspace's record and not its workspace id.
      const spoof = await call("GET", `/api/notifications/${theirId}`, { session: adminA.token, headers: { "x-workspace-id": WS_B } });
      expect(spoof.status).toBe(404);
      expect(spoof.body).toEqual({
        error: `Notification not found: ${theirId}`,
        correlationId: spoof.correlationId,
        classification: "handler_invocation_not_found",
        stage: "handler_invocation",
      });
      expect(spoof.text).not.toContain("ws-b private");
      expect(spoof.text).not.toContain(WS_B);
    });
  });

  describe("5. Cross-workspace data access -> blocked", () => {
    // The export body's nested objects are currently emptied by the route's serializer (a
    // JSON.stringify key-array replacer allowlists only top-level keys; RP2 report finding), so the
    // controls pin status and envelope keys, not nested fields.
    it("decision export of another workspace's item returns no data; own item and owner's export -> 200", async () => {
      const envelope = ["accuracy", "actualOutcome", "auditTrail", "decision", "delta", "expectedImpact", "inputs", "outputs"];
      const own = await call("GET", `/api/decision/export?decisionId=${ITEM_A}`, { session: adminA.token });
      expect(own.status).toBe(200);
      expect(Object.keys(own.body).sort()).toEqual(envelope);

      const owner = await call("GET", `/api/decision/export?decisionId=${ITEM_B}`, { session: adminB.token });
      expect(owner.status).toBe(200);
      expect(Object.keys(owner.body).sort()).toEqual(envelope);

      // Same request from workspace A, even naming WS_B in the header: the workspace-scoped lookup
      // finds nothing -> tenant-safe 404 (#708/#710 typed not-found; formerly a generic 500).
      const cross = await call("GET", `/api/decision/export?decisionId=${ITEM_B}`, { session: adminA.token, headers: { "x-workspace-id": WS_B } });
      expect(cross.status).toBe(404);
      expect(cross.body).toEqual({
        error: `Decision not found: ${ITEM_B}`,
        correlationId: cross.correlationId,
        classification: "handler_invocation_not_found",
        stage: "handler_invocation",
      });
      expect(cross.text).not.toContain(ITEM_B_PROBLEM);
      expect(cross.text).not.toContain(WS_B);
    });
  });

  describe("6. Unauthenticated audit access -> blocked", () => {
    it("GET /api/audit with no headers at all -> 401", async () => {
      expectAuthGate401(await call("GET", "/api/audit"));
    });
  });

  describe("7. Unauthenticated value access -> blocked", () => {
    it("GET /api/value/summary -> 401", async () => {
      expectAuthGate401(await call("GET", "/api/value/summary"));
    });

    it("GET /api/value/7day -> 401", async () => {
      expectAuthGate401(await call("GET", "/api/value/7day"));
    });
  });

  describe("8. Unauthenticated intelligence access -> blocked", () => {
    it("GET /api/intelligence/insights -> 401", async () => {
      expectAuthGate401(await call("GET", "/api/intelligence/insights", { headers: { "x-workspace-id": WS_A } }));
    });

    it("GET /api/intelligence/patterns -> 401", async () => {
      expectAuthGate401(await call("GET", "/api/intelligence/patterns", { headers: { "x-workspace-id": WS_A } }));
    });
  });

  describe("9. Unauthenticated quota access -> blocked", () => {
    it("GET /api/entitlement/quota -> 401", async () => {
      expectAuthGate401(await call("GET", "/api/entitlement/quota", { headers: { "x-workspace-id": WS_A } }));
    });

    it("POST /api/entitlement/quota -> 401", async () => {
      expectAuthGate401(await call("POST", "/api/entitlement/quota", { headers: { "x-workspace-id": WS_A }, json: { type: "action" } }));
    });
  });

  describe("10. Unauthenticated notification access -> blocked", () => {
    it("GET /api/notifications -> 401", async () => {
      expectAuthGate401(await call("GET", "/api/notifications", { headers: { "x-workspace-id": WS_A } }));
    });

    it("GET /api/notifications/preferences -> 401", async () => {
      expectAuthGate401(await call("GET", "/api/notifications/preferences", { headers: { "x-workspace-id": WS_A } }));
    });

    it("GET /api/notifications/[id] -> 401 even for an id that exists", async () => {
      const sent = await sendInApp(adminA, `rp2 unauth-id ${RUN}`);
      expect(sent.status).toBe(200);
      const res = await call("GET", `/api/notifications/${sent.body.notification.id}`, { headers: { "x-workspace-id": WS_A } });
      expectAuthGate401(res);
      expect(res.text).not.toContain("unauth-id");
    });
  });

  describe("Positive control for groups 1, 6-10", () => {
    it("every route rejected above answers 200 to an authorized session (the 401s come from the gate, not a dead route)", async () => {
      const sent = await sendInApp(adminA, `rp2 control ${RUN}`);
      expect(sent.status).toBe(200);
      const requests: Array<[string, string, unknown?]> = [
        ["GET", "/api/audit"],
        ["GET", "/api/value/7day"],
        ["GET", "/api/value/summary"],
        ["POST", "/api/verify", { inputs: {}, decisionHash: "test" }],
        ["GET", "/api/intelligence/insights"],
        ["GET", "/api/intelligence/patterns"],
        ["GET", "/api/entitlement/quota"],
        ["POST", "/api/entitlement/quota", { type: "action" }],
        ["GET", "/api/notifications"],
        ["GET", "/api/notifications/preferences"],
        ["GET", `/api/notifications/${sent.body.notification.id}`],
      ];
      for (const [method, path, json] of requests) {
        const res = await call(method, path, { session: adminA.token, json });
        expect({ path: `${method} ${path}`, status: res.status }).toEqual({ path: `${method} ${path}`, status: 200 });
      }
    });
  });

  describe("11. Invalid Stripe signature -> 401, nothing recorded", () => {
    it("well-formed event signed with an attacker secret, and a garbage signature header -> 401, no webhook row; correctly signed -> 200 once applied", async () => {
      const id = nextEventId();
      const payload = checkoutCompleted(id);
      for (const signature of [signStripe(payload, "whsec_attacker"), "invalid-signature-xyz"]) {
        const res = await postStripe(payload, signature);
        expect(res.status).toBe(401);
        expect(res.text).not.toContain(id);
      }
      expect(await webhookRows(id)).toBe(0);
      expect((await db.subscription.findUnique({ where: { id: SUB_ID } }))?.status).toBe("trialing");

      const genuine = await postStripe(payload, signStripe(payload));
      expect(genuine.status).toBe(200);
      expect(genuine.body).toEqual({ received: true, id, type: "checkout.session.completed", status: "processed" });
      // The response is sent after settlement: the row is already processed.
      expect((await db.webhookEvent.findUnique({ where: { stripeEventId: id } }))?.status).toBe("processed");
    });
  });

  describe("12. Replayed Stripe event -> safe duplicate", () => {
    it("redelivery and byte-identical replay -> 200 duplicate; one row, one activation audit, state unchanged", async () => {
      const id = nextEventId();
      const payload = checkoutCompleted(id);
      const header = signStripe(payload);

      const first = await postStripe(payload, header);
      expect(first.status).toBe(200);
      expect((await db.webhookEvent.findUnique({ where: { stripeEventId: id } }))?.status).toBe("processed");
      const activations = () => db.auditEvent.count({ where: { eventName: "subscription.activated", entityId: SUB_ID, correlationId: id } });
      expect(await activations()).toBe(1);
      const subAfterFirst = await db.subscription.findUnique({ where: { id: SUB_ID } });
      expect(subAfterFirst).toMatchObject({ status: "active", stripeSubscriptionId: STRIPE_SUB });

      const redelivery = await postStripe(payload, signStripe(payload));
      expect(redelivery.status).toBe(200);
      expect(redelivery.body).toEqual({ received: true, duplicate: true });
      const replay = await postStripe(payload, header);
      expect(replay.status).toBe(200);
      expect(replay.body).toEqual({ received: true, duplicate: true });

      expect(await webhookRows(id)).toBe(1);
      expect(await activations()).toBe(1);
      expect((await db.subscription.findUnique({ where: { id: SUB_ID } }))?.updatedAt.getTime()).toBe(subAfterFirst?.updatedAt.getTime());
    });
  });

  describe("13. Oversized payload", () => {
    // No request-body size limit exists on these App Router handlers (none in next.config.ts,
    // middleware.ts or withCanonicalEnforcement), so no 413 contract can be asserted; recorded as
    // a finding. The enforced property is that an unauthenticated body is never read: auth runs
    // before the handler parses anything.
    it("10MB unparseable body without a session -> 401 from the auth gate, body never parsed", async () => {
      const res = await call("POST", "/api/verify", { raw: `{${"x".repeat(10 * 1024 * 1024)}` });
      expectAuthGate401(res);
    });
  });

  describe("14. Malformed JSON -> fails closed", () => {
    it("authenticated malformed body -> 400 with no parser detail (#708); well-formed body -> 200", async () => {
      const bad = await call("POST", "/api/verify", { session: adminA.token, raw: "{invalid json}" });
      expect(bad.status).toBe(400);
      expect(bad.body).toEqual({
        error: "Invalid JSON in request body",
        correlationId: bad.correlationId,
        classification: "handler_invocation_validation_error",
        stage: "handler_invocation",
      });
      // The fixed client message names the fault class only; no parser internals leak.
      expect(bad.text).not.toMatch(/Unexpected token|position \d|SyntaxError|at JSON\.parse/i);

      const good = await call("POST", "/api/verify", { session: adminA.token, json: { inputs: {}, decisionHash: "test" } });
      expect(good.status).toBe(200);
      expect(good.body).toMatchObject({ valid: false, hashMatches: false, originalHash: "test" });
    });

    it("unauthenticated malformed body -> 401 (auth precedes parsing)", async () => {
      expectAuthGate401(await call("POST", "/api/verify", { raw: "{invalid json}" }));
    });
  });

  // 15 (rate-limit abuse on /api/health) is intentionally absent: no rate limiter exists on
  // /api/health or on any route this file dispatches (probes are exempt by design), so the former
  // case could only assert that 100 requests got some status. The limiters that do exist
  // (/api/actions, /api/run) are recorded in the RP2 report as findings.

  describe("16. Correlation ID propagation", () => {
    it("a supplied x-correlation-id is echoed on the rejection and success paths; absent, the server mints one", async () => {
      const denied = await call("GET", "/api/audit", { correlationId: "rp2-fixed-correlation" });
      expect(denied.headers.get("x-correlation-id")).toBe("rp2-fixed-correlation");
      expect(denied.body.correlationId).toBe("rp2-fixed-correlation");

      const ok = await call("GET", "/api/audit", { session: adminA.token, correlationId: "rp2-fixed-correlation-ok" });
      expect(ok.status).toBe(200);
      expect(ok.headers.get("x-correlation-id")).toBe("rp2-fixed-correlation-ok");
      expect(ok.headers.get("x-trace-id")).toMatch(/\S+/);

      const minted = await call("GET", "/api/audit", { correlationId: null });
      expect(minted.headers.get("x-correlation-id")).toMatch(/^corr-\d+-[a-z0-9]+$/);
      expect(minted.body.correlationId).toBe(minted.headers.get("x-correlation-id"));
    });
  });

  describe("17. Audit emission verification", () => {
    it("sending a notification over HTTP writes exactly one notification.sent audit row attributed to the verified actor and workspace", async () => {
      const sent = await sendInApp(adminA, `rp2 audit ${RUN}`);
      expect(sent.status).toBe(200);
      const notificationId = sent.body.notification.id as string;
      const rows = await db.auditEvent.findMany({ where: { eventName: "notification.sent", entityId: notificationId } });
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ actorId: adminA.id, workspaceId: WS_A, entityType: "notification", visibility: "internal" });
      expect(rows[0].payload).toMatchObject({ channel: "in_app", type: "action_completed", status: "delivered" });

      // Read back through the real audit API (same workspace, audit:view).
      const viaApi = await call("GET", "/api/audit", { session: adminA.token });
      expect(viaApi.status).toBe(200);
      expect(viaApi.body.events.map((e: { entityId: string }) => e.entityId)).toContain(notificationId);
    });
  });

  describe("18. DTO leakage scan", () => {
    it("authorized responses never carry password hashes, session tokens or credential fields", async () => {
      const sent = await sendInApp(adminA, `rp2 dto ${RUN}`);
      expect(sent.status).toBe(200);
      const responses = [
        sent,
        await call("GET", "/api/notifications", { session: adminA.token }),
        await call("GET", `/api/notifications/${sent.body.notification.id}`, { session: adminA.token }),
        await call("GET", "/api/audit", { session: adminA.token }),
        await call("GET", `/api/decision/export?decisionId=${ITEM_A}`, { session: adminA.token }),
      ];
      for (const res of responses) {
        expect(res.status).toBe(200);
        for (const a of ALL_ACTORS) {
          expect(res.text).not.toContain(a.hashedPassword);
          expect(res.text).not.toContain(a.token);
        }
        expect(res.text).not.toMatch(/"(hashedPassword|hashed_password|passwordHash|sessionToken)"\s*:/);
      }
      // The scanned bodies are real data, not empty envelopes.
      expect(responses[1].body.notifications.length).toBeGreaterThan(0);
      expect(responses[3].body.events.length).toBeGreaterThan(0);
      expect(Object.keys(responses[4].body)).toContain("decision");
    });
  });

  describe("Endpoint exemptions (probes reachable without auth)", () => {
    it("/api/health -> 200 healthy database check without a session", async () => {
      const res = await call("GET", "/api/health");
      expect(res.status).toBe(200);
      expect(res.body.checks.database.status).toBe("healthy");
    });

    // The DB lane's global setup migrates the database and initializes startup status to READY, so
    // the probe is genuinely ready here.
    it("/api/readiness -> 200 ready without a session", async () => {
      const res = await call("GET", "/api/readiness");
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ is_ready: true, startup_status: "READY", database_healthy: true, status: 200 });
    });

    it("/api/liveness -> 200 alive without a session", async () => {
      const res = await call("GET", "/api/liveness");
      expect(res.status).toBe(200);
      expect(res.body.is_alive).toBe(true);
    });
  });
});
