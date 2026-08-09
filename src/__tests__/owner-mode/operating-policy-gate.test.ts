/**
 * Tests for the operating-policy gate wired into enforceOwnerGatesForPromotion.
 *
 * Covers:
 *   - OperatingPolicyBlockError class shape and exports
 *   - growth_before_capacity BLOCK path → OperatingPolicyBlockError thrown + audit recorded
 *   - growth_before_capacity ALLOW path → passes through
 *   - WARN decision → no throw (only logged)
 *   - OPTED_OUT workspace → gate skipped entirely
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Static mocks (must precede imports of the modules under test) ────────────

const emitAuditEventMock = vi.fn(async () => "audit-id");
vi.mock("@/infra/audit", () => ({ emitAuditEvent: (...a: unknown[]) => emitAuditEventMock(...a) }));

// Mock all existing gate services as pass-through no-ops.
vi.mock("@/services/business-impact/recommendation-business-impact.service", () => ({
  enforceBusinessImpactForPromotion: vi.fn(async () => {}),
}));
vi.mock("@/services/owner-mode/recommendation-input-quality.service", () => ({
  enforceInputQualityForPromotion: vi.fn(async () => {}),
}));
vi.mock("@/services/decision-confidence/recommendation-confidence.service", () => ({
  enforceConfidenceForPromotion: vi.fn(async () => {}),
}));
vi.mock("@/services/owner-finance/recommendation-cash-safety.service", () => ({
  enforceCashSafetyForPromotion: vi.fn(async () => {}),
}));
vi.mock("@/services/owner-finance/recommendation-margin-safety.service", () => ({
  enforceMarginSafetyForPromotion: vi.fn(async () => {}),
}));
vi.mock("@/services/owner-mode/recommendation-capacity-safety.service", () => ({
  enforceCapacitySafetyForPromotion: vi.fn(async () => {}),
}));
vi.mock("@/services/owner-mode/do-not-repeat.service", () => ({
  enforceDoNotRepeatForPromotion: vi.fn(async () => {}),
}));

// Operating-policy service mock — controlled per test.
const evaluateCrossDomainConflictsMock = vi.fn();
vi.mock("@/services/governance/operating-policy.service", () => ({
  evaluateCrossDomainConflicts: (...a: unknown[]) => evaluateCrossDomainConflictsMock(...a),
}));

// DB dynamic-import mock — controlled per test.
const dbMock = {
  recommendation: { findUnique: vi.fn() },
  finding: { findFirst: vi.fn() },
  ownerEquipment: { findMany: vi.fn() },
};
vi.mock("@/lib/db", () => ({ db: dbMock }));

// Logger mock — prevent noise, allow assertions.
const loggerWarnMock = vi.fn();
vi.mock("@/infra/logger", () => ({ logger: { warn: (...a: unknown[]) => loggerWarnMock(...a), info: vi.fn(), error: vi.fn() } }));

import {
  enforceOwnerGatesForPromotion,
  OperatingPolicyBlockError,
  type PolicyDeps,
} from "@/services/owner-mode/gate-enforcement-policy";

const NOW = new Date("2026-08-08T00:00:00.000Z");

function makeDeps(requireBusinessImpactAssessment = false, optedOut = false): PolicyDeps {
  return {
    now: () => NOW,
    db: {
      clientAccount: {
        findUnique: vi.fn(async () => ({
          requireBusinessImpactAssessment,
          ownerGateOptOutAt: optedOut ? new Date("2026-01-01") : null,
          ownerGateOptOutExpiresAt: null,
        })),
        update: vi.fn(async () => ({})),
      },
    },
  };
}

beforeEach(() => {
  emitAuditEventMock.mockClear();
  evaluateCrossDomainConflictsMock.mockClear();
  loggerWarnMock.mockClear();
  dbMock.recommendation.findUnique.mockReset();
  dbMock.finding.findFirst.mockReset();
  dbMock.ownerEquipment.findMany.mockReset();
});

// ── OperatingPolicyBlockError class ──────────────────────────────────────────

describe("OperatingPolicyBlockError", () => {
  it("is exported", () => {
    expect(typeof OperatingPolicyBlockError).toBe("function");
  });

  it("has the correct code", () => {
    const err = new OperatingPolicyBlockError("growth_before_capacity", "blocked");
    expect(err.code).toBe("OPERATING_POLICY_BLOCKED");
  });

  it("stores policyKey", () => {
    const err = new OperatingPolicyBlockError("growth_before_capacity", "blocked");
    expect(err.policyKey).toBe("growth_before_capacity");
  });

  it("stores overridePath when supplied", () => {
    const err = new OperatingPolicyBlockError("growth_before_capacity", "blocked", "/api/owner/policies/p1/overrides");
    expect(err.overridePath).toBe("/api/owner/policies/p1/overrides");
  });

  it("overridePath is undefined when not supplied", () => {
    const err = new OperatingPolicyBlockError("growth_before_capacity", "blocked");
    expect(err.overridePath).toBeUndefined();
  });

  it("name is OperatingPolicyBlockError", () => {
    const err = new OperatingPolicyBlockError("growth_before_capacity", "blocked");
    expect(err.name).toBe("OperatingPolicyBlockError");
  });

  it("extends Error", () => {
    const err = new OperatingPolicyBlockError("growth_before_capacity", "blocked");
    expect(err).toBeInstanceOf(Error);
  });

  it("message is set from constructor arg", () => {
    const err = new OperatingPolicyBlockError("p", "capacity exceeded 80%");
    expect(err.message).toBe("capacity exceeded 80%");
  });
});

// ── Operating policy gate integration via enforceOwnerGatesForPromotion ──────

describe("enforceOwnerGatesForPromotion — operating policy gate", () => {
  it("OPTED_OUT workspace: gate skipped, evaluateCrossDomainConflicts not called", async () => {
    const deps = makeDeps(false, true);
    await expect(enforceOwnerGatesForPromotion("rec-1", "ws-1", deps)).resolves.toBeUndefined();
    expect(evaluateCrossDomainConflictsMock).not.toHaveBeenCalled();
  });

  it("DEFAULT_ON + ALLOW result: resolves without throw", async () => {
    dbMock.recommendation.findUnique.mockResolvedValue({ findingId: null });
    dbMock.ownerEquipment.findMany.mockResolvedValue([]);
    evaluateCrossDomainConflictsMock.mockResolvedValue([{ candidateId: "rec-2", decision: "ALLOW" }]);

    const deps = makeDeps(false, false);
    await expect(enforceOwnerGatesForPromotion("rec-2", "ws-2", deps)).resolves.toBeUndefined();
  });

  it("DEFAULT_ON + BLOCK result: throws OperatingPolicyBlockError with correct policyKey", async () => {
    dbMock.recommendation.findUnique.mockResolvedValue({ findingId: "finding-1" });
    dbMock.finding.findFirst.mockResolvedValue({ impactArea: "growth" });
    dbMock.ownerEquipment.findMany.mockResolvedValue([
      { name: "Van A", utilization: 0.92, downtimeState: "up", maintenanceDueAt: null, status: "operational" },
    ]);
    evaluateCrossDomainConflictsMock.mockResolvedValue([
      {
        candidateId: "rec-3",
        decision: "BLOCK",
        policyKey: "growth_before_capacity",
        blockReason: "Capacity 85% exceeds limit 80%",
        overridePath: "/api/owner/policies/p1/overrides",
      },
    ]);

    const deps = makeDeps(false, false);
    const err = await enforceOwnerGatesForPromotion("rec-3", "ws-3", deps).catch((e) => e);
    expect(err).toBeInstanceOf(OperatingPolicyBlockError);
    expect((err as OperatingPolicyBlockError).policyKey).toBe("growth_before_capacity");
    expect((err as OperatingPolicyBlockError).code).toBe("OPERATING_POLICY_BLOCKED");
  });

  it("BLOCK result: audit event is emitted before rethrow", async () => {
    dbMock.recommendation.findUnique.mockResolvedValue({ findingId: null });
    dbMock.ownerEquipment.findMany.mockResolvedValue([]);
    evaluateCrossDomainConflictsMock.mockResolvedValue([
      { candidateId: "rec-4", decision: "BLOCK", policyKey: "growth_before_capacity", blockReason: "over capacity" },
    ]);

    const deps = makeDeps(false, false);
    await enforceOwnerGatesForPromotion("rec-4", "ws-4", deps).catch(() => {});
    expect(emitAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: "owner.gate_promotion_blocked",
        workspaceId: "ws-4",
        entityId: "rec-4",
        payload: expect.objectContaining({ code: "OPERATING_POLICY_BLOCKED", mode: "DEFAULT_ON" }),
      })
    );
  });

  it("WARN result: resolves without throw, logger.warn called", async () => {
    dbMock.recommendation.findUnique.mockResolvedValue({ findingId: null });
    dbMock.ownerEquipment.findMany.mockResolvedValue([]);
    evaluateCrossDomainConflictsMock.mockResolvedValue([
      {
        candidateId: "rec-5",
        decision: "WARN",
        policyKey: "high_cost_low_payback",
        warningMessage: "Payback exceeds 6 months",
      },
    ]);

    const deps = makeDeps(false, false);
    await expect(enforceOwnerGatesForPromotion("rec-5", "ws-5", deps)).resolves.toBeUndefined();
    expect(loggerWarnMock).toHaveBeenCalledWith(
      "Operating policy advisory at promotion",
      expect.objectContaining({ policyKey: "high_cost_low_payback" })
    );
  });

  it("WARN result: evaluateCrossDomainConflicts called with workspaceId and capacity percent", async () => {
    dbMock.recommendation.findUnique.mockResolvedValue({ findingId: null });
    dbMock.ownerEquipment.findMany.mockResolvedValue([]); // safe fleet → 60%
    evaluateCrossDomainConflictsMock.mockResolvedValue([{ candidateId: "rec-6", decision: "ALLOW" }]);

    const deps = makeDeps(false, false);
    await enforceOwnerGatesForPromotion("rec-6", "ws-6", deps);
    expect(evaluateCrossDomainConflictsMock).toHaveBeenCalledWith(
      "ws-6",
      expect.arrayContaining([expect.objectContaining({ id: "rec-6" })]),
      60 // safe fleet maps to 60%
    );
  });

  it("blocked fleet (down equipment): capacity maps to 100%", async () => {
    dbMock.recommendation.findUnique.mockResolvedValue({ findingId: null });
    dbMock.ownerEquipment.findMany.mockResolvedValue([
      { name: "Machine A", utilization: 0.5, downtimeState: "down", maintenanceDueAt: null, status: "operational" },
    ]);
    evaluateCrossDomainConflictsMock.mockResolvedValue([{ candidateId: "rec-7", decision: "ALLOW" }]);

    const deps = makeDeps(false, false);
    await enforceOwnerGatesForPromotion("rec-7", "ws-7", deps);
    expect(evaluateCrossDomainConflictsMock).toHaveBeenCalledWith(
      "ws-7",
      expect.any(Array),
      100
    );
  });

  it("BLOCK on unknown policyKey falls back to 'unknown'", async () => {
    dbMock.recommendation.findUnique.mockResolvedValue({ findingId: null });
    dbMock.ownerEquipment.findMany.mockResolvedValue([]);
    evaluateCrossDomainConflictsMock.mockResolvedValue([
      { candidateId: "rec-8", decision: "BLOCK", blockReason: "some block" },
    ]);

    const deps = makeDeps(false, false);
    const err = await enforceOwnerGatesForPromotion("rec-8", "ws-8", deps).catch((e) => e);
    expect(err).toBeInstanceOf(OperatingPolicyBlockError);
    expect((err as OperatingPolicyBlockError).policyKey).toBe("unknown");
  });

  it("growth-sensitive impactArea marks candidate as isGrowthAction=true", async () => {
    dbMock.recommendation.findUnique.mockResolvedValue({ findingId: "f1" });
    dbMock.finding.findFirst.mockResolvedValue({ impactArea: "growth" });
    dbMock.ownerEquipment.findMany.mockResolvedValue([]);
    evaluateCrossDomainConflictsMock.mockResolvedValue([{ candidateId: "rec-9", decision: "ALLOW" }]);

    const deps = makeDeps(false, false);
    await enforceOwnerGatesForPromotion("rec-9", "ws-9", deps);
    expect(evaluateCrossDomainConflictsMock).toHaveBeenCalledWith(
      "ws-9",
      expect.arrayContaining([expect.objectContaining({ isGrowthAction: true, category: "GROWTH" })]),
      expect.any(Number)
    );
  });

  it("non-growth impactArea marks candidate as isGrowthAction=false", async () => {
    dbMock.recommendation.findUnique.mockResolvedValue({ findingId: "f2" });
    dbMock.finding.findFirst.mockResolvedValue({ impactArea: "cash_flow" });
    dbMock.ownerEquipment.findMany.mockResolvedValue([]);
    evaluateCrossDomainConflictsMock.mockResolvedValue([{ candidateId: "rec-10", decision: "ALLOW" }]);

    const deps = makeDeps(false, false);
    await enforceOwnerGatesForPromotion("rec-10", "ws-10", deps);
    expect(evaluateCrossDomainConflictsMock).toHaveBeenCalledWith(
      "ws-10",
      expect.arrayContaining([expect.objectContaining({ isGrowthAction: false, category: "OPERATIONS" })]),
      expect.any(Number)
    );
  });

  it("caution fleet (85% utilization): capacity maps to 85%", async () => {
    dbMock.recommendation.findUnique.mockResolvedValue({ findingId: null });
    dbMock.ownerEquipment.findMany.mockResolvedValue([
      { name: "Van B", utilization: 0.87, downtimeState: "up", maintenanceDueAt: null, status: "operational" },
    ]);
    evaluateCrossDomainConflictsMock.mockResolvedValue([{ candidateId: "rec-11", decision: "ALLOW" }]);

    const deps = makeDeps(false, false);
    await enforceOwnerGatesForPromotion("rec-11", "ws-11", deps);
    expect(evaluateCrossDomainConflictsMock).toHaveBeenCalledWith(
      "ws-11",
      expect.any(Array),
      85
    );
  });

  it("high_risk fleet (≥95% utilization): capacity maps to 95%", async () => {
    dbMock.recommendation.findUnique.mockResolvedValue({ findingId: null });
    dbMock.ownerEquipment.findMany.mockResolvedValue([
      { name: "Van C", utilization: 0.96, downtimeState: "up", maintenanceDueAt: null, status: "operational" },
    ]);
    evaluateCrossDomainConflictsMock.mockResolvedValue([{ candidateId: "rec-12", decision: "ALLOW" }]);

    const deps = makeDeps(false, false);
    await enforceOwnerGatesForPromotion("rec-12", "ws-12", deps);
    expect(evaluateCrossDomainConflictsMock).toHaveBeenCalledWith(
      "ws-12",
      expect.any(Array),
      95
    );
  });
});
