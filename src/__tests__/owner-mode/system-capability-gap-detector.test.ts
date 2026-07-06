/**
 * OpsIQ Capability Gap Detector / System Feature Recommendation Engine (pure).
 *
 * Exercises grouping signals into per-capability recommendations, severity/evidence/unlocked-action
 * aggregation, priority ranking, the summary counts, empty input, workspace scoping, the "recommended not
 * auto-built" + "material stays owner-controlled" governance guarantees, and the safety rules (no fabricated
 * money, no fraud/negligence/HR-discipline label, no hidden score). Covers >=8 missing-capability types.
 */
import { describe, it, expect } from "vitest";
import {
  buildCapabilityGapDetector,
  type CapabilityGapInput,
  type CapabilityGapSignal,
  type MissingCapabilityType,
} from "@/domain/owner-mode/system-capability-gap-detector";

const AT = "2026-07-06T00:00:00.000Z";
const WS = "ws-1";

function signal(over: Partial<CapabilityGapSignal> = {}): CapabilityGapSignal {
  return {
    signalType: "MISSING_OPERATIONAL_DATA", missingCapability: "CUSTOMER_FEEDBACK_INTAKE",
    detail: "complaint/rework data arrives ad hoc", severity: "MEDIUM", evidenceRefs: [],
    blocksAutomationOf: null, missingData: [], ...over,
  };
}
const input = (signals: CapabilityGapSignal[], dataConfidence: CapabilityGapInput["dataConfidence"] = "MEDIUM"): CapabilityGapInput => ({ signals, dataConfidence });
const build = (s: CapabilityGapSignal[], ws = WS, dc: CapabilityGapInput["dataConfidence"] = "MEDIUM") => buildCapabilityGapDetector(input(s, dc), ws, AT);

const EIGHT_TYPES: MissingCapabilityType[] = [
  "VERIFIED_FINANCIAL_LEDGER", "REFUND_RECONCILIATION", "MARGIN_SIMULATION", "SPEND_CONTROL_LEDGER",
  "COMPENSATION_INTEGRATION", "CONTRACT_TERMS_REGISTRY", "LEGAL_REVIEW_WORKFLOW", "IDENTITY_EVIDENCE_CHAIN",
];

