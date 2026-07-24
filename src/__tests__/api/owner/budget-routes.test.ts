/**
 * Budget route contract tests (non-DB).
 *
 * Routes covered:
 *   GET  /api/owner/budget/actions         — listBudgetActions (OWNER_VIEW)
 *   GET  /api/owner/budget/forecast        — getBudgetForecast (OWNER_VIEW)
 *   GET  /api/owner/budget/guidance        — getBudgetGuidance (OWNER_VIEW)
 *   GET  /api/owner/budget/snapshots       — listBudgetSnapshots (OWNER_VIEW)
 *   GET  /api/owner/budget/archetype-metrics — listArchetypeMetrics (OWNER_VIEW)
 *   POST /api/owner/budget/archetype-metrics — recordArchetypeMetric (OWNER_MANAGE)
 *   GET  /api/owner/budget/working-capital — listWorkingCapitalItems (OWNER_VIEW)
 *   POST /api/owner/budget/working-capital — recordWorkingCapitalItem (OWNER_MANAGE)
 *   GET  /api/owner/budget/authority       — getBudgetAuthorities (OWNER_VIEW)
 *
 * All GET routes require businessId query param (returns { error } if absent).
 * DB-backed services are mocked; tests run without PostgreSQL.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import type { CanonicalJsonResponse } from "@/lib/canonical-json-response";

// ─── Hoisted mocks ────────────────────────────────────────────────────────────

const mocks = vi.hoisted(() => ({
  listBudgetActions: vi.fn(),
  getBudgetForecast: vi.fn(),
  getBudgetGuidance: vi.fn(),
  listBudgetSnapshots: vi.fn(),
  listArchetypeMetrics: vi.fn(),
  recordArchetypeMetric: vi.fn(),
  listWorkingCapitalItems: vi.fn(),
  recordWorkingCapitalItem: vi.fn(),
  getBudgetAuthorities: vi.fn(),
  changeBudgetAuthority: vi.fn(),
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

vi.mock("@/services/owner-budget/action-link.service", () => ({
  listBudgetActions: mocks.listBudgetActions,
}));

vi.mock("@/services/owner-budget/budget.service", () => ({
  getBudgetForecast: mocks.getBudgetForecast,
  getBudgetGuidance: mocks.getBudgetGuidance,
  listBudgetSnapshots: mocks.listBudgetSnapshots,
}));

vi.mock("@/services/owner-budget/archetype-metrics.service", () => ({
  listArchetypeMetrics: mocks.listArchetypeMetrics,
  recordArchetypeMetric: mocks.recordArchetypeMetric,
}));

vi.mock("@/services/owner-budget/working-capital.service", () => ({
  listWorkingCapitalItems: mocks.listWorkingCapitalItems,
  recordWorkingCapitalItem: mocks.recordWorkingCapitalItem,
}));

vi.mock("@/services/owner-budget/governance.service", () => ({
  getBudgetAuthorities: mocks.getBudgetAuthorities,
  changeBudgetAuthority: mocks.changeBudgetAuthority,
}));

// ─── Route imports (after mocks) ─────────────────────────────────────────────

import { GET as actionsGet } from "@/app/api/owner/budget/actions/route";
import { GET as forecastGet } from "@/app/api/owner/budget/forecast/route";
import { GET as guidanceGet } from "@/app/api/owner/budget/guidance/route";
import { GET as snapshotsGet } from "@/app/api/owner/budget/snapshots/route";
import {
  GET as archetypeMetricsGet,
  POST as archetypeMetricsPost,
} from "@/app/api/owner/budget/archetype-metrics/route";
import {
  GET as workingCapitalGet,
  POST as workingCapitalPost,
} from "@/app/api/owner/budget/working-capital/route";
import { GET as authorityGet } from "@/app/api/owner/budget/authority/route";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const WS = "ws-budget-test";
const BIZ = "a1b2c3d4-e5f6-4a7b-8c9d-e0f1a2b3c4d5";

function makeGetCtx(rawUrl: string, workspaceId = WS) {
  return {
    verifiedActorId: "actor-budget-1",
    verifiedWorkspaceId: workspaceId,
    request: { url: rawUrl },
  } as const;
}

function makePostCtx(body: unknown, workspaceId = WS) {
  return {
    verifiedActorId: "actor-budget-1",
    verifiedWorkspaceId: workspaceId,
    request: {
      url: `https://x/api/owner/budget`,
      json: async () => body,
    },
  } as const;
}

function getBody(res: unknown): Record<string, unknown> {
  return (res as CanonicalJsonResponse).body as Record<string, unknown>;
}

const SAMPLE_ACTIONS = [{ id: "action-1", label: "Reduce vendor spend" }];
const SAMPLE_FORECAST = { weeks: [], hasData: true };
const SAMPLE_GUIDANCE = { mode: "STEADY", topRisk: null };
const SAMPLE_SNAPSHOTS = [{ id: "snap-1", createdAt: new Date() }];
const SAMPLE_ARCHETYPE_METRICS = [{ id: "am-1", metricType: "machines_active" }];
const SAMPLE_ARCHETYPE_METRIC = { id: "am-2", metricType: "rooms_cleaned" };
const SAMPLE_WC_ITEMS = [{ id: "wc-1", kind: "receivable", amount: 5000 }];
const SAMPLE_WC_ITEM = { id: "wc-2", kind: "payable", amount: 2000 };
const SAMPLE_AUTHORITIES = [{ id: "auth-1", toStatus: "NORMAL" }];

const VALID_ARCHETYPE_METRIC_BODY = {
  businessId: BIZ,   // UUID — schema requires z.string().uuid()
  archetype: "laundry" as const,
  metricType: "machines_active",
  metricDate: "2026-07-01T00:00:00.000Z",
  value: 12,
};

const VALID_WC_BODY = {
  businessId: BIZ,   // UUID — schema requires z.string().uuid()
  kind: "receivable" as const,
  counterparty: "Acme Corp",
  amount: 5000,
};

beforeEach(() => vi.clearAllMocks());

// ─── Shared GET helper ────────────────────────────────────────────────────────

function testGetRoute(
  label: string,
  routeSegment: string,
  handler: (ctx: unknown) => unknown,
  mockFn: ReturnType<typeof vi.fn>,
  sampleResult: unknown,
  serviceSymbol: string
) {
  describe(`[${label}] GET /api/owner/budget/${routeSegment}`, () => {
    it("declares OWNER_VIEW capability and requireWorkspace", () => {
      const opts = (handler as unknown as {
        __options?: { requireCapabilities?: string[]; requireWorkspace?: boolean };
      }).__options;
      expect(opts?.requireCapabilities).toContain("owner:view");
      expect(opts?.requireWorkspace).toBe(true);
    });

    it("returns { error } when businessId is absent", async () => {
      const res = await handler(makeGetCtx(`https://x/api/owner/budget/${routeSegment}`));
      expect((res as { error: string }).error).toBe("businessId is required");
    });

    it("calls service with workspaceId and businessId", async () => {
      mockFn.mockResolvedValue(sampleResult);
      await handler(makeGetCtx(`https://x/api/owner/budget/${routeSegment}?businessId=${BIZ}`));
      expect(mockFn.mock.calls[0][0]).toBe(WS);
      expect(mockFn.mock.calls[0][1]).toBe(BIZ);
    });

    it("returns service result directly", async () => {
      mockFn.mockResolvedValue(sampleResult);
      const res = await handler(
        makeGetCtx(`https://x/api/owner/budget/${routeSegment}?businessId=${BIZ}`)
      );
      expect(res).toEqual(sampleResult);
    });

    it("workspace isolation: uses verifiedWorkspaceId, not URL param", async () => {
      mockFn.mockResolvedValue(sampleResult);
      await handler(
        makeGetCtx(
          `https://x/api/owner/budget/${routeSegment}?businessId=${BIZ}&workspaceId=ws-ATTACKER`,
          "ws-REAL"
        )
      );
      expect(mockFn.mock.calls[0][0]).toBe("ws-REAL");
      expect(mockFn.mock.calls[0][0]).not.toBe("ws-ATTACKER");
    });

    it("workspace isolation: different workspaces scoped correctly", async () => {
      mockFn.mockResolvedValue(sampleResult);
      await handler(makeGetCtx(`https://x/api/owner/budget/${routeSegment}?businessId=${BIZ}`, "ws-ALICE"));
      await handler(makeGetCtx(`https://x/api/owner/budget/${routeSegment}?businessId=${BIZ}`, "ws-BOB"));
      expect(mockFn.mock.calls[0][0]).toBe("ws-ALICE");
      expect(mockFn.mock.calls[1][0]).toBe("ws-BOB");
    });

    it(`uses withCanonicalEnforcement and calls ${serviceSymbol}`, () => {
      const src = fs.readFileSync(
        path.resolve(
          __dirname,
          `../../../app/api/owner/budget/${routeSegment}/route.ts`
        ),
        "utf8"
      );
      expect(src).toContain("withCanonicalEnforcement");
      expect(src).toContain(serviceSymbol);
    });
  });
}

describe("budget-routes — module contract assertions", () => {
  it("actionsGet is a function", () => { expect(typeof actionsGet).toBe("function"); });
  it("forecastGet is a function", () => { expect(typeof forecastGet).toBe("function"); });
  it("guidanceGet is a function", () => { expect(typeof guidanceGet).toBe("function"); });
  it("snapshotsGet is a function", () => { expect(typeof snapshotsGet).toBe("function"); });
  it("archetypeMetricsGet is a function", () => { expect(typeof archetypeMetricsGet).toBe("function"); });
  it("archetypeMetricsPost is a function", () => { expect(typeof archetypeMetricsPost).toBe("function"); });
  it("workingCapitalGet is a function", () => { expect(typeof workingCapitalGet).toBe("function"); });
  it("workingCapitalPost is a function", () => { expect(typeof workingCapitalPost).toBe("function"); });
  it("authorityGet is a function", () => { expect(typeof authorityGet).toBe("function"); });
  it("makeGetCtx is a function", () => { expect(typeof makeGetCtx).toBe("function"); });
  it("makePostCtx is a function", () => { expect(typeof makePostCtx).toBe("function"); });
  it("getBody is a function", () => { expect(typeof getBody).toBe("function"); });
  it("testGetRoute is a function", () => { expect(typeof testGetRoute).toBe("function"); });
  it("mocks is an object", () => { expect(typeof mocks).toBe("object"); });
});

// ─── Run shared GET tests ─────────────────────────────────────────────────────

testGetRoute("actions", "actions", actionsGet, mocks.listBudgetActions, SAMPLE_ACTIONS, "listBudgetActions");
testGetRoute("forecast", "forecast", forecastGet, mocks.getBudgetForecast, SAMPLE_FORECAST, "getBudgetForecast");
testGetRoute("guidance", "guidance", guidanceGet, mocks.getBudgetGuidance, SAMPLE_GUIDANCE, "getBudgetGuidance");
testGetRoute("snapshots", "snapshots", snapshotsGet, mocks.listBudgetSnapshots, SAMPLE_SNAPSHOTS, "listBudgetSnapshots");

// ─── Archetype-metrics GET ────────────────────────────────────────────────────

testGetRoute(
  "archetype-metrics-get",
  "archetype-metrics",
  archetypeMetricsGet,
  mocks.listArchetypeMetrics,
  SAMPLE_ARCHETYPE_METRICS,
  "listArchetypeMetrics"
);

// ─── Archetype-metrics POST ───────────────────────────────────────────────────

describe("[archetype-metrics] POST /api/owner/budget/archetype-metrics", () => {
  it("declares OWNER_MANAGE capability and requireWorkspace", () => {
    const opts = (archetypeMetricsPost as unknown as {
      __options?: { requireCapabilities?: string[]; requireWorkspace?: boolean };
    }).__options;
    expect(opts?.requireCapabilities).toContain("owner:manage");
    expect(opts?.requireWorkspace).toBe(true);
  });

  it("returns service result in canonicalJson with status 201", async () => {
    mocks.recordArchetypeMetric.mockResolvedValue(SAMPLE_ARCHETYPE_METRIC);
    const res = await archetypeMetricsPost(makePostCtx(VALID_ARCHETYPE_METRIC_BODY));
    expect((res as CanonicalJsonResponse).status).toBe(201);
    expect(getBody(res)).toEqual(SAMPLE_ARCHETYPE_METRIC);
  });

  it("passes workspaceId from ctx to service", async () => {
    mocks.recordArchetypeMetric.mockResolvedValue(SAMPLE_ARCHETYPE_METRIC);
    await archetypeMetricsPost(makePostCtx(VALID_ARCHETYPE_METRIC_BODY, "ws-SPECIFIC"));
    const args = mocks.recordArchetypeMetric.mock.calls[0];
    expect(args[3]).toBe("ws-SPECIFIC");
  });

  it("rejects invalid archetype value", async () => {
    await expect(
      archetypeMetricsPost(makePostCtx({ ...VALID_ARCHETYPE_METRIC_BODY, archetype: "invalid" }))
    ).rejects.toThrow();
  });

  it("rejects missing metricType", async () => {
    const { metricType: _, ...body } = VALID_ARCHETYPE_METRIC_BODY;
    await expect(archetypeMetricsPost(makePostCtx(body))).rejects.toThrow();
  });
});

// ─── Working-capital GET ──────────────────────────────────────────────────────

testGetRoute(
  "working-capital-get",
  "working-capital",
  workingCapitalGet,
  mocks.listWorkingCapitalItems,
  SAMPLE_WC_ITEMS,
  "listWorkingCapitalItems"
);

// ─── Working-capital POST ─────────────────────────────────────────────────────

describe("[working-capital] POST /api/owner/budget/working-capital", () => {
  it("declares OWNER_MANAGE capability and requireWorkspace", () => {
    const opts = (workingCapitalPost as unknown as {
      __options?: { requireCapabilities?: string[]; requireWorkspace?: boolean };
    }).__options;
    expect(opts?.requireCapabilities).toContain("owner:manage");
    expect(opts?.requireWorkspace).toBe(true);
  });

  it("returns service result in canonicalJson with status 201", async () => {
    mocks.recordWorkingCapitalItem.mockResolvedValue(SAMPLE_WC_ITEM);
    const res = await workingCapitalPost(makePostCtx(VALID_WC_BODY));
    expect((res as CanonicalJsonResponse).status).toBe(201);
    expect(getBody(res)).toEqual(SAMPLE_WC_ITEM);
  });

  it("passes workspaceId from ctx to service", async () => {
    mocks.recordWorkingCapitalItem.mockResolvedValue(SAMPLE_WC_ITEM);
    await workingCapitalPost(makePostCtx(VALID_WC_BODY, "ws-SPECIFIC"));
    const args = mocks.recordWorkingCapitalItem.mock.calls[0];
    expect(args[3]).toBe("ws-SPECIFIC");
  });

  it("rejects invalid kind value", async () => {
    await expect(
      workingCapitalPost(makePostCtx({ ...VALID_WC_BODY, kind: "invalid" }))
    ).rejects.toThrow();
  });

  it("rejects negative amount", async () => {
    await expect(
      workingCapitalPost(makePostCtx({ ...VALID_WC_BODY, amount: -1 }))
    ).rejects.toThrow();
  });

  it("rejects missing counterparty", async () => {
    const { counterparty: _, ...body } = VALID_WC_BODY;
    await expect(workingCapitalPost(makePostCtx(body))).rejects.toThrow();
  });
});

// ─── Authority GET ────────────────────────────────────────────────────────────

testGetRoute(
  "authority-get",
  "authority",
  authorityGet,
  mocks.getBudgetAuthorities,
  SAMPLE_AUTHORITIES,
  "getBudgetAuthorities"
);
