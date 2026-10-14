/**
 * Pure invariants for the false-survival-triage P2: a data gap is never a crisis, a signal's category is its
 * meaning, an evidence-only Finance state is not a margin reading, and the Cockpit's "highest risk" reads
 * risk — not maturity.
 */
import { describe, it, expect } from "vitest";
import { buildOwnerRecoveryStatus, cashSeverityFromProtectionSignals, deriveCrisisInput } from "@/domain/owner-mode/owner-recovery-status";
import { deriveBusinessConditionSignals, type BusinessConditionSignalInputs } from "@/services/business-condition/business-condition-profile.service";
import { conditionRiskLevel, highestConditionRisk } from "@/domain/business-condition/condition-risk";
import { financeSurvivalDriver } from "@/domain/owner-spine/owner-decision";

const sig = (category: string, severity: string) => ({ category, severity });
const base: BusinessConditionSignalInputs = {
  cashRunwayDays: 0, supplierInventoryRiskScore: 0, ownerLoadPct: 0, staffOverloadPct: 0, ownerOverloaded: false, staffOverloaded: false,
  capacityUtilizationPct: 0, complaintsCount: 0, reworkCount: 0, overdueProofCount: 0, outcomeChecksDue: 0, churnRiskScore: 0, growthReadinessTier: "NOT_READY",
};

describe("DATA_SIGNAL_NEVER_FEEDS_CASH_PRESSURE", () => {
  it("a DATA top signal contributes no cash severity, whatever its severity", () => {
    for (const sev of ["LOW", "MEDIUM", "HIGH", "CRITICAL"]) expect(cashSeverityFromProtectionSignals([sig("DATA", sev)])).toBeNull();
  });
  it("a data-gap-only workspace derives NO crisis (no survival triage)", () => {
    const c = deriveCrisisInput({ caseId: "rc", archetype: "laundry_local_service", cashSeverity: cashSeverityFromProtectionSignals([sig("DATA", "LOW")]), missingData: ["your bank balance"] });
    expect(c).toBeNull();
    const out = buildOwnerRecoveryStatus({ crisis: c });
    expect(out.ok && out.status.recoveryStatus).toBe("NONE");
    expect(out.ok && JSON.stringify(out.status)).not.toMatch(/Stop-loss in force|loss-making/i);
  });
});

describe("MARGIN_SIGNAL_NEVER_MASQUERADES_AS_CASH", () => {
  it.each(["MARGIN", "PRICING", "COST", "WORKING_CAPITAL"])("a %s signal, however severe, is not cash severity", (category) => {
    expect(cashSeverityFromProtectionSignals([sig(category, "CRITICAL")])).toBeNull();
  });
  it("only CASH-category signals set cash severity, and the most severe wins regardless of order", () => {
    expect(cashSeverityFromProtectionSignals([sig("MARGIN", "CRITICAL"), sig("CASH", "MEDIUM"), sig("CASH", "HIGH"), sig("DATA", "LOW")])).toBe("HIGH");
    expect(cashSeverityFromProtectionSignals(null)).toBeNull();
    expect(cashSeverityFromProtectionSignals([])).toBeNull();
  });
});

describe("TRUE_CASH_RISK_STILL_TRIGGERS_RECOVERY", () => {
  it.each(["MEDIUM", "HIGH", "CRITICAL"])("a %s CASH signal opens a recovery case with the gates blocked", (sev) => {
    const c = deriveCrisisInput({ caseId: "rc", archetype: "laundry_local_service", cashSeverity: cashSeverityFromProtectionSignals([sig("CASH", sev)]) });
    expect(c).not.toBeNull();
    const out = buildOwnerRecoveryStatus({ crisis: c });
    expect(out.ok && out.status.recoveryStatus).not.toBe("NONE");
    expect(out.ok && out.status.thriveGate).toBe("BLOCKED");
  });
  it("other genuine pressures (quality, operations, workload) still open a case", () => {
    expect(deriveCrisisInput({ caseId: "rc", archetype: "laundry_local_service", qualitySeverity: "HIGH" })).not.toBeNull();
    expect(deriveCrisisInput({ caseId: "rc", archetype: "laundry_local_service", operationalSeverity: "MEDIUM" })).not.toBeNull();
    expect(deriveCrisisInput({ caseId: "rc", archetype: "laundry_local_service", workloadSeverity: "CRITICAL" })).not.toBeNull();
  });
});

describe("LOW signals are observations, not crises", () => {
  it("LOW pressure alone derives no crisis; MEDIUM does", () => {
    expect(deriveCrisisInput({ caseId: "rc", archetype: "laundry_local_service", cashSeverity: "LOW", qualitySeverity: "LOW", operationalSeverity: "LOW" })).toBeNull();
    expect(deriveCrisisInput({ caseId: "rc", archetype: "laundry_local_service", cashSeverity: "LOW", qualitySeverity: "MEDIUM" })).not.toBeNull();
  });
});