describe("system-capability-gap-detector", () => {
  it("1. produces one recommendation per distinct missing capability", () => {
    const r = build([
      signal({ missingCapability: "REFUND_RECONCILIATION" }),
      signal({ missingCapability: "MARGIN_SIMULATION" }),
    ]);
    expect(r.recommendations).toHaveLength(2);
    expect(new Set(r.recommendations.map((x) => x.capabilityType)).size).toBe(2);
  });

  it("2. groups multiple signals for the same capability into one recommendation with a signal count", () => {
    const r = build([
      signal({ missingCapability: "REFUND_RECONCILIATION", evidenceRefs: ["e1"] }),
      signal({ missingCapability: "REFUND_RECONCILIATION", evidenceRefs: ["e2"] }),
    ]);
    expect(r.recommendations).toHaveLength(1);
    expect(r.recommendations[0].signalCount).toBe(2);
    expect(r.recommendations[0].evidenceRefs.sort()).toEqual(["e1", "e2"]);
  });

  it("3. aggregates to the most severe signal for a capability", () => {
    const r = build([
      signal({ missingCapability: "VERIFIED_FINANCIAL_LEDGER", severity: "LOW" }),
      signal({ missingCapability: "VERIFIED_FINANCIAL_LEDGER", severity: "CRITICAL" }),
    ]);
    expect(r.recommendations[0].severity).toBe("CRITICAL");
  });

  it("4. surfaces >=8 distinct missing-capability types", () => {
    const r = build(EIGHT_TYPES.map((t) => signal({ missingCapability: t })));
    expect(r.recommendations.length).toBe(8);
    expect(new Set(r.recommendations.map((x) => x.capabilityType)).size).toBe(8);
  });

  it("5. unlocksAutomation only when a signal blocks a real action and the capability can unlock it", () => {
    const r = build([signal({ missingCapability: "REFUND_RECONCILIATION", blocksAutomationOf: "REFUND_ABOVE_THRESHOLD" })]);
    const rec = r.recommendations[0];
    expect(rec.unlocksAutomation).toBe(true);
    expect(rec.unlockedActionTypes).toEqual(["REFUND_ABOVE_THRESHOLD"]);
  });

  it("6. a capability that cannot unlock automation stays unlocksAutomation=false even if a signal names an action", () => {
    const r = build([signal({ missingCapability: "COMPENSATION_INTEGRATION", blocksAutomationOf: "PAYROLL_CHANGE" })]);
    expect(r.recommendations[0].unlocksAutomation).toBe(false);
  });

  it("7. dependsOnData + missingData reflect data gaps", () => {
    const r = build([signal({ missingCapability: "CUSTOMER_FEEDBACK_INTAKE", missingData: ["no complaint/rework data"] })]);
    expect(r.recommendations[0].dependsOnData).toBe(true);
    expect(r.recommendations[0].missingData).toEqual(["no complaint/rework data"]);
  });

  it("8. recommendations are ranked most-severe first, then by signal count", () => {
    const r = build([
      signal({ missingCapability: "CUSTOMER_FEEDBACK_INTAKE", severity: "LOW" }),
      signal({ missingCapability: "MARGIN_SIMULATION", severity: "HIGH" }),
      signal({ missingCapability: "MARGIN_SIMULATION", severity: "HIGH" }),
      signal({ missingCapability: "VERIFIED_FINANCIAL_LEDGER", severity: "CRITICAL" }),
    ]);
    expect(r.recommendations[0].capabilityType).toBe("VERIFIED_FINANCIAL_LEDGER");
    expect(r.recommendations.map((x) => x.priorityRank)).toEqual([1, 2, 3]);
    expect(r.topRecommendation!.capabilityType).toBe("VERIFIED_FINANCIAL_LEDGER");
  });

  it("9. summary counts total, critical, high, and unlocks-automation", () => {
    const r = build([
      signal({ missingCapability: "VERIFIED_FINANCIAL_LEDGER", severity: "CRITICAL" }),
      signal({ missingCapability: "MARGIN_SIMULATION", severity: "HIGH", blocksAutomationOf: "PRICING_CHANGE" }),
      signal({ missingCapability: "CUSTOMER_FEEDBACK_INTAKE", severity: "LOW" }),
    ]);
    expect(r.summary.total).toBe(3);
    expect(r.summary.critical).toBe(1);
    expect(r.summary.high).toBe(1);
    expect(r.summary.unlocksAutomation).toBe(1);
  });

  it("10. every recommendation is RECOMMENDED — never auto-built — with a fixed complexity band", () => {
    const r = build(EIGHT_TYPES.map((t) => signal({ missingCapability: t })));
    expect(r.recommendations.every((x) => x.status === "RECOMMENDED")).toBe(true);
    expect(r.recommendations.every((x) => ["LOW", "MEDIUM", "HIGH"].includes(x.estimatedComplexity))).toBe(true);
  });

  it("11. every recommendation carries a material-control governance guardrail or an assist-only guardrail", () => {
    const r = build(EIGHT_TYPES.map((t) => signal({ missingCapability: t })));
    expect(r.recommendations.every((x) => x.governanceGuardrail.length > 20)).toBe(true);
    // A material-capability guardrail keeps the owner in control.
    const fin = r.recommendations.find((x) => x.capabilityType === "VERIFIED_FINANCIAL_LEDGER")!;
    expect(fin.governanceGuardrail.toLowerCase()).toMatch(/owner-controlled/);
  });

  it("12. empty input yields no recommendations, a null top, and a zeroed summary", () => {
    const r = build([]);
    expect(r.recommendations).toHaveLength(0);
    expect(r.topRecommendation).toBeNull();
    expect(r.summary).toEqual({ total: 0, critical: 0, high: 0, unlocksAutomation: 0 });
  });

  it("13. confidence falls back to MEDIUM when data confidence is null, else uses it", () => {
    expect(build([signal()], WS, null).recommendations[0].confidence).toBe("MEDIUM");
    expect(build([signal()], WS, "LOW").recommendations[0].confidence).toBe("LOW");
  });

  it("14. workspace scoping: every recommendation carries the workspace and cannot contaminate another", () => {
    const r = build([signal({ missingCapability: "MARGIN_SIMULATION" })], "ws-2");
    expect(r.workspaceId).toBe("ws-2");
    expect(r.recommendations.every((x) => x.workspaceId === "ws-2")).toBe(true);
  });

  it("15. no fabricated money figure in any recommendation text", () => {
    const r = build(EIGHT_TYPES.map((t) => signal({ missingCapability: t, severity: "HIGH" })));
    for (const rec of r.recommendations) {
      const prose = `${rec.problemStatement} ${rec.recommendedCapability} ${rec.ownerBenefit} ${rec.governanceGuardrail}`;
      expect(prose).not.toMatch(/[$£€]\s?\d/);
      expect(prose).not.toMatch(/\d+\s*(dollars|pounds|euros|rupees)/i);
    }
  });

  it("16. no fraud/negligence/HR-discipline label and no hidden score in generated text", () => {
    const r = build([
      signal({ missingCapability: "COMPENSATION_INTEGRATION", severity: "HIGH" }),
      signal({ missingCapability: "IDENTITY_EVIDENCE_CHAIN", severity: "HIGH" }),
    ]);
    for (const rec of r.recommendations) {
      const prose = `${rec.title} ${rec.problemStatement} ${rec.recommendedCapability} ${rec.ownerBenefit} ${rec.governanceGuardrail}`.toLowerCase();
      expect(prose).not.toMatch(/\b(fraud|theft|thief|negligent|negligence|lazy|dishonest)\b/);
      expect(prose).not.toMatch(/\b(fire|fired|firing|terminate|payroll|salary|discipline|disciplinary|punish|suspend)\b/);
      expect(prose).not.toMatch(/hidden\s*score/);
    }
  });
});
