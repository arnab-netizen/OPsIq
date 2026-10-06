/**
 * N1 — legacy whole-business-plan / action-plan growth permission must never contradict the canonical owner
 * scale gate. The legacy planner derives its own cash/risk flags from raw rows (it cannot see a Finance
 * profit-driven AT_RISK, an unverified reading, missing evidence, …); `growth.scaleAllowed`, the next best
 * action and the action-plan response are therefore adapted from the canonical GROW gate (tightened only).
 *
 * Every scenario drives the REAL services (getOwnerWholeBusinessPlan / getOwnerActionAssignment) over a mock
 * Prisma whose LEGACY rows look healthy, while the CANONICAL cash/finance cycles carry the danger — the exact
 * shape of the #594 production AT_RISK fixture.
 */
import { describe, it, expect, vi } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";

vi.mock("@/lib/db", () => ({ db: {}, getDbInstance: vi.fn().mockResolvedValue({}) }));

import { getOwnerWholeBusinessPlan } from "@/services/owner-mode/owner-whole-business-plan.service";
import { getOwnerActionAssignment } from "@/services/owner-mode/owner-action-assignment.service";
import { loadOwnerGateConstraints } from "@/services/owner-mode/owner-action-gate.service";
import { evaluateCanonicalScaleGate } from "@/domain/owner-mode/canonical-scale-gate";
import { evaluateOwnerActionGate } from "@/domain/owner-mode/owner-action-gate-policy";
import { LIQUIDITY_UNCONFIRMED_FINDING_CODE } from "@/domain/owner-finance/liquidity";

const NOW = new Date("2026-06-29T00:00:00Z");
const day = (d: number) => new Date(NOW.getTime() - d * 86_400_000);
const WS = "ws-n1";
const BIZ = "biz-n1";
const PERIOD_END = day(5);

interface Scenario {
  /** Legacy rows (what the old planner sees). Defaults describe a healthy business. */
  cashInHand?: number;
  receivablesOverdue?: number;
  revenue?: number;
  costOfGoods?: number;
  /** Canonical cycles (what Home / the action gate see). null = no current reading. */
  finState?: string | null;
  finFindings?: Array<{ code: string; severity?: string }>;
  cashState?: string | null;
  equipmentDown?: boolean;
  standingInstruction?: { riskClass: string } | null;
  businessScoped?: boolean;
  failCanonicalLoad?: boolean;
}

function makeDb(s: Scenario = {}): PrismaClient {
  const ff = (val: unknown) => async () => val;
  const fm = (val: unknown[]) => async () => val;
  const fin = s.finState ? { survivalState: s.finState, dataConfidenceScore: 90, snapshot: { periodEnd: PERIOD_END, supersededById: null }, findings: s.finFindings ?? [] } : null;
  const cash = s.cashState ? { cashflowState: s.cashState, dataConfidenceScore: 90, generatedAt: PERIOD_END, snapshot: { periodEnd: PERIOD_END } } : null;
  const db: Record<string, unknown> = {
    ownerCashflowSnapshot: { findFirst: ff({ periodEnd: PERIOD_END, cashInHand: s.cashInHand ?? 250_000, bankBalance: 0, receivables: 20_000, receivablesOverdue: s.receivablesOverdue ?? 0, payables: 10_000 }) },
    ownerFinancialSnapshot: { findFirst: ff({ periodEnd: PERIOD_END, revenue: s.revenue ?? 400_000, costOfGoods: s.costOfGoods ?? 160_000, fixedCosts: 60_000, variableCosts: 20_000, dataConfidenceScore: 90 }) },
    ownerWorkingCapitalItem: { findMany: fm([]) },
    ownerCapacitySnapshot: { findFirst: ff({ bottleneckUtilization: 0.5, growthSafe: true, safeUtilization: 0.7, createdAt: NOW, expansionTriggered: false }) },
    ownerComplianceItem: { findMany: fm([]) },
    proof: { findMany: fm([]) },
    ownerWorkloadSnapshot: { findFirst: ff({ dailyLoadPct: 50, band: "ok", ownerOnlyCriticalTasks: 1, overloaded: false, bottleneckRisk: false, createdAt: NOW }) },
    ownerStandingInstruction: { count: async () => 1, findFirst: async () => s.standingInstruction ?? null },
    ownerBusiness: {
      findFirst: async () => ({ id: BIZ, workspaceId: WS, name: "N1 Laundry", businessType: "laundry_dry_cleaning", location: "Kolkata, West Bengal", currency: "INR" }),
      findMany: async () => [{ id: BIZ }],
    },
    behavioralLearningArtifact: { count: async () => 0, findMany: async () => [], findUnique: async () => null, upsert: async () => undefined },
    // Canonical safety-state loader tables:
    clientAccount: { findUnique: async () => ({ requireBusinessImpactAssessment: false, ownerGateOptOutAt: null, ownerGateOptOutExpiresAt: null }), update: vi.fn() },
    ownerDoNotRepeatRule: { findMany: fm([]) },
    ownerEquipment: { findMany: fm(s.equipmentDown ? [{ name: "Washer", businessId: BIZ, utilization: 0.5, downtimeState: "down", maintenanceDueAt: null, status: "operational", updatedAt: PERIOD_END }] : []) },
    ownerFinanceCycle: { findFirst: ff(fin) },
    ownerCashflowCycle: { findFirst: ff(cash) },
  };
  if (s.failCanonicalLoad) db.ownerFinanceCycle = { findFirst: async () => { throw new Error("db down"); } };
  return db as unknown as PrismaClient;
}

