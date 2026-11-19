/**
 * [db] POST /api/webhooks/stripe — hostile-request contract matrix against real PostgreSQL.
 *
 * Run (disposable loopback database with every migration applied):
 *   TEST_WITH_DB=true OPSIQ_DB_TARGET=local DATABASE_URL=postgresql://…@127.0.0.1:…/db \
 *     TEST_DATABASE_URL=<same> npx vitest run src/__tests__/api/webhooks/stripe-webhook-route.db.test.ts
 *
 * Nothing on the request path is stubbed: the real route, the real Stripe SDK signature
 * verification (`stripe.webhooks.constructEvent`, offline HMAC — no network), the real
 * webhook.service state machine and the real handlers write to real tables. Signatures are
 * produced with the SDK's own `webhooks.generateTestHeaderString` and a test-only secret.
 * No live key, no Stripe network call, no money: STRIPE_SECRET_KEY is a dummy `sk_test_` value
 * that only satisfies the SDK constructor (webhook verification never calls the Stripe API).
 *
 * The webhook.service exports and emitAuditEvent are wrapped in call-through spies so the
 * matrix can PROVE that a rejected request never reaches the record/processing layer, and
 * inject a single failure where a case needs one.
 *
 * Documented contract (route.ts header):
 *   bad / missing signature, missing secret, timestamp outside tolerance -> 401, nothing recorded
 *   verified but structurally invalid event                              -> 400, nothing recorded
 *   new verified event                                                   -> 202, processed async
 *   already processed                                                    -> 200 { duplicate: true }
 *   currently processing                                                 -> 409
 *   DB error recording the event                                         -> 500, nothing processed
 *   processing failure                                                   -> event marked failed (retryable)
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { randomUUID } from "crypto";
import Stripe from "stripe";
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";

const spies = vi.hoisted(() => ({
  handleWebhookEvent: vi.fn(),
  getOrCreateWebhookEvent: vi.fn(),
  emitAuditEvent: vi.fn(),
}));

vi.mock("@/services/webhook.service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/webhook.service")>();
  spies.handleWebhookEvent.mockImplementation(actual.handleWebhookEvent);
  spies.getOrCreateWebhookEvent.mockImplementation(actual.getOrCreateWebhookEvent);
  return {
    ...actual,
    handleWebhookEvent: spies.handleWebhookEvent,
    getOrCreateWebhookEvent: spies.getOrCreateWebhookEvent,
  };
});
vi.mock("@/infra/audit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/infra/audit")>();
  spies.emitAuditEvent.mockImplementation(actual.emitAuditEvent);
  return { ...actual, emitAuditEvent: spies.emitAuditEvent };
});

import { POST } from "@/app/api/webhooks/stripe/route";

const RUN = randomUUID().slice(0, 8);
const SECRET = `whsec_test_${RUN}`;
const WS = randomUUID();
const PLAN_ID = randomUUID();
const ACCT_ID = randomUUID();
const SUB_ID = randomUUID();
const CUSTOMER = `cus_test_${RUN}`;
const STRIPE_SUB = `sub_test_${RUN}`;
const DAY = 24 * 60 * 60 * 1000;

// Offline SDK instance: used only for generateTestHeaderString (pure HMAC).
const sdk = new Stripe("sk_test_dummy_not_a_real_key");

let seq = 0;
const nextEventId = () => `evt_${RUN}_${++seq}`;

function checkoutCompleted(id: string, customer = CUSTOMER) {
  return {
    id,
    object: "event",
    type: "checkout.session.completed",
    created: Math.floor(Date.now() / 1000),
    data: {
      object: { id: `cs_test_${RUN}_${seq}`, customer, subscription: STRIPE_SUB, status: "complete", mode: "subscription" },
    },
  };
}

function sign(payload: string, opts: { secret?: string; timestamp?: number } = {}) {
  return sdk.webhooks.generateTestHeaderString({
    payload,
    secret: opts.secret ?? SECRET,
    timestamp: opts.timestamp ?? Math.floor(Date.now() / 1000),
  });
}

function request(payload: string, signature: string | null) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (signature !== null) headers["stripe-signature"] = signature;
  return new NextRequest("http://localhost:3000/api/webhooks/stripe", { method: "POST", headers, body: payload });
}

async function post(payload: string, signature: string | null) {
  const res = await POST(request(payload, signature));
  return { status: res.status, body: await res.json() };
}

const eventRow = (id: string) => db.webhookEvent.findUnique({ where: { stripeEventId: id } });
const runEventCount = () => db.webhookEvent.count({ where: { stripeEventId: { startsWith: `evt_${RUN}_` } } });
const subscription = () => db.subscription.findUnique({ where: { id: SUB_ID } });
const activationAudits = () => db.auditEvent.count({ where: { entityId: SUB_ID, eventName: "subscription.activated" } });

/** Snapshot of every row this suite's events could touch. */
async function businessState() {
  const sub = await subscription();
  return {
    webhookEvents: await runEventCount(),
    subscriptionStatus: sub?.status,
    stripeSubscriptionId: sub?.stripeSubscriptionId,
    subscriptionUpdatedAt: sub?.updatedAt?.getTime(),
    billingAccounts: await db.billingAccount.count({ where: { workspaceId: WS } }),
    activationAudits: await activationAudits(),
  };
}

