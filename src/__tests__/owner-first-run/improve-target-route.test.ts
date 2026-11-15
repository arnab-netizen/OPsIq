/**
 * GET /api/owner/first-run/improve-target and POST /api/owner/first-run/improve — the destination of "Improve" is the
 * SERVER's answer: the only inputs are the business and the category (a client-supplied "mode"/"kind"/"href" is ignored and
 * cannot steer add vs edit), the route is OWNER_VIEW / OWNER_MANAGE and workspace-bound, and the improve acknowledgement
 * carries the same resolved target.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const WS = "a1b2c3d4-e5f6-4789-8abc-def012345678";
const ACTOR = "b2c3d4e5-f6a7-4b8c-9d0e-f1a2b3c4d5e6";
const BIZ = "c3d4e5f6-a7b8-4c9d-8e1f-a2b3c4d5e6f7";

type Handler = ((ctx: Record<string, unknown>) => Promise<{ body: unknown; status: number } & { target?: unknown }>) & { __options?: { requireCapabilities?: string[]; requireWorkspace?: boolean } };

vi.mock("@/lib/canonical-route-enforcement", () => ({
  withCanonicalEnforcement: (handler: (ctx: Record<string, unknown>) => unknown, options: unknown) => {
    const wrapped = (ctx: Record<string, unknown>) => handler(ctx);
    wrapped.__options = options;
    return wrapped;
  },
}));
vi.mock("@/lib/canonical-json-response", () => ({
  canonicalJson: (body: unknown, init?: { status?: number }) => ({ body, status: init?.status ?? 200 }),
}));
vi.mock("@/lib/db", () => ({ db: {}, getDbInstance: vi.fn().mockResolvedValue({}) }));
const resolve = vi.hoisted(() => vi.fn());
const improve = vi.hoisted(() => vi.fn());
vi.mock("@/services/owner-first-run/improve-target.service", () => ({ resolveImproveTarget: resolve }));
const firstRunContext = vi.hoisted(() => vi.fn());
vi.mock("@/services/owner-first-run/first-run.service", () => ({ requestImprovement: improve, getFirstRunContext: firstRunContext }));

import { GET } from "@/app/api/owner/first-run/improve-target/route";
import { POST } from "@/app/api/owner/first-run/improve/route";
import { CAPABILITIES } from "@/domain/constants/capabilities";

const get = GET as unknown as Handler;
const post = POST as unknown as Handler;
const TARGET = { kind: "EDIT_CASHFLOW", category: "cash_debt", snapshotId: "c1", actionLabel: "Edit this" };
const getCtx = (qs: string) => ({ verifiedWorkspaceId: WS, verifiedActorId: ACTOR, request: new NextRequest(`http://localhost/api/owner/first-run/improve-target?${qs}`) });
const postCtx = (body: unknown) => ({
  verifiedWorkspaceId: WS, verifiedActorId: ACTOR,
  request: new NextRequest("http://localhost/api/owner/first-run/improve", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
});

beforeEach(() => { resolve.mockReset(); improve.mockReset(); firstRunContext.mockReset(); });

describe("improve-target route", () => {
  it("is OWNER_VIEW and workspace-bound", () => {
    expect(get.__options?.requireCapabilities).toEqual([CAPABILITIES.OWNER_VIEW]);
    expect(get.__options?.requireWorkspace).toBe(true);
  });
  it("resolves from the verified workspace + the business + the category — and NOTHING else", async () => {
    resolve.mockResolvedValue(TARGET);
    const res = await get(getCtx(`businessId=${BIZ}&category=cash_debt&mode=ADD&kind=ADD&href=/owner/finance&snapshotId=zzz&editing=false`));
    expect(res).toEqual({ target: TARGET });
    expect(resolve).toHaveBeenCalledTimes(1);
    expect(resolve.mock.calls[0]).toEqual([WS, BIZ, "cash_debt"]); // exactly three arguments: no client state reaches the resolver
  });
  it("without a businessId it is the workspace's own first-run business (never a client-chosen one)", async () => {
    resolve.mockResolvedValue(TARGET);
    firstRunContext.mockResolvedValue({ business: { id: BIZ } });
    expect(await get(getCtx("category=payroll"))).toEqual({ target: TARGET });
    expect(firstRunContext).toHaveBeenCalledWith(WS);
    expect(resolve.mock.calls[0]).toEqual([WS, BIZ, "payroll"]);
    firstRunContext.mockResolvedValue({ business: null });
    await expect(get(getCtx("category=payroll"))).rejects.toThrow();
  });
  it("refuses a missing/oversized category and a malformed business", async () => {
    await expect(get(getCtx(`businessId=${BIZ}`))).rejects.toThrow();
    await expect(get(getCtx(`businessId=${BIZ}&category=${"x".repeat(61)}`))).rejects.toThrow();
    await expect(get(getCtx(`businessId=nope&category=cash_debt`))).rejects.toThrow();
    expect(resolve).not.toHaveBeenCalled();
  });
});

describe("improve route", () => {
  it("is OWNER_MANAGE and returns the server-resolved target with the acknowledgement (201 on first request, 200 on a replay)", async () => {
    expect(post.__options?.requireCapabilities).toEqual([CAPABILITIES.OWNER_MANAGE]);
    improve.mockResolvedValueOnce({ replayed: false, target: TARGET }).mockResolvedValueOnce({ replayed: true, target: TARGET });
    const first = await post(postCtx({ businessId: BIZ, category: "cash_debt" }));
    expect(first.status).toBe(201);
    expect(first.body).toEqual({ replayed: false, target: TARGET });
    expect((await post(postCtx({ businessId: BIZ, category: "cash_debt" }))).status).toBe(200);
    expect(improve).toHaveBeenCalledWith(WS, ACTOR, BIZ, "cash_debt");
  });
  it("is strict: a client-supplied mode/target is refused outright, not ignored into a different behaviour", async () => {
    await expect(post(postCtx({ businessId: BIZ, category: "cash_debt", mode: "ADD" }))).rejects.toThrow();
    await expect(post(postCtx({ businessId: BIZ, category: "cash_debt", target: TARGET }))).rejects.toThrow();
    expect(improve).not.toHaveBeenCalled();
  });
});