const deps = (s: Scenario = {}) => ({ db: makeDb(s), workspaceId: WS, businessId: BIZ, now: NOW });
const SAFE = { finState: "SAFE", cashState: "SAFE" } as const;
const GROWTH_SPEND_RECOMMENDATION = /Proceed: Spend on marketing|capped,? proof-gated pilot\.?$/i;

describe("N1 hostile matrix — canonical BLOCKED must never surface as legacy scaleAllowed=true", () => {
  it("1. genuine safe business — legacy and canonical both permit; nothing is unnecessarily blocked", async () => {
    const v = await getOwnerWholeBusinessPlan(deps(SAFE));
    expect(v.growth.canonicalGate.allowed).toBe(true);
    expect(v.growth.canonicalGate.reasons).toEqual([]);
    // The adapter adds nothing: blockedBy holds only legacy gate names (no canonical codes).
    expect(v.growth.blockedBy.filter((b) => /_safety_gate|compliance_gate|reading_missing|unavailable/.test(b))).toEqual([]);
    expect(v.growth.scaleAllowed).toBe(v.growth.blockedBy.length === 0);
  });

  it("2. #594 fixture: Finance profit-driven AT_RISK with healthy legacy rows → scaleAllowed=false, no growth-spend recommendation", async () => {
    const v = await getOwnerWholeBusinessPlan(deps({ finState: "AT_RISK", cashState: "SAFE", finFindings: [{ code: "FIN_NEGATIVE_NET_MARGIN", severity: "high" }] }));
    expect(v.growth.scaleAllowed).toBe(false);
    expect(v.growth.canonicalGate.allowed).toBe(false);
    expect(v.growth.canonicalGate.reasons.join(" ")).toMatch(/profit and margin rather than cash/);
    expect(v.growth.blockedBy).toContain("cash_safety_gate");
    expect(v.nextBestAction).not.toMatch(GROWTH_SPEND_RECOMMENDATION);
    expect(v.nextBestAction).toMatch(/Hold growth and scaling spend/);
    expect(v.plan.plan90Day).toMatch(/Do not scale yet/);
    expect(v.doNotDo.join(" ")).toMatch(/owner scale gate/);
    // Ordinary operating spend is NOT globally forbidden: the recommendation keeps operating actions running.
    expect(v.nextBestAction).toMatch(/Keep ordinary operating actions running/);
    expect(v.supervisor.nextBestAction ?? v.nextBestAction).not.toMatch(GROWTH_SPEND_RECOMMENDATION);
  });

  it("3a. genuine cash-driven AT_RISK (cash flow cycle) with healthy legacy rows → blocked", async () => {
    const v = await getOwnerWholeBusinessPlan(deps({ finState: "SAFE", cashState: "AT_RISK" }));
    expect(v.growth.scaleAllowed).toBe(false);
    expect(v.growth.canonicalGate.reasons.join(" ")).toMatch(/Cash survival is at risk/);
    expect(v.nextBestAction).not.toMatch(GROWTH_SPEND_RECOMMENDATION);
  });

  it("3b. cash-driven AT_RISK that the legacy planner ALSO sees (negative cash) → stays blocked, legacy recommendation unchanged", async () => {
    const v = await getOwnerWholeBusinessPlan(deps({ cashInHand: -50_000, finState: "SAFE", cashState: "AT_RISK" }));
    expect(v.growth.scaleAllowed).toBe(false);
    expect(v.dominantConstraint).toBe("cash_survival");
    expect(v.nextBestAction).toMatch(/Protect cash first/);
    expect(v.nextBestAction).not.toMatch(/Hold growth and scaling spend/);
  });

  it("4. CRITICAL / insolvent → blocked", async () => {
    for (const st of ["CRITICAL", "INSOLVENT_RISK"]) {
      const v = await getOwnerWholeBusinessPlan(deps({ finState: st, cashState: "SAFE" }));
      expect(v.growth.scaleAllowed).toBe(false);
      expect(v.growth.blockedBy).toContain("cash_safety_gate");
      expect(v.nextBestAction).not.toMatch(GROWTH_SPEND_RECOMMENDATION);
    }
  });

  it("5a. incomplete evidence: no current cash/Finance reading at all → scale is NOT affirmed (unknown ≠ safe)", async () => {
    const v = await getOwnerWholeBusinessPlan(deps({ finState: null, cashState: null }));
    expect(v.growth.scaleAllowed).toBe(false);
    expect(v.growth.blockedBy).toContain("cash_finance_reading_missing");
    expect(v.nextBestAction).not.toMatch(GROWTH_SPEND_RECOMMENDATION);
  });

  it("5b. incomplete evidence: SAFE state resting on unconfirmed liquidity → scale is NOT affirmed", async () => {
    const v = await getOwnerWholeBusinessPlan(deps({ finState: "SAFE", cashState: null, finFindings: [{ code: LIQUIDITY_UNCONFIRMED_FINDING_CODE }] }));
    expect(v.growth.scaleAllowed).toBe(false);
    expect(v.growth.blockedBy).toContain("cash_safety_gate");
  });

  it("5c. canonical safety state cannot be loaded → fails closed", async () => {
    const v = await getOwnerWholeBusinessPlan(deps({ ...SAFE, failCanonicalLoad: true }));
    expect(v.growth.scaleAllowed).toBe(false);
    expect(v.growth.blockedBy).toContain("safety_state_unavailable");
  });

  it("6. stabilisation not proven (cash/finance CRITICAL, evidence open) → growth held, nothing permissive anywhere", async () => {
    const v = await getOwnerWholeBusinessPlan(deps({ finState: "CRITICAL", cashState: "CRITICAL", equipmentDown: false }));
    expect(v.growth.scaleAllowed).toBe(false);
    const a = await getOwnerActionAssignment(deps({ finState: "CRITICAL", cashState: "CRITICAL" }));
    expect(a.assignment?.actionTitle ?? "").not.toMatch(GROWTH_SPEND_RECOMMENDATION);
    expect(JSON.stringify(a)).not.toMatch(/"scaleAllowed":true/);
  });

  it("7. stabilisation satisfied (SAFE + complete evidence) → canonical permits; unchanged vs legacy", async () => {
    const v = await getOwnerWholeBusinessPlan(deps(SAFE));
    expect(v.growth.canonicalGate.allowed).toBe(true);
  });

  it("capacity block (equipment down) holds growth while cash is SAFE", async () => {
    const v = await getOwnerWholeBusinessPlan(deps({ ...SAFE, equipmentDown: true }));
    expect(v.growth.scaleAllowed).toBe(false);
    expect(v.growth.blockedBy).toContain("capacity_safety_gate");
  });

  it("known gross margin below the floor holds growth", async () => {
    const v = await getOwnerWholeBusinessPlan(deps({ ...SAFE, revenue: 100, costOfGoods: 95 }));
    expect(v.growth.scaleAllowed).toBe(false);
    expect(v.growth.blockedBy).toContain("margin_safety_gate");
  });

  it("action-plan response is derived from the same adapted plan (no growth-spend title when canonical is BLOCKED)", async () => {
    const s = { finState: "AT_RISK", cashState: "SAFE", finFindings: [{ code: "FIN_NEGATIVE_NET_MARGIN" }] };
    const plan = await getOwnerWholeBusinessPlan(deps(s));
    const action = await getOwnerActionAssignment(deps(s));
    expect(action.assignment?.actionTitle).toBe(plan.nextBestAction);
    expect(action.assignment?.actionTitle).not.toMatch(GROWTH_SPEND_RECOMMENDATION);
  });

  it("the safe-action (SOP) downgrade cannot proceed while the canonical scale gate is BLOCKED", async () => {
    const blocked = await getOwnerWholeBusinessPlan(deps({ finState: "AT_RISK", cashState: "SAFE", standingInstruction: { riskClass: "low" } }));
    expect(blocked.supervisor.disposition).not.toBe("proceed");
    expect(blocked.supervisor.disposition).not.toBe("cautious_proceed");
  });
});