describe("UNCONFIRMED_LIQUIDITY_NEVER_IMPLIES_MARGIN_HIGH", () => {
  const findings = (...f: Array<[string, string]>) => f.map(([code, severity]) => ({ code, severity }));
  it("Finance findings that are only evidence conditions have no survival driver", () => {
    expect(financeSurvivalDriver(findings(["FIN_LIQUIDITY_UNCONFIRMED", "medium"], ["FIN_OPP_DATA_QUALITY", "low"]))).toBeNull();
  });
  it("an AT_RISK/WATCH Finance state with no driver is not a margin-pressure level", () => {
    for (const finState of ["AT_RISK", "WATCH", "CRITICAL"]) {
      expect(deriveBusinessConditionSignals({ ...base, finState, financeDriver: null }).marginPressureLevel).toBe("unknown");
    }
  });
  it("PROFIT_DRIVER_CAN_SET_MARGIN_PRESSURE: a profit-driven Finance state keeps its margin mapping (genuine risk not lowered)", () => {
    expect(deriveBusinessConditionSignals({ ...base, finState: "AT_RISK", financeDriver: "profit" }).marginPressureLevel).toBe("HIGH");
    expect(deriveBusinessConditionSignals({ ...base, finState: "CRITICAL", financeDriver: "profit" }).marginPressureLevel).toBe("CRITICAL");
    expect(deriveBusinessConditionSignals({ ...base, finState: "WATCH", financeDriver: "profit" }).marginPressureLevel).toBe("MEDIUM");
  });
  it("CASH_DRIVER_NEVER_MASQUERADES_AS_MARGIN: a cash-driven Finance state alone is not margin pressure (cash-only AT_RISK fixture)", () => {
    // Finance AT_RISK, canonical driver = cash, no profit/margin finding.
    const cashOnly = deriveBusinessConditionSignals({ ...base, finState: "AT_RISK", financeDriver: "cash" });
    expect(cashOnly.marginPressureLevel).toBe("unknown");
    for (const finState of ["WATCH", "AT_RISK", "CRITICAL", "INSOLVENT_RISK"]) {
      expect(deriveBusinessConditionSignals({ ...base, finState, financeDriver: "cash" }).marginPressureLevel).toBe("unknown");
    }
    // Cash pressure comes from the cash source, not from the Finance state.
    expect(deriveBusinessConditionSignals({ ...base, cashState: "AT_RISK", finState: "AT_RISK", financeDriver: "cash" })).toMatchObject({ cashPressureLevel: "HIGH", marginPressureLevel: "unknown" });
  });
  it("findings unavailable to the caller (undefined driver) keep the legacy mapping — risk is never hidden for want of findings", () => {
    expect(deriveBusinessConditionSignals({ ...base, finState: "AT_RISK" }).marginPressureLevel).toBe("HIGH");
  });
});

describe("CONDITION_POLARITY_MATRIX: Cockpit 'highest risk' reads risk, not maturity", () => {
  it("HIGH maturity / resilience / headroom / growth-ready are LOW risk", () => {
    for (const f of ["processMaturityLevel", "managementMaturityLevel", "resilienceLevel", "executionCapacityLevel", "growthReadinessLevel"]) {
      expect(conditionRiskLevel(f, "HIGH")).toBe("LOW");
    }
  });
  it("LOW maturity / resilience / headroom and a blocked growth gate ARE risk", () => {
    expect(conditionRiskLevel("processMaturityLevel", "LOW")).toBe("HIGH");
    expect(conditionRiskLevel("resilienceLevel", "LOW")).toBe("HIGH");
    expect(conditionRiskLevel("executionCapacityLevel", "CRITICAL")).toBe("CRITICAL");
    expect(conditionRiskLevel("growthReadinessLevel", "BLOCKED")).toBe("HIGH");
  });
  it("pressure dimensions keep their own scale", () => {
    expect(conditionRiskLevel("cashPressureLevel", "CRITICAL")).toBe("CRITICAL");
    expect(conditionRiskLevel("marginPressureLevel", "HIGH")).toBe("HIGH");
    expect(conditionRiskLevel("ownerDependencyRisk", "MEDIUM")).toBe("MEDIUM");
    expect(conditionRiskLevel("cashPressureLevel", "HIGH")).toBe("HIGH");
    expect(conditionRiskLevel("marginPressureLevel", "CRITICAL")).toBe("CRITICAL");
    expect(conditionRiskLevel("cashPressureLevel", "unknown")).toBe("unknown");
  });
  it("the healthy-profit, unknown-bank condition reads no HIGH risk; real danger still does", () => {
    const healthy = { cashPressureLevel: "unknown", marginPressureLevel: "unknown", processMaturityLevel: "HIGH", managementMaturityLevel: "HIGH", growthReadinessLevel: "unknown" };
    expect(highestConditionRisk(healthy)).toBe("LOW");
    expect(highestConditionRisk({ ...healthy, marginPressureLevel: "HIGH" })).toBe("HIGH");
    expect(highestConditionRisk({ ...healthy, cashPressureLevel: "CRITICAL" })).toBe("CRITICAL");
  });
  it("no evidence at all is unknown — never fabricated LOW/safe", () => {
    expect(highestConditionRisk({ cashPressureLevel: "unknown", marginPressureLevel: "unknown" })).toBe("unknown");
    expect(highestConditionRisk({})).toBe("unknown");
  });
});
