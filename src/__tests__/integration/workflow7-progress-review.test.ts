/**
 * Workflow 7 Integration: Owner Progress Tracking + Business Review (decoupled from engagementId)
 *
 * Proves that:
 * 1. `getOwnerBusinessProgress` aggregates action counts across all 5 domain spines.
 * 2. `completionRate` is computed correctly from completed / total.
 * 3. Progress summary is "on_track" when ≥50% complete and no blockers.
 * 4. Progress summary is "blocked" when overdue or blocked actions exist.
 * 5. Progress summary is "no_actions" when all domains have zero actions.
 * 6. `generateOwnerBusinessReview` produces status = "improving" when rate ≥50% and no blockers.
 * 7. `generateOwnerBusinessReview` produces status = "stagnant" when rate < 50%.
 * 8. `generateOwnerBusinessReview` produces status = "worsening" when a cycle shows critical/failing.
 * 9. `generateOwnerBusinessReview` produces status = "insufficient_data" when no cycles exist.
 * 10. Audit event is emitted for every review (governance invariant).
 * 11. Workspace isolation: workspaceId from the call site always flows through to the result.
 * 12. Both functions accept a DB interface (injectable mock — no real DB needed).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getOwnerBusinessProgress,
  generateOwnerBusinessReview,
  type OwnerProgressDb,
} from "@/services/owner-mode/owner-progress.service";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockEmitAuditEvent = vi.fn().mockResolvedValue("audit-ok");

vi.mock("@/infra/audit", () => ({ emitAuditEvent: (...args: unknown[]) => mockEmitAuditEvent(...args) }));

const REVIEWED_AT = "2024-01-15T10:00:00.000Z";

// ── DB builder ───────────────────────────────────────────────────────────────

type StatusMap = { open?: number; in_progress?: number; completed?: number; blocked?: number; overdue?: number };

function makeTable(counts: StatusMap) {
  return {
    count: vi.fn().mockImplementation(({ where }: { where: Record<string, unknown> }) => {
      const status = where.status as string | undefined;
      if (status === "open") return Promise.resolve(counts.open ?? 0);
      if (status === "in_progress") return Promise.resolve(counts.in_progress ?? 0);
      if (status === "completed") return Promise.resolve(counts.completed ?? 0);
      if (status === "blocked") return Promise.resolve(counts.blocked ?? 0);
      if (status === "overdue") return Promise.resolve(counts.overdue ?? 0);
      return Promise.resolve(0);
    }),
  };
}

function makeCycleTable(status: string | null) {
  return {
    findFirst: vi.fn().mockResolvedValue(status ? { status } : null),
  };
}

function makeDb(
  domainCounts: {
    finance?: StatusMap;
    sales?: StatusMap;
    operations?: StatusMap;
    sop?: StatusMap;
    strategy?: StatusMap;
  } = {},
  cycleSummaries: {
    finance?: string | null;
    sales?: string | null;
    operations?: string | null;
    sop?: string | null;
    strategy?: string | null;
  } = {},
): OwnerProgressDb {
  return {
    ownerFinanceAction: makeTable(domainCounts.finance ?? {}),
    ownerSalesAction: makeTable(domainCounts.sales ?? {}),
    ownerOperationsAction: makeTable(domainCounts.operations ?? {}),
    ownerSopAction: makeTable(domainCounts.sop ?? {}),
    ownerStrategyAction: makeTable(domainCounts.strategy ?? {}),
    ownerFinanceCycle: makeCycleTable(cycleSummaries.finance ?? null),
    ownerSalesCycle: makeCycleTable(cycleSummaries.sales ?? null),
    ownerOperationsCycle: makeCycleTable(cycleSummaries.operations ?? null),
    ownerSopCycle: makeCycleTable(cycleSummaries.sop ?? null),
    ownerStrategyCycle: makeCycleTable(cycleSummaries.strategy ?? null),
  };
}

// ---------------------------------------------------------------------------
// getOwnerBusinessProgress tests
// ---------------------------------------------------------------------------

describe("Workflow 7 — getOwnerBusinessProgress (pure aggregation)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns zero totals when all domain tables are empty", async () => {
    const db = makeDb();
    const result = await getOwnerBusinessProgress("biz-1", "ws-1", db);
    expect(result.totals.total).toBe(0);
    expect(result.totals.completed).toBe(0);
    expect(result.summary).toBe("no_actions");
    expect(result.completionRate).toBe(0);
  });

  it("aggregates action counts across all 5 domain spines", async () => {
    const db = makeDb({
      finance:    { open: 2, completed: 3 },
      sales:      { in_progress: 1, completed: 2 },
      operations: { blocked: 1 },
      sop:        { overdue: 1 },
      strategy:   { open: 1, completed: 1 },
    });
    const result = await getOwnerBusinessProgress("biz-1", "ws-1", db);
    expect(result.totals.open).toBe(3);       // 2 + 0 + 0 + 0 + 1
    expect(result.totals.inProgress).toBe(1); // 0 + 1 + 0 + 0 + 0
    expect(result.totals.completed).toBe(6);  // 3 + 2 + 0 + 0 + 1
    expect(result.totals.blocked).toBe(1);    // 0 + 0 + 1 + 0 + 0
    expect(result.totals.overdue).toBe(1);    // 0 + 0 + 0 + 1 + 0
    expect(result.totals.total).toBe(12);
  });

  it("completionRate is completed / total", async () => {
    const db = makeDb({ finance: { completed: 4, open: 1 } });
    const result = await getOwnerBusinessProgress("biz-1", "ws-1", db);
    expect(result.completionRate).toBeCloseTo(4 / 5);
  });

  it("summary is 'on_track' when ≥50% complete and no blocked/overdue", async () => {
    const db = makeDb({ finance: { completed: 3, open: 1 } });
    const result = await getOwnerBusinessProgress("biz-1", "ws-1", db);
    expect(result.summary).toBe("on_track");
  });

  it("summary is 'at_risk' when <50% complete and no blocked/overdue", async () => {
    const db = makeDb({ finance: { completed: 1, open: 3 } });
    const result = await getOwnerBusinessProgress("biz-1", "ws-1", db);
    expect(result.summary).toBe("at_risk");
  });

  it("summary is 'blocked' when any blocked actions exist", async () => {
    const db = makeDb({ finance: { completed: 5, blocked: 1 } });
    const result = await getOwnerBusinessProgress("biz-1", "ws-1", db);
    expect(result.summary).toBe("blocked");
  });

  it("summary is 'blocked' when any overdue actions exist", async () => {
    const db = makeDb({ finance: { completed: 5, overdue: 1 } });
    const result = await getOwnerBusinessProgress("biz-1", "ws-1", db);
    expect(result.summary).toBe("blocked");
  });

  it("by-domain breakdown is correct", async () => {
    const db = makeDb({
      finance: { open: 1, completed: 2 },
      sales:   { in_progress: 3 },
    });
    const result = await getOwnerBusinessProgress("biz-1", "ws-1", db);
    expect(result.byDomain.finance.open).toBe(1);
    expect(result.byDomain.finance.completed).toBe(2);
    expect(result.byDomain.sales.inProgress).toBe(3);
    expect(result.byDomain.operations.total).toBe(0);
  });

  it("workspace isolation: workspaceId and businessId flow through to the result", async () => {
    const db = makeDb();
    const result = await getOwnerBusinessProgress("biz-tenant-X", "ws-tenant-X", db);
    expect(result.workspaceId).toBe("ws-tenant-X");
    expect(result.businessId).toBe("biz-tenant-X");
  });
});

// ---------------------------------------------------------------------------
// generateOwnerBusinessReview tests
// ---------------------------------------------------------------------------

describe("Workflow 7 — generateOwnerBusinessReview (decoupled from engagementId)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("status = 'insufficient_data' when no cycle records exist", async () => {
    const db = makeDb();
    const result = await generateOwnerBusinessReview("biz-1", "ws-1", "actor-1", REVIEWED_AT, db);
    expect(result.status).toBe("insufficient_data");
    expect(result.domainCycleStatuses).toEqual({
      finance: null, sales: null, operations: null, sop: null, strategy: null,
    });
  });

  it("status = 'improving' when ≥50% complete and no cycles show critical/failing", async () => {
    const db = makeDb(
      { finance: { completed: 4, open: 1 } },
      { finance: "stable", sales: "stable" },
    );
    const result = await generateOwnerBusinessReview("biz-1", "ws-1", "actor-1", REVIEWED_AT, db);
    expect(result.status).toBe("improving");
  });

  it("status = 'stagnant' when <50% complete and no critical cycles", async () => {
    const db = makeDb(
      { finance: { completed: 1, open: 4 } },
      { finance: "stable" },
    );
    const result = await generateOwnerBusinessReview("biz-1", "ws-1", "actor-1", REVIEWED_AT, db);
    expect(result.status).toBe("stagnant");
  });

  it("status = 'worsening' when any cycle status contains 'critical'", async () => {
    const db = makeDb(
      { finance: { completed: 5 } },
      { finance: "stable", operations: "critical_issue_detected" },
    );
    const result = await generateOwnerBusinessReview("biz-1", "ws-1", "actor-1", REVIEWED_AT, db);
    expect(result.status).toBe("worsening");
  });

  it("status = 'worsening' when any cycle status contains 'failing'", async () => {
    const db = makeDb(
      { finance: { completed: 5 } },
      { sales: "failing_margin" },
    );
    const result = await generateOwnerBusinessReview("biz-1", "ws-1", "actor-1", REVIEWED_AT, db);
    expect(result.status).toBe("worsening");
  });

  it("GOVERNANCE: audit event is ALWAYS emitted on review generation", async () => {
    const db = makeDb();
    await generateOwnerBusinessReview("biz-1", "ws-1", "actor-1", REVIEWED_AT, db);
    expect(mockEmitAuditEvent).toHaveBeenCalledOnce();
    expect(mockEmitAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: "owner.business_review_generated",
        workspaceId: "ws-1",
        actorId: "actor-1",
      }),
    );
  });

  it("audit event payload includes reviewedAt and status", async () => {
    const db = makeDb();
    await generateOwnerBusinessReview("biz-1", "ws-1", "actor-1", REVIEWED_AT, db);
    const [call] = mockEmitAuditEvent.mock.calls;
    expect(call[0].payload.reviewedAt).toBe(REVIEWED_AT);
    expect(call[0].payload.status).toBeDefined();
  });

  it("result includes progress sub-object with correct workspace isolation", async () => {
    const db = makeDb({ finance: { completed: 2, open: 1 } }, { finance: "stable" });
    const result = await generateOwnerBusinessReview("biz-tenant-A", "ws-tenant-A", "actor-1", REVIEWED_AT, db);
    expect(result.workspaceId).toBe("ws-tenant-A");
    expect(result.businessId).toBe("biz-tenant-A");
    expect(result.progress.workspaceId).toBe("ws-tenant-A");
    expect(result.progress.businessId).toBe("biz-tenant-A");
  });

  it("reviewedAt is forwarded into the result unchanged", async () => {
    const db = makeDb();
    const result = await generateOwnerBusinessReview("biz-1", "ws-1", "actor-1", "2024-06-15T08:00:00.000Z", db);
    expect(result.reviewedAt).toBe("2024-06-15T08:00:00.000Z");
  });

  it("rationale is a non-empty string", async () => {
    const db = makeDb({ finance: { completed: 2, open: 1 } }, { finance: "stable" });
    const result = await generateOwnerBusinessReview("biz-1", "ws-1", "actor-1", REVIEWED_AT, db);
    expect(typeof result.rationale).toBe("string");
    expect(result.rationale.length).toBeGreaterThan(0);
  });
});
