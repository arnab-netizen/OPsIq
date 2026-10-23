import { describe, it, expect, beforeEach, vi } from "vitest";
import type { createFakeBillingDb } from "./fake-billing-db";

const h = vi.hoisted(() => ({ fake: null as unknown as ReturnType<typeof createFakeBillingDb> }));
vi.mock("@/lib/db", async () => {
  const m = await import("./fake-billing-db");
  h.fake = m.createFakeBillingDb();
  return { db: h.fake.db, getDbInstance: async () => h.fake.db };
});
vi.mock("@/infra/audit", () => ({
  emitAuditEvent: vi.fn(async (input: Record<string, unknown>) => { h.fake.audits.push(input); return "a"; }),
}));

import { processPaddleEvent, PaddleEventRejectedError } from "@/services/billing/paddle-webhook.service";
import { resolveAccess } from "@/domain/billing/paddle";
const isEntitledStatus = (status: string) => resolveAccess({ status, currentPeriodEnd: new Date("2026-11-01T00:00:00Z") }, new Date("2026-10-20T00:00:00Z")).access === "paid";

const WS_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const WS_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const PRICE = "pri_pro";

function sub(over: Record<string, unknown> = {}, ws: string | null = WS_A) {
  return {
    id: "sub_1",
    status: "active",
    customer_id: "ctm_A",
    custom_data: ws ? { workspaceId: ws, billingAccountId: ws === WS_A ? "acct-A" : ws === WS_B ? "acct-B" : "acct-none" } : null,
    items: [{ price: { id: PRICE } }],
    current_billing_period: { starts_at: "2026-10-01T00:00:00Z", ends_at: "2026-11-01T00:00:00Z" },
    scheduled_change: null,
    canceled_at: null,
    ...over,
  };
}
function evt(type: string, at: string, data: Record<string, unknown>, id = `evt_${type}_${at}`) {
  return { event_id: id, event_type: type, occurred_at: at, data };
}
const statusOf = (ws: string) => {
  const acct = h.fake.accounts.find((a) => a.workspaceId === ws);
  return h.fake.subs.find((s) => s.billingAccountId === acct?.id);
};

beforeEach(() => {
  h.fake.plans.length = h.fake.accounts.length = h.fake.subs.length = h.fake.audits.length = 0;
  h.fake.plans.push({ id: "plan-1", paddlePriceId: PRICE });
  h.fake.accounts.push({ id: "acct-A", workspaceId: WS_A, paddleCustomerId: null }, { id: "acct-B", workspaceId: WS_B, paddleCustomerId: null });
});