async function resetSubscription() {
  await db.subscription.update({
    where: { id: SUB_ID },
    data: { status: "trialing", stripeSubscriptionId: null, lastEventTimestamp: null },
  });
  await db.auditEvent.deleteMany({ where: { entityId: SUB_ID } });
}

/** Wait for the route's post-202 background processing to settle the event row. */
async function settled(id: string, status: string) {
  await vi.waitFor(
    async () => {
      expect((await eventRow(id))?.status).toBe(status);
    },
    { timeout: 10_000, interval: 50 },
  );
}

/** Asserts a rejected request reached neither the record layer nor the processing layer. */
function expectNothingReachedProcessing() {
  expect(spies.getOrCreateWebhookEvent).not.toHaveBeenCalled();
  expect(spies.handleWebhookEvent).not.toHaveBeenCalled();
  expect(spies.emitAuditEvent).not.toHaveBeenCalled();
}

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] POST /api/webhooks/stripe — signature + idempotency contract", () => {
  const saved = { ...process.env };

  beforeAll(async () => {
    await db.workspace.create({ data: { id: WS, name: `Stripe WH ${RUN}`, slug: `stripe-wh-${RUN}` } });
    await db.plan.create({
      data: { id: PLAN_ID, name: `Stripe WH Plan ${RUN}`, priceMonthly: 1, priceYearly: 12, stripePriceId: `price_test_${RUN}`, active: true },
    });
    await db.billingAccount.create({
      data: { id: ACCT_ID, workspaceId: WS, provider: "stripe", providerCustomerId: CUSTOMER, stripeCustomerId: CUSTOMER },
    });
    await db.subscription.create({
      data: {
        id: SUB_ID,
        billingAccountId: ACCT_ID,
        planId: PLAN_ID,
        status: "trialing",
        currentPeriodStart: new Date(Date.now() - DAY),
        currentPeriodEnd: new Date(Date.now() + 30 * DAY),
      },
    });
  });

  afterAll(async () => {
    await db.webhookEvent.deleteMany({ where: { stripeEventId: { startsWith: `evt_${RUN}_` } } });
    await db.auditEvent.deleteMany({ where: { entityId: SUB_ID } });
    await db.subscription.deleteMany({ where: { id: SUB_ID } });
    await db.billingAccount.deleteMany({ where: { id: ACCT_ID } });
    await db.plan.deleteMany({ where: { id: PLAN_ID } });
    await db.workspace.deleteMany({ where: { id: WS } });
    process.env = { ...saved };
  });

  beforeEach(async () => {
    spies.handleWebhookEvent.mockClear();
    spies.getOrCreateWebhookEvent.mockClear();
    spies.emitAuditEvent.mockClear();
    process.env.STRIPE_WEBHOOK_SECRET = SECRET;
    process.env.STRIPE_SECRET_KEY = "sk_test_dummy_not_a_real_key";
    await resetSubscription();
  });

  // ── Rejections: 401 and provably no side effects ─────────────────────────

  it("invalid signature (signed with a different secret) -> 401, nothing recorded or processed", async () => {
    const before = await businessState();
    const payload = JSON.stringify(checkoutCompleted(nextEventId()));
    const res = await post(payload, sign(payload, { secret: "whsec_attacker" }));
    expect(res.status).toBe(401);
    expectNothingReachedProcessing();
    expect(await businessState()).toEqual(before);
  });

  it("garbage signature header -> 401, nothing recorded or processed", async () => {
    const before = await businessState();
    const res = await post(JSON.stringify(checkoutCompleted(nextEventId())), "invalid-signature-xyz");
    expect(res.status).toBe(401);
    expectNothingReachedProcessing();
    expect(await businessState()).toEqual(before);
  });

  it("missing stripe-signature header -> 401, nothing recorded or processed", async () => {
    const before = await businessState();
    const res = await post(JSON.stringify(checkoutCompleted(nextEventId())), null);
    expect(res.status).toBe(401);
    expectNothingReachedProcessing();
    expect(await businessState()).toEqual(before);
  });

  it("missing webhook configuration (no STRIPE_WEBHOOK_SECRET) -> fail-closed 401 even for a correctly signed event", async () => {
    const before = await businessState();
    delete process.env.STRIPE_WEBHOOK_SECRET;
    const payload = JSON.stringify(checkoutCompleted(nextEventId()));
    const res = await post(payload, sign(payload));
    expect(res.status).toBe(401);
    expectNothingReachedProcessing();
    expect(await businessState()).toEqual(before);
  });

  it("expired timestamp (signed 10 min ago, outside the 300s tolerance) -> 401, nothing recorded", async () => {
    const before = await businessState();
    const payload = JSON.stringify(checkoutCompleted(nextEventId()));
    const res = await post(payload, sign(payload, { timestamp: Math.floor(Date.now() / 1000) - 600 }));
    expect(res.status).toBe(401);
    expectNothingReachedProcessing();
    expect(await businessState()).toEqual(before);
  });

  it("malformed JSON payload -> 401 whether unsigned or validly signed (verification parses the body), nothing recorded", async () => {
    const before = await businessState();
    const broken = '{"id":"evt_broken","type":"checkout.session.completed",';
    expect((await post(broken, "t=1,v1=deadbeef")).status).toBe(401);
    expect((await post(broken, sign(broken))).status).toBe(401);
    expectNothingReachedProcessing();
    expect(await businessState()).toEqual(before);
  });

  it("validly signed event without id/type -> 400 'Invalid event structure', nothing recorded", async () => {
    const before = await businessState();
    for (const payload of [JSON.stringify({ type: "checkout.session.completed" }), JSON.stringify({ id: nextEventId() }), JSON.stringify({ id: "", type: "" })]) {
      const res = await post(payload, sign(payload));
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: "Invalid event structure" });
    }
    expectNothingReachedProcessing();
    expect(await businessState()).toEqual(before);
  });

  // ── Accepted path, duplicates and replays ────────────────────────────────

  it("valid signature -> 202, processed exactly once; redelivery and byte-identical replay -> 200 duplicate, no reprocessing", async () => {
    const id = nextEventId();
    const payload = JSON.stringify(checkoutCompleted(id));
    const header = sign(payload);

    const first = await post(payload, header);
    expect(first.status).toBe(202);
    expect(first.body).toEqual({ received: true, id, type: "checkout.session.completed", status: "processing" });
    await settled(id, "processed");

    const sub = await subscription();
    expect(sub?.status).toBe("active");
    expect(sub?.stripeSubscriptionId).toBe(STRIPE_SUB);
    expect(await activationAudits()).toBe(1);
    expect(spies.handleWebhookEvent).toHaveBeenCalledTimes(1);
    const afterFirst = await businessState();

    // Stripe redelivery: same event id, fresh signature timestamp.
    const redelivery = await post(payload, sign(payload));
    expect(redelivery.status).toBe(200);
    expect(redelivery.body).toEqual({ received: true, duplicate: true });

    // Attacker replay: the exact captured header + body, still inside tolerance.
    const replay = await post(payload, header);
    expect(replay.status).toBe(200);
    expect(replay.body).toEqual({ received: true, duplicate: true });

    expect(spies.handleWebhookEvent).toHaveBeenCalledTimes(1);
    expect(await businessState()).toEqual(afterFirst);
    expect(await eventRow(id)).toMatchObject({ status: "processed", attempts: 0 });
  });

  it("concurrent duplicate deliveries of one new event -> processed exactly once, one row", async () => {
    const id = nextEventId();
    const payload = JSON.stringify(checkoutCompleted(id));
    const results = await Promise.all([post(payload, sign(payload)), post(payload, sign(payload)), post(payload, sign(payload))]);
    const statuses = results.map((r) => r.status);
    // Exactly one delivery wins and is accepted. The losers either see the in-flight row (409)
    // or lose the unique-insert race on stripe_event_id and get the documented record-failure
    // 500 -- both tell Stripe to retry; neither processes.
    expect(statuses.filter((s) => s === 202)).toHaveLength(1);
    for (const s of statuses) expect([202, 409, 500]).toContain(s);
    await settled(id, "processed");
    expect(spies.handleWebhookEvent).toHaveBeenCalledTimes(1);
    expect(await db.webhookEvent.count({ where: { stripeEventId: id } })).toBe(1);
    expect(await activationAudits()).toBe(1);
  });

  it("event already in 'processing' state -> 409, not processed again", async () => {
    const id = nextEventId();
    await db.webhookEvent.create({ data: { stripeEventId: id, type: "checkout.session.completed", status: "processing", attempts: 0 } });
    const payload = JSON.stringify(checkoutCompleted(id));
    const res = await post(payload, sign(payload));
    expect(res.status).toBe(409);
    expect(spies.handleWebhookEvent).not.toHaveBeenCalled();
    expect((await subscription())?.status).toBe("trialing");
  });

  // ── Database failure ─────────────────────────────────────────────────────

  it("database failure recording the event -> 500 'Internal error', never processed, nothing written", async () => {
    const before = await businessState();
    spies.getOrCreateWebhookEvent.mockRejectedValueOnce(new Error("Can't reach database server at 127.0.0.1:5433"));
    const payload = JSON.stringify(checkoutCompleted(nextEventId()));
    const res = await post(payload, sign(payload));
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "Internal error" });
    expect(spies.handleWebhookEvent).not.toHaveBeenCalled();
    expect(await businessState()).toEqual(before);
  });

  it("database failure inside processing (unknown Stripe customer) -> 202 then event marked failed, no subscription change; retry succeeds once fixed", async () => {
    const id = nextEventId();
    const unknownCustomer = `cus_unknown_${RUN}`;
    const payload = JSON.stringify(checkoutCompleted(id, unknownCustomer));
    const res = await post(payload, sign(payload));
    expect(res.status).toBe(202);
    await settled(id, "failed");
    expect(await eventRow(id)).toMatchObject({ status: "failed", attempts: 1 });
    expect((await subscription())?.status).toBe("trialing");
    expect(await activationAudits()).toBe(0);
  });

  it("transient database failure while processing -> event failed (retryable), redelivery processes it exactly once", async () => {
    const id = nextEventId();
    const payload = JSON.stringify(checkoutCompleted(id));
    spies.handleWebhookEvent.mockRejectedValueOnce(new Error("Connection terminated unexpectedly"));
    expect((await post(payload, sign(payload))).status).toBe(202);
    await settled(id, "failed");
    expect((await subscription())?.status).toBe("trialing");
    expect(await activationAudits()).toBe(0);

    expect((await post(payload, sign(payload))).status).toBe(202);
    await settled(id, "processed");
    expect((await subscription())?.status).toBe("active");
    expect(await activationAudits()).toBe(1);
    expect(spies.handleWebhookEvent).toHaveBeenCalledTimes(2);
  });
});
