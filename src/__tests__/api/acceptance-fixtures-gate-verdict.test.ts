/**
 * GET /api/admin/acceptance-fixtures/businesses/[businessId]/cashflow/actions/[actionId]/gate-verdict
 *
 * DB-free, route-contract tests (mirrors src/__tests__/api/bundle7-permission-matrix.test.ts and
 * src/__tests__/api/privacy-requests.test.ts): withCanonicalEnforcement and the db client are mocked so
 * the route's OWN logic -- the ownership-check WHERE clauses, the sanitized response shape, and that it
 * never audits/mutates -- is tested in isolation. The gate's own correctness (assessOwnerActionGate) is
 * proven separately in src/__tests__/owner-mode/owner-action-gate.test.ts and is mocked here. The real
 * zod schemas (uuidSchema, acceptanceGateVerdictQuerySchema) run as-is, so 400 behavior is tested for
 * real, not assumed.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockDb, mockEmitAuditEvent, mockAssessOwnerActionGate, capturedOptions } = vi.hoisted(() => ({
  mockDb: {
    ownerBusiness: { findFirst: vi.fn(), update: vi.fn(), create: vi.fn(), delete: vi.fn() },
    ownerCashflowAction: { findFirst: vi.fn(), update: vi.fn(), create: vi.fn(), delete: vi.fn() },
  },
  mockEmitAuditEvent: vi.fn().mockResolvedValue(undefined),
  mockAssessOwnerActionGate: vi.fn(),
  capturedOptions: { current: undefined as { requireCapabilities?: string[]; requireWorkspace?: boolean } | undefined },
}));

vi.mock("@/lib/db", () => ({ db: mockDb, getDbInstance: vi.fn().mockResolvedValue({}) }));
vi.mock("@/infra/audit", () => ({ emitAuditEvent: mockEmitAuditEvent }));
vi.mock("@/services/owner-mode/owner-action-gate.service", () => ({ assessOwnerActionGate: mockAssessOwnerActionGate }));

// Unwraps withCanonicalEnforcement to the raw handler so tests call it directly with a hand-built ctx --
// the capability/workspace DECLARATION is captured and asserted, the wrapper's own 401/403 enforcement is
// not re-proven here (it's shared machinery, already covered wherever it's defined).
vi.mock("@/lib/canonical-route-enforcement", () => ({
  withCanonicalEnforcement: (handler: unknown, options: { requireCapabilities?: string[]; requireWorkspace?: boolean }) => {
    capturedOptions.current = options;
    return handler;
  },
}));

vi.mock("@/lib/canonical-json-response", () => ({
  canonicalJson: (body: unknown, init?: { status?: number }) => ({ json: () => body, status: init?.status ?? 200 }),
}));

import { GET } from "@/app/api/admin/acceptance-fixtures/businesses/[businessId]/cashflow/actions/[actionId]/gate-verdict/route";
import { CAPABILITIES } from "@/domain/constants/capabilities";

const WS = "11111111-1111-4111-8111-111111111111";
const OTHER_WS = "99999999-9999-4999-8999-999999999999";
const FIXTURE_BIZ = "22222222-2222-4222-8222-222222222222";
const REAL_BIZ = "33333333-3333-4333-8333-333333333333";
const ACTION = "44444444-4444-4444-8444-444444444444";
// Stored under a DIFFERENT workspace than FIXTURE_BIZ/ACTION, so a request scoped to WS genuinely fails
// the action query's own workspaceId condition -- distinct from "cross-workspace business" (where the
// business query fails first and the action query is never reached).
const ACTION_WRONG_WORKSPACE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
// Stored under WS but attributed to REAL_BIZ, not FIXTURE_BIZ, so it genuinely exercises the action
// query's businessId condition -- distinct from an unconditional "mock returns null" stand-in.
const ACTION_WRONG_BUSINESS = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const ACTION_STORE: Record<string, { workspaceId: string; businessId: string; findingId: string | null; findingCode: string }> = {
  [ACTION]: { workspaceId: WS, businessId: FIXTURE_BIZ, findingId: null, findingCode: "CF_LOW_RUNWAY" },
  [ACTION_WRONG_WORKSPACE]: { workspaceId: OTHER_WS, businessId: FIXTURE_BIZ, findingId: null, findingCode: "CF_LOW_RUNWAY" },
  [ACTION_WRONG_BUSINESS]: { workspaceId: WS, businessId: REAL_BIZ, findingId: null, findingCode: "CF_LOW_RUNWAY" },
};

function ctx(workspaceId = WS) {
  return { verifiedWorkspaceId: workspaceId, verifiedActorId: "actor-1" } as never;
}
function req(businessId: string, actionId: string, query = "toStatus=in_progress") {
  return new Request(`http://localhost/api/admin/acceptance-fixtures/businesses/${businessId}/cashflow/actions/${actionId}/gate-verdict?${query}`);
}
async function call(businessId: string, actionId: string, opts: { workspaceId?: string; query?: string } = {}) {
  const c = ctx(opts.workspaceId) as Record<string, unknown>;
  (c as { request: Request }).request = req(businessId, actionId, opts.query);
  return (GET as unknown as (c: unknown, p: Record<string, string>) => Promise<{ json: () => unknown; status: number }>)(c, { businessId, actionId });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockDb.ownerBusiness.findFirst.mockImplementation(async ({ where }: { where: { id: string; workspaceId: string; isFixtureBusiness: boolean } }) =>
    where.id === FIXTURE_BIZ && where.workspaceId === WS && where.isFixtureBusiness === true ? { id: FIXTURE_BIZ } : null
  );
  mockDb.ownerCashflowAction.findFirst.mockImplementation(async ({ where }: { where: { id: string; workspaceId: string; businessId: string } }) => {
    const row = ACTION_STORE[where.id];
    if (!row || row.workspaceId !== where.workspaceId || row.businessId !== where.businessId) return null;
    return { businessId: row.businessId, findingId: row.findingId, findingCode: row.findingCode };
  });
  mockAssessOwnerActionGate.mockResolvedValue({ allowed: true, marginAbstention: null });
});

describe("GET .../cashflow/actions/[actionId]/gate-verdict", () => {
  it("declares the existing narrow acceptance-fixture capability -- no new role/capability", () => {
    expect(capturedOptions.current).toEqual({ requireCapabilities: [CAPABILITIES.ACCEPTANCE_FIXTURE_WRITE], requireWorkspace: true });
  });

  it("valid fixture + adopted action => 200 with the sanitized ALLOWED verdict", async () => {
    const res = await call(FIXTURE_BIZ, ACTION);
    expect(res.status).toBe(200);
    expect(res.json()).toEqual({ allowed: true, expectedMutationStatus: 200 });
    expect(mockAssessOwnerActionGate).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: WS, businessId: FIXTURE_BIZ, actionId: ACTION, domain: "cashflow", toStatus: "in_progress", findingCode: "CF_LOW_RUNWAY" })
    );
  });

  it("valid fixture + adopted action, BLOCKED verdict => 200 with sanitized refusal (no raw constraints)", async () => {
    mockAssessOwnerActionGate.mockResolvedValue({ allowed: false, code: "CASH_SAFETY_BLOCKED", reason: "internal owner-facing prose -- must never leak", blocks: [] });
    const res = await call(FIXTURE_BIZ, ACTION);
    expect(res.status).toBe(200);
    expect(res.json()).toEqual({ allowed: false, expectedMutationStatus: 409, code: "CASH_SAFETY_BLOCKED" });
    expect(JSON.stringify(res.json())).not.toContain("internal owner-facing prose");
  });

  it("ordinary (non-fixture) business => 404, indistinguishable from not-found", async () => {
    await expect(call(REAL_BIZ, ACTION)).rejects.toMatchObject({ statusCode: 404 });
    expect(mockDb.ownerCashflowAction.findFirst).not.toHaveBeenCalled(); // short-circuits before the action lookup
  });

  it("cross-workspace business (real fixture, wrong workspace) => the SAME 404", async () => {
    await expect(call(FIXTURE_BIZ, ACTION, { workspaceId: OTHER_WS })).rejects.toMatchObject({ statusCode: 404 });
  });

  it("nonexistent business => the SAME 404", async () => {
    const unknown = "55555555-5555-4555-8555-555555555555";
    await expect(call(unknown, ACTION)).rejects.toMatchObject({ statusCode: 404 });
  });

  it("foreign-business action (action is really attributed to a different business than the path's businessId) => the SAME 404", async () => {
    // The business lookup succeeds (FIXTURE_BIZ is a real fixture in WS); only the action's OWN businessId
    // condition excludes it -- genuinely exercises the `businessId: business.id` filter, not a blanket null.
    await expect(call(FIXTURE_BIZ, ACTION_WRONG_BUSINESS)).rejects.toMatchObject({ statusCode: 404 });
  });

  it("cross-workspace action (business found; the action's OWN workspaceId condition excludes it) => the SAME 404", async () => {
    // Distinct from "cross-workspace business": here the business lookup SUCCEEDS (same ws as the request),
    // and only the action query's workspaceId condition fails -- a different code path than the business-404 case.
    await expect(call(FIXTURE_BIZ, ACTION_WRONG_WORKSPACE)).rejects.toMatchObject({ statusCode: 404 });
  });

  it("nonexistent action => the SAME 404", async () => {
    const unknown = "66666666-6666-4666-8666-666666666666";
    await expect(call(FIXTURE_BIZ, unknown)).rejects.toMatchObject({ statusCode: 404 });
  });

  it("invalid toStatus => 400 (real zod schema, not assumed)", async () => {
    await expect(call(FIXTURE_BIZ, ACTION, { query: "toStatus=completed" })).rejects.toMatchObject({ statusCode: 400 });
    await expect(call(FIXTURE_BIZ, ACTION, { query: "toStatus=bogus" })).rejects.toMatchObject({ statusCode: 400 });
    await expect(call(FIXTURE_BIZ, ACTION, { query: "" })).rejects.toMatchObject({ statusCode: 400 });
  });

  it("an unexpected extra query parameter => 400 (strictObject, no accidental extra scope)", async () => {
    await expect(call(FIXTURE_BIZ, ACTION, { query: "toStatus=in_progress&extra=1" })).rejects.toMatchObject({ statusCode: 400 });
  });

  it("invalid path ids => 400", async () => {
    await expect(call("not-a-uuid", ACTION)).rejects.toMatchObject({ statusCode: 400 });
    await expect(call(FIXTURE_BIZ, "not-a-uuid")).rejects.toMatchObject({ statusCode: 400 });
  });

  it("the SAME caller-supplied (businessId, actionId) produces an IDENTICAL message whether the business check or the action check is what actually fails -- no enumeration oracle", async () => {
    // The route's error embeds only the caller's OWN params (never which internal check failed), so for one
    // fixed (businessId, actionId) pair, the message must be byte-identical regardless of which lookup's
    // WHERE clause excluded the row. Flip which lookup fails by changing the STORED data, never the params.
    const catchMessage = async (p: Promise<unknown>): Promise<string> => {
      try {
        await p;
        throw new Error("expected a rejection");
      } catch (e) {
        return (e as { message: string }).message;
      }
    };

    // Scenario 1: the BUSINESS check fails (not a fixture); had it passed, the action would have matched.
    mockDb.ownerBusiness.findFirst.mockResolvedValue(null);
    const businessFailedMsg = await catchMessage(call(FIXTURE_BIZ, ACTION));
    expect(mockDb.ownerCashflowAction.findFirst, "business check must short-circuit before the action lookup").not.toHaveBeenCalled();

    // Scenario 2: the BUSINESS check now passes; the ACTION check fails instead -- same (businessId, actionId).
    mockDb.ownerBusiness.findFirst.mockResolvedValue({ id: FIXTURE_BIZ });
    mockDb.ownerCashflowAction.findFirst.mockResolvedValue(null);
    const actionFailedMsg = await catchMessage(call(FIXTURE_BIZ, ACTION));

    expect(actionFailedMsg, "the message must not depend on which internal check failed").toBe(businessFailedMsg);
    expect(businessFailedMsg).not.toMatch(/OwnerBusiness|OwnerCashflowAction/);
  });

  it("every distinct 404 reason never echoes a different entity label in its message", async () => {
    const unknownBiz = "77777777-7777-4777-8777-777777777777";
    const unknownAction = "88888888-8888-4888-8888-888888888888";
    for (const [biz, action] of [
      [REAL_BIZ, ACTION],
      [unknownBiz, ACTION],
      [FIXTURE_BIZ, unknownAction],
      [FIXTURE_BIZ, ACTION_WRONG_BUSINESS],
      [FIXTURE_BIZ, ACTION_WRONG_WORKSPACE],
    ] as const) {
      await expect(call(biz, action)).rejects.toMatchObject({ statusCode: 404, message: expect.not.stringMatching(/OwnerBusiness|OwnerCashflowAction/) });
    }
    await expect(call(FIXTURE_BIZ, ACTION, { workspaceId: OTHER_WS })).rejects.toMatchObject({
      statusCode: 404,
      message: expect.not.stringMatching(/OwnerBusiness|OwnerCashflowAction/),
    });
  });

  it("never audits and never calls a mutation DB method, on every path (allowed, blocked, and every 404/400)", async () => {
    await call(FIXTURE_BIZ, ACTION);
    mockAssessOwnerActionGate.mockResolvedValue({ allowed: false, code: "CASH_SAFETY_BLOCKED", reason: "x", blocks: [] });
    await call(FIXTURE_BIZ, ACTION);
    await call(REAL_BIZ, ACTION).catch(() => undefined);
    await call(FIXTURE_BIZ, ACTION, { query: "toStatus=bogus" }).catch(() => undefined);

    expect(mockEmitAuditEvent).not.toHaveBeenCalled();
    for (const model of [mockDb.ownerBusiness, mockDb.ownerCashflowAction]) {
      expect(model.update).not.toHaveBeenCalled();
      expect(model.create).not.toHaveBeenCalled();
      expect(model.delete).not.toHaveBeenCalled();
    }
  });
});