describe("Paddle webhook → subscription state", () => {
  it("creates an ACTIVE subscription, binds the customer, grants entitlement, audits", async () => {
    const out = await processPaddleEvent(evt("subscription.created", "2026-10-01T10:00:00Z", sub()));
    expect(out).toBe("applied");
    const row = statusOf(WS_A)!;
    expect(isEntitledStatus(row.status)).toBe(true);
    expect(row.paddleSubscriptionId).toBe("sub_1");
    expect(h.fake.accounts[0].paddleCustomerId).toBe("ctm_A");
    expect(h.fake.audits.map((a) => a.eventName)).toEqual(["billing.subscription_synced", "subscription.activated"]);
    expect(h.fake.audits.every((a) => a.workspaceId === WS_A)).toBe(true);
  });

  it("is tenant isolated: workspace B stays unentitled", async () => {
    await processPaddleEvent(evt("subscription.created", "2026-10-01T10:00:00Z", sub()));
    expect(statusOf(WS_B)).toBeUndefined();
  });

  it("rejects a bound customer replayed with another tenant's workspace claim (cross-tenant spoof)", async () => {
    await processPaddleEvent(evt("subscription.created", "2026-10-01T10:00:00Z", sub()));
    // Attacker-controlled custom_data claims tenant B but reuses tenant A's provider customer.
    await expect(
      processPaddleEvent(evt("subscription.updated", "2026-10-02T10:00:00Z", sub({ id: "sub_evil" }, WS_B))),
    ).rejects.toMatchObject({ reason: "tenant_mismatch" });
    expect(statusOf(WS_B)).toBeUndefined();
  });

  it("rejects when persisted subscription tenant disagrees with custom_data", async () => {
    await processPaddleEvent(evt("subscription.created", "2026-10-01T10:00:00Z", sub()));
    await expect(
      processPaddleEvent(evt("subscription.updated", "2026-10-02T10:00:00Z", sub({}, WS_B))),
    ).rejects.toBeInstanceOf(PaddleEventRejectedError);
  });

  it("rejects an unknown tenant (no billing account created by authenticated checkout)", async () => {
    const stranger = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    await expect(processPaddleEvent(evt("subscription.created", "2026-10-01T10:00:00Z", sub({}, stranger)))).rejects.toMatchObject({
      reason: "unknown_tenant",
    });
    await expect(processPaddleEvent(evt("subscription.created", "2026-10-01T10:00:00Z", sub({ customer_id: "ctm_x" }, null)))).rejects.toMatchObject({
      reason: "unknown_tenant",
    });
  });

  it("rejects a client-supplied workspace claim without the server-issued billingAccountId (public-token forgery)", async () => {
    const forged = sub({ customer_id: "ctm_attacker", custom_data: { workspaceId: WS_A } });
    await expect(processPaddleEvent(evt("subscription.created", "2026-10-01T10:00:00Z", forged))).rejects.toMatchObject({ reason: "unverified_binding" });
    const wrongId = sub({ customer_id: "ctm_attacker", custom_data: { workspaceId: WS_A, billingAccountId: "acct-B" } });
    await expect(processPaddleEvent(evt("subscription.created", "2026-10-01T10:00:01Z", wrongId))).rejects.toMatchObject({ reason: "unverified_binding" });
    expect(statusOf(WS_A)).toBeUndefined();
    expect(h.fake.accounts[0].paddleCustomerId).toBeNull();
  });

  it("a legacy (non-Paddle) live subscription row is never overwritten by a Paddle event", async () => {
    h.fake.subs.push({ id: "legacy", billingAccountId: "acct-A", status: "active", paddleSubscriptionId: null, lastEventTimestamp: null });
    await expect(processPaddleEvent(evt("subscription.created", "2026-10-01T10:00:00Z", sub()))).rejects.toMatchObject({
      reason: "second_live_subscription", orphanSubscriptionId: "sub_1",
    });
    expect(h.fake.subs[0]).toMatchObject({ id: "legacy", status: "active", paddleSubscriptionId: null });
  });

  it("a double payment is rejected with the orphan identified; the duplicate's own late cancel is ignored", async () => {
    await processPaddleEvent(evt("subscription.created", "2026-10-01T10:00:00Z", sub()));
    await expect(processPaddleEvent(evt("subscription.created", "2026-10-02T10:00:00Z", sub({ id: "sub_dup" })))).rejects.toMatchObject({ orphanSubscriptionId: "sub_dup" });
    expect(await processPaddleEvent(evt("subscription.canceled", "2026-10-02T10:00:05Z", sub({ id: "sub_dup", status: "canceled" })))).toBe("ignored");
    expect(statusOf(WS_A)).toMatchObject({ status: "active", paddleSubscriptionId: "sub_1" });
  });

  it("a delayed event of an OLDER lineage cannot resurrect access after re-subscribe + cancel", async () => {
    await processPaddleEvent(evt("subscription.created", "2026-10-01T10:00:00Z", sub()));
    await processPaddleEvent(evt("subscription.canceled", "2026-10-05T10:00:00Z", sub({ status: "canceled" })));
    await processPaddleEvent(evt("subscription.created", "2026-10-06T10:00:00Z", sub({ id: "sub_2" })));
    await processPaddleEvent(evt("subscription.canceled", "2026-10-07T10:00:00Z", sub({ id: "sub_2", status: "canceled" })));
    expect(await processPaddleEvent(evt("subscription.updated", "2026-10-03T10:00:00Z", sub()))).toBe("stale_ignored");
    expect(statusOf(WS_A)).toMatchObject({ status: "canceled", paddleSubscriptionId: "sub_2" });
  });

  it("equal timestamps: a terminal cancel wins the tie, anything else does not displace the stored state", async () => {
    await processPaddleEvent(evt("subscription.created", "2026-10-01T10:00:00Z", sub()));
    expect(await processPaddleEvent(evt("subscription.updated", "2026-10-01T10:00:00Z", sub({ status: "paused" })))).toBe("stale_ignored");
    expect(statusOf(WS_A)!.status).toBe("active");
    expect(await processPaddleEvent(evt("subscription.canceled", "2026-10-01T10:00:00Z", sub({ status: "canceled" })))).toBe("applied");
    expect(statusOf(WS_A)!.status).toBe("canceled");
  });

  it("rejects an unknown price id (fail closed, no entitlement)", async () => {
    await expect(
      processPaddleEvent(evt("subscription.created", "2026-10-01T10:00:00Z", sub({ items: [{ price: { id: "pri_other" } }] }))),
    ).rejects.toMatchObject({ reason: "unknown_price" });
    expect(statusOf(WS_A)).toBeUndefined();
  });

  it("ignores an out-of-order OLDER event (stale canceled cannot override newer active)", async () => {
    await processPaddleEvent(evt("subscription.updated", "2026-10-05T10:00:00Z", sub()));
    const out = await processPaddleEvent(evt("subscription.canceled", "2026-10-03T10:00:00Z", sub({ status: "canceled" })));
    expect(out).toBe("stale_ignored");
    expect(statusOf(WS_A)!.status).toBe("active");
    expect(h.fake.audits.at(-1)?.eventName).toBe("billing.subscription_stale_event_ignored");
  });

  it("accepts updated-before-created ordering (snapshots are order-agnostic)", async () => {
    expect(await processPaddleEvent(evt("subscription.updated", "2026-10-02T10:00:00Z", sub()))).toBe("applied");
    expect(await processPaddleEvent(evt("subscription.created", "2026-10-01T10:00:00Z", sub()))).toBe("stale_ignored");
    expect(statusOf(WS_A)!.status).toBe("active");
  });

  it("keeps entitlement while cancel is merely scheduled, removes it at subscription.canceled", async () => {
    await processPaddleEvent(evt("subscription.created", "2026-10-01T10:00:00Z", sub()));
    await processPaddleEvent(
      evt("subscription.updated", "2026-10-10T10:00:00Z", sub({ scheduled_change: { action: "cancel", effective_at: "2026-11-01T00:00:00Z" } })),
    );
    expect(statusOf(WS_A)).toMatchObject({ status: "active", cancelAtPeriodEnd: true });
    expect(isEntitledStatus(statusOf(WS_A)!.status)).toBe(true);
    await processPaddleEvent(
      evt("subscription.canceled", "2026-11-01T00:00:01Z", sub({ status: "canceled", canceled_at: "2026-11-01T00:00:00Z", current_billing_period: null })),
    );
    expect(statusOf(WS_A)!.status).toBe("canceled");
    expect(isEntitledStatus(statusOf(WS_A)!.status)).toBe(false);
  });

  it("failed payment (past_due) removes entitlement; recovery restores it", async () => {
    await processPaddleEvent(evt("subscription.created", "2026-10-01T10:00:00Z", sub()));
    await processPaddleEvent(evt("subscription.past_due", "2026-10-20T10:00:00Z", sub({ status: "past_due" })));
    expect(isEntitledStatus(statusOf(WS_A)!.status)).toBe(false);
    await processPaddleEvent(evt("subscription.updated", "2026-10-21T10:00:00Z", sub()));
    expect(isEntitledStatus(statusOf(WS_A)!.status)).toBe(true);
  });

  it("transaction events are audited only and never change entitlement", async () => {
    await processPaddleEvent(evt("subscription.created", "2026-10-01T10:00:00Z", sub()));
    h.fake.audits.length = 0;
    expect(await processPaddleEvent(evt("transaction.payment_failed", "2026-10-20T09:00:00Z", { id: "txn_1", subscription_id: "sub_1", customer_id: "ctm_A" }))).toBe("audited");
    expect(h.fake.audits[0].eventName).toBe("billing.payment_failed");
    expect(statusOf(WS_A)!.status).toBe("active");
    expect(await processPaddleEvent(evt("transaction.completed", "2026-10-20T09:00:00Z", { id: "txn_2", subscription_id: null, customer_id: "ctm_zzz" }))).toBe("ignored");
  });

  it("a second live subscription for the same account is rejected", async () => {
    await processPaddleEvent(evt("subscription.created", "2026-10-01T10:00:00Z", sub()));
    await expect(processPaddleEvent(evt("subscription.created", "2026-10-02T10:00:00Z", sub({ id: "sub_2" })))).rejects.toMatchObject({
      reason: "second_live_subscription",
    });
  });

  it("allows re-subscription after the previous subscription was canceled", async () => {
    await processPaddleEvent(evt("subscription.created", "2026-10-01T10:00:00Z", sub()));
    await processPaddleEvent(evt("subscription.canceled", "2026-10-15T10:00:00Z", sub({ status: "canceled" })));
    await processPaddleEvent(evt("subscription.created", "2026-10-16T10:00:00Z", sub({ id: "sub_2" })));
    expect(statusOf(WS_A)).toMatchObject({ status: "active", paddleSubscriptionId: "sub_2" });
  });

  it("unrelated event types are ignored", async () => {
    expect(await processPaddleEvent(evt("product.updated", "2026-10-01T10:00:00Z", {}))).toBe("ignored");
  });
});
