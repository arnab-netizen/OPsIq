import { describe, it, expect } from "vitest";
import { ARCHETYPE_PACK_CASES, ARCHETYPE_NAMES } from "@/domain/collective-training/simulation/archetype-packs.cases";
import { evaluateCollective } from "@/domain/collective-training/simulation/collective-scoring";
import { runCollective } from "@/domain/collective-training/collective-engine";

describe("[C17] archetype collective simulations", () => {
  it("has 3 archetypes × 30 cases = 90", () => {
    expect(ARCHETYPE_NAMES).toEqual(["universal", "laundry", "housekeeping"]);
    expect(ARCHETYPE_PACK_CASES.length).toBe(90);
    for (const a of ARCHETYPE_NAMES) expect(ARCHETYPE_PACK_CASES.filter((c) => c.archetype === a).length).toBe(30);
  });
  it("laundry capacity/quality/pricing cases exist and pass", () => {
    const laundry = ARCHETYPE_PACK_CASES.filter((c) => c.archetype === "laundry");
    for (const dom of ["capacity", "quality", "pricing-decisions"]) {
      expect(laundry.some((c) => c.expected.bindingDomain === dom)).toBe(true);
    }
  });
  it("housekeeping workload/roster/compliance cases exist and pass", () => {
    const hk = ARCHETYPE_PACK_CASES.filter((c) => c.archetype === "housekeeping");
    for (const dom of ["staff-workload", "owner-workload", "risk-compliance"]) {
      expect(hk.some((c) => c.expected.bindingDomain === dom)).toBe(true);
    }
  });
  it("archetype influences the output (laundry capacity vs housekeeping workload differ)", () => {
    const laundryCap = ARCHETYPE_PACK_CASES.find((c) => c.archetype === "laundry" && c.expected.bindingDomain === "capacity")!;
    const hkWork = ARCHETYPE_PACK_CASES.find((c) => c.archetype === "housekeeping" && c.expected.bindingDomain === "staff-workload")!;
    const pa = runCollective(laundryCap.input).primaryNextAction;
    const pb = runCollective(hkWork.input).primaryNextAction;
    expect(pa).not.toBe(pb);
  });
  it("every archetype case scores ≥90 with zero unsafe", () => {
    const ev = evaluateCollective(ARCHETYPE_PACK_CASES);
    if (!ev.passed) throw new Error(`avg=${ev.averageScore.toFixed(1)} unsafe=${ev.unsafeFailures} weak=${JSON.stringify(ev.weakCases.slice(0, 6))}`);
    expect(ev.passed).toBe(true);
  });
});
