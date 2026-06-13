/**
 * Owner Operations (Module 4 Slice 3) — recommendation/action planner tests.
 * Pure/no DB. Verifies traceable recommendations, action conformance to the Spine
 * schema, bounded + deterministic pressure-weighted priority, ranking,
 * no-invention (every emitted finding has a template), template traceability, and
 * that the recommended next action targets the most urgent operations problem.
 */
import { describe, it, expect } from "vitest";
import {
  diagnoseOperationsSnapshot,
  planOperationsActionsFromDiagnosis,
  buildOperationsRecommendations,
  OPERATIONS_REC_TEMPLATES,
  type OperationsSnapshotInput,
} from "@/domain/owner-operations";
import {
  ownerActionSchema,
  OWNER_ACTION_STATUSES,
  calculateOwnerPriorityScore,
} from "@/domain/owner-spine/contracts";

const NOW = new Date("2026-06-05T00:00:00.000Z");

function healthy(): OperationsSnapshotInput {
  return {
    periodStart: "2026-05-01",
    periodEnd: "2026-05-31",
    currency: "INR",
    ordersReceived: 1000,
    ordersCompleted: 980,
    ordersDelayed: 20,
    reworkCount: 10,
    complaints: 5,
    staffHours: 400,
    machineCapacityUnits: 1500,
    idleHours: 20,
    deliveryAttempts: 980,
    deliveryFailures: 10,
    inventoryShortages: 0,
    sopChecks: 100,
    sopMisses: 2,
  };
}

function overloaded(): OperationsSnapshotInput {
  return {
    periodStart: "2026-05-01",
    periodEnd: "2026-05-31",
    currency: "INR",
    ordersReceived: 1500,
    ordersCompleted: 900,
    ordersDelayed: 500,
    reworkCount: 180,
    complaints: 120,
    staffHours: 400,
    machineCapacityUnits: 1000,
    idleHours: 120,
    deliveryAttempts: 900,
    deliveryFailures: 200,
    inventoryShortages: 4,
    sopChecks: 100,
    sopMisses: 50,
  };
}

function plan(input: OperationsSnapshotInput) {
  return planOperationsActionsFromDiagnosis(diagnoseOperationsSnapshot(input, { now: NOW }));
}
const actionCodes = (p: { actions: { findingCode: string }[] }) =>
  p.actions.map((a) => a.findingCode);

describe("owner-operations planner — recommendation/action creation", () => {
  it("capacity bottleneck creates a relieve-capacity action", () => {
    const p = plan(overloaded());
    expect(actionCodes(p)).toContain("OPS_CAPACITY_BOTTLENECK");
    const rec = p.recommendations.find((r) => r.findingCode === "OPS_CAPACITY_BOTTLENECK");
    expect(rec?.category).toBe("relieve_capacity");
    expect(rec?.recommendationCode).toBe("OPSREC_RELIEVE_CAPACITY");
  });

  it("rework finding creates a reduce-rework action", () => {
    const p = plan(overloaded());
    expect(actionCodes(p)).toContain("OPS_HIGH_REWORK");
    const rec = p.recommendations.find((r) => r.findingCode === "OPS_HIGH_REWORK");
    expect(rec?.category).toBe("reduce_rework");
  });

  it("recommendations are traceable to a real source metric/value", () => {
    const p = plan(overloaded());
    const rec = p.recommendations.find((r) => r.findingCode === "OPS_CAPACITY_BOTTLENECK");
    expect(rec?.sourceMetric).toBe("capacityUtilizationPct");
    expect(typeof rec?.sourceValue).toBe("number");
    expect(rec?.verificationMetric).toBe("capacityUtilizationPct");
  });
});

describe("owner-operations planner — actions conform + prioritise", () => {
  it("every action satisfies the Spine OwnerAction schema (proposed, operations)", () => {
    const p = plan(overloaded());
    expect(p.actions.length).toBeGreaterThan(0);
    for (const a of p.actions) {
      expect(() => ownerActionSchema.parse(a)).not.toThrow();
      expect(a.domain).toBe("operations");
      expect(a.status).toBe("proposed");
      expect(OWNER_ACTION_STATUSES).toContain(a.status);
      expect(a.priorityScore).toBeGreaterThanOrEqual(0);
      expect(a.priorityScore).toBeLessThanOrEqual(100);
      expect(Number.isInteger(a.priorityScore)).toBe(true);
    }
  });

  it("ranks by descending priority and recommends a critical-severity top action", () => {
    const p = plan(overloaded());
    for (let i = 1; i < p.actions.length; i++) {
      expect(p.actions[i - 1].priorityScore).toBeGreaterThanOrEqual(p.actions[i].priorityScore);
    }
    expect(p.recommendedNextAction).toEqual(p.actions[0]);
    expect(p.recommendedNextAction?.severity).toBe("critical");
  });

  it("priority is pressure-weighted: operations risk lifts the same action", () => {
    const p = plan(overloaded());
    const risk = diagnoseOperationsSnapshot(overloaded(), { now: NOW }).metrics.operationsRiskScore;
    const rec = p.recommendations.find((r) => r.findingCode === "OPS_CAPACITY_BOTTLENECK")!;
    const weighted = calculateOwnerPriorityScore({
      expectedImpactScore: rec.expectedOpsImpactScore,
      confidence: rec.confidence,
      urgencyScore: rec.urgencyScore,
      effortScore: rec.effortScore,
      severity: rec.severity,
      survivalRiskScore: risk,
    });
    const unweighted = calculateOwnerPriorityScore({
      expectedImpactScore: rec.expectedOpsImpactScore,
      confidence: rec.confidence,
      urgencyScore: rec.urgencyScore,
      effortScore: rec.effortScore,
      severity: rec.severity,
      survivalRiskScore: 0,
    });
    expect(weighted).toBeGreaterThanOrEqual(unweighted);
    const action = p.actions.find((a) => a.findingCode === "OPS_CAPACITY_BOTTLENECK");
    expect(action?.priorityScore).toBe(weighted);
  });
});

describe("owner-operations planner — no invention / completeness", () => {
  it("every emitted finding has a recommendation template (no missing inputs)", () => {
    for (const input of [healthy(), overloaded()]) {
      const diag = diagnoseOperationsSnapshot(input, { now: NOW });
      const p = planOperationsActionsFromDiagnosis(diag);
      expect(p.missingActionInputs).toEqual([]);
      const withTemplate = diag.findings.filter((f) => OPERATIONS_REC_TEMPLATES[f.code]);
      expect(p.recommendations.length).toBe(withTemplate.length);
    }
  });

  it("does not mutate diagnosis findings", () => {
    const diag = diagnoseOperationsSnapshot(overloaded(), { now: NOW });
    const before = JSON.parse(JSON.stringify(diag.findings));
    planOperationsActionsFromDiagnosis(diag);
    expect(diag.findings).toEqual(before);
  });

  it("buildOperationsRecommendations skips findings with no template", () => {
    const recs = buildOperationsRecommendations([
      {
        domain: "operations",
        code: "OPS_UNKNOWN_NOT_A_TEMPLATE",
        title: "x",
        summary: "x",
        sourceMetric: "x",
        sourceValue: null,
        threshold: null,
        severity: "low",
        confidence: 1,
        impactScore: 10,
        urgencyScore: 10,
        findingType: "risk",
        evidence: [],
        missingData: [],
      },
    ]);
    expect(recs).toEqual([]);
  });
});
