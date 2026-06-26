import { describe, it, expect } from "vitest";
import {
  assessContinuityThreat,
  keyPersonRisk,
  emergencyReserveAdequacy,
  prioritizeContinuityActions,
  assertContinuityReviewed,
  ContinuityRiskError,
  type ContinuityThreat,
} from "@/domain/execution/business-continuity";

const threat = (over: Partial<ContinuityThreat> = {}): ContinuityThreat => ({
  type: "cash_shock",
  likelihood: 0.5,
  impactSeverity: "high",
  contingencyPlanExists: true,
  ...over,
});

describe("[module25] assessContinuityThreat", () => {
  it("classifies high likelihood + critical severity as CRITICAL", () => {
    expect(
      assessContinuityThreat(threat({ likelihood: 0.9, impactSeverity: "critical" }))
    ).toBe("CRITICAL");
  });

  it("classifies low likelihood + low severity as ACCEPTABLE", () => {
    expect(
      assessContinuityThreat(threat({ likelihood: 0.1, impactSeverity: "low" }))
    ).toBe("ACCEPTABLE");
  });

  it("classifies a moderate mid-severity threat as URGENT", () => {
    expect(
      assessContinuityThreat(threat({ likelihood: 0.4, impactSeverity: "high" }))
    ).toBe("URGENT");
  });

  it("escalates one band when no contingency plan exists", () => {
    const withPlan = assessContinuityThreat(
      threat({ likelihood: 0.5, impactSeverity: "high", contingencyPlanExists: true })
    );
    const noPlan = assessContinuityThreat(
      threat({ likelihood: 0.5, impactSeverity: "high", contingencyPlanExists: false })
    );
    expect(withPlan).toBe("URGENT");
    expect(noPlan).toBe("CRITICAL");
  });

  it("escalation is capped at CRITICAL (no overflow)", () => {
    expect(
      assessContinuityThreat(
        threat({ likelihood: 1, impactSeverity: "critical", contingencyPlanExists: false })
      )
    ).toBe("CRITICAL");
  });

  it("never leaves a likely critical-severity threat as ACCEPTABLE", () => {
    const level = assessContinuityThreat(threat({ likelihood: 0.1, impactSeverity: "critical" }));
    expect(level).not.toBe("ACCEPTABLE");
    expect(level).toBe("URGENT");
  });

  it("treats zero likelihood as ACCEPTABLE regardless of severity (with plan)", () => {
    expect(
      assessContinuityThreat(threat({ likelihood: 0, impactSeverity: "critical" }))
    ).toBe("ACCEPTABLE");
  });

  it("clamps out-of-range likelihood without throwing", () => {
    expect(
      assessContinuityThreat(threat({ likelihood: 5, impactSeverity: "critical" }))
    ).toBe("CRITICAL");
    expect(
      assessContinuityThreat(threat({ likelihood: -3, impactSeverity: "low" }))
    ).toBe("ACCEPTABLE");
  });
});

describe("[module25] keyPersonRisk", () => {
  it("is HIGH when owner does most critical tasks with no successor", () => {
    expect(
      keyPersonRisk({ headcount: 5, ownerCriticalTasksPct: 0.9, documentedSuccessor: false })
    ).toBe("HIGH");
  });

  it("is HIGH for a solo operator", () => {
    expect(
      keyPersonRisk({ headcount: 1, ownerCriticalTasksPct: 0.2, documentedSuccessor: false })
    ).toBe("HIGH");
  });

  it("is MEDIUM for moderate owner load with no successor", () => {
    expect(
      keyPersonRisk({ headcount: 6, ownerCriticalTasksPct: 0.5, documentedSuccessor: false })
    ).toBe("MEDIUM");
  });

  it("is LOW when owner load is small across a real team", () => {
    expect(
      keyPersonRisk({ headcount: 10, ownerCriticalTasksPct: 0.2, documentedSuccessor: false })
    ).toBe("LOW");
  });

  it("a documented successor caps HIGH down to MEDIUM", () => {
    expect(
      keyPersonRisk({ headcount: 5, ownerCriticalTasksPct: 0.9, documentedSuccessor: true })
    ).toBe("MEDIUM");
  });

  it("a documented successor caps MEDIUM down to LOW", () => {
    expect(
      keyPersonRisk({ headcount: 6, ownerCriticalTasksPct: 0.5, documentedSuccessor: true })
    ).toBe("LOW");
  });

  it("handles invalid headcount as solo (HIGH)", () => {
    expect(
      keyPersonRisk({ headcount: 0, ownerCriticalTasksPct: 0.1, documentedSuccessor: false })
    ).toBe("HIGH");
  });
});

