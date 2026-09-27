/**
 * Route contract tests (non-DB) for:
 *   POST /api/owner/guardrails/screen     — discriminated union screening (OWNER_VIEW)
 *   POST /api/owner/waste-leakage         — record leakage event (OWNER_MANAGE)
 *   GET  /api/owner/waste-leakage         — list events + summary (OWNER_VIEW)
 *   GET  /api/owner/now-view              — owner now-view (OWNER_VIEW)
 *
 * DB-backed services are mocked; pure-domain functions in guardrails are also mocked
 * to isolate route-level contract (dispatch, enforcement, serialisation).
 * Tests run without PostgreSQL.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import type { CanonicalJsonResponse } from "@/lib/canonical-json-response";

// ─── Hoisted mocks ────────────────────────────────────────────────────────────

const mocks = vi.hoisted(() => ({
  screenOpportunity: vi.fn(),
  screenContractQuote: vi.fn(),
  shouldRunMarketing: vi.fn(),
  recordLeakageEvent: vi.fn(),
  listLeakageEvents: vi.fn(),
  getLeakageSummary: vi.fn(),
  getOwnerNowView: vi.fn(),
  // The route resolves the ONE canonical owner decision (owner-home service) and returns it beside
  // Now View. Mocked for the same DB-free route-contract isolation as every other dependency.
  getOwnerHome: vi.fn(),
}));

vi.mock("@/lib/canonical-route-enforcement", () => ({
  withCanonicalEnforcement: (
    handler: (ctx: unknown) => unknown,
    options?: Record<string, unknown>
  ) => {
    const wrapped = (ctx: unknown) => handler(ctx);
    (wrapped as { __options?: unknown }).__options = options;
    return wrapped;
  },
}));

vi.mock("@/domain/owner-mode/opportunity-contract-guardrails", () => ({
  screenOpportunity: mocks.screenOpportunity,
  screenContractQuote: mocks.screenContractQuote,
  shouldRunMarketing: mocks.shouldRunMarketing,
}));

vi.mock("@/services/owner-mode/waste-leakage.service", () => ({
  recordLeakageEvent: mocks.recordLeakageEvent,
  listLeakageEvents: mocks.listLeakageEvents,
  getLeakageSummary: mocks.getLeakageSummary,
}));

vi.mock("@/services/owner-guidance/owner-now-view.service", () => ({
  getOwnerNowView: mocks.getOwnerNowView,
}));

vi.mock("@/services/owner-home/home.service", () => ({
  getOwnerHome: mocks.getOwnerHome,
}));

// ─── Route imports (after mocks) ─────────────────────────────────────────────

import { POST as guardrailsPost } from "@/app/api/owner/guardrails/screen/route";
import { POST as leakagePost, GET as leakageGet } from "@/app/api/owner/waste-leakage/route";
import { GET as nowViewGet } from "@/app/api/owner/now-view/route";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const WS = "ws-guard-test";

function makeGetCtx(rawUrl: string, workspaceId = WS) {
  return {
    verifiedActorId: "actor-guard-1",
    verifiedWorkspaceId: workspaceId,
    request: { url: rawUrl },
  } as const;
}

function makePostCtx(body: unknown, workspaceId = WS) {
  return {
    verifiedActorId: "actor-guard-1",
    verifiedWorkspaceId: workspaceId,
    request: { url: `https://x/`, json: async () => body },
  } as const;
}

function getBody(res: unknown): Record<string, unknown> {
  return (res as CanonicalJsonResponse).body as Record<string, unknown>;
}

const OPP_BODY = {
  kind: "opportunity" as const,
  fitScore: 0.8,
  marginPct: 0.35,
  marginFloorPct: 0.2,
  capacityStatus: "safe" as const,
  paymentRisk: "low" as const,
};

const CONTRACT_BODY = {
  kind: "contract" as const,
  price: 10000,
  directCost: 6000,
  marginFloorPct: 0.25,
  paymentTermsDays: 30,
  capacityStatus: "safe" as const,
};

const MARKETING_BODY = {
  kind: "marketing" as const,
  financialState: "SAFE" as const,
  capacityStatus: "safe" as const,
  qualityRed: false,
  reputationRed: false,
};

const LEAKAGE_BODY = {
  category: "DISCOUNT_LEAK" as const,
  source: "sales" as const,
  amount: 1500,
  currency: "GBP",
  detectedAt: "2026-07-01T00:00:00.000Z",
  confidenceLevel: "HIGH" as const,
};

const SAMPLE_SCREEN_RESULT = { verdict: "accept", reason: "Within margin floor" };
const SAMPLE_EVENTS = [{ id: "ev-1", category: "DISCOUNT_LEAK" }];
const SAMPLE_SUMMARY = { totalLeakage: 1500, eventCount: 1 };
const SAMPLE_NOW_VIEW = {
  workspaceId: WS,
  topActions: [],
  actionsToAvoid: [],
  confidence: "MEDIUM",
};

beforeEach(() => vi.clearAllMocks());

// ─── 1. Static enforcement — POST /api/owner/guardrails/screen ────────────────

describe("[guardrails] POST /api/owner/guardrails/screen — static enforcement", () => {
  const src = fs.readFileSync(
    path.resolve(__dirname, "../../../app/api/owner/guardrails/screen/route.ts"),
    "utf8"
  );

  it("uses withCanonicalEnforcement", () => {
    expect(src).toContain("withCanonicalEnforcement");
  });

  it("requires OWNER_VIEW capability", () => {
    expect(src).toContain("CAPABILITIES.OWNER_VIEW");
  });

  it("requires workspace", () => {
    expect(src).toContain("requireWorkspace: true");
  });

  it("exports POST only (no GET/PATCH/DELETE)", () => {
    expect(src).toContain("export const POST");
    expect(src).not.toContain("export const GET");
    expect(src).not.toContain("export const PATCH");
    expect(src).not.toContain("export const DELETE");
  });

  it("uses parseRequestBody and discriminated union schema", () => {
    expect(src).toContain("parseRequestBody");
    expect(src).toContain("discriminatedUnion");
  });

  it("delegates to all three domain functions", () => {
    expect(src).toContain("screenOpportunity");
    expect(src).toContain("screenContractQuote");
    expect(src).toContain("shouldRunMarketing");
  });
});

// ─── 2. POST /api/owner/guardrails/screen — handler behaviour ────────────────

describe("[guardrails] POST /api/owner/guardrails/screen — handler", () => {
  it("declares OWNER_VIEW capability and requireWorkspace", () => {
    const opts = (guardrailsPost as unknown as {
      __options?: { requireCapabilities?: string[]; requireWorkspace?: boolean };
    }).__options;
    expect(opts?.requireCapabilities).toContain("owner:view");
    expect(opts?.requireWorkspace).toBe(true);
  });

  it("dispatches opportunity kind to screenOpportunity", async () => {
    mocks.screenOpportunity.mockReturnValue(SAMPLE_SCREEN_RESULT);
    const res = await guardrailsPost(makePostCtx(OPP_BODY));
    expect(mocks.screenOpportunity).toHaveBeenCalledOnce();
    expect(mocks.screenContractQuote).not.toHaveBeenCalled();
    expect(mocks.shouldRunMarketing).not.toHaveBeenCalled();
    expect(getBody(res)).toEqual(SAMPLE_SCREEN_RESULT);
    expect((res as CanonicalJsonResponse).status).toBe(200);
  });

  it("dispatches contract kind to screenContractQuote", async () => {
    mocks.screenContractQuote.mockReturnValue(SAMPLE_SCREEN_RESULT);
    const res = await guardrailsPost(makePostCtx(CONTRACT_BODY));
    expect(mocks.screenContractQuote).toHaveBeenCalledOnce();
    expect(mocks.screenOpportunity).not.toHaveBeenCalled();
    expect(mocks.shouldRunMarketing).not.toHaveBeenCalled();
    expect(getBody(res)).toEqual(SAMPLE_SCREEN_RESULT);
  });

  it("dispatches marketing kind to shouldRunMarketing", async () => {
    mocks.shouldRunMarketing.mockReturnValue({ run: true, reason: "Safe to run" });
    const res = await guardrailsPost(makePostCtx(MARKETING_BODY));
    expect(mocks.shouldRunMarketing).toHaveBeenCalledOnce();
    expect(mocks.screenOpportunity).not.toHaveBeenCalled();
    expect(mocks.screenContractQuote).not.toHaveBeenCalled();
    expect((res as CanonicalJsonResponse).status).toBe(200);
  });

  it("rejects unknown kind value", async () => {
    await expect(
      guardrailsPost(makePostCtx({ kind: "unknown", fitScore: 0.8 }))
    ).rejects.toThrow();
  });

  it("rejects fitScore out of range [0,1]", async () => {
    await expect(
      guardrailsPost(makePostCtx({ ...OPP_BODY, fitScore: 1.5 }))
    ).rejects.toThrow();
  });

  it("rejects marginPct out of range [0,1]", async () => {
    await expect(
      guardrailsPost(makePostCtx({ ...OPP_BODY, marginPct: -0.1 }))
    ).rejects.toThrow();
  });

  it("rejects invalid capacityStatus", async () => {
    await expect(
      guardrailsPost(makePostCtx({ ...OPP_BODY, capacityStatus: "overloaded" }))
    ).rejects.toThrow();
  });

  it("rejects invalid paymentRisk", async () => {
    await expect(
      guardrailsPost(makePostCtx({ ...OPP_BODY, paymentRisk: "critical" }))
    ).rejects.toThrow();
  });

  it("rejects missing required opportunity fields", async () => {
    const { fitScore: _, ...partial } = OPP_BODY;
    await expect(guardrailsPost(makePostCtx(partial))).rejects.toThrow();
  });

  it("passes opportunity input to screenOpportunity correctly", async () => {
    mocks.screenOpportunity.mockReturnValue(SAMPLE_SCREEN_RESULT);
    await guardrailsPost(makePostCtx(OPP_BODY));
    const arg = mocks.screenOpportunity.mock.calls[0][0];
    expect(arg.fitScore).toBe(0.8);
    expect(arg.capacityStatus).toBe("safe");
    expect(arg.marginFloorPct).toBe(0.2);
  });

  it("wraps all responses in canonicalJson", async () => {
    mocks.screenOpportunity.mockReturnValue(SAMPLE_SCREEN_RESULT);
    const res = await guardrailsPost(makePostCtx(OPP_BODY));
    expect((res as CanonicalJsonResponse).status).toBe(200);
    expect(getBody(res)).toBeDefined();
  });
});

// ─── 3. Static enforcement — POST /api/owner/waste-leakage ───────────────────

describe("[waste-leakage-post] POST /api/owner/waste-leakage — static enforcement", () => {
  const src = fs.readFileSync(
    path.resolve(__dirname, "../../../app/api/owner/waste-leakage/route.ts"),
    "utf8"
  );

  it("uses withCanonicalEnforcement", () => {
    expect(src).toContain("withCanonicalEnforcement");
  });

  it("requires OWNER_MANAGE for POST", () => {
    expect(src).toContain("CAPABILITIES.OWNER_MANAGE");
  });

  it("requires workspace", () => {
    expect(src).toContain("requireWorkspace: true");
  });

  it("calls recordLeakageEvent", () => {
    expect(src).toContain("recordLeakageEvent");
  });

  it("wraps POST response in canonicalJson with status 201", () => {
    expect(src).toContain("status: 201");
  });
});

// ─── 4. POST /api/owner/waste-leakage — handler behaviour ────────────────────

describe("[waste-leakage-post] POST /api/owner/waste-leakage — handler", () => {
  it("declares OWNER_MANAGE capability and requireWorkspace", () => {
    const opts = (leakagePost as unknown as {
      __options?: { requireCapabilities?: string[]; requireWorkspace?: boolean };
    }).__options;
    expect(opts?.requireCapabilities).toContain("owner:manage");
    expect(opts?.requireWorkspace).toBe(true);
  });

  it("returns eventId in canonicalJson with status 201", async () => {
    mocks.recordLeakageEvent.mockResolvedValue("ev-abc-123");
    const res = await leakagePost(makePostCtx(LEAKAGE_BODY));
    const body = getBody(res);
    expect(body.eventId).toBe("ev-abc-123");
    expect((res as CanonicalJsonResponse).status).toBe(201);
  });

  it("passes workspaceId from ctx to service", async () => {
    mocks.recordLeakageEvent.mockResolvedValue("ev-1");
    await leakagePost(makePostCtx(LEAKAGE_BODY, "ws-SPECIFIC"));
    const arg = mocks.recordLeakageEvent.mock.calls[0][0];
    expect(arg.workspaceId).toBe("ws-SPECIFIC");
  });

  it("passes actorId from ctx to service", async () => {
    mocks.recordLeakageEvent.mockResolvedValue("ev-1");
    await leakagePost(makePostCtx(LEAKAGE_BODY));
    const arg = mocks.recordLeakageEvent.mock.calls[0][0];
    expect(arg.actorId).toBe("actor-guard-1");
  });

  it("converts detectedAt string to Date", async () => {
    mocks.recordLeakageEvent.mockResolvedValue("ev-1");
    await leakagePost(makePostCtx(LEAKAGE_BODY));
    const arg = mocks.recordLeakageEvent.mock.calls[0][0];
    expect(arg.detectedAt).toBeInstanceOf(Date);
  });

  it("rejects invalid category", async () => {
    await expect(
      leakagePost(makePostCtx({ ...LEAKAGE_BODY, category: "UNKNOWN_CATEGORY" }))
    ).rejects.toThrow();
  });

  it("rejects invalid source", async () => {
    await expect(
      leakagePost(makePostCtx({ ...LEAKAGE_BODY, source: "invalid" }))
    ).rejects.toThrow();
  });

  it("rejects invalid detectedAt format", async () => {
    await expect(
      leakagePost(makePostCtx({ ...LEAKAGE_BODY, detectedAt: "not-a-date" }))
    ).rejects.toThrow();
  });

  it("rejects unknown top-level fields", async () => {
    await expect(
      leakagePost(makePostCtx({ ...LEAKAGE_BODY, injectedField: "x" }))
    ).rejects.toThrow();
  });

  it("workspace isolation: verifiedWorkspaceId used, not body field", async () => {
    mocks.recordLeakageEvent.mockResolvedValue("ev-1");
    await leakagePost({ ...makePostCtx(LEAKAGE_BODY, "ws-REAL"), verifiedWorkspaceId: "ws-REAL" } as never);
    const arg = mocks.recordLeakageEvent.mock.calls[0][0];
    expect(arg.workspaceId).toBe("ws-REAL");
  });
});

// ─── 5. Static enforcement — GET /api/owner/waste-leakage ────────────────────

describe("[waste-leakage-get] GET /api/owner/waste-leakage — static enforcement", () => {
  const src = fs.readFileSync(
    path.resolve(__dirname, "../../../app/api/owner/waste-leakage/route.ts"),
    "utf8"
  );

  it("requires OWNER_VIEW for GET", () => {
    expect(src).toContain("CAPABILITIES.OWNER_VIEW");
  });

  it("calls both listLeakageEvents and getLeakageSummary", () => {
    expect(src).toContain("listLeakageEvents");
    expect(src).toContain("getLeakageSummary");
  });

  it("uses Promise.all for parallel fetching", () => {
    expect(src).toContain("Promise.all");
  });
});

// ─── 6. GET /api/owner/waste-leakage — handler behaviour ─────────────────────

describe("[waste-leakage-get] GET /api/owner/waste-leakage — handler", () => {
  it("declares OWNER_VIEW capability and requireWorkspace", () => {
    const opts = (leakageGet as unknown as {
      __options?: { requireCapabilities?: string[]; requireWorkspace?: boolean };
    }).__options;
    expect(opts?.requireCapabilities).toContain("owner:view");
    expect(opts?.requireWorkspace).toBe(true);
  });

  it("returns events and summary in canonicalJson with status 200", async () => {
    mocks.listLeakageEvents.mockResolvedValue(SAMPLE_EVENTS);
    mocks.getLeakageSummary.mockResolvedValue(SAMPLE_SUMMARY);
    const res = await leakageGet(makeGetCtx(`https://x/api/owner/waste-leakage`));
    const body = getBody(res);
    expect(body.events).toEqual(SAMPLE_EVENTS);
    expect(body.summary).toEqual(SAMPLE_SUMMARY);
    expect((res as CanonicalJsonResponse).status).toBe(200);
  });

  it("calls both services with verified workspaceId", async () => {
    mocks.listLeakageEvents.mockResolvedValue(SAMPLE_EVENTS);
    mocks.getLeakageSummary.mockResolvedValue(SAMPLE_SUMMARY);
    await leakageGet(makeGetCtx(`https://x/api/owner/waste-leakage`, "ws-SPECIFIC"));
    expect(mocks.listLeakageEvents.mock.calls[0][0]).toBe("ws-SPECIFIC");
    expect(mocks.getLeakageSummary.mock.calls[0][0]).toBe("ws-SPECIFIC");
  });

  it("workspace isolation: different workspaces scoped correctly", async () => {
    mocks.listLeakageEvents.mockResolvedValue(SAMPLE_EVENTS);
    mocks.getLeakageSummary.mockResolvedValue(SAMPLE_SUMMARY);
    await leakageGet(makeGetCtx(`https://x/api/owner/waste-leakage`, "ws-ALICE"));
    await leakageGet(makeGetCtx(`https://x/api/owner/waste-leakage`, "ws-BOB"));
    expect(mocks.listLeakageEvents.mock.calls[0][0]).toBe("ws-ALICE");
    expect(mocks.listLeakageEvents.mock.calls[1][0]).toBe("ws-BOB");
  });
});

// ─── 7. Static enforcement — GET /api/owner/now-view ─────────────────────────

describe("[now-view] GET /api/owner/now-view — static enforcement", () => {
  const src = fs.readFileSync(
    path.resolve(__dirname, "../../../app/api/owner/now-view/route.ts"),
    "utf8"
  );

  it("uses withCanonicalEnforcement", () => {
    expect(src).toContain("withCanonicalEnforcement");
  });

  it("requires OWNER_VIEW capability", () => {
    expect(src).toContain("CAPABILITIES.OWNER_VIEW");
  });

  it("requires workspace", () => {
    expect(src).toContain("requireWorkspace: true");
  });

  it("calls getOwnerNowView", () => {
    expect(src).toContain("getOwnerNowView");
  });

  it("exports GET only", () => {
    expect(src).toContain("export const GET");
    expect(src).not.toContain("export const POST");
    expect(src).not.toContain("export const PATCH");
    expect(src).not.toContain("export const DELETE");
  });
});

// ─── 8. GET /api/owner/now-view — handler behaviour ──────────────────────────

const CANONICAL_DECISION = { contractVersion: "owner-decision-v1", primaryCandidateId: "domain_action:finance:x" };

describe("[now-view] GET /api/owner/now-view — handler", () => {
  beforeEach(() => {
    mocks.getOwnerHome.mockImplementation(async (_ws: string, businessId: string | null) => ({
      selectedBusinessId: businessId ?? "biz-auto",
      currentOwnerDecision: CANONICAL_DECISION,
    }));
  });

  it("declares OWNER_VIEW capability and requireWorkspace", () => {
    const opts = (nowViewGet as unknown as {
      __options?: { requireCapabilities?: string[]; requireWorkspace?: boolean };
    }).__options;
    expect(opts?.requireCapabilities).toContain("owner:view");
    expect(opts?.requireWorkspace).toBe(true);
  });

  it("returns service result directly (no canonicalJson wrapper), plus the canonical owner decision (no retired finance/domain priority bridges)", async () => {
    mocks.getOwnerNowView.mockResolvedValue(SAMPLE_NOW_VIEW);
    const res = await nowViewGet(makeGetCtx(`https://x/api/owner/now-view`));
    expect(res).toEqual({ ...SAMPLE_NOW_VIEW, ownerDecision: CANONICAL_DECISION });
    expect(res).not.toHaveProperty("financeTopPriority");
    expect(res).not.toHaveProperty("domainTopPriority");
  });

  it("resolves the canonical decision for the verified workspace only", async () => {
    mocks.getOwnerNowView.mockResolvedValue(SAMPLE_NOW_VIEW);
    await nowViewGet(makeGetCtx(`https://x/api/owner/now-view?workspaceId=ws-ATTACKER`, "ws-REAL"));
    expect(mocks.getOwnerHome).toHaveBeenCalledWith("ws-REAL", null);
  });

  it("calls getOwnerNowView with verified workspaceId", async () => {
    mocks.getOwnerNowView.mockResolvedValue(SAMPLE_NOW_VIEW);
    await nowViewGet(makeGetCtx(`https://x/api/owner/now-view`, "ws-SPECIFIC"));
    expect(mocks.getOwnerNowView.mock.calls[0][0]).toBe("ws-SPECIFIC");
  });

  it("passes businessId from query string when present", async () => {
    mocks.getOwnerNowView.mockResolvedValue(SAMPLE_NOW_VIEW);
    await nowViewGet(makeGetCtx(`https://x/api/owner/now-view?businessId=biz-77`));
    expect(mocks.getOwnerNowView.mock.calls[0][1]).toBe("biz-77");
  });

  it("with no businessId in the query, reads the business the canonical decision was resolved for (never workspace-wide)", async () => {
    mocks.getOwnerNowView.mockResolvedValue(SAMPLE_NOW_VIEW);
    await nowViewGet(makeGetCtx(`https://x/api/owner/now-view`));
    expect(mocks.getOwnerNowView.mock.calls[0][1]).toBe("biz-auto");
  });

  it("workspace isolation: verifiedWorkspaceId used, not URL param", async () => {
    mocks.getOwnerNowView.mockResolvedValue(SAMPLE_NOW_VIEW);
    await nowViewGet(makeGetCtx(`https://x/api/owner/now-view?workspaceId=ws-ATTACKER`, "ws-REAL"));
    expect(mocks.getOwnerNowView.mock.calls[0][0]).toBe("ws-REAL");
    expect(mocks.getOwnerNowView.mock.calls[0][0]).not.toBe("ws-ATTACKER");
  });

  it("workspace isolation: different workspaces scoped correctly", async () => {
    mocks.getOwnerNowView.mockResolvedValue(SAMPLE_NOW_VIEW);
    await nowViewGet(makeGetCtx(`https://x/api/owner/now-view`, "ws-ALICE"));
    await nowViewGet(makeGetCtx(`https://x/api/owner/now-view`, "ws-BOB"));
    expect(mocks.getOwnerNowView.mock.calls[0][0]).toBe("ws-ALICE");
    expect(mocks.getOwnerNowView.mock.calls[1][0]).toBe("ws-BOB");
  });
});
