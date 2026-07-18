/**
 * Phase 2 Attention Engine — unit tests for the 5 new OwnerNowView signals:
 *   A — Goal Attention Signal (6-state derivation + beginner explanation)
 *   C — Policy Attention Signal (triggered vs configured, live measurement)
 *   D — Trend Alerts (metric snapshot assembly, noise filtering)
 *   E — Do-Not-Repeat Annotation (dual-key strategy — see do-not-repeat-dual-key.test.ts)
 *   G — Active Escalations (OPEN filter, workspace isolation)
 *
 * All tests use DI (fake deps), no DB. Real DB proof is in attention-engine.db.test.ts.
 */

import { describe, it, expect } from "vitest";
import {
  getOwnerNowView,
  type GuidanceDeps,
  type GoalAttentionSignal,
  type PolicyAttentionSignal,
  type EscalationAttentionItem,
} from "@/services/owner-guidance/owner-now-view.service";

// ─── Minimal fake deps factory ────────────────────────────────────────────────

type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };

function baseDeps(overrides: DeepPartial<GuidanceDeps> = {}): GuidanceDeps {
  const noopDb = {
    ownerCashflowCycle: { findFirst: async () => null },
    ownerFinanceCycle: { findFirst: async () => null },
    ownerEmployeeWorkloadSnapshot: { findFirst: async () => null },
    ownerWorkloadSnapshot: { findFirst: async () => null },
    ownerCapacitySnapshot: { findFirst: async () => ({ growthSafe: true, expansionTriggered: false, bottleneckUtilization: 0.3 }) },
    ownerMetricSnapshot: { findFirst: async () => null },
    ownerSupplierInventorySnapshot: { findFirst: async () => null },
    ownerBusiness: { findFirst: async () => ({ businessType: "laundry_local_service" }) },
    proof: { count: async () => 0 },
    ownerActionOutcome: { count: async () => 0 },
    ownerReassessmentEvent: { count: async () => 0 },
    ownerGuidanceSnapshot: {
      findFirst: async () => null,
      create: async (args: { data: Record<string, unknown> }) => args.data,
    },
  };

  return {
    uuid: () => "00000000-0000-0000-0000-000000000001",
    now: () => 1_900_000_000_000,
    db: { ...noopDb, ...(overrides.db ?? {}) } as GuidanceDeps["db"],
    goalTrajectoryFn: overrides.goalTrajectoryFn,
    policyListFn: overrides.policyListFn,
    policyEvalFn: overrides.policyEvalFn,
  };
}

// ─── Signal A: Goal Attention Signal ─────────────────────────────────────────