describe("[module25] emergencyReserveAdequacy", () => {
  it("is ADEQUATE when cover meets the target months", () => {
    const r = emergencyReserveAdequacy({ cashOnHand: 60000, monthlyFixedCost: 10000, targetMonths: 6 });
    expect(r.monthsOfCover).toBe(6);
    expect(r.ratio).toBe(1);
    expect(r.state).toBe("ADEQUATE");
  });

  it("is THIN at half the target", () => {
    const r = emergencyReserveAdequacy({ cashOnHand: 30000, monthlyFixedCost: 10000, targetMonths: 6 });
    expect(r.state).toBe("THIN");
  });

  it("is INSUFFICIENT well below the target", () => {
    const r = emergencyReserveAdequacy({ cashOnHand: 10000, monthlyFixedCost: 10000, targetMonths: 6 });
    expect(r.state).toBe("INSUFFICIENT");
  });

  it("treats zero monthly fixed cost as unbounded ADEQUATE", () => {
    const r = emergencyReserveAdequacy({ cashOnHand: 0, monthlyFixedCost: 0, targetMonths: 6 });
    expect(r.monthsOfCover).toBe(Infinity);
    expect(r.ratio).toBe(Infinity);
    expect(r.state).toBe("ADEQUATE");
  });

  it("yields zero ratio (INSUFFICIENT) when target months is invalid and there is no cash", () => {
    const r = emergencyReserveAdequacy({ cashOnHand: 0, monthlyFixedCost: 10000, targetMonths: 0 });
    expect(r.monthsOfCover).toBe(0);
    expect(r.ratio).toBe(0);
    expect(r.state).toBe("INSUFFICIENT");
  });
});

describe("[module25] prioritizeContinuityActions", () => {
  it("returns an empty array for an empty threat list", () => {
    expect(prioritizeContinuityActions([])).toEqual([]);
  });

  it("orders CRITICAL first and ties break by type name", () => {
    const acceptable = threat({ type: "regulatory_shock", likelihood: 0.05, impactSeverity: "low" });
    const criticalA = threat({
      type: "supply_cutoff",
      likelihood: 0.9,
      impactSeverity: "critical",
      contingencyPlanExists: false,
    });
    const criticalB = threat({
      type: "cash_shock",
      likelihood: 0.9,
      impactSeverity: "critical",
      contingencyPlanExists: false,
    });

    const ordered = prioritizeContinuityActions([acceptable, criticalA, criticalB]);
    expect(ordered.map((o) => o.threat.type)).toEqual([
      "cash_shock", // CRITICAL, type sorts before supply_cutoff
      "supply_cutoff", // CRITICAL
      "regulatory_shock", // ACCEPTABLE last
    ]);
    expect(ordered[0].risk).toBe("CRITICAL");
    expect(ordered[2].risk).toBe("ACCEPTABLE");
  });

  it("does not mutate the input array", () => {
    const input = [
      threat({ type: "facility_loss", likelihood: 0.1, impactSeverity: "low" }),
      threat({ type: "cash_shock", likelihood: 0.9, impactSeverity: "critical", contingencyPlanExists: false }),
    ];
    const snapshot = input.map((t) => t.type);
    prioritizeContinuityActions(input);
    expect(input.map((t) => t.type)).toEqual(snapshot);
  });
});

describe("[module25] assertContinuityReviewed guard", () => {
  it("throws ContinuityRiskError when a CRITICAL threat lacks a contingency plan", () => {
    const threats = [
      threat({ type: "key_person_loss", likelihood: 0.9, impactSeverity: "critical", contingencyPlanExists: false }),
    ];
    expect(() => assertContinuityReviewed(threats, "ref-1")).toThrow(ContinuityRiskError);
  });

  it("includes the code and unmitigated critical types on the error", () => {
    const threats = [
      threat({ type: "key_person_loss", likelihood: 0.9, impactSeverity: "critical", contingencyPlanExists: false }),
      threat({ type: "cash_shock", likelihood: 0.95, impactSeverity: "critical", contingencyPlanExists: false }),
    ];
    try {
      assertContinuityReviewed(threats, "ref-2");
      expect.unreachable("guard should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(ContinuityRiskError);
      const err = e as ContinuityRiskError;
      expect(err.code).toBe("CONTINUITY_RISK_UNMITIGATED");
      expect(err.unmitigatedCriticalTypes).toEqual(["key_person_loss", "cash_shock"]);
      expect(err.message).toContain("ref-2");
    }
  });

  it("does not throw when the CRITICAL threat has a contingency plan", () => {
    const threats = [
      threat({ type: "key_person_loss", likelihood: 0.9, impactSeverity: "critical", contingencyPlanExists: true }),
    ];
    expect(() => assertContinuityReviewed(threats, "ref-3")).not.toThrow();
  });

  it("does not throw on an empty threat list", () => {
    expect(() => assertContinuityReviewed([], "ref-4")).not.toThrow();
  });

  it("does not throw when threats are below CRITICAL even without a plan", () => {
    const threats = [
      threat({ type: "major_client_loss", likelihood: 0.3, impactSeverity: "low", contingencyPlanExists: false }),
    ];
    expect(() => assertContinuityReviewed(threats, "ref-5")).not.toThrow();
  });
});
