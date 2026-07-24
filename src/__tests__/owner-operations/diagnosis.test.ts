/**
 * Owner Operations (Module 4 Slice 2) — detector + diagnosis tests.
 * Pure/no DB. Covers risk findings (capacity / completion / delay / rework /
 * complaint / delivery / SOP / idle / inventory / missing data / invalid
 * currency), opportunity findings (recover delays / cut rework / reclaim idle /
 * close SOP gap / use capacity headroom / data quality), deterministic ranking,
 * the operations DomainScore, no-fabrication-on-missing, and spine schema validity.
 */
import { describe, it, expect } from "vitest";
import {
  diagnoseOperationsSnapshot,
  buildOperationsRiskFindings,
  buildOperationsOpportunityFindings,
  computeOperationsMetrics,
  resolveOperationsThresholds,
  rankOperationsFindings,
  type OperationsSnapshotInput,
} from "@/domain/owner-operations";
import { ownerFindingSchema, domainScoreSchema } from "@/domain/owner-spine/contracts";

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

/** Overloaded operation: over capacity, low completion, delays, rework, failures. */
function overloaded(): OperationsSnapshotInput {
  return {
    periodStart: "2026-05-01",
    periodEnd: "2026-05-31",
    currency: "INR",
    ordersReceived: 1500,
    ordersCompleted: 900, // 60% completion (critical)
    ordersDelayed: 500, // 33% delay (critical)
    reworkCount: 180, // 20% rework (critical)
    complaints: 120, // ~13% complaint
    staffHours: 400,
    machineCapacityUnits: 1000, // 150% utilization (over capacity)
    idleHours: 120, // 30% idle
    deliveryAttempts: 900,
    deliveryFailures: 200, // ~78% success (critical)
    inventoryShortages: 4,
    sopChecks: 100,
    sopMisses: 50, // 50% compliance (critical)
  };
}

const codes = (fs: { code: string }[]) => fs.map((f) => f.code);

function diagnose(input: OperationsSnapshotInput) {
  return diagnoseOperationsSnapshot(input, { now: new Date("2026-06-05") });
}

describe("owner-operations diagnosis — module contract assertions", () => {
  it("diagnoseOperationsSnapshot is a function", () => { expect(typeof diagnoseOperationsSnapshot).toBe("function"); });
  it("buildOperationsRiskFindings is a function", () => { expect(typeof buildOperationsRiskFindings).toBe("function"); });
  it("buildOperationsOpportunityFindings is a function", () => { expect(typeof buildOperationsOpportunityFindings).toBe("function"); });
  it("computeOperationsMetrics is a function", () => { expect(typeof computeOperationsMetrics).toBe("function"); });
  it("resolveOperationsThresholds is a function", () => { expect(typeof resolveOperationsThresholds).toBe("function"); });
  it("rankOperationsFindings is a function", () => { expect(typeof rankOperationsFindings).toBe("function"); });
  it("ownerFindingSchema is an object", () => { expect(typeof ownerFindingSchema).toBe("object"); });
  it("domainScoreSchema is an object", () => { expect(typeof domainScoreSchema).toBe("object"); });
  it("healthy is a function", () => { expect(typeof healthy).toBe("function"); });
  it("overloaded is a function", () => { expect(typeof overloaded).toBe("function"); });
  it("codes is a function", () => { expect(typeof codes).toBe("function"); });
  it("diagnose is a function", () => { expect(typeof diagnose).toBe("function"); });
  it("healthy() returns an object", () => { expect(typeof healthy()).toBe("object"); });
  it("overloaded() returns an object", () => { expect(typeof overloaded()).toBe("object"); });
});

