/**
 * Route contracts for:
 *   /api/owner/integrations/quickbooks          (status + connect/sync/disconnect)
 *   /api/owner/integrations/quickbooks/actions  (governed write actions)
 *   /api/webhooks/quickbooks                    (signed change notifications)
 *
 * Services are mocked; the canonical response helpers and request-body
 * validation are REAL, so schema strictness is actually exercised.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { isCanonicalJsonResponse } from "@/lib/canonical-json-response";

const m = vi.hoisted(() => ({
  getStatus: vi.fn(),
  start: vi.fn(),
  disconnect: vi.fn(),
  requestSync: vi.fn(),
  drain: vi.fn(),
  pushVendor: vi.fn(),
  pushCustomer: vi.fn(),
  pushPo: vi.fn(),
  recordBill: vi.fn(),
  inactivate: vi.fn(),
  listAccounts: vi.fn(),
  links: vi.fn(),
  webhook: vi.fn(),
  after: [] as Array<() => unknown>,
  options: [] as Array<Record<string, unknown>>,
}));

vi.mock("next/server", async (orig) => ({
  ...(await orig<typeof import("next/server")>()),
  after: (cb: () => unknown) => { m.after.push(cb); },
}));
vi.mock("@/services/quickbooks/qbo-connection.service", () => ({
  getQuickBooksStatus: m.getStatus,
  startQuickBooksConnect: m.start,
  disconnectQuickBooks: m.disconnect,
}));
vi.mock("@/services/quickbooks/qbo-sync.service", () => ({ requestQuickBooksSync: m.requestSync }));
vi.mock("@/services/quickbooks/qbo-sync-dispatch.service", () => ({ drainQuickBooksSyncTask: m.drain }));
vi.mock("@/services/quickbooks/qbo-webhook.service", () => ({ handleQuickBooksWebhook: m.webhook }));
vi.mock("@/services/quickbooks/qbo-write-actions.service", () => ({
  pushVendorToQuickBooks: m.pushVendor,
  pushCustomerToQuickBooks: m.pushCustomer,
  pushPurchaseOrderToQuickBooks: m.pushPo,
  recordBillForPurchaseOrder: m.recordBill,
  inactivatePartyInQuickBooks: m.inactivate,
  listQuickBooksExpenseAccounts: m.listAccounts,
  getQuickBooksLinks: m.links,
}));
vi.mock("@/lib/canonical-route-enforcement", () => ({
  withCanonicalEnforcement: (handler: (ctx: unknown) => Promise<unknown>, options: Record<string, unknown>) => {
    m.options.push(options);
    return async (request: Request) => {
      try {
        return await handler({ request, verifiedWorkspaceId: "ws-1", verifiedActorId: "actor-1" });
      } catch (e) {
        return { thrown: e };
      }
    };
  },
}));

import * as statusRoute from "@/app/api/owner/integrations/quickbooks/route";
import * as actionsRoute from "@/app/api/owner/integrations/quickbooks/actions/route";
import { POST as webhookPOST } from "@/app/api/webhooks/quickbooks/route";

type Handler = (r: Request) => Promise<unknown>;
const post = (h: unknown, url: string, body: unknown) =>
  (h as Handler)(new Request(url, { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } }));
const get = (h: unknown, url: string) => (h as Handler)(new Request(url));
const S = "https://app.example.com/api/owner/integrations/quickbooks";
const A = `${S}/actions`;
const UUID = "0b2f5b8e-8b5f-4c7e-9b1e-6f7a2a1c3d4e";

function thrownName(res: unknown): string | undefined {
  return (res as { thrown?: Error }).thrown?.name;
}

beforeEach(() => {
  for (const f of Object.values(m)) if (typeof f === "function" && "mockReset" in f) (f as ReturnType<typeof vi.fn>).mockReset();
  m.after.length = 0;
});

describe("capability gates", () => {
  it("GETs require OWNER_VIEW, POSTs OWNER_MANAGE, all workspace-scoped", () => {
    // status GET, status POST, actions GET, actions POST (declaration order)
    const caps = m.options.map((o) => (o.requireCapabilities as string[])[0]);
    expect(caps).toEqual(["owner:view", "owner:manage", "owner:view", "owner:manage"]);
    expect(m.options.every((o) => o.requireWorkspace === true)).toBe(true);
  });
});

describe("status route", () => {
  it("GET returns the service DTO for the verified workspace", async () => {
    m.getStatus.mockResolvedValue({ available: false });
    const res = await get(statusRoute.GET, S);
    expect(isCanonicalJsonResponse(res)).toBe(true);
    expect(m.getStatus).toHaveBeenCalledWith({ workspaceId: "ws-1" });
  });

  it("connect requires a uuid businessId and passes server-verified ids", async () => {
    expect(thrownName(await post(statusRoute.POST, S, { action: "connect", businessId: "nope" }))).toBe("ValidationError");
    m.start.mockResolvedValue({ authorizeUrl: "https://appcenter.intuit.com/connect/oauth2?x", connectorId: "c" });
    await post(statusRoute.POST, S, { action: "connect", businessId: UUID, workspaceId: "attacker-ws" });
    expect(m.start).toHaveBeenCalledWith({ workspaceId: "ws-1", actorId: "actor-1", businessId: UUID });
  });

  it("disconnect requires confirm:true", async () => {
    expect(thrownName(await post(statusRoute.POST, S, { action: "disconnect" }))).toBe("ValidationError");
    expect(m.disconnect).not.toHaveBeenCalled();
  });

  it("sync returns 202 and drains its own task after the response", async () => {
    m.requestSync.mockResolvedValue({ taskId: "t9", deduplicated: false });
    const res = (await post(statusRoute.POST, S, { action: "sync" })) as { status: number };
    expect(res.status).toBe(202);
    expect(m.requestSync).toHaveBeenCalledWith({ workspaceId: "ws-1", actorId: "actor-1", trigger: "MANUAL" });
    await m.after[0]();
    expect(m.drain).toHaveBeenCalledWith("t9");
  });
});

describe("actions route — browser can never submit QuickBooks JSON", () => {
  it("rejects unknown actions and raw QBO bodies", async () => {
    expect(thrownName(await post(actionsRoute.POST, A, { action: "create", entity: "JournalEntry", body: {} }))).toBe("ValidationError");
    expect(thrownName(await post(actionsRoute.POST, A, { action: "push_vendor", vendorId: "x" }))).toBe("ValidationError");
  });

  it("material actions require confirm:true and a numeric QBO account id", async () => {
    expect(thrownName(await post(actionsRoute.POST, A, { action: "record_bill", purchaseOrderId: UUID, expenseAccountId: "60" }))).toBe("ValidationError");
    expect(thrownName(await post(actionsRoute.POST, A, { action: "record_bill", purchaseOrderId: UUID, expenseAccountId: "60 OR 1=1", confirm: true }))).toBe("ValidationError");
    expect(thrownName(await post(actionsRoute.POST, A, { action: "inactivate", kind: "vendor", recordId: UUID }))).toBe("ValidationError");
    expect(m.recordBill).not.toHaveBeenCalled();
    expect(m.inactivate).not.toHaveBeenCalled();
  });

  it("dispatches a valid bill request with server-verified identity only", async () => {
    m.recordBill.mockResolvedValue({ action: "CREATED", remoteId: "5", replayed: false, writeId: "w", remoteSyncToken: "0" });
    const res = await post(actionsRoute.POST, A, { action: "record_bill", purchaseOrderId: UUID, expenseAccountId: "60", dueDate: "2026-10-01", confirm: true });
    expect(isCanonicalJsonResponse(res)).toBe(true);
    expect(m.recordBill).toHaveBeenCalledWith({
      workspaceId: "ws-1", actorId: "actor-1", purchaseOrderId: UUID, expenseAccountId: "60", dueDate: "2026-10-01", confirm: true,
    });
    expect((res as { body: unknown }).body).toEqual({ result: { action: "CREATED", remoteId: "5", replayed: false } });
  });

  it("links view validates type and ids", async () => {
    expect(thrownName(await get(actionsRoute.GET, `${A}?view=links&type=Invoice&ids=${UUID}`))).toBe("ValidationError");
    expect(thrownName(await get(actionsRoute.GET, `${A}?view=links&type=PurchaseOrder&ids=abc`))).toBe("ValidationError");
    m.links.mockResolvedValue([]);
    await get(actionsRoute.GET, `${A}?view=links&type=PurchaseOrder&ids=${UUID}`);
    expect(m.links).toHaveBeenCalledWith({ workspaceId: "ws-1", opsiqEntityType: "PurchaseOrder", ids: [UUID] });
  });
});

describe("webhook route", () => {
  const W = "https://app.example.com/api/webhooks/quickbooks";
  it("passes the exact raw body and signature header to the service", async () => {
    m.webhook.mockResolvedValue({ status: 200, dispatched: [] });
    const raw = '[{"specversion":"1.0","id":"e1"}]  ';
    await webhookPOST(new Request(W, { method: "POST", body: raw, headers: { "intuit-signature": "sig==" } }));
    expect(m.webhook).toHaveBeenCalledWith({ rawBody: raw, signatureHeader: "sig==" });
  });

  it.each([[401], [400], [503]])("propagates status %s without dispatching", async (status) => {
    m.webhook.mockResolvedValue({ status, dispatched: [] });
    const res = await webhookPOST(new Request(W, { method: "POST", body: "x" }));
    expect(res.status).toBe(status);
    expect(m.after).toHaveLength(0);
  });

  it("drains every dispatched task after acknowledging", async () => {
    m.webhook.mockResolvedValue({ status: 200, dispatched: [{ taskId: "a" }, { taskId: "b" }] });
    const res = await webhookPOST(new Request(W, { method: "POST", body: "x" }));
    expect(res.status).toBe(200);
    await m.after[0]();
    expect(m.drain.mock.calls.map((c) => c[0])).toEqual(["a", "b"]);
  });

  it("an internal failure returns 500 so Intuit retries (dedup keys make it safe)", async () => {
    m.webhook.mockRejectedValue(new Error("db down"));
    const res = await webhookPOST(new Request(W, { method: "POST", body: "x" }));
    expect(res.status).toBe(500);
  });
});
