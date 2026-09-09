/**
 * Route contract tests (non-DB) for remaining uncovered owner API routes:
 *   GET  /api/owner/businesses
 *   GET  /api/owner/businesses/[businessId]/outcomes
 *   POST /api/owner/businesses/[businessId]/outcomes
 *   GET  /api/owner/businesses/[businessId]/progress
 *   GET  /api/owner/portfolio/dashboard
 *   GET  /api/owner/portfolio/ranking
 *   GET  /api/owner/portfolio/risks
 *   GET  /api/owner/portfolio/actions
 *   GET  /api/owner/trust/audit-trail
 *   GET  /api/owner/trust/cycles
 *   GET  /api/owner/trust/explanations
 *   PATCH /api/owner/waste-leakage/[eventId]/status
 *   POST /api/owner/tasks
 *   POST /api/owner/tasks/complete
 *   GET  /api/owner/startup/sessions
 *   POST /api/owner/startup/sessions
 *   POST /api/owner/gates/opt-out
 *   DELETE /api/owner/gates/opt-out
 *   GET  /api/owner/local-mode/status
 *   GET  /api/owner/vendor
 *   POST /api/owner/vendor
 *   POST /api/owner/vendor/[vendorId]/approve
 *   GET  /api/owner/vendor/[vendorId]/contracts
 *   POST /api/owner/vendor/[vendorId]/contracts
 *   POST /api/owner/vendor/[vendorId]/deliveries
 *   GET  /api/owner/vendor/[vendorId]/performance
 *   POST /api/owner/vendor/[vendorId]/suspend
 *
 * DB-backed services are mocked. Tests run without PostgreSQL.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Hoisted mocks ────────────────────────────────────────────────────────────

const mocks = vi.hoisted(() => {
  class TaskCompletionBlockedError extends Error {
    reason: string;
    constructor(reason: string) {
      super("blocked: " + reason);
      this.reason = reason;
    }
  }
  class TaskNotFoundError extends Error {
    constructor() {
      super("not found");
    }
  }

  return {
    // businesses
    listBusinesses: vi.fn(),
    recordOwnerActionOutcome: vi.fn(),
    listOwnerActionOutcomes: vi.fn(),
    getOwnerBusinessProgress: vi.fn(),
    generateOwnerBusinessReview: vi.fn(),
    // portfolio
    getPortfolio: vi.fn(),
    // trust
    getEntityAuditTrail: vi.fn(),
    getBusinessTrustOverview: vi.fn(),
    getCycleExplanations: vi.fn(),
    // waste-leakage
    updateLeakageStatus: vi.fn(),
    // tasks
    assignDelegatedTask: vi.fn(),
    completeTask: vi.fn(),
    TaskCompletionBlockedError,
    TaskNotFoundError,
    // startup
    createStartupSession: vi.fn(),
    listStartupSessions: vi.fn(),
    // gates
    recordGateOptOut: vi.fn(),
    clearGateOptOut: vi.fn(),
    // vendor
    createVendor: vi.fn(),
    getVendors: vi.fn(),
    approveVendor: vi.fn(),
    recordVendorContract: vi.fn(),
    listVendorContracts: vi.fn(),
    recordVendorDelivery: vi.fn(),
    getVendorPerformanceSummary: vi.fn(),
    suspendVendor: vi.fn(),
  };
});

// ─── Module mocks ─────────────────────────────────────────────────────────────

vi.mock("@/lib/canonical-route-enforcement", () => ({
  withCanonicalEnforcement: (
    handler: (ctx: unknown, params?: unknown) => unknown,
    options?: unknown
  ) => {
    const wrapped = (ctx: unknown, params?: unknown) => handler(ctx, params);
    (wrapped as { __options?: unknown }).__options = options;
    return wrapped;
  },
}));

vi.mock("@/lib/db", () => ({ db: {}, getDbInstance: vi.fn().mockResolvedValue({}) }));

vi.mock("@/services/founder-recovery/business.service", () => ({
  listBusinesses: mocks.listBusinesses,
}));

vi.mock("@/services/owner-mode/owner-action-outcome.service", () => ({
  recordOwnerActionOutcome: mocks.recordOwnerActionOutcome,
  listOwnerActionOutcomes: mocks.listOwnerActionOutcomes,
}));

vi.mock("@/services/owner-mode/owner-progress.service", () => ({
  getOwnerBusinessProgress: mocks.getOwnerBusinessProgress,
  generateOwnerBusinessReview: mocks.generateOwnerBusinessReview,
}));

vi.mock("@/services/owner-portfolio/portfolio.service", () => ({
  getPortfolio: mocks.getPortfolio,
}));

vi.mock("@/services/owner-trust/trust.service", () => ({
  getEntityAuditTrail: mocks.getEntityAuditTrail,
  getBusinessTrustOverview: mocks.getBusinessTrustOverview,
  getCycleExplanations: mocks.getCycleExplanations,
}));

vi.mock("@/services/owner-mode/waste-leakage.service", () => ({
  updateLeakageStatus: mocks.updateLeakageStatus,
}));

vi.mock("@/services/execution/task-assignment.service", () => ({
  assignDelegatedTask: mocks.assignDelegatedTask,
}));

vi.mock("@/services/execution/task-completion.service", () => ({
  completeTask: mocks.completeTask,
  TaskCompletionBlockedError: mocks.TaskCompletionBlockedError,
  TaskNotFoundError: mocks.TaskNotFoundError,
}));

vi.mock("@/services/owner-strategy/startup-session.service", () => ({
  createStartupSession: mocks.createStartupSession,
  listStartupSessions: mocks.listStartupSessions,
}));

vi.mock("@/services/owner-mode/gate-enforcement-policy", () => ({
  GATE_OPT_OUT_RISK_CLASSES: ["low", "medium", "high", "critical"] as const,
  recordGateOptOut: mocks.recordGateOptOut,
  clearGateOptOut: mocks.clearGateOptOut,
}));

vi.mock("@/services/owner-budget/vendor.service", () => ({
  createVendor: mocks.createVendor,
  getVendors: mocks.getVendors,
  approveVendor: mocks.approveVendor,
  recordVendorContract: mocks.recordVendorContract,
  listVendorContracts: mocks.listVendorContracts,
  recordVendorDelivery: mocks.recordVendorDelivery,
  getVendorPerformanceSummary: mocks.getVendorPerformanceSummary,
  suspendVendor: mocks.suspendVendor,
}));

// ─── Route imports (after mocks) ──────────────────────────────────────────────

import { GET as bizGet } from "@/app/api/owner/businesses/route";
import {
  GET as outcomesGet,
  POST as outcomesPost,
} from "@/app/api/owner/businesses/[businessId]/outcomes/route";
import { GET as progressGet } from "@/app/api/owner/businesses/[businessId]/progress/route";
import { GET as portfolioDashGet } from "@/app/api/owner/portfolio/dashboard/route";
import { GET as portfolioRankGet } from "@/app/api/owner/portfolio/ranking/route";
import { GET as portfolioRisksGet } from "@/app/api/owner/portfolio/risks/route";
import { GET as portfolioActionsGet } from "@/app/api/owner/portfolio/actions/route";
import { GET as auditTrailGet } from "@/app/api/owner/trust/audit-trail/route";
import { GET as trustCyclesGet } from "@/app/api/owner/trust/cycles/route";
import { GET as trustExplanationsGet } from "@/app/api/owner/trust/explanations/route";
import { PATCH as leakageStatusPatch } from "@/app/api/owner/waste-leakage/[eventId]/status/route";
import { POST as tasksPost } from "@/app/api/owner/tasks/route";
import { POST as tasksCompletePost } from "@/app/api/owner/tasks/complete/route";
import { GET as startupSessionsGet, POST as startupSessionsPost } from "@/app/api/owner/startup/sessions/route";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { POST as gatesOptOutPost, DELETE as gatesOptOutDelete } from "@/app/api/owner/gates/opt-out/route";
import { GET as localModeGet } from "@/app/api/owner/local-mode/status/route";
import { GET as vendorGet, POST as vendorPost } from "@/app/api/owner/vendor/route";
import { POST as vendorApprovePost } from "@/app/api/owner/vendor/[vendorId]/approve/route";
import {
  GET as vendorContractsGet,
  POST as vendorContractsPost,
} from "@/app/api/owner/vendor/[vendorId]/contracts/route";
import { POST as vendorDeliveriesPost } from "@/app/api/owner/vendor/[vendorId]/deliveries/route";
import { GET as vendorPerfGet } from "@/app/api/owner/vendor/[vendorId]/performance/route";
import { POST as vendorSuspendPost } from "@/app/api/owner/vendor/[vendorId]/suspend/route";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const WS = "a1b2c3d4-e5f6-4789-8abc-def012345678";
const ACTOR = "b2c3d4e5-f6a7-4b8c-9d0e-f1a2b3c4d5e6";
const BIZ_ID = "c3d4e5f6-a7b8-4c9d-8e1f-a2b3c4d5e6f7";
const VND_ID = "d4e5f6a7-b8c9-4d0e-8f1a-b2c3d4e5f6a7";
const ENTITY_ID = "e5f6a7b8-c9d0-4e1f-8a2b-c3d4e5f6a7b8";
const CYCLE_ID = "f6a7b8c9-d0e1-4f2a-8b3c-d4e5f6a7b8c9";
const EVENT_ID = "a7b8c9d0-e1f2-4a3b-8c4d-e5f6a7b8c9d0";
const INVALID_ID = "not-a-uuid";

function makeCtx(url = "https://x/api/owner/test", wsId = WS) {
  return {
    verifiedActorId: ACTOR,
    verifiedWorkspaceId: wsId,
    // Every real ctx from withCanonicalEnforcement always carries this Set (empty for a
    // non-admin caller); default it here so route code that checks a capability (e.g. the
    // SYSTEM_ADMIN-gated isFixtureBusiness field) behaves the same as it would for a real,
    // ordinary owner caller instead of throwing on an undefined ctx field.
    verifiedCapabilities: new Set<string>(),
    request: {
      url,
      json: async () => ({}),
    },
  };
}

function makeBodyCtx(body: Record<string, unknown>, url = "https://x/api/owner/test", wsId = WS) {
  return {
    verifiedActorId: ACTOR,
    verifiedWorkspaceId: wsId,
    verifiedCapabilities: new Set<string>(),
    request: {
      url,
      json: async () => body,
    },
  };
}

function expectOwnerView(handler: { __options?: { requireCapabilities?: string[]; requireWorkspace?: boolean } }) {
  expect(handler.__options?.requireCapabilities).toContain("owner:view");
  expect(handler.__options?.requireWorkspace).toBe(true);
}

function expectOwnerManage(handler: { __options?: { requireCapabilities?: string[]; requireWorkspace?: boolean } }) {
  expect(handler.__options?.requireCapabilities).toContain("owner:manage");
  expect(handler.__options?.requireWorkspace).toBe(true);
}

// ─── Businesses — list ────────────────────────────────────────────────────────

describe("[businesses-list] GET /api/owner/businesses", () => {
  beforeEach(() => vi.clearAllMocks());

  it("requires OWNER_VIEW + workspace", () => {
    expectOwnerView(bizGet as never);
  });

  it("calls listBusinesses with verified workspaceId and returns mapped array", async () => {
    mocks.listBusinesses.mockResolvedValue([
      { id: BIZ_ID, name: "Ace Laundry", businessType: "laundry_local_service", currency: "GBP", isActive: true },
    ]);
    const res = await bizGet(makeCtx());
    expect(mocks.listBusinesses).toHaveBeenCalledWith(WS);
    expect((res as { businesses: unknown[] }).businesses).toHaveLength(1);
    expect((res as { businesses: { id: string }[] }).businesses[0].id).toBe(BIZ_ID);
  });

  it("passes verified workspaceId, not a spoofed value", async () => {
    mocks.listBusinesses.mockResolvedValue([]);
    const attacker = makeCtx("https://x/api/owner/businesses", "ws-ATTACKER");
    const victim = makeCtx("https://x/api/owner/businesses", "ws-VICTIM");
    await bizGet(attacker);
    await bizGet(victim);
    expect(mocks.listBusinesses.mock.calls[0][0]).toBe("ws-ATTACKER");
    expect(mocks.listBusinesses.mock.calls[1][0]).toBe("ws-VICTIM");
  });
});

// ─── Businesses — outcomes ────────────────────────────────────────────────────

describe("[outcomes-get] GET /api/owner/businesses/[businessId]/outcomes", () => {
  beforeEach(() => vi.clearAllMocks());

  it("requires OWNER_VIEW + workspace", () => {
    expectOwnerView(outcomesGet as never);
  });

  it("rejects invalid businessId param", async () => {
    mocks.listOwnerActionOutcomes.mockResolvedValue([]);
    await expect(outcomesGet(makeCtx(), { businessId: INVALID_ID })).rejects.toThrow();
  });

  it("delegates to listOwnerActionOutcomes with correct scope", async () => {
    mocks.listOwnerActionOutcomes.mockResolvedValue([{ id: "out-1" }]);
    await outcomesGet(makeCtx(), { businessId: BIZ_ID });
    expect(mocks.listOwnerActionOutcomes).toHaveBeenCalledWith(WS, BIZ_ID);
  });
});

describe("[outcomes-post] POST /api/owner/businesses/[businessId]/outcomes", () => {
  beforeEach(() => vi.clearAllMocks());

  it("requires OWNER_MANAGE + workspace", () => {
    expectOwnerManage(outcomesPost as never);
  });

  it("rejects invalid businessId param", async () => {
    const ctx = makeBodyCtx({ outcomeStatus: "worked" });
    await expect(outcomesPost(ctx, { businessId: INVALID_ID })).rejects.toThrow();
  });

  it("rejects body missing required outcomeStatus", async () => {
    const ctx = makeBodyCtx({});
    await expect(outcomesPost(ctx, { businessId: BIZ_ID })).rejects.toThrow();
  });

  it("rejects invalid outcomeStatus value", async () => {
    const ctx = makeBodyCtx({ outcomeStatus: "unknown_status" });
    await expect(outcomesPost(ctx, { businessId: BIZ_ID })).rejects.toThrow();
  });

  it("delegates to recordOwnerActionOutcome with correct args", async () => {
    mocks.recordOwnerActionOutcome.mockResolvedValue({ id: "out-new" });
    const ctx = makeBodyCtx({ outcomeStatus: "worked", ownerReportedResult: "Revenue up 10%" });
    const res = await outcomesPost(ctx, { businessId: BIZ_ID });
    expect(mocks.recordOwnerActionOutcome).toHaveBeenCalledWith(
      WS,
      ACTOR,
      expect.objectContaining({ businessId: BIZ_ID, outcomeStatus: "worked" })
    );
    expect((res as { status: number }).status).toBe(201);
  });
});

// ─── Businesses — progress ────────────────────────────────────────────────────

describe("[progress] GET /api/owner/businesses/[businessId]/progress", () => {
  beforeEach(() => vi.clearAllMocks());

  it("requires OWNER_VIEW + workspace", () => {
    expectOwnerView(progressGet as never);
  });

  it("calls getOwnerBusinessProgress without review flag", async () => {
    mocks.getOwnerBusinessProgress.mockResolvedValue({ status: "ok" });
    const ctx = makeCtx(`https://x/api/owner/businesses/${BIZ_ID}/progress`);
    await progressGet(ctx, { businessId: BIZ_ID });
    expect(mocks.getOwnerBusinessProgress).toHaveBeenCalledWith(BIZ_ID, WS, expect.anything());
    expect(mocks.generateOwnerBusinessReview).not.toHaveBeenCalled();
  });

  it("calls generateOwnerBusinessReview when review=true", async () => {
    mocks.generateOwnerBusinessReview.mockResolvedValue({ status: "improving" });
    const ctx = makeCtx(`https://x/api/owner/businesses/${BIZ_ID}/progress?review=true`);
    await progressGet(ctx, { businessId: BIZ_ID });
    expect(mocks.generateOwnerBusinessReview).toHaveBeenCalledWith(
      BIZ_ID, WS, ACTOR, expect.any(String), expect.anything()
    );
    expect(mocks.getOwnerBusinessProgress).not.toHaveBeenCalled();
  });
});

// ─── Portfolio routes ─────────────────────────────────────────────────────────

const PORTFOLIO_STUB = {
  hasData: true,
  businessCount: 1,
  portfolioHealthScore: 75,
  ranking: [],
  businesses: [],
  riskAlerts: [],
  investmentRecommendation: null,
  top3Priorities: [],
  generatedAt: "2024-01-01T00:00:00Z",
};

describe("[portfolio-dashboard] GET /api/owner/portfolio/dashboard", () => {
  beforeEach(() => vi.clearAllMocks());

  it("requires OWNER_VIEW + workspace", () => {
    expectOwnerView(portfolioDashGet as never);
  });

  it("calls getPortfolio with verified workspaceId", async () => {
    mocks.getPortfolio.mockResolvedValue(PORTFOLIO_STUB);
    await portfolioDashGet(makeCtx());
    expect(mocks.getPortfolio).toHaveBeenCalledWith(WS);
  });
});

describe("[portfolio-ranking] GET /api/owner/portfolio/ranking", () => {
  beforeEach(() => vi.clearAllMocks());

  it("requires OWNER_VIEW + workspace", () => {
    expectOwnerView(portfolioRankGet as never);
  });

  it("returns ranking fields from portfolio service", async () => {
    mocks.getPortfolio.mockResolvedValue(PORTFOLIO_STUB);
    const res = await portfolioRankGet(makeCtx());
    expect(res).toHaveProperty("hasData");
    expect(res).toHaveProperty("ranking");
    expect(res).toHaveProperty("businesses");
  });
});

describe("[portfolio-risks] GET /api/owner/portfolio/risks", () => {
  beforeEach(() => vi.clearAllMocks());

  it("requires OWNER_VIEW + workspace", () => {
    expectOwnerView(portfolioRisksGet as never);
  });

  it("returns riskAlerts and investmentRecommendation", async () => {
    mocks.getPortfolio.mockResolvedValue(PORTFOLIO_STUB);
    const res = await portfolioRisksGet(makeCtx());
    expect(res).toHaveProperty("riskAlerts");
    expect(res).toHaveProperty("investmentRecommendation");
  });
});

describe("[portfolio-actions] GET /api/owner/portfolio/actions", () => {
  beforeEach(() => vi.clearAllMocks());

  it("requires OWNER_VIEW + workspace", () => {
    expectOwnerView(portfolioActionsGet as never);
  });

  it("returns top3Priorities and actionQueue", async () => {
    mocks.getPortfolio.mockResolvedValue({
      ...PORTFOLIO_STUB,
      top3Priorities: ["hire", "fix-margins"],
      businesses: [{ businessId: BIZ_ID, name: "Ace", recommendedNextAction: "reduce costs" }],
    });
    const res = await portfolioActionsGet(makeCtx()) as { top3Priorities: unknown; actionQueue: { businessId: string }[] };
    expect(res.top3Priorities).toEqual(["hire", "fix-margins"]);
    expect(res.actionQueue[0].businessId).toBe(BIZ_ID);
  });
});

// ─── Trust — audit trail ──────────────────────────────────────────────────────

describe("[trust-audit-trail] GET /api/owner/trust/audit-trail", () => {
  beforeEach(() => vi.clearAllMocks());

  it("requires OWNER_VIEW + workspace", () => {
    expectOwnerView(auditTrailGet as never);
  });

  it("rejects request with missing entityId param", async () => {
    const ctx = makeCtx("https://x/api/owner/trust/audit-trail");
    await expect(auditTrailGet(ctx)).rejects.toThrow();
  });

  it("rejects request with invalid UUID entityId", async () => {
    const ctx = makeCtx(`https://x/api/owner/trust/audit-trail?entityId=${INVALID_ID}`);
    await expect(auditTrailGet(ctx)).rejects.toThrow();
  });

  it("delegates to getEntityAuditTrail with entityId and workspaceId", async () => {
    mocks.getEntityAuditTrail.mockResolvedValue([]);
    const ctx = makeCtx(`https://x/api/owner/trust/audit-trail?entityId=${ENTITY_ID}`);
    await auditTrailGet(ctx);
    expect(mocks.getEntityAuditTrail).toHaveBeenCalledWith(ENTITY_ID, WS);
  });

  it("passes verified workspaceId, not a spoofed header", async () => {
    mocks.getEntityAuditTrail.mockResolvedValue([]);
    const ctx = makeCtx(`https://x/api/owner/trust/audit-trail?entityId=${ENTITY_ID}`, "ws-REAL");
    await auditTrailGet(ctx);
    expect(mocks.getEntityAuditTrail.mock.calls[0][1]).toBe("ws-REAL");
  });
});

// ─── Trust — cycles ───────────────────────────────────────────────────────────

describe("[trust-cycles] GET /api/owner/trust/cycles", () => {
  beforeEach(() => vi.clearAllMocks());

  it("requires OWNER_VIEW + workspace", () => {
    expectOwnerView(trustCyclesGet as never);
  });

  it("calls getBusinessTrustOverview with null businessId when not provided", async () => {
    mocks.getBusinessTrustOverview.mockResolvedValue({ businesses: [] });
    const ctx = makeCtx("https://x/api/owner/trust/cycles");
    await trustCyclesGet(ctx);
    expect(mocks.getBusinessTrustOverview).toHaveBeenCalledWith(WS, null);
  });

  it("passes businessId query param to service", async () => {
    mocks.getBusinessTrustOverview.mockResolvedValue({ businesses: [] });
    const ctx = makeCtx(`https://x/api/owner/trust/cycles?businessId=${BIZ_ID}`);
    await trustCyclesGet(ctx);
    expect(mocks.getBusinessTrustOverview).toHaveBeenCalledWith(WS, BIZ_ID);
  });
});

// ─── Trust — explanations ─────────────────────────────────────────────────────

describe("[trust-explanations] GET /api/owner/trust/explanations", () => {
  beforeEach(() => vi.clearAllMocks());

  it("requires OWNER_VIEW + workspace", () => {
    expectOwnerView(trustExplanationsGet as never);
  });

  it("rejects request with missing domain param", async () => {
    const ctx = makeCtx(`https://x/api/owner/trust/explanations?cycleId=${CYCLE_ID}`);
    await expect(trustExplanationsGet(ctx)).rejects.toThrow();
  });

  it("rejects request with invalid domain value", async () => {
    const ctx = makeCtx(`https://x/api/owner/trust/explanations?domain=invalid&cycleId=${CYCLE_ID}`);
    await expect(trustExplanationsGet(ctx)).rejects.toThrow();
  });

  it("rejects request with missing cycleId param", async () => {
    const ctx = makeCtx("https://x/api/owner/trust/explanations?domain=finance");
    await expect(trustExplanationsGet(ctx)).rejects.toThrow();
  });

  it("rejects request with invalid cycleId UUID", async () => {
    const ctx = makeCtx(`https://x/api/owner/trust/explanations?domain=finance&cycleId=${INVALID_ID}`);
    await expect(trustExplanationsGet(ctx)).rejects.toThrow();
  });

  it("delegates to getCycleExplanations with domain, cycleId, workspaceId", async () => {
    mocks.getCycleExplanations.mockResolvedValue({ findings: [] });
    const ctx = makeCtx(`https://x/api/owner/trust/explanations?domain=finance&cycleId=${CYCLE_ID}`);
    await trustExplanationsGet(ctx);
    expect(mocks.getCycleExplanations).toHaveBeenCalledWith("finance", CYCLE_ID, WS);
  });

  it("accepts all valid trust domains", async () => {
    mocks.getCycleExplanations.mockResolvedValue({});
    const domains = ["finance", "sales", "cashflow", "operations", "sop", "marketing", "strategy"];
    for (const d of domains) {
      const ctx = makeCtx(`https://x/api/owner/trust/explanations?domain=${d}&cycleId=${CYCLE_ID}`);
      await trustExplanationsGet(ctx);
    }
    expect(mocks.getCycleExplanations).toHaveBeenCalledTimes(7);
  });
});

// ─── Waste-leakage status ─────────────────────────────────────────────────────

describe("[leakage-status] PATCH /api/owner/waste-leakage/[eventId]/status", () => {
  beforeEach(() => vi.clearAllMocks());

  it("requires OWNER_MANAGE + workspace", () => {
    expectOwnerManage(leakageStatusPatch as never);
  });

  it("rejects invalid eventId UUID", async () => {
    const ctx = makeBodyCtx({ newStatus: "confirmed" });
    await expect(leakageStatusPatch(ctx, { eventId: INVALID_ID })).rejects.toThrow();
  });

  it("rejects body missing newStatus", async () => {
    const ctx = makeBodyCtx({});
    await expect(leakageStatusPatch(ctx, { eventId: EVENT_ID })).rejects.toThrow();
  });

  it("rejects invalid newStatus value", async () => {
    const ctx = makeBodyCtx({ newStatus: "opened" });
    await expect(leakageStatusPatch(ctx, { eventId: EVENT_ID })).rejects.toThrow();
  });

  it("delegates to updateLeakageStatus with correct args", async () => {
    mocks.updateLeakageStatus.mockResolvedValue(undefined);
    const ctx = makeBodyCtx({ newStatus: "confirmed" });
    const res = await leakageStatusPatch(ctx, { eventId: EVENT_ID }) as { status: number };
    expect(mocks.updateLeakageStatus).toHaveBeenCalledWith(
      EVENT_ID,
      expect.objectContaining({ workspaceId: WS, actorId: ACTOR, newStatus: "confirmed" })
    );
    expect(res.status).toBe(200);
  });
});

// ─── Tasks — create ───────────────────────────────────────────────────────────

describe("[tasks-post] POST /api/owner/tasks", () => {
  beforeEach(() => vi.clearAllMocks());

  it("requires OWNER_MANAGE + workspace", () => {
    expectOwnerManage(tasksPost as never);
  });

  it("rejects body missing required title", async () => {
    const ctx = makeBodyCtx({});
    await expect(tasksPost(ctx)).rejects.toThrow();
  });

  it("rejects title that is empty string", async () => {
    const ctx = makeBodyCtx({ title: "   " });
    await expect(tasksPost(ctx)).rejects.toThrow();
  });

  it("creates task with minimal valid body", async () => {
    mocks.assignDelegatedTask.mockResolvedValue({ taskId: "t1" });
    const ctx = makeBodyCtx({ title: "Send invoices" });
    const res = await tasksPost(ctx) as { status: number };
    expect(mocks.assignDelegatedTask).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: WS, actorId: ACTOR, title: "Send invoices" })
    );
    expect(res.status).toBe(201);
  });

  it("passes optional proofType through to service", async () => {
    mocks.assignDelegatedTask.mockResolvedValue({ taskId: "t2" });
    const ctx = makeBodyCtx({
      title: "Photograph store",
      requireProof: { proofType: "photo", riskLevel: "LOW" },
    });
    await tasksPost(ctx);
    expect(mocks.assignDelegatedTask).toHaveBeenCalledWith(
      expect.objectContaining({
        requireProof: expect.objectContaining({ proofType: "photo", riskLevel: "LOW" }),
      })
    );
  });
});

// ─── Tasks — complete ─────────────────────────────────────────────────────────

describe("[tasks-complete] POST /api/owner/tasks/complete", () => {
  beforeEach(() => vi.clearAllMocks());

  it("requires OWNER_MANAGE + workspace", () => {
    expectOwnerManage(tasksCompletePost as never);
  });

  it("rejects body with empty taskId", async () => {
    const ctx = makeBodyCtx({ taskId: "" });
    await expect(tasksCompletePost(ctx)).rejects.toThrow();
  });

  it("completes task and returns status 200", async () => {
    mocks.completeTask.mockResolvedValue("APPROVED_COMPLETE");
    const ctx = makeBodyCtx({ taskId: "task-abc" });
    const res = await tasksCompletePost(ctx) as { status: number; body: () => Promise<{ status: string }> };
    expect(res.status).toBe(200);
  });

  it("returns 409 with reason when TaskCompletionBlockedError thrown", async () => {
    mocks.completeTask.mockRejectedValue(new mocks.TaskCompletionBlockedError("proof_required"));
    const ctx = makeBodyCtx({ taskId: "task-blocked" });
    const res = await tasksCompletePost(ctx) as { status: number };
    expect(res.status).toBe(409);
  });

  it("returns 404 when TaskNotFoundError thrown", async () => {
    mocks.completeTask.mockRejectedValue(new mocks.TaskNotFoundError());
    const ctx = makeBodyCtx({ taskId: "task-missing" });
    const res = await tasksCompletePost(ctx) as { status: number };
    expect(res.status).toBe(404);
  });

  it("re-throws unknown errors (does not swallow them)", async () => {
    mocks.completeTask.mockRejectedValue(new Error("db exploded"));
    const ctx = makeBodyCtx({ taskId: "task-x" });
    await expect(tasksCompletePost(ctx)).rejects.toThrow("db exploded");
  });
});

// ─── Startup sessions ─────────────────────────────────────────────────────────

const MINIMAL_IDEA = { name: "Mobile Car Wash", industry: "Automotive", structural: {} };
const MINIMAL_SESSION_BODY = { intake: {}, ideas: [MINIMAL_IDEA] };

describe("[startup-sessions-get] GET /api/owner/startup/sessions", () => {
  beforeEach(() => vi.clearAllMocks());

  it("requires OWNER_VIEW + workspace", () => {
    expectOwnerView(startupSessionsGet as never);
  });

  it("delegates to listStartupSessions with workspaceId", async () => {
    mocks.listStartupSessions.mockResolvedValue([]);
    await startupSessionsGet(makeCtx());
    expect(mocks.listStartupSessions).toHaveBeenCalledWith(WS);
  });

  it("passes verified workspaceId not a spoofed value", async () => {
    mocks.listStartupSessions.mockResolvedValue([]);
    await startupSessionsGet({ ...makeCtx(), verifiedWorkspaceId: "ws-REAL" });
    expect(mocks.listStartupSessions.mock.calls[0][0]).toBe("ws-REAL");
  });
});

describe("[startup-sessions-post] POST /api/owner/startup/sessions", () => {
  beforeEach(() => vi.clearAllMocks());

  it("requires OWNER_MANAGE + workspace", () => {
    expectOwnerManage(startupSessionsPost as never);
  });

  it("rejects body with empty ideas array", async () => {
    const ctx = makeBodyCtx({ intake: {}, ideas: [] });
    await expect(startupSessionsPost(ctx)).rejects.toThrow();
  });

  it("rejects idea missing required name", async () => {
    const ctx = makeBodyCtx({ intake: {}, ideas: [{ industry: "Tech", structural: {} }] });
    await expect(startupSessionsPost(ctx)).rejects.toThrow();
  });

  it("creates session with minimal valid body", async () => {
    mocks.createStartupSession.mockResolvedValue("sess-id-1");
    const ctx = makeBodyCtx(MINIMAL_SESSION_BODY);
    const res = await startupSessionsPost(ctx) as { status: number };
    expect(mocks.createStartupSession).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: WS, actorId: ACTOR, intake: {}, ideas: MINIMAL_SESSION_BODY.ideas }),
      { isFixtureBusiness: false }
    );
    expect(res.status).toBe(201);
  });

  it("passes optional sessionLabel to service", async () => {
    mocks.createStartupSession.mockResolvedValue("sess-id-2");
    const ctx = makeBodyCtx({ ...MINIMAL_SESSION_BODY, sessionLabel: "Q1 Ideas" });
    await startupSessionsPost(ctx);
    expect(mocks.createStartupSession).toHaveBeenCalledWith(
      expect.objectContaining({ sessionLabel: "Q1 Ideas" }),
      { isFixtureBusiness: false }
    );
  });

  it("ORDINARY_CALLER_CANNOT_CREATE_FIXTURE: a caller without SYSTEM_ADMIN gets isFixtureBusiness=false even when the body requests true", async () => {
    mocks.createStartupSession.mockResolvedValue("sess-id-3");
    // No verifiedCapabilities set on this ctx -- the same as every real non-admin owner caller.
    const ctx = makeBodyCtx({ ...MINIMAL_SESSION_BODY, isFixtureBusiness: true });
    await startupSessionsPost(ctx);
    expect(mocks.createStartupSession).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: WS, actorId: ACTOR }),
      { isFixtureBusiness: false }
    );
  });

  it("SYSTEM_ADMIN_CAN_CREATE_FIXTURE: a SYSTEM_ADMIN-capable caller requesting isFixtureBusiness=true is honored", async () => {
    mocks.createStartupSession.mockResolvedValue("sess-id-4");
    const ctx = {
      ...makeBodyCtx({ ...MINIMAL_SESSION_BODY, isFixtureBusiness: true }),
      verifiedCapabilities: new Set([CAPABILITIES.SYSTEM_ADMIN]),
    };
    await startupSessionsPost(ctx);
    expect(mocks.createStartupSession).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: WS, actorId: ACTOR }),
      { isFixtureBusiness: true }
    );
  });

  it("SYSTEM_ADMIN capability alone does not imply isFixtureBusiness -- the body must still ask for it", async () => {
    mocks.createStartupSession.mockResolvedValue("sess-id-5");
    const ctx = {
      ...makeBodyCtx(MINIMAL_SESSION_BODY),
      verifiedCapabilities: new Set([CAPABILITIES.SYSTEM_ADMIN]),
    };
    await startupSessionsPost(ctx);
    expect(mocks.createStartupSession).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: WS, actorId: ACTOR }),
      { isFixtureBusiness: false }
    );
  });
});

// ─── Gates opt-out ────────────────────────────────────────────────────────────

describe("[gates-opt-out-post] POST /api/owner/gates/opt-out", () => {
  beforeEach(() => vi.clearAllMocks());

  it("requires OWNER_MANAGE + workspace", () => {
    expectOwnerManage(gatesOptOutPost as never);
  });

  it("rejects body missing reason", async () => {
    const ctx = makeBodyCtx({ riskClass: "low" });
    await expect(gatesOptOutPost(ctx)).rejects.toThrow();
  });

  it("rejects empty reason string", async () => {
    const ctx = makeBodyCtx({ reason: "   ", riskClass: "medium" });
    await expect(gatesOptOutPost(ctx)).rejects.toThrow();
  });

  it("rejects invalid riskClass value", async () => {
    const ctx = makeBodyCtx({ reason: "Owner decision", riskClass: "extreme" });
    await expect(gatesOptOutPost(ctx)).rejects.toThrow();
  });

  it("accepts all valid risk class values", async () => {
    mocks.recordGateOptOut.mockResolvedValue(undefined);
    for (const riskClass of ["low", "medium", "high", "critical"]) {
      const ctx = makeBodyCtx({ reason: "Approved by owner", riskClass });
      const res = await gatesOptOutPost(ctx) as { status: number };
      expect(res.status).toBe(201);
    }
    expect(mocks.recordGateOptOut).toHaveBeenCalledTimes(4);
  });

  it("passes verified workspaceId and actorId to service", async () => {
    mocks.recordGateOptOut.mockResolvedValue(undefined);
    const ctx = makeBodyCtx({ reason: "Owner decision", riskClass: "high" });
    await gatesOptOutPost(ctx);
    expect(mocks.recordGateOptOut).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: WS, actorId: ACTOR, actorIsOwner: true })
    );
  });
});

describe("[gates-opt-out-delete] DELETE /api/owner/gates/opt-out", () => {
  beforeEach(() => vi.clearAllMocks());

  it("requires OWNER_MANAGE + workspace", () => {
    expectOwnerManage(gatesOptOutDelete as never);
  });

  it("clears gate opt-out and returns ok", async () => {
    mocks.clearGateOptOut.mockResolvedValue(undefined);
    const res = await gatesOptOutDelete(makeCtx()) as { status: number };
    expect(mocks.clearGateOptOut).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: WS, actorId: ACTOR, actorIsOwner: true })
    );
    expect(res.status).toBe(200);
  });
});

// ─── Local-mode status ────────────────────────────────────────────────────────

describe("[local-mode-status] GET /api/owner/local-mode/status", () => {
  beforeEach(() => vi.clearAllMocks());

  it("requires OWNER_VIEW + workspace", () => {
    expectOwnerView(localModeGet as never);
  });

  it("returns workspaceId from verified context", async () => {
    const res = await localModeGet(makeCtx()) as { workspaceId: string };
    expect(res.workspaceId).toBe(WS);
  });

  it("returns storageProvider and schedulerProvider fields", async () => {
    const res = await localModeGet(makeCtx()) as Record<string, unknown>;
    expect(res).toHaveProperty("storageProvider");
    expect(res).toHaveProperty("schedulerProvider");
    expect(res).toHaveProperty("localModeActive");
    expect(res).toHaveProperty("capabilities");
  });

  it("localModeActive is true only when both storage and scheduler are local/in-memory", async () => {
    const savedStorage = process.env.STORAGE_PROVIDER;
    const savedScheduler = process.env.SCHEDULER_PROVIDER;
    process.env.STORAGE_PROVIDER = "local";
    process.env.SCHEDULER_PROVIDER = "in-memory";
    const res = await localModeGet(makeCtx()) as { localModeActive: boolean };
    expect(res.localModeActive).toBe(true);
    process.env.STORAGE_PROVIDER = savedStorage ?? "";
    process.env.SCHEDULER_PROVIDER = savedScheduler ?? "";
  });
});

// ─── Vendor — list/create ─────────────────────────────────────────────────────

describe("[vendor-get] GET /api/owner/vendor", () => {
  beforeEach(() => vi.clearAllMocks());

  it("requires OWNER_VIEW + workspace", () => {
    expectOwnerView(vendorGet as never);
  });

  it("returns 400 when businessId query param is missing", async () => {
    const ctx = makeCtx("https://x/api/owner/vendor");
    const res = await vendorGet(ctx) as { status: number };
    expect(res.status).toBe(400);
  });

  it("delegates to getVendors with workspaceId and businessId", async () => {
    mocks.getVendors.mockResolvedValue([]);
    const ctx = makeCtx(`https://x/api/owner/vendor?businessId=${BIZ_ID}`);
    await vendorGet(ctx);
    expect(mocks.getVendors).toHaveBeenCalledWith(WS, BIZ_ID);
  });

  it("passes verified workspaceId, not a header value", async () => {
    mocks.getVendors.mockResolvedValue([]);
    const ctx = { ...makeCtx(`https://x/api/owner/vendor?businessId=${BIZ_ID}`), verifiedWorkspaceId: "ws-SAFE" };
    await vendorGet(ctx);
    expect(mocks.getVendors.mock.calls[0][0]).toBe("ws-SAFE");
  });
});

describe("[vendor-post] POST /api/owner/vendor", () => {
  beforeEach(() => vi.clearAllMocks());

  it("requires OWNER_MANAGE + workspace", () => {
    expectOwnerManage(vendorPost as never);
  });

  it("rejects body missing required businessId", async () => {
    const ctx = makeBodyCtx({ name: "Ace Supplies" });
    await expect(vendorPost(ctx)).rejects.toThrow();
  });

  it("rejects body missing required name", async () => {
    const ctx = makeBodyCtx({ businessId: BIZ_ID });
    await expect(vendorPost(ctx)).rejects.toThrow();
  });

  it("creates vendor with valid body and returns 201", async () => {
    mocks.createVendor.mockResolvedValue({ id: VND_ID, name: "Ace Supplies" });
    const ctx = makeBodyCtx({ businessId: BIZ_ID, name: "Ace Supplies" });
    const res = await vendorPost(ctx) as { status: number };
    expect(mocks.createVendor).toHaveBeenCalledWith(
      BIZ_ID,
      expect.objectContaining({ name: "Ace Supplies" }),
      ACTOR,
      WS
    );
    expect(res.status).toBe(201);
  });
});

// ─── Vendor — approve ─────────────────────────────────────────────────────────

describe("[vendor-approve] POST /api/owner/vendor/[vendorId]/approve", () => {
  beforeEach(() => vi.clearAllMocks());

  it("requires OWNER_MANAGE + workspace", () => {
    expectOwnerManage(vendorApprovePost as never);
  });

  it("rejects invalid vendorId UUID", async () => {
    await expect(vendorApprovePost(makeCtx(), { vendorId: INVALID_ID })).rejects.toThrow();
  });

  it("delegates to approveVendor with workspaceId, vendorId, actorId", async () => {
    mocks.approveVendor.mockResolvedValue({ id: VND_ID, approved: true });
    const res = await vendorApprovePost(makeCtx(), { vendorId: VND_ID }) as { status: number };
    expect(mocks.approveVendor).toHaveBeenCalledWith(WS, VND_ID, ACTOR);
    expect(res.status).toBe(200);
  });
});

// ─── Vendor — contracts ───────────────────────────────────────────────────────

describe("[vendor-contracts-get] GET /api/owner/vendor/[vendorId]/contracts", () => {
  beforeEach(() => vi.clearAllMocks());

  it("requires OWNER_VIEW + workspace", () => {
    expectOwnerView(vendorContractsGet as never);
  });

  it("rejects invalid vendorId UUID", async () => {
    await expect(vendorContractsGet(makeCtx(), { vendorId: INVALID_ID })).rejects.toThrow();
  });

  it("delegates to listVendorContracts with workspaceId and vendorId", async () => {
    mocks.listVendorContracts.mockResolvedValue([]);
    await vendorContractsGet(makeCtx(), { vendorId: VND_ID });
    expect(mocks.listVendorContracts).toHaveBeenCalledWith(WS, VND_ID);
  });
});

describe("[vendor-contracts-post] POST /api/owner/vendor/[vendorId]/contracts", () => {
  beforeEach(() => vi.clearAllMocks());

  it("requires OWNER_MANAGE + workspace", () => {
    expectOwnerManage(vendorContractsPost as never);
  });

  it("rejects invalid vendorId UUID", async () => {
    const ctx = makeBodyCtx({ businessId: BIZ_ID, startDate: "2024-01-01" });
    await expect(vendorContractsPost(ctx, { vendorId: INVALID_ID })).rejects.toThrow();
  });

  it("rejects body missing required businessId", async () => {
    const ctx = makeBodyCtx({ startDate: "2024-01-01" });
    await expect(vendorContractsPost(ctx, { vendorId: VND_ID })).rejects.toThrow();
  });

  it("records contract with valid body and returns 201", async () => {
    mocks.recordVendorContract.mockResolvedValue({ id: "c1" });
    const ctx = makeBodyCtx({ businessId: BIZ_ID, startDate: "2024-01-01" });
    const res = await vendorContractsPost(ctx, { vendorId: VND_ID }) as { status: number };
    expect(mocks.recordVendorContract).toHaveBeenCalledWith(
      WS, ACTOR,
      expect.objectContaining({ vendorId: VND_ID, businessId: BIZ_ID })
    );
    expect(res.status).toBe(201);
  });
});

// ─── Vendor — deliveries ──────────────────────────────────────────────────────

describe("[vendor-deliveries] POST /api/owner/vendor/[vendorId]/deliveries", () => {
  beforeEach(() => vi.clearAllMocks());

  it("requires OWNER_MANAGE + workspace", () => {
    expectOwnerManage(vendorDeliveriesPost as never);
  });

  it("rejects invalid vendorId UUID", async () => {
    const ctx = makeBodyCtx({ businessId: BIZ_ID, expectedDate: "2024-06-01" });
    await expect(vendorDeliveriesPost(ctx, { vendorId: INVALID_ID })).rejects.toThrow();
  });

  it("rejects body missing required businessId", async () => {
    const ctx = makeBodyCtx({ expectedDate: "2024-06-01" });
    await expect(vendorDeliveriesPost(ctx, { vendorId: VND_ID })).rejects.toThrow();
  });

  it("records delivery and returns 201", async () => {
    mocks.recordVendorDelivery.mockResolvedValue({ id: "del-1" });
    const ctx = makeBodyCtx({ businessId: BIZ_ID, expectedDate: "2024-06-01" });
    const res = await vendorDeliveriesPost(ctx, { vendorId: VND_ID }) as { status: number };
    expect(mocks.recordVendorDelivery).toHaveBeenCalledWith(
      WS, ACTOR,
      expect.objectContaining({ vendorId: VND_ID, businessId: BIZ_ID })
    );
    expect(res.status).toBe(201);
  });
});

// ─── Vendor — performance ─────────────────────────────────────────────────────

describe("[vendor-performance] GET /api/owner/vendor/[vendorId]/performance", () => {
  beforeEach(() => vi.clearAllMocks());

  it("requires OWNER_VIEW + workspace", () => {
    expectOwnerView(vendorPerfGet as never);
  });

  it("rejects invalid vendorId UUID", async () => {
    await expect(vendorPerfGet(makeCtx(), { vendorId: INVALID_ID })).rejects.toThrow();
  });

  it("delegates to getVendorPerformanceSummary with workspaceId and vendorId", async () => {
    mocks.getVendorPerformanceSummary.mockResolvedValue({ totalDeliveries: 0 });
    await vendorPerfGet(makeCtx(), { vendorId: VND_ID });
    expect(mocks.getVendorPerformanceSummary).toHaveBeenCalledWith(WS, VND_ID);
  });
});

// ─── Vendor — suspend ─────────────────────────────────────────────────────────

describe("[vendor-suspend] POST /api/owner/vendor/[vendorId]/suspend", () => {
  beforeEach(() => vi.clearAllMocks());

  it("requires OWNER_MANAGE + workspace", () => {
    expectOwnerManage(vendorSuspendPost as never);
  });

  it("rejects invalid vendorId UUID", async () => {
    const ctx = makeBodyCtx({ reason: "Non-compliant" });
    await expect(vendorSuspendPost(ctx, { vendorId: INVALID_ID })).rejects.toThrow();
  });

  it("rejects body missing reason", async () => {
    const ctx = makeBodyCtx({});
    await expect(vendorSuspendPost(ctx, { vendorId: VND_ID })).rejects.toThrow();
  });

  it("rejects empty reason string", async () => {
    const ctx = makeBodyCtx({ reason: "" });
    await expect(vendorSuspendPost(ctx, { vendorId: VND_ID })).rejects.toThrow();
  });

  it("suspends vendor and returns 200", async () => {
    mocks.suspendVendor.mockResolvedValue({ id: VND_ID, suspended: true });
    const ctx = makeBodyCtx({ reason: "Repeated delivery failures" });
    const res = await vendorSuspendPost(ctx, { vendorId: VND_ID }) as { status: number };
    expect(mocks.suspendVendor).toHaveBeenCalledWith(WS, VND_ID, ACTOR, "Repeated delivery failures");
    expect(res.status).toBe(200);
  });
});