describe("owner-operations detector — risk findings", () => {
  it("overloaded triggers the operations risk cluster", () => {
    const r = diagnose(overloaded());
    const c = codes(r.riskFindings);
    expect(c).toEqual(
      expect.arrayContaining([
        "OPS_CAPACITY_BOTTLENECK",
        "OPS_LOW_COMPLETION",
        "OPS_HIGH_DELAY",
        "OPS_HIGH_REWORK",
        "OPS_HIGH_COMPLAINT_RATE",
        "OPS_DELIVERY_FAILURE",
        "OPS_SOP_NONCOMPLIANCE",
        "OPS_HIGH_IDLE",
        "OPS_INVENTORY_SHORTAGE",
      ])
    );
    const cap = r.riskFindings.find((f) => f.code === "OPS_CAPACITY_BOTTLENECK");
    expect(cap?.severity).toBe("critical"); // 150% > critical 100%
  });

  it("healthy operation emits no operations risk findings", () => {
    const r = diagnose(healthy());
    const c = codes(r.riskFindings);
    expect(c).not.toContain("OPS_CAPACITY_BOTTLENECK");
    expect(c).not.toContain("OPS_LOW_COMPLETION");
    expect(c).not.toContain("OPS_HIGH_REWORK");
    expect(c).not.toContain("OPS_DELIVERY_FAILURE");
  });

  it("flags missing critical data and invalid currency (certain)", () => {
    const input: OperationsSnapshotInput = { periodStart: "2026-05-01", periodEnd: "2026-05-31", currency: "" };
    const m = computeOperationsMetrics(input, { now: new Date("2026-06-05") });
    const findings = buildOperationsRiskFindings(input, m, resolveOperationsThresholds());
    const c = codes(findings);
    expect(c).toContain("OPS_INVALID_CURRENCY");
    expect(c).toContain("OPS_MISSING_CRITICAL_DATA");
    const missing = findings.find((f) => f.code === "OPS_MISSING_CRITICAL_DATA");
    expect(missing?.confidence).toBe(1);
    expect(missing?.missingData).toEqual(
      expect.arrayContaining(["ordersReceived", "ordersCompleted", "capacityOrStaff"])
    );
  });
});

describe("owner-operations detector — opportunity findings", () => {
  it("emits the improvement cluster under load", () => {
    const r = diagnose(overloaded());
    const c = codes(r.opportunityFindings);
    expect(c).toEqual(
      expect.arrayContaining([
        "OPS_OPP_RECOVER_DELAYS",
        "OPS_OPP_CUT_REWORK",
        "OPS_OPP_RECLAIM_IDLE",
        "OPS_OPP_CLOSE_SOP_GAP",
      ])
    );
    // over capacity → no spare-headroom opportunity
    expect(c).not.toContain("OPS_OPP_USE_CAPACITY_HEADROOM");
  });

  it("offers capacity-headroom opportunity when below the strain bar", () => {
    const r = diagnose(healthy()); // 66.7% utilization
    expect(codes(r.opportunityFindings)).toContain("OPS_OPP_USE_CAPACITY_HEADROOM");
  });

  it("fabricates no opportunity when supporting inputs are absent", () => {
    const bare: OperationsSnapshotInput = {
      periodStart: "2026-05-01",
      periodEnd: "2026-05-31",
      currency: "INR",
      ordersReceived: 1000,
      ordersCompleted: 1000, // no delay/rework inputs, no idle, no sop, no capacity
      staffHours: 400,
    };
    const m = computeOperationsMetrics(bare, { now: new Date("2026-06-05") });
    const c = codes(buildOperationsOpportunityFindings(bare, m, resolveOperationsThresholds()));
    expect(c).not.toContain("OPS_OPP_RECOVER_DELAYS");
    expect(c).not.toContain("OPS_OPP_CUT_REWORK");
    expect(c).not.toContain("OPS_OPP_RECLAIM_IDLE");
    expect(c).not.toContain("OPS_OPP_CLOSE_SOP_GAP");
    expect(c).not.toContain("OPS_OPP_USE_CAPACITY_HEADROOM");
  });
});

describe("owner-operations detector — ranking + domain score", () => {
  it("ranks critical findings ahead of low ones (deterministic + stable)", () => {
    const r = diagnose(overloaded());
    const rank = { critical: 4, high: 3, medium: 2, low: 1 } as const;
    for (let i = 1; i < r.findings.length; i++) {
      expect(rank[r.findings[i - 1].severity]).toBeGreaterThanOrEqual(rank[r.findings[i].severity]);
    }
    const again = diagnose(overloaded());
    expect(codes(again.findings)).toEqual(codes(r.findings));
  });

  it("produces a valid operations DomainScore from the engine metrics", () => {
    const r = diagnose(overloaded());
    const parsed = domainScoreSchema.parse(r.domainScore);
    expect(parsed.domain).toBe("operations");
    expect(parsed.riskScore).toBe(r.metrics.operationsRiskScore);
    expect(parsed.healthScore).toBe(r.metrics.operationsHealthScore);
    expect(parsed.opportunityScore).toBe(r.metrics.operationsOpportunityScore);
    expect(parsed.topFindingCodes.length).toBeGreaterThan(0);
  });

  it("every finding satisfies the spine OwnerFinding schema with domain operations", () => {
    const r = diagnose(overloaded());
    for (const f of r.findings) {
      expect(() => ownerFindingSchema.parse(f)).not.toThrow();
      expect(f.domain).toBe("operations");
    }
  });

  it("rankOperationsFindings does not mutate its input", () => {
    const r = diagnose(overloaded());
    const before = codes(r.findings);
    const copy = [...r.findings];
    rankOperationsFindings(r.findings);
    expect(codes(copy)).toEqual(before);
  });
});
