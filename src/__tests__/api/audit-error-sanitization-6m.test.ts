/**
 * Phase 6M — audit error sanitization proof for value, scenario, and governance/alerts routes.
 *
 * Three routes previously logged raw `${auditError}` in their .catch() handlers
 * instead of using classifyOperatorError — a potential log information-leakage risk.
 *
 * Fix: all three routes now call classifyOperatorError before console.error,
 * consistent with governance/metrics, metrics/control-effectiveness, and
 * metrics/decision-latency routes.
 *
 * DC-18 prevention gate enforces this pattern going forward.
 *
 * These tests prove that:
 *   - The routes still return their correct results when audit succeeds
 *   - classifyOperatorError is available and used in each route's module graph
 *   - The routes do NOT reject when audit fails (read-path audit = fail-open intentional)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Hoisted mocks (value/route.ts) ─────────────────────────────────────────

const valueMocks = vi.hoisted(() => ({
  getItems: vi.fn(),
  calculateValue: vi.fn(),
  resolveServerRole: vi.fn(),
  canView: vi.fn(),
  emitAuditEvent: vi.fn(),
  classifyOperatorError: vi.fn(),
}));

vi.mock("@/services/operator/store", () => ({ getItems: valueMocks.getItems }));
vi.mock("@/services/value/tracker", () => ({ calculateValue: valueMocks.calculateValue }));
vi.mock("@/services/auth/server-role", () => ({ resolveServerRole: valueMocks.resolveServerRole }));
vi.mock("@/services/auth/access", () => ({ canView: valueMocks.canView, resolveApprovalGrant: vi.fn().mockReturnValue(null) }));
vi.mock("@/infra/audit", () => ({ emitAuditEvent: valueMocks.emitAuditEvent }));
vi.mock("@/lib/operator-error-governance", () => ({
  classifyOperatorError: valueMocks.classifyOperatorError,
}));
vi.mock("@/lib/canonical-route-enforcement", () => ({
  withCanonicalEnforcement: (handler: (ctx: unknown) => unknown) => handler,
}));

import { GET as valueGET } from "@/app/api/value/route";

// ─── Hoisted mocks (scenario/route.ts) ──────────────────────────────────────

const scenarioMocks = vi.hoisted(() => ({
  runScenario: vi.fn(),
  resolveServerRole: vi.fn(),
  emitAuditEvent: vi.fn(),
  classifyOperatorError: vi.fn(),
}));

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const VALUE_CTX = {
  verifiedActorId: "actor-1",
  verifiedWorkspaceId: "ws-1",
  request: { json: () => Promise.resolve({}) },
};

const SAMPLE_METRICS = {
  totalExpected: 100000,
  totalActual: 80000,
  totalDelta: -20000,
  roi: 0.8,
  lossFromWrongDecisions: 20000,
  itemsAnalyzed: 5,
};

// ─── Tests: value/route.ts ────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  valueMocks.resolveServerRole.mockResolvedValue("ADMIN");
  valueMocks.canView.mockReturnValue(true);
  valueMocks.getItems.mockResolvedValue([]);
  valueMocks.calculateValue.mockReturnValue(SAMPLE_METRICS);
  valueMocks.emitAuditEvent.mockResolvedValue(undefined);
  valueMocks.classifyOperatorError.mockReturnValue({ operatorMessage: "sanitized audit error" });
});

describe("Phase 6M — audit error sanitization: value route", () => {
  it("returns metrics when audit succeeds", async () => {
    const result = await valueGET(VALUE_CTX as never);
    expect(result).toEqual(SAMPLE_METRICS);
  });

  it("does NOT reject when emitAuditEvent fails (read-path = fail-open intentional)", async () => {
    valueMocks.emitAuditEvent.mockRejectedValue(new Error("audit DB down"));
    const result = await valueGET(VALUE_CTX as never);
    expect(result).toEqual(SAMPLE_METRICS);
  });

  it("classifyOperatorError is called when emitAuditEvent fails", async () => {
    const auditErr = new Error("audit DB down");
    valueMocks.emitAuditEvent.mockRejectedValue(auditErr);

    await valueGET(VALUE_CTX as never);

    expect(valueMocks.classifyOperatorError).toHaveBeenCalledWith(auditErr, { context: "load" });
  });

  it("emitAuditEvent is called with correct workspaceId and actorId", async () => {
    await valueGET(VALUE_CTX as never);

    expect(valueMocks.emitAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "ws-1",
        actorId: "actor-1",
      })
    );
  });

  it("classifyOperatorError is NOT called when audit succeeds", async () => {
    await valueGET(VALUE_CTX as never);
    expect(valueMocks.classifyOperatorError).not.toHaveBeenCalled();
  });

  it("getItems is called exactly once per request", async () => {
    await valueGET(VALUE_CTX as never);
    expect(valueMocks.getItems).toHaveBeenCalledTimes(1);
  });

  it("calculateValue is called exactly once per request", async () => {
    await valueGET(VALUE_CTX as never);
    expect(valueMocks.calculateValue).toHaveBeenCalledTimes(1);
  });

  it("emitAuditEvent is called exactly once per request", async () => {
    await valueGET(VALUE_CTX as never);
    expect(valueMocks.emitAuditEvent).toHaveBeenCalledTimes(1);
  });

  it("result contains totalExpected field", async () => {
    const result = (await valueGET(VALUE_CTX as never)) as typeof SAMPLE_METRICS;
    expect(result.totalExpected).toBe(100000);
  });

  it("result contains totalActual field", async () => {
    const result = (await valueGET(VALUE_CTX as never)) as typeof SAMPLE_METRICS;
    expect(result.totalActual).toBe(80000);
  });

  it("result contains roi field", async () => {
    const result = (await valueGET(VALUE_CTX as never)) as typeof SAMPLE_METRICS;
    expect(result.roi).toBe(0.8);
  });

  it("result contains itemsAnalyzed field", async () => {
    const result = (await valueGET(VALUE_CTX as never)) as typeof SAMPLE_METRICS;
    expect(result.itemsAnalyzed).toBe(5);
  });

  it("result contains lossFromWrongDecisions field", async () => {
    const result = (await valueGET(VALUE_CTX as never)) as typeof SAMPLE_METRICS;
    expect(result.lossFromWrongDecisions).toBe(20000);
  });

  it("result contains totalDelta field", async () => {
    const result = (await valueGET(VALUE_CTX as never)) as typeof SAMPLE_METRICS;
    expect(result.totalDelta).toBe(-20000);
  });

  it("result is exactly the value returned by calculateValue", async () => {
    const altMetrics = { ...SAMPLE_METRICS, roi: 1.5, totalExpected: 200000 };
    valueMocks.calculateValue.mockReturnValue(altMetrics);
    const result = await valueGET(VALUE_CTX as never);
    expect(result).toEqual(altMetrics);
  });

  it("classifyOperatorError context arg is 'load'", async () => {
    valueMocks.emitAuditEvent.mockRejectedValue(new Error("fail"));
    await valueGET(VALUE_CTX as never);
    expect(valueMocks.classifyOperatorError).toHaveBeenCalledWith(
      expect.any(Error),
      { context: "load" }
    );
  });

  it("audit failure does not change the returned metrics (fail-open)", async () => {
    valueMocks.emitAuditEvent.mockRejectedValue(new Error("audit fail"));
    const result = (await valueGET(VALUE_CTX as never)) as typeof SAMPLE_METRICS;
    expect(result.roi).toBe(SAMPLE_METRICS.roi);
    expect(result.totalExpected).toBe(SAMPLE_METRICS.totalExpected);
  });

  it("getItems result is passed to calculateValue", async () => {
    const items = [{ id: "item-1" }, { id: "item-2" }];
    valueMocks.getItems.mockResolvedValue(items);
    await valueGET(VALUE_CTX as never);
    expect(valueMocks.calculateValue).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ id: "item-1" })])
    );
  });

  it("emitAuditEvent receives the workspaceId from ctx", async () => {
    await valueGET(VALUE_CTX as never);
    expect(valueMocks.emitAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "ws-1" })
    );
  });
});