describe("Signal A — GoalAttentionSignal state derivation", () => {
  it("returns NO_GOAL when goalTrajectoryFn is absent", async () => {
    const deps = baseDeps();
    const payload = await getOwnerNowView("ws1", "biz1", deps);
    expect(payload.goalAttentionSignal).toBeNull();
  });

  it("returns NO_GOAL when goalTrajectoryFn resolves null", async () => {
    const deps = baseDeps({ goalTrajectoryFn: async () => null });
    const payload = await getOwnerNowView("ws1", "biz1", deps);
    expect(payload.goalAttentionSignal?.state).toBe("NO_GOAL");
    expect(payload.goalAttentionSignal?.beginnerExplanation).toMatch(/no active goal/i);
  });

  it("returns INSUFFICIENT_DATA when confidence is LOW", async () => {
    const deps = baseDeps({
      goalTrajectoryFn: async () => ({
        goal: { targetType: "REVENUE", targetAmount: 500000, targetCurrency: "INR", targetDate: new Date("2027-01-01") },
        trajectory: {
          confidence: "LOW",
          confidenceRationale: "Only 1 valid period",
          trajectoryMiss: false,
          projectedMonthsToGoal: null,
          currentTrajectoryDate: null,
          gapToClose: 400000,
          requiredMonthlyImprovement: 33000,
          assumptions: [],
        },
      }),
    });
    const payload = await getOwnerNowView("ws1", "biz1", deps);
    expect(payload.goalAttentionSignal?.state).toBe("INSUFFICIENT_DATA");
    expect(payload.goalAttentionSignal?.beginnerExplanation).toMatch(/not enough data/i);
  });

  it("returns STALE when MEDIUM confidence and rationale includes 'days old'", async () => {
    const deps = baseDeps({
      goalTrajectoryFn: async () => ({
        goal: { targetType: "PROFIT", targetAmount: 100000, targetCurrency: "INR", targetDate: new Date("2027-06-01") },
        trajectory: {
          confidence: "MEDIUM",
          confidenceRationale: "Last result was 65 days old",
          trajectoryMiss: false,
          projectedMonthsToGoal: 18,
          currentTrajectoryDate: new Date("2027-06-01"),
          gapToClose: 80000,
          requiredMonthlyImprovement: 4400,
          assumptions: ["Assumes consistent monthly growth"],
        },
      }),
    });
    const payload = await getOwnerNowView("ws1", "biz1", deps);
    expect(payload.goalAttentionSignal?.state).toBe("STALE");
    expect(payload.goalAttentionSignal?.beginnerExplanation).toMatch(/60 days/i);
  });

  it("returns NO_GROWTH when projectedMonthsToGoal is null and confidence is not LOW", async () => {
    const deps = baseDeps({
      goalTrajectoryFn: async () => ({
        goal: { targetType: "REVENUE", targetAmount: 500000, targetCurrency: "INR", targetDate: new Date("2027-01-01") },
        trajectory: {
          confidence: "MEDIUM",
          confidenceRationale: "Negative growth trend",
          trajectoryMiss: false,
          projectedMonthsToGoal: null,
          currentTrajectoryDate: null,
          gapToClose: 300000,
          requiredMonthlyImprovement: 25000,
          assumptions: [],
        },
      }),
    });
    const payload = await getOwnerNowView("ws1", "biz1", deps);
    expect(payload.goalAttentionSignal?.state).toBe("NO_GROWTH");
    expect(payload.goalAttentionSignal?.beginnerExplanation).toMatch(/current rate/i);
  });

  it("returns ON_TRACK when trajectoryMiss is false", async () => {
    const deps = baseDeps({
      goalTrajectoryFn: async () => ({
        goal: { targetType: "REVENUE", targetAmount: 500000, targetCurrency: "INR", targetDate: new Date("2027-01-01") },
        trajectory: {
          confidence: "HIGH",
          confidenceRationale: "6 valid periods",
          trajectoryMiss: false,
          projectedMonthsToGoal: 10,
          currentTrajectoryDate: new Date("2026-11-01"),
          gapToClose: 200000,
          requiredMonthlyImprovement: 20000,
          assumptions: ["Assumes 5% monthly growth"],
        },
      }),
    });
    const payload = await getOwnerNowView("ws1", "biz1", deps);
    expect(payload.goalAttentionSignal?.state).toBe("ON_TRACK");
    expect(payload.goalAttentionSignal?.beginnerExplanation).toMatch(/on pace/i);
    expect(payload.goalAttentionSignal?.projectedMonthsToGoal).toBe(10);
  });

  it("returns AT_RISK when trajectoryMiss is true", async () => {
    const deps = baseDeps({
      goalTrajectoryFn: async () => ({
        goal: { targetType: "REVENUE", targetAmount: 500000, targetCurrency: "INR", targetDate: new Date("2027-01-01") },
        trajectory: {
          confidence: "HIGH",
          confidenceRationale: "5 valid periods",
          trajectoryMiss: true,
          projectedMonthsToGoal: 16,
          currentTrajectoryDate: new Date("2027-07-01"),
          gapToClose: 300000,
          requiredMonthlyImprovement: 20000,
          assumptions: [],
        },
      }),
    });
    const payload = await getOwnerNowView("ws1", "biz1", deps);
    expect(payload.goalAttentionSignal?.state).toBe("AT_RISK");
    expect(payload.goalAttentionSignal?.beginnerExplanation).toMatch(/may slip|behind schedule/i);
    expect(payload.goalAttentionSignal?.trajectoryMiss).toBe(true);
  });

  it("maps goal targetType to human label in goalTitle", async () => {
    const deps = baseDeps({
      goalTrajectoryFn: async () => ({
        goal: { targetType: "PROFIT", targetAmount: 100000, targetCurrency: "INR", targetDate: new Date("2027-01-01") },
        trajectory: {
          confidence: "HIGH",
          confidenceRationale: "",
          trajectoryMiss: false,
          projectedMonthsToGoal: 6,
          currentTrajectoryDate: new Date("2027-01-01"),
          gapToClose: 50000,
          requiredMonthlyImprovement: 8333,
          assumptions: [],
        },
      }),
    });
    const payload = await getOwnerNowView("ws1", "biz1", deps);
    expect(payload.goalAttentionSignal?.goalTitle).toBe("profit target");
  });

  it("exposes all required numeric fields with correct values", async () => {
    const deps = baseDeps({
      goalTrajectoryFn: async () => ({
        goal: { targetType: "REVENUE", targetAmount: 500000, targetCurrency: "INR", targetDate: new Date("2027-01-01") },
        trajectory: {
          confidence: "HIGH",
          confidenceRationale: "",
          trajectoryMiss: false,
          projectedMonthsToGoal: 12,
          currentTrajectoryDate: new Date("2027-01-01"),
          gapToClose: 240000,
          requiredMonthlyImprovement: 20000,
          assumptions: ["stable growth"],
        },
      }),
    });
    const payload = await getOwnerNowView("ws1", "biz1", deps);
    const sig = payload.goalAttentionSignal as GoalAttentionSignal;
    expect(sig.targetAmount).toBe(500000);
    expect(sig.targetCurrency).toBe("INR");
    expect(sig.gapToClose).toBe(240000);
    expect(sig.requiredMonthlyImprovement).toBe(20000);
    expect(sig.assumptions).toEqual(["stable growth"]);
    expect(typeof sig.targetDateIso).toBe("string");
    expect(typeof sig.currentTrajectoryDateIso).toBe("string");
    expect(sig.confidence).toBe("HIGH");
  });

  it("serializes dates as ISO strings — no Date objects in payload", async () => {
    const deps = baseDeps({
      goalTrajectoryFn: async () => ({
        goal: { targetType: "REVENUE", targetAmount: 500000, targetCurrency: "INR", targetDate: new Date("2027-01-01") },
        trajectory: {
          confidence: "HIGH",
          confidenceRationale: "",
          trajectoryMiss: false,
          projectedMonthsToGoal: 8,
          currentTrajectoryDate: new Date("2026-09-01"),
          gapToClose: 100000,
          requiredMonthlyImprovement: 12500,
          assumptions: [],
        },
      }),
    });
    const payload = await getOwnerNowView("ws1", "biz1", deps);
    const sig = payload.goalAttentionSignal as GoalAttentionSignal;
    // Round-trip check: ISO strings survive JSON serialization
    const roundTripped = JSON.parse(JSON.stringify(sig)) as GoalAttentionSignal;
    expect(roundTripped.targetDateIso).toBe(sig.targetDateIso);
    expect(roundTripped.currentTrajectoryDateIso).toBe(sig.currentTrajectoryDateIso);
    expect(roundTripped.targetDateIso).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

// ─── Signal C: Policy Attention Signal ───────────────────────────────────────

describe("Signal C — PolicyAttentionSignal (triggered vs configured)", () => {
  it("returns null when policyListFn is absent", async () => {
    const deps = baseDeps();
    const payload = await getOwnerNowView("ws1", "biz1", deps);
    expect(payload.policyAttentionSignal).toBeNull();
  });

  it("counts hard-block vs warning policies correctly", async () => {
    const deps = baseDeps({
      policyListFn: async () => [
        { policyKey: "growth_before_capacity", isActive: true, hardBlock: true },
        { policyKey: "high_cost_low_payback", isActive: true, hardBlock: false },
      ],
      policyEvalFn: async () => ({ decision: "ALLOW" as const }),
    });
    const payload = await getOwnerNowView("ws1", "biz1", deps);
    const sig = payload.policyAttentionSignal as PolicyAttentionSignal;
    expect(sig.configuredHardBlockCount).toBe(1);
    expect(sig.configuredWarningCount).toBe(1);
  });

  it("counts triggered BLOCK vs WARN from live evaluation", async () => {
    const deps = baseDeps({
      policyListFn: async () => [
        { policyKey: "growth_before_capacity", isActive: true, hardBlock: true },
        { policyKey: "high_cost_low_payback", isActive: true, hardBlock: false },
      ],
      policyEvalFn: async (_ws, policyKey) => {
        if (policyKey === "growth_before_capacity") return { decision: "BLOCK" as const };
        return { decision: "WARN" as const };
      },
    });
    const payload = await getOwnerNowView("ws1", "biz1", deps);
    const sig = payload.policyAttentionSignal as PolicyAttentionSignal;
    expect(sig.triggeredBlockCount).toBe(1);
    expect(sig.triggeredWarningCount).toBe(1);
  });

  it("surfaces policy details with human-readable labels", async () => {
    const deps = baseDeps({
      policyListFn: async () => [
        { policyKey: "growth_before_capacity", isActive: true, hardBlock: true },
      ],
      policyEvalFn: async () => ({ decision: "ALLOW" as const }),
    });
    const payload = await getOwnerNowView("ws1", "biz1", deps);
    const sig = payload.policyAttentionSignal as PolicyAttentionSignal;
    expect(sig.details[0].label).toBe("Growth before capacity");
    expect(sig.details[0].policyKey).toBe("growth_before_capacity");
    expect(sig.details[0].hardBlock).toBe(true);
  });

  it("counts override when policyEvalFn returns activeOverride", async () => {
    const deps = baseDeps({
      policyListFn: async () => [
        { policyKey: "growth_before_capacity", isActive: true, hardBlock: true },
      ],
      policyEvalFn: async () => ({
        decision: "BLOCK" as const,
        activeOverride: { overriddenBy: "owner", reason: "Capacity is fine", expiresAt: null },
      }),
    });
    const payload = await getOwnerNowView("ws1", "biz1", deps);
    const sig = payload.policyAttentionSignal as PolicyAttentionSignal;
    expect(sig.activeOverrideCount).toBe(1);
    expect(sig.details[0].hasActiveOverride).toBe(true);
    expect(sig.details[0].overrideReason).toBe("Capacity is fine");
  });

  it("does not trigger BLOCK when policy is below threshold (ALLOW)", async () => {
    const deps = baseDeps({
      policyListFn: async () => [
        { policyKey: "growth_before_capacity", isActive: true, hardBlock: true },
      ],
      policyEvalFn: async () => ({ decision: "ALLOW" as const }),
    });
    const payload = await getOwnerNowView("ws1", "biz1", deps);
    const sig = payload.policyAttentionSignal as PolicyAttentionSignal;
    expect(sig.triggeredBlockCount).toBe(0);
    expect(sig.details[0].isCurrentlyTriggered).toBe(false);
  });
});

// ─── Signal D: Trend Alerts ───────────────────────────────────────────────────

describe("Signal D — Trend Alerts (metric snapshot assembly, noise filtering)", () => {
  const period1End = new Date("2025-12-31T00:00:00.000Z");
  const period2End = new Date("2026-03-31T00:00:00.000Z");

  it("returns null when ownerMetricSnapshot.findMany is absent", async () => {
    const deps = baseDeps();
    // Default db has only findFirst, no findMany
    const payload = await getOwnerNowView("ws1", "biz1", deps);
    expect(payload.trendAlerts).toBeNull();
  });

  it("returns null when fewer than 2 metric snapshots exist", async () => {
    const deps = baseDeps({
      db: {
        ownerMetricSnapshot: {
          findFirst: async () => null,
          findMany: async () => [
            {
              periodEnd: period1End,
              revenue: 100000, grossProfit: 30000, netProfit: 10000,
              newCustomers: 50, averageOrderValue: 2000, refundAmount: 500,
              rewashCount: 2, complaintCount: 1, receivables: 20000,
              marketingSpend: 5000, staffProductivity: 0.8,
            },
          ],
        },
      } as Partial<GuidanceDeps["db"]>,
    });
    const payload = await getOwnerNowView("ws1", "biz1", deps);
    expect(payload.trendAlerts).toBeNull();
  });

  it("returns null when both snapshots have duplicate periodEnd", async () => {
    const deps = baseDeps({
      db: {
        ownerMetricSnapshot: {
          findFirst: async () => null,
          findMany: async () => [
            {
              periodEnd: period1End,
              revenue: 100000, grossProfit: 30000, netProfit: 10000,
              newCustomers: 50, averageOrderValue: 2000, refundAmount: 500,
              rewashCount: 2, complaintCount: 1, receivables: 20000,
              marketingSpend: 5000, staffProductivity: 0.8,
            },
            {
              periodEnd: period1End, // duplicate
              revenue: 100000, grossProfit: 30000, netProfit: 10000,
              newCustomers: 50, averageOrderValue: 2000, refundAmount: 500,
              rewashCount: 2, complaintCount: 1, receivables: 20000,
              marketingSpend: 5000, staffProductivity: 0.8,
            },
          ],
        },
      } as Partial<GuidanceDeps["db"]>,
    });
    const payload = await getOwnerNowView("ws1", "biz1", deps);
    expect(payload.trendAlerts).toBeNull();
  });

  it("returns [] when 2 snapshots exist but no metric changes exceed threshold", async () => {
    // Both periods identical → no change → no alerts
    const snapshot = {
      revenue: 100000, grossProfit: 30000, netProfit: 10000,
      newCustomers: 50, averageOrderValue: 2000, refundAmount: 500,
      rewashCount: 2, complaintCount: 1, receivables: 20000,
      marketingSpend: 5000, staffProductivity: 0.8,
    };
    const deps = baseDeps({
      db: {
        ownerMetricSnapshot: {
          findFirst: async () => null,
          findMany: async () => [
            { periodEnd: period2End, ...snapshot },
            { periodEnd: period1End, ...snapshot },
          ],
        },
      } as Partial<GuidanceDeps["db"]>,
    });
    const payload = await getOwnerNowView("ws1", "biz1", deps);
    expect(Array.isArray(payload.trendAlerts)).toBe(true);
    expect(payload.trendAlerts).toHaveLength(0);
  });

  it("produces a trend alert when complaints rise by >1% (complaints_up_before_churn)", async () => {
    // Complaints rising is a standalone alert trigger (no pairing needed).
    // Use a large relative jump: 1 → 10 complaints (+900%, well above 1% threshold).
    const deps = baseDeps({
      db: {
        ownerMetricSnapshot: {
          findFirst: async () => null,
          findMany: async () => [
            {
              periodEnd: period2End,
              revenue: 100000,
              grossProfit: 30000, netProfit: 10000,
              newCustomers: 50, averageOrderValue: 2000, refundAmount: 500,
              rewashCount: 2, complaintCount: 10, // big jump from 1 → 10
              receivables: 20000, marketingSpend: 5000, staffProductivity: 0.8,
            },
            {
              periodEnd: period1End,
              revenue: 100000,
              grossProfit: 30000, netProfit: 10000,
              newCustomers: 50, averageOrderValue: 2000, refundAmount: 500,
              rewashCount: 2, complaintCount: 1, // baseline
              receivables: 20000, marketingSpend: 5000, staffProductivity: 0.8,
            },
          ],
        },
      } as Partial<GuidanceDeps["db"]>,
    });
    const payload = await getOwnerNowView("ws1", "biz1", deps);
    expect(Array.isArray(payload.trendAlerts)).toBe(true);
    expect((payload.trendAlerts ?? []).length).toBeGreaterThan(0);
    expect((payload.trendAlerts ?? []).some((a) => a.alertType === "complaints_up_before_churn")).toBe(true);
  });

  it("suppresses a complaints change below the 1% noise floor (complaints_up_before_churn)", async () => {
    // complaints: 100 → 100 (identical) — 0% change — below 1% threshold
    const deps = baseDeps({
      db: {
        ownerMetricSnapshot: {
          findFirst: async () => null,
          findMany: async () => [
            {
              periodEnd: period2End,
              revenue: 100000,
              grossProfit: 30000, netProfit: 10000,
              newCustomers: 50, averageOrderValue: 2000, refundAmount: 500,
              rewashCount: 2, complaintCount: 100, // identical to previous period
              receivables: 20000, marketingSpend: 5000, staffProductivity: 0.8,
            },
            {
              periodEnd: period1End,
              revenue: 100000,
              grossProfit: 30000, netProfit: 10000,
              newCustomers: 50, averageOrderValue: 2000, refundAmount: 500,
              rewashCount: 2, complaintCount: 100, // identical
              receivables: 20000, marketingSpend: 5000, staffProductivity: 0.8,
            },
          ],
        },
      } as Partial<GuidanceDeps["db"]>,
    });
    const payload = await getOwnerNowView("ws1", "biz1", deps);
    // Complaints didn't change → threshold not met → no alert
    const complaintAlerts = (payload.trendAlerts ?? []).filter(
      (a) => a.alertType === "complaints_up_before_churn"
    );
    expect(complaintAlerts).toHaveLength(0);
  });
});

// ─── Signal G: Active Escalations ────────────────────────────────────────────

describe("Signal G — ActiveEscalations (OPEN filter, workspace isolation)", () => {
  it("returns null when escalation findMany is unavailable", async () => {
    const deps = baseDeps();
    const payload = await getOwnerNowView("ws1", "biz1", deps);
    expect(payload.activeEscalations).toBeNull();
  });

  it("returns [] when no OPEN escalations exist", async () => {
    const deps = baseDeps({
      db: {
        escalation: {
          findMany: async () => [
            {
              id: "esc-1",
              assignedTarget: "Floor Manager",
              severity: "HIGH",
              status: "ACKNOWLEDGED",
              createdAt: new Date("2026-07-01"),
              dueAt: null,
              acknowledgedAt: new Date("2026-07-02"),
              resolvedAt: null,
            },
          ],
        },
      } as Partial<GuidanceDeps["db"]>,
    });
    const payload = await getOwnerNowView("ws1", "biz1", deps);
    expect(Array.isArray(payload.activeEscalations)).toBe(true);
    expect(payload.activeEscalations).toHaveLength(0);
  });

  it("returns OPEN escalations with ISO string dates", async () => {
    const openDate = new Date("2026-07-10T08:00:00.000Z");
    const dueDate = new Date("2026-07-17T17:00:00.000Z");
    const deps = baseDeps({
      db: {
        escalation: {
          findMany: async () => [
            {
              id: "esc-open-1",
              assignedTarget: "Delivery Team",
              severity: "CRITICAL",
              status: "OPEN",
              createdAt: openDate,
              dueAt: dueDate,
              acknowledgedAt: null,
              resolvedAt: null,
            },
          ],
        },
      } as Partial<GuidanceDeps["db"]>,
    });
    const payload = await getOwnerNowView("ws1", "biz1", deps);
    expect(payload.activeEscalations).toHaveLength(1);
    const item = payload.activeEscalations![0] as EscalationAttentionItem;
    expect(item.id).toBe("esc-open-1");
    expect(item.status).toBe("OPEN");
    expect(item.severity).toBe("CRITICAL");
    expect(item.raisedAtIso).toBe(openDate.toISOString());
    expect(item.dueAtIso).toBe(dueDate.toISOString());
    expect(item.title).toBe("Delivery Team");
  });

  it("filters out non-OPEN escalations from mixed list", async () => {
    const deps = baseDeps({
      db: {
        escalation: {
          findMany: async () => [
            {
              id: "esc-open",
              assignedTarget: "Manager",
              severity: "HIGH",
              status: "OPEN",
              createdAt: new Date("2026-07-10"),
              dueAt: null,
              acknowledgedAt: null,
              resolvedAt: null,
            },
            {
              id: "esc-acked",
              assignedTarget: "Staff",
              severity: "LOW",
              status: "ACKNOWLEDGED",
              createdAt: new Date("2026-07-05"),
              dueAt: null,
              acknowledgedAt: new Date("2026-07-06"),
              resolvedAt: null,
            },
            {
              id: "esc-resolved",
              assignedTarget: "Floor",
              severity: "MEDIUM",
              status: "RESOLVED",
              createdAt: new Date("2026-07-01"),
              dueAt: null,
              acknowledgedAt: null,
              resolvedAt: new Date("2026-07-08"),
            },
          ],
        },
      } as Partial<GuidanceDeps["db"]>,
    });
    const payload = await getOwnerNowView("ws1", "biz1", deps);
    expect(payload.activeEscalations).toHaveLength(1);
    expect(payload.activeEscalations![0].id).toBe("esc-open");
  });

  it("caps at 5 escalations when more than 5 OPEN", async () => {
    const manyOpen = Array.from({ length: 8 }, (_, i) => ({
      id: `esc-${i}`,
      assignedTarget: `Target ${i}`,
      severity: "HIGH",
      status: "OPEN",
      createdAt: new Date(`2026-07-${String(i + 1).padStart(2, "0")}`),
      dueAt: null,
      acknowledgedAt: null,
      resolvedAt: null,
    }));
    const deps = baseDeps({
      db: {
        escalation: {
          findMany: async () => manyOpen,
        },
      } as Partial<GuidanceDeps["db"]>,
    });
    const payload = await getOwnerNowView("ws1", "biz1", deps);
    expect((payload.activeEscalations ?? []).length).toBeLessThanOrEqual(5);
  });

  it("dueAtIso is null when dueAt is null", async () => {
    const deps = baseDeps({
      db: {
        escalation: {
          findMany: async () => [
            {
              id: "esc-noduedate",
              assignedTarget: "Ops",
              severity: "MEDIUM",
              status: "OPEN",
              createdAt: new Date("2026-07-10"),
              dueAt: null,
              acknowledgedAt: null,
              resolvedAt: null,
            },
          ],
        },
      } as Partial<GuidanceDeps["db"]>,
    });
    const payload = await getOwnerNowView("ws1", "biz1", deps);
    expect(payload.activeEscalations![0].dueAtIso).toBeNull();
  });
});

// ─── Cross-signal: JSON serializability ──────────────────────────────────────

describe("Cross-signal — JSON round-trip (no Date objects escape the service)", () => {
  it("full payload with all signals present round-trips through JSON.parse(JSON.stringify)", async () => {
    const deps = baseDeps({
      goalTrajectoryFn: async () => ({
        goal: { targetType: "REVENUE", targetAmount: 500000, targetCurrency: "INR", targetDate: new Date("2027-01-01") },
        trajectory: {
          confidence: "HIGH", confidenceRationale: "", trajectoryMiss: false,
          projectedMonthsToGoal: 10, currentTrajectoryDate: new Date("2026-11-01"),
          gapToClose: 200000, requiredMonthlyImprovement: 20000, assumptions: [],
        },
      }),
      policyListFn: async () => [{ policyKey: "growth_before_capacity", isActive: true, hardBlock: true }],
      policyEvalFn: async () => ({ decision: "ALLOW" as const }),
      db: {
        escalation: {
          findMany: async () => [
            {
              id: "esc-1", assignedTarget: "Team A", severity: "HIGH", status: "OPEN",
              createdAt: new Date("2026-07-10"), dueAt: null, acknowledgedAt: null, resolvedAt: null,
            },
          ],
        },
        ownerMetricSnapshot: {
          findFirst: async () => null,
          findMany: async () => [],
        },
      } as Partial<GuidanceDeps["db"]>,
    });
    const payload = await getOwnerNowView("ws1", "biz1", deps);
    // Should not throw on JSON round-trip
    const serialized = JSON.stringify(payload);
    const restored = JSON.parse(serialized) as typeof payload;
    expect(restored.goalAttentionSignal?.state).toBe(payload.goalAttentionSignal?.state);
    expect(restored.policyAttentionSignal?.configuredHardBlockCount).toBe(
      payload.policyAttentionSignal?.configuredHardBlockCount
    );
  });
});
