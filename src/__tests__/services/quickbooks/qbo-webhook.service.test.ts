/**
 * qbo-webhook.service — unit proof (mocked db + requestQuickBooksSync).
 *
 * Real routing/realm-isolation behavior against Postgres is proven in
 * qbo-webhook.service.db.test.ts; this file proves the HTTP-shaped contract:
 * fail-closed config, signature/parse gating, per-connector dispatch, and
 * that a single connector's failure never aborts the rest of the delivery.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHmac } from "crypto";

const requestQuickBooksSync = vi.fn(async () => ({ taskId: "task-1", deduplicated: false }));
vi.mock("@/services/quickbooks/qbo-sync.service", () => ({
  requestQuickBooksSync: (...a: unknown[]) => requestQuickBooksSync(...a),
}));

const emitAuditEvent = vi.fn(async () => "audit-id");
vi.mock("@/infra/audit", () => ({ emitAuditEvent: (...a: unknown[]) => emitAuditEvent(...a) }));

const ownerConnectorFindMany = vi.fn();
// vi.mock is hoisted above every top-level statement in this file, so the
// object it returns must itself be built inside vi.hoisted() — a plain
// `const dbMock = {...}` here would still be in the temporal dead zone when
// the hoisted factory below runs.
const dbMock = vi.hoisted(() => ({ ownerConnector: { findMany: (...a: unknown[]) => ownerConnectorFindMany(...a) } }));
// DC-20 (vitest.setup.ts contract): every "@/lib/db" mock factory must also export getDbInstance.
vi.mock("@/lib/db", () => ({ db: dbMock, getDbInstance: vi.fn().mockResolvedValue(dbMock) }));

import { handleQuickBooksWebhook } from "@/services/quickbooks/qbo-webhook.service";

const VERIFIER = "test-verifier-token";
const ENV = {
  QUICKBOOKS_CLIENT_ID: "id",
  QUICKBOOKS_CLIENT_SECRET: "secret",
  QUICKBOOKS_REDIRECT_URI: "https://app.example.com/callback",
  QUICKBOOKS_ENVIRONMENT: "sandbox",
  QUICKBOOKS_WEBHOOK_VERIFIER_TOKEN: VERIFIER,
  OAUTH_TOKEN_ENCRYPTION_KEY: "encryption-key",
};

function sign(body: string): string {
  return createHmac("sha256", VERIFIER).update(body, "utf8").digest("base64");
}

function cloudEventsBody(realmId: string, id = "evt-1"): string {
  return JSON.stringify([
    {
      specversion: "1.0",
      id,
      type: "qbo.invoice.updated.v1",
      time: "2026-09-25T10:00:00.000Z",
      intuitentityid: "456",
      intuitaccountid: realmId,
    },
  ]);
}

beforeEach(() => {
  vi.clearAllMocks();
  requestQuickBooksSync.mockResolvedValue({ taskId: "task-1", deduplicated: false });
  ownerConnectorFindMany.mockResolvedValue([]);
});

describe("[unit] handleQuickBooksWebhook", () => {
  it("fails closed (503) when the webhook verifier token is not configured", async () => {
    const body = cloudEventsBody("789012345");
    const result = await handleQuickBooksWebhook({
      rawBody: body,
      signatureHeader: "irrelevant",
      env: { ...ENV, QUICKBOOKS_WEBHOOK_VERIFIER_TOKEN: undefined },
    });
    expect(result.status).toBe(503);
    expect(result.dispatched).toEqual([]);
  });

  it("fails closed (503) when QuickBooks is not configured at all", async () => {
    const body = cloudEventsBody("789012345");
    const result = await handleQuickBooksWebhook({ rawBody: body, signatureHeader: "irrelevant", env: {} });
    expect(result.status).toBe(503);
  });

  it("rejects a bad signature with 401", async () => {
    const body = cloudEventsBody("789012345");
    const result = await handleQuickBooksWebhook({ rawBody: body, signatureHeader: "not-a-real-signature", env: ENV });
    expect(result.status).toBe(401);
    expect(requestQuickBooksSync).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON with 400", async () => {
    const result = await handleQuickBooksWebhook({ rawBody: "not json", signatureHeader: sign("not json"), env: ENV });
    expect(result.status).toBe(400);
  });

  it("rejects a well-formed-JSON but schema-invalid payload with 400", async () => {
    const body = JSON.stringify({ notEventNotifications: true });
    const result = await handleQuickBooksWebhook({ rawBody: body, signatureHeader: sign(body), env: ENV });
    expect(result.status).toBe(400);
  });

  it("returns 200 with no dispatch for an unrecognized realm (no info leak)", async () => {
    ownerConnectorFindMany.mockResolvedValueOnce([]); // no connector for this realm
    const body = cloudEventsBody("999999999");
    const result = await handleQuickBooksWebhook({ rawBody: body, signatureHeader: sign(body), env: ENV });
    expect(result.status).toBe(200);
    expect(result.dispatched).toEqual([]);
    expect(requestQuickBooksSync).not.toHaveBeenCalled();
  });

  it("dispatches a WEBHOOK sync request, scoped by realm, with the notification's dedupKey", async () => {
    ownerConnectorFindMany.mockResolvedValueOnce([{ id: "conn-1", workspaceId: "ws-1" }]);
    const body = cloudEventsBody("789012345", "evt-42");
    const result = await handleQuickBooksWebhook({ rawBody: body, signatureHeader: sign(body), env: ENV });
    expect(result.status).toBe(200);
    expect(requestQuickBooksSync).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "ws-1", trigger: "WEBHOOK", dedupKey: "evt-42" })
    );
    expect(result.dispatched).toEqual([{ workspaceId: "ws-1", connectorId: "conn-1", taskId: "task-1" }]);
    expect(emitAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ eventName: "quickbooks.webhook_received", workspaceId: "ws-1" }));
  });

  it("routes to EVERY workspace whose ACTIVE connector matches the realm (multiple workspaces, same realm)", async () => {
    ownerConnectorFindMany.mockResolvedValueOnce([
      { id: "conn-a", workspaceId: "ws-a" },
      { id: "conn-b", workspaceId: "ws-b" },
    ]);
    const body = cloudEventsBody("789012345");
    const result = await handleQuickBooksWebhook({ rawBody: body, signatureHeader: sign(body), env: ENV });
    expect(result.status).toBe(200);
    expect(result.dispatched.map((d) => d.workspaceId).sort()).toEqual(["ws-a", "ws-b"]);
    expect(emitAuditEvent).toHaveBeenCalledTimes(2); // once per workspace
  });

  it("keeps processing the rest of the delivery when one connector's sync request throws", async () => {
    ownerConnectorFindMany.mockResolvedValueOnce([
      { id: "conn-a", workspaceId: "ws-a" },
      { id: "conn-b", workspaceId: "ws-b" },
    ]);
    requestQuickBooksSync.mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce({ taskId: "task-2", deduplicated: false });
    const body = cloudEventsBody("789012345");
    const result = await handleQuickBooksWebhook({ rawBody: body, signatureHeader: sign(body), env: ENV });
    expect(result.status).toBe(200);
    expect(result.dispatched).toHaveLength(1);
    expect(result.dispatched[0].workspaceId).toBe("ws-b");
  });
});
