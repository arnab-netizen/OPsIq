/**
 * Route contract tests (non-DB) for:
 *   GET /api/owner/strategy/dashboard    — aggregated strategy dashboard (OWNER_VIEW)
 *   GET /api/owner/wealth-path           — Wealth Path classification (OWNER_VIEW)
 *   GET /api/owner/wealth-command-center — Wealth command center (OWNER_VIEW)
 *   GET /api/owner/whole-business-plan   — Whole-business plan (OWNER_VIEW)
 *
 * All routes:
 *   - Require OWNER_VIEW + requireWorkspace
 *   - Parse optional `businessId` from query string
 *   - Delegate to a single DB-backed service
 *
 * DB-backed services mocked; tests run without PostgreSQL.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import type { CanonicalJsonResponse } from "@/lib/canonical-json-response";

// ─── Hoisted mocks ────────────────────────────────────────────────────────────

const mocks = vi.hoisted(() => ({
  getStrategyDashboard: vi.fn(),
  getWealthPath: vi.fn(),
  getWealthCommandCenter: vi.fn(),
  getOwnerWholeBusinessPlan: vi.fn(),
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

vi.mock("@/lib/db", () => ({ db: {}, getDbInstance: vi.fn().mockResolvedValue({}) }));

vi.mock("@/services/owner-strategy/dashboard.service", () => ({
  getStrategyDashboard: mocks.getStrategyDashboard,
}));

vi.mock("@/services/owner-strategy/wealth-path.service", () => ({
  getWealthPath: mocks.getWealthPath,
}));

vi.mock("@/services/owner-strategy/command-center.service", () => ({
  getWealthCommandCenter: mocks.getWealthCommandCenter,
}));

vi.mock("@/services/owner-mode/owner-whole-business-plan.service", () => ({
  getOwnerWholeBusinessPlan: mocks.getOwnerWholeBusinessPlan,
}));

// ─── Route imports (after mocks) ─────────────────────────────────────────────

import { GET as strategyDashboardGet } from "@/app/api/owner/strategy/dashboard/route";
import { GET as wealthPathGet } from "@/app/api/owner/wealth-path/route";
import { GET as wealthCommandCenterGet } from "@/app/api/owner/wealth-command-center/route";
import { GET as wholeBusinessPlanGet } from "@/app/api/owner/whole-business-plan/route";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const WS = "ws-strategy-test";

function makeCtx(rawUrl: string, workspaceId = WS) {
  return {
    verifiedActorId: "actor-strategy-1",
    verifiedWorkspaceId: workspaceId,
    request: { url: rawUrl },
  } as const;
}

function getBody(res: unknown): Record<string, unknown> {
  return (res as CanonicalJsonResponse).body as Record<string, unknown>;
}

const SAMPLE_STRATEGY_DASHBOARD = {
  workspaceId: WS,
  activeGoal: null,
  wealthPath: "OPERATOR",
  bmqScore: 55,
  topRecommendations: [],
};

const SAMPLE_WEALTH_PATH = {
  workspaceId: WS,
  wealthPath: "OPERATOR",
  bmqScore: 55,
  found: true,
};

const SAMPLE_WEALTH_CC = {
  workspaceId: WS,
  wealthLoop: {},
  nextBestMove: null,
};

const SAMPLE_WHOLE_PLAN = {
  workspaceId: WS,
  found: true,
  topActions: [],
  confidence: "MEDIUM",
};

beforeEach(() => vi.clearAllMocks());

// ─── 1. GET /api/owner/strategy/dashboard ────────────────────────────────────

describe("[strategy-dashboard] GET /api/owner/strategy/dashboard", () => {
  const src = fs.readFileSync(
    path.resolve(__dirname, "../../../app/api/owner/strategy/dashboard/route.ts"),
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

  it("calls getStrategyDashboard", () => {
    expect(src).toContain("getStrategyDashboard");
  });

  it("exports GET only", () => {
    expect(src).toContain("export const GET");
    expect(src).not.toContain("export const POST");
  });

  it("declares OWNER_VIEW capability and requireWorkspace", () => {
    const opts = (strategyDashboardGet as unknown as {
      __options?: { requireCapabilities?: string[]; requireWorkspace?: boolean };
    }).__options;
    expect(opts?.requireCapabilities).toContain("owner:view");
    expect(opts?.requireWorkspace).toBe(true);
  });

  it("returns service result directly", async () => {
    mocks.getStrategyDashboard.mockResolvedValue(SAMPLE_STRATEGY_DASHBOARD);
    const res = await strategyDashboardGet(
      makeCtx(`https://x/api/owner/strategy/dashboard?businessId=biz-1`)
    );
    expect(res).toEqual(SAMPLE_STRATEGY_DASHBOARD);
  });

  it("calls getStrategyDashboard with verified workspaceId", async () => {
    mocks.getStrategyDashboard.mockResolvedValue(SAMPLE_STRATEGY_DASHBOARD);
    await strategyDashboardGet(makeCtx(`https://x/api/owner/strategy/dashboard`, "ws-SPECIFIC"));
    expect(mocks.getStrategyDashboard.mock.calls[0][0]).toBe("ws-SPECIFIC");
  });

  it("passes businessId from query string", async () => {
    mocks.getStrategyDashboard.mockResolvedValue(SAMPLE_STRATEGY_DASHBOARD);
    await strategyDashboardGet(
      makeCtx(`https://x/api/owner/strategy/dashboard?businessId=biz-42`)
    );
    expect(mocks.getStrategyDashboard.mock.calls[0][1]).toBe("biz-42");
  });

  it("passes null businessId when not in query", async () => {
    mocks.getStrategyDashboard.mockResolvedValue(SAMPLE_STRATEGY_DASHBOARD);
    await strategyDashboardGet(makeCtx(`https://x/api/owner/strategy/dashboard`));
    expect(mocks.getStrategyDashboard.mock.calls[0][1]).toBeNull();
  });

  it("workspace isolation: verifiedWorkspaceId used, not URL param", async () => {
    mocks.getStrategyDashboard.mockResolvedValue(SAMPLE_STRATEGY_DASHBOARD);
    await strategyDashboardGet(
      makeCtx(`https://x/api/owner/strategy/dashboard?workspaceId=ws-ATTACKER`, "ws-REAL")
    );
    expect(mocks.getStrategyDashboard.mock.calls[0][0]).toBe("ws-REAL");
    expect(mocks.getStrategyDashboard.mock.calls[0][0]).not.toBe("ws-ATTACKER");
  });

  it("workspace isolation: different workspaces scoped correctly", async () => {
    mocks.getStrategyDashboard.mockResolvedValue(SAMPLE_STRATEGY_DASHBOARD);
    await strategyDashboardGet(makeCtx(`https://x/api/owner/strategy/dashboard`, "ws-ALICE"));
    await strategyDashboardGet(makeCtx(`https://x/api/owner/strategy/dashboard`, "ws-BOB"));
    expect(mocks.getStrategyDashboard.mock.calls[0][0]).toBe("ws-ALICE");
    expect(mocks.getStrategyDashboard.mock.calls[1][0]).toBe("ws-BOB");
  });
});

// ─── 2. GET /api/owner/wealth-path ───────────────────────────────────────────

describe("[wealth-path] GET /api/owner/wealth-path", () => {
  const src = fs.readFileSync(
    path.resolve(__dirname, "../../../app/api/owner/wealth-path/route.ts"),
    "utf8"
  );

  it("uses withCanonicalEnforcement and requires OWNER_VIEW", () => {
    expect(src).toContain("withCanonicalEnforcement");
    expect(src).toContain("CAPABILITIES.OWNER_VIEW");
    expect(src).toContain("requireWorkspace: true");
  });

  it("calls getWealthPath", () => {
    expect(src).toContain("getWealthPath");
  });

  it("declares OWNER_VIEW capability and requireWorkspace", () => {
    const opts = (wealthPathGet as unknown as {
      __options?: { requireCapabilities?: string[]; requireWorkspace?: boolean };
    }).__options;
    expect(opts?.requireCapabilities).toContain("owner:view");
    expect(opts?.requireWorkspace).toBe(true);
  });

  it("returns service result directly", async () => {
    mocks.getWealthPath.mockResolvedValue(SAMPLE_WEALTH_PATH);
    const res = await wealthPathGet(makeCtx(`https://x/api/owner/wealth-path`));
    expect(res).toEqual(SAMPLE_WEALTH_PATH);
  });

  it("calls getWealthPath with verified workspaceId and businessId", async () => {
    mocks.getWealthPath.mockResolvedValue(SAMPLE_WEALTH_PATH);
    await wealthPathGet(makeCtx(`https://x/api/owner/wealth-path?businessId=biz-77`, "ws-SPECIFIC"));
    expect(mocks.getWealthPath.mock.calls[0][0]).toBe("ws-SPECIFIC");
    expect(mocks.getWealthPath.mock.calls[0][1]).toBe("biz-77");
  });

  it("passes null businessId when absent", async () => {
    mocks.getWealthPath.mockResolvedValue(SAMPLE_WEALTH_PATH);
    await wealthPathGet(makeCtx(`https://x/api/owner/wealth-path`));
    expect(mocks.getWealthPath.mock.calls[0][1]).toBeNull();
  });

  it("workspace isolation: verifiedWorkspaceId used", async () => {
    mocks.getWealthPath.mockResolvedValue(SAMPLE_WEALTH_PATH);
    await wealthPathGet(makeCtx(`https://x/api/owner/wealth-path?workspaceId=ws-ATTACKER`, "ws-REAL"));
    expect(mocks.getWealthPath.mock.calls[0][0]).toBe("ws-REAL");
  });

  it("workspace isolation: different workspaces scoped correctly", async () => {
    mocks.getWealthPath.mockResolvedValue(SAMPLE_WEALTH_PATH);
    await wealthPathGet(makeCtx(`https://x/api/owner/wealth-path`, "ws-ALICE"));
    await wealthPathGet(makeCtx(`https://x/api/owner/wealth-path`, "ws-BOB"));
    expect(mocks.getWealthPath.mock.calls[0][0]).toBe("ws-ALICE");
    expect(mocks.getWealthPath.mock.calls[1][0]).toBe("ws-BOB");
  });
});

// ─── 3. GET /api/owner/wealth-command-center ─────────────────────────────────

describe("[wealth-command-center] GET /api/owner/wealth-command-center", () => {
  const src = fs.readFileSync(
    path.resolve(__dirname, "../../../app/api/owner/wealth-command-center/route.ts"),
    "utf8"
  );

  it("uses withCanonicalEnforcement and requires OWNER_VIEW", () => {
    expect(src).toContain("withCanonicalEnforcement");
    expect(src).toContain("CAPABILITIES.OWNER_VIEW");
    expect(src).toContain("requireWorkspace: true");
  });

  it("calls getWealthCommandCenter", () => {
    expect(src).toContain("getWealthCommandCenter");
  });

  it("declares OWNER_VIEW capability and requireWorkspace", () => {
    const opts = (wealthCommandCenterGet as unknown as {
      __options?: { requireCapabilities?: string[]; requireWorkspace?: boolean };
    }).__options;
    expect(opts?.requireCapabilities).toContain("owner:view");
    expect(opts?.requireWorkspace).toBe(true);
  });

  it("returns service result directly", async () => {
    mocks.getWealthCommandCenter.mockResolvedValue(SAMPLE_WEALTH_CC);
    const res = await wealthCommandCenterGet(
      makeCtx(`https://x/api/owner/wealth-command-center`)
    );
    expect(res).toEqual(SAMPLE_WEALTH_CC);
  });

  it("calls service with verified workspaceId", async () => {
    mocks.getWealthCommandCenter.mockResolvedValue(SAMPLE_WEALTH_CC);
    await wealthCommandCenterGet(
      makeCtx(`https://x/api/owner/wealth-command-center`, "ws-SPECIFIC")
    );
    expect(mocks.getWealthCommandCenter.mock.calls[0][0]).toBe("ws-SPECIFIC");
  });

  it("passes businessId from query string", async () => {
    mocks.getWealthCommandCenter.mockResolvedValue(SAMPLE_WEALTH_CC);
    await wealthCommandCenterGet(
      makeCtx(`https://x/api/owner/wealth-command-center?businessId=biz-99`)
    );
    expect(mocks.getWealthCommandCenter.mock.calls[0][1]).toBe("biz-99");
  });

  it("passes null businessId when absent", async () => {
    mocks.getWealthCommandCenter.mockResolvedValue(SAMPLE_WEALTH_CC);
    await wealthCommandCenterGet(makeCtx(`https://x/api/owner/wealth-command-center`));
    expect(mocks.getWealthCommandCenter.mock.calls[0][1]).toBeNull();
  });

  it("workspace isolation: verifiedWorkspaceId used", async () => {
    mocks.getWealthCommandCenter.mockResolvedValue(SAMPLE_WEALTH_CC);
    await wealthCommandCenterGet(
      makeCtx(`https://x/api/owner/wealth-command-center?workspaceId=ws-ATTACKER`, "ws-REAL")
    );
    expect(mocks.getWealthCommandCenter.mock.calls[0][0]).toBe("ws-REAL");
  });

  it("workspace isolation: different workspaces scoped correctly", async () => {
    mocks.getWealthCommandCenter.mockResolvedValue(SAMPLE_WEALTH_CC);
    await wealthCommandCenterGet(makeCtx(`https://x/api/owner/wealth-command-center`, "ws-ALICE"));
    await wealthCommandCenterGet(makeCtx(`https://x/api/owner/wealth-command-center`, "ws-BOB"));
    expect(mocks.getWealthCommandCenter.mock.calls[0][0]).toBe("ws-ALICE");
    expect(mocks.getWealthCommandCenter.mock.calls[1][0]).toBe("ws-BOB");
  });
});

// ─── 4. GET /api/owner/whole-business-plan ───────────────────────────────────

describe("[whole-business-plan] GET /api/owner/whole-business-plan", () => {
  const src = fs.readFileSync(
    path.resolve(__dirname, "../../../app/api/owner/whole-business-plan/route.ts"),
    "utf8"
  );

  it("uses withCanonicalEnforcement and requires OWNER_VIEW", () => {
    expect(src).toContain("withCanonicalEnforcement");
    expect(src).toContain("CAPABILITIES.OWNER_VIEW");
    expect(src).toContain("requireWorkspace: true");
  });

  it("calls getOwnerWholeBusinessPlan", () => {
    expect(src).toContain("getOwnerWholeBusinessPlan");
  });

  it("wraps response in canonicalJson with status 200", () => {
    expect(src).toContain("canonicalJson");
    expect(src).toContain("status: 200");
  });

  it("declares OWNER_VIEW capability and requireWorkspace", () => {
    const opts = (wholeBusinessPlanGet as unknown as {
      __options?: { requireCapabilities?: string[]; requireWorkspace?: boolean };
    }).__options;
    expect(opts?.requireCapabilities).toContain("owner:view");
    expect(opts?.requireWorkspace).toBe(true);
  });

  it("returns result in canonicalJson with status 200", async () => {
    mocks.getOwnerWholeBusinessPlan.mockResolvedValue(SAMPLE_WHOLE_PLAN);
    const res = await wholeBusinessPlanGet(makeCtx(`https://x/api/owner/whole-business-plan?businessId=biz-33`));
    expect(getBody(res)).toEqual(SAMPLE_WHOLE_PLAN);
    expect((res as CanonicalJsonResponse).status).toBe(200);
  });

  it("calls service with verified workspaceId", async () => {
    mocks.getOwnerWholeBusinessPlan.mockResolvedValue(SAMPLE_WHOLE_PLAN);
    await wholeBusinessPlanGet(
      makeCtx(`https://x/api/owner/whole-business-plan?businessId=biz-33`, "ws-SPECIFIC")
    );
    const arg = mocks.getOwnerWholeBusinessPlan.mock.calls[0][0];
    expect(arg.workspaceId).toBe("ws-SPECIFIC");
  });

  it("passes businessId from query string", async () => {
    mocks.getOwnerWholeBusinessPlan.mockResolvedValue(SAMPLE_WHOLE_PLAN);
    await wholeBusinessPlanGet(
      makeCtx(`https://x/api/owner/whole-business-plan?businessId=biz-33`)
    );
    const arg = mocks.getOwnerWholeBusinessPlan.mock.calls[0][0];
    expect(arg.businessId).toBe("biz-33");
  });

  it("returns no-business 200 and does not call service when businessId absent", async () => {
    const res = await wholeBusinessPlanGet(makeCtx(`https://x/api/owner/whole-business-plan`));
    expect((res as CanonicalJsonResponse).status).toBe(200);
    expect(getBody(res)).toMatchObject({ found: false, reason: "no_business_configured" });
    expect(mocks.getOwnerWholeBusinessPlan).not.toHaveBeenCalled();
  });

  it("injects db into service call", async () => {
    mocks.getOwnerWholeBusinessPlan.mockResolvedValue(SAMPLE_WHOLE_PLAN);
    await wholeBusinessPlanGet(makeCtx(`https://x/api/owner/whole-business-plan?businessId=biz-33`));
    const arg = mocks.getOwnerWholeBusinessPlan.mock.calls[0][0];
    expect(arg.db).toBeDefined();
  });

  it("injects now (a Date instance) into service call", async () => {
    mocks.getOwnerWholeBusinessPlan.mockResolvedValue(SAMPLE_WHOLE_PLAN);
    await wholeBusinessPlanGet(makeCtx(`https://x/api/owner/whole-business-plan?businessId=biz-33`));
    const arg = mocks.getOwnerWholeBusinessPlan.mock.calls[0][0];
    expect(arg.now).toBeInstanceOf(Date);
  });

  it("workspace isolation: verifiedWorkspaceId used, not URL param", async () => {
    mocks.getOwnerWholeBusinessPlan.mockResolvedValue(SAMPLE_WHOLE_PLAN);
    await wholeBusinessPlanGet(
      makeCtx(`https://x/api/owner/whole-business-plan?workspaceId=ws-ATTACKER&businessId=biz-33`, "ws-REAL")
    );
    const arg = mocks.getOwnerWholeBusinessPlan.mock.calls[0][0];
    expect(arg.workspaceId).toBe("ws-REAL");
    expect(arg.workspaceId).not.toBe("ws-ATTACKER");
  });

  it("workspace isolation: different workspaces scoped correctly", async () => {
    mocks.getOwnerWholeBusinessPlan.mockResolvedValue(SAMPLE_WHOLE_PLAN);
    await wholeBusinessPlanGet(makeCtx(`https://x/api/owner/whole-business-plan?businessId=biz-33`, "ws-ALICE"));
    await wholeBusinessPlanGet(makeCtx(`https://x/api/owner/whole-business-plan?businessId=biz-33`, "ws-BOB"));
    expect(mocks.getOwnerWholeBusinessPlan.mock.calls[0][0].workspaceId).toBe("ws-ALICE");
    expect(mocks.getOwnerWholeBusinessPlan.mock.calls[1][0].workspaceId).toBe("ws-BOB");
  });
});
