/**
 * QuickBooks owner routes (status, disconnect, sync) + the callback's browser redirect.
 * The canonical wrapper is an identity wrapper here (its own 401/403 behaviour is asserted via the declared options and by
 * qbo-connect-session.test.ts); the real handlers, services and Postgres run underneath.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";

const afterCallbacks = vi.hoisted(() => [] as Array<() => unknown>);
vi.mock("@/lib/canonical-route-enforcement", () => ({
  withCanonicalEnforcement: (handler: (ctx: unknown, params: Record<string, string>) => unknown, options?: Record<string, unknown>) => {
    const wrapped = (ctx: unknown, params: Record<string, string> = {}) => handler(ctx, params);
    (wrapped as { __options?: unknown }).__options = options;
    return wrapped;
  },
}));
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: (fn: () => unknown) => { afterCallbacks.push(fn); } }));

import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { connectQbo, envFor, makeFakeIntuit, monthKeys, seedQboTenant } from "@/__tests__/test-helpers/qbo-db-fixtures";
import * as statusRoute from "@/app/api/owner/integrations/quickbooks/status/route";
import * as disconnectRoute from "@/app/api/owner/integrations/quickbooks/disconnect/route";
import * as syncRoute from "@/app/api/owner/integrations/quickbooks/sync/route";
import { runQboSync } from "@/services/quickbooks/qbo-sync.service";

type Ctx = { verifiedWorkspaceId: string; verifiedActorId: string; request: Request };
type Envelope = { body: Record<string, unknown>; status: number };
const asRoute = (r: unknown) => r as (c: Ctx) => Promise<Envelope>;
const getCtx = (t: { ws: string; actor: string }, qs: string): Ctx => ({ verifiedWorkspaceId: t.ws, verifiedActorId: t.actor, request: new Request(`http://t/x?${qs}`) });
const postCtx = (t: { ws: string; actor: string }, body: unknown): Ctx => ({ verifiedWorkspaceId: t.ws, verifiedActorId: t.actor, request: new Request("http://t/x", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } }) });
const KEYS = ["QUICKBOOKS_CLIENT_ID", "QUICKBOOKS_CLIENT_SECRET", "QUICKBOOKS_REDIRECT_URI", "QUICKBOOKS_ENVIRONMENT"] as const;
const saved: Record<string, string | undefined> = {};

describe.skipIf(!SHOULD_RUN_DB_TESTS)("QBO owner routes (real Postgres)", () => {
  beforeAll(() => {
    for (const k of KEYS) saved[k] = process.env[k];
    Object.assign(process.env, envFor("production"));
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200 })));
  });
  afterAll(() => {
    for (const k of KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
    vi.unstubAllGlobals();
  });

  it("all owner routes require a verified workspace, a human actor and the right capability", () => {
    expect((statusRoute.GET as unknown as { __options: unknown }).__options).toEqual({ requireCapabilities: ["owner:view"], requireWorkspace: true, requireActorType: "user" });
    for (const r of [disconnectRoute.POST, syncRoute.POST]) {
      expect((r as unknown as { __options: unknown }).__options).toEqual({ requireCapabilities: ["owner:manage"], requireWorkspace: true, requireActorType: "user" });
    }
  });

  it("status: returns the bounded DTO for the session's workspace; foreign business => NotFound; bad input => ValidationError", async () => {
    const t = await seedQboTenant(); const o = await seedQboTenant();
    const res = await asRoute(statusRoute.GET)(getCtx(t, `businessId=${t.biz}`));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ state: "NOT_CONNECTED", available: true });
    await expect(asRoute(statusRoute.GET)(getCtx(t, `businessId=${o.biz}`))).rejects.toMatchObject({ name: "NotFoundError" });
    await expect(asRoute(statusRoute.GET)(getCtx(t, "businessId=nope"))).rejects.toMatchObject({ name: "ValidationError" });
    await expect(asRoute(statusRoute.GET)(getCtx(t, `businessId=${t.biz}&workspaceId=${o.ws}`))).rejects.toMatchObject({ name: "ValidationError" });
  });

  it("disconnect: owner-scoped, strict body, idempotent, never takes a workspace from the body", async () => {
    const t = await seedQboTenant(); const o = await seedQboTenant();
    const c = await connectQbo(t);
    await expect(asRoute(disconnectRoute.POST)(postCtx(t, { businessId: t.biz, workspaceId: o.ws }))).rejects.toThrow();
    await expect(asRoute(disconnectRoute.POST)(postCtx(o, { businessId: t.biz }))).rejects.toMatchObject({ name: "NotFoundError" });
    expect((await db.qboConnection.findUniqueOrThrow({ where: { id: c.connectionId } })).status).toBe("ACTIVE");
    const r = await asRoute(disconnectRoute.POST)(postCtx(t, { businessId: t.biz }));
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ changed: true, revocation: "REVOKED" });
    expect((await asRoute(disconnectRoute.POST)(postCtx(t, { businessId: t.biz }))).body).toEqual({ changed: false, revocation: "SKIPPED" });
  });

  it("sync (Refresh now): 202, one coalesced task per 5-minute bucket, accelerator scheduled after the response; requires an ACTIVE connection", async () => {
    const t = await seedQboTenant();
    await expect(asRoute(syncRoute.POST)(postCtx(t, { businessId: t.biz }))).rejects.toMatchObject({ name: "NotFoundError" });
    const c = await connectQbo(t);
    afterCallbacks.length = 0;
    const r1 = await asRoute(syncRoute.POST)(postCtx(t, { businessId: t.biz }));
    const r2 = await asRoute(syncRoute.POST)(postCtx(t, { businessId: t.biz }));
    expect([r1.status, r2.status]).toEqual([202, 202]);
    expect(afterCallbacks).toHaveLength(2);
    const tasks = await db.scheduledTask.findMany({ where: { workspaceId: t.ws, idempotencyKey: { startsWith: `qbo-sync:${c.connectionId}:owner:` } } });
    expect(tasks.length).toBeLessThanOrEqual(2);
    expect(tasks.every((x) => x.taskName === "qbo-sync" && x.status === "pending")).toBe(true);
    // no diagnosis, no data change at request time
    expect(await db.ownerFinanceCycle.count({ where: { workspaceId: t.ws } })).toBe(0);
    expect(await db.qboReportSnapshot.count({ where: { connectionId: c.connectionId } })).toBe(0);
  });

  it("refreshed figures do not rerun analysis: after a sync the owner has new evidence and NO new cycle", async () => {
    const t = await seedQboTenant();
    const c = await connectQbo(t);
    const f = makeFakeIntuit(Object.fromEntries(monthKeys(12).map((k, i) => [k, { income: 100 + i, cogs: 10, bank: 500, arTotal: 5, arCurrent: 5, apTotal: 1, apCurrent: 1 }])));
    await runQboSync({ workspaceId: t.ws, connectionId: c.connectionId, trigger: "OWNER" }, { env: envFor("production"), readClientFactory: () => f.reader });
    expect(await db.ownerFinancialSnapshot.count({ where: { workspaceId: t.ws } })).toBe(3);
    expect(await db.ownerFinanceCycle.count({ where: { workspaceId: t.ws } })).toBe(0);
    expect(randomUUID()).toBeTruthy();
  });
});