describe("N1 — the verdict IS the canonical gate (no second safety calculation)", () => {
  const cases: Array<[string, Scenario]> = [
    ["safe", SAFE],
    ["profit AT_RISK", { finState: "AT_RISK", cashState: "SAFE", finFindings: [{ code: "FIN_NEGATIVE_NET_MARGIN" }] }],
    ["cash AT_RISK", { finState: "SAFE", cashState: "AT_RISK" }],
    ["critical", { finState: "CRITICAL", cashState: "SAFE" }],
    ["capacity", { ...SAFE, equipmentDown: true }],
    ["low margin", { ...SAFE, revenue: 100, costOfGoods: 95 }],
  ];
  for (const [name, s] of cases) {
    it(`${name}: plan.growth.canonicalGate.allowed === evaluateOwnerActionGate(GROW).allowed over the same loaded constraints`, async () => {
      const constraints = await loadOwnerGateConstraints(WS, BIZ, { db: makeDb(s) as never, now: () => NOW });
      const canonical = evaluateOwnerActionGate({ ...constraints, doNotRepeat: [] }, { domain: "marketing", intent: "GROW", findingId: null, findingCode: null });
      const v = await getOwnerWholeBusinessPlan(deps(s));
      expect(v.growth.canonicalGate.allowed).toBe(canonical.allowed);
      if (!canonical.allowed) expect(v.growth.scaleAllowed).toBe(false);
    });
  }
});

describe("N1 — pure gate fail-closed contract", () => {
  it("null constraints → blocked", () => {
    const g = evaluateCanonicalScaleGate(null);
    expect(g.allowed).toBe(false);
    expect(g.blocks[0].code).toBe("safety_state_unavailable");
  });
  it("an audited opt-out follows the canonical gate (everything permitted)", async () => {
    const constraints = await loadOwnerGateConstraints(WS, BIZ, { db: makeDb({ finState: "CRITICAL" }) as never, now: () => NOW });
    expect(evaluateCanonicalScaleGate({ ...constraints, optedOut: true }).allowed).toBe(true);
  });
  it("an unscoped (business-less) evaluation is not affirmed", async () => {
    const constraints = await loadOwnerGateConstraints(WS, BIZ, { db: makeDb(SAFE) as never, now: () => NOW });
    expect(evaluateCanonicalScaleGate({ ...constraints, businessScoped: false }).allowed).toBe(false);
  });
});
