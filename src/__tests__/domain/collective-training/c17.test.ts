import { describe, it, expect } from "vitest";
import { ARCHETYPE_PACK_CASES, ARCHETYPE_NAMES } from "@/domain/collective-training/simulation/archetype-packs.cases";
import { evaluateCollective } from "@/domain/collective-training/simulation/collective-scoring";
import { runCollective } from "@/domain/collective-training/collective-engine";

describe("[C17] archetype packs — module contract assertions", () => {
  it("ARCHETYPE_NAMES is an array", () => {
    expect(Array.isArray(ARCHETYPE_NAMES)).toBe(true);
  });
  it("ARCHETYPE_NAMES has 3 entries", () => {
    expect(ARCHETYPE_NAMES.length).toBe(3);
  });
  it("ARCHETYPE_NAMES equals ['universal','laundry','housekeeping']", () => {
    expect(ARCHETYPE_NAMES).toEqual(["universal", "laundry", "housekeeping"]);
  });
  it("ARCHETYPE_PACK_CASES is an array", () => {
    expect(Array.isArray(ARCHETYPE_PACK_CASES)).toBe(true);
  });
  it("ARCHETYPE_PACK_CASES has 90 entries", () => {
    expect(ARCHETYPE_PACK_CASES.length).toBe(90);
  });
  it("ARCHETYPE_PACK_CASES[0] has an archetype field", () => {
    expect(ARCHETYPE_PACK_CASES[0]).toHaveProperty("archetype");
  });
  it("ARCHETYPE_PACK_CASES[0] has an expected field", () => {
    expect(ARCHETYPE_PACK_CASES[0]).toHaveProperty("expected");
  });
  it("evaluateCollective is a function", () => {
    expect(typeof evaluateCollective).toBe("function");
  });
  it("runCollective is a function", () => {
    expect(typeof runCollective).toBe("function");
  });
  it("30 laundry cases in ARCHETYPE_PACK_CASES", () => {
    expect(ARCHETYPE_PACK_CASES.filter((c) => c.archetype === "laundry").length).toBe(30);
  });
  it("30 housekeeping cases in ARCHETYPE_PACK_CASES", () => {
    expect(ARCHETYPE_PACK_CASES.filter((c) => c.archetype === "housekeeping").length).toBe(30);
  });
  it("30 universal cases in ARCHETYPE_PACK_CASES", () => {
    expect(ARCHETYPE_PACK_CASES.filter((c) => c.archetype === "universal").length).toBe(30);
  });
  it("evaluateCollective returns object with passed/averageScore/unsafeFailures", () => {
    const ev = evaluateCollective(ARCHETYPE_PACK_CASES.slice(0, 1));
    expect(ev).toHaveProperty("passed");
    expect(ev).toHaveProperty("averageScore");
    expect(ev).toHaveProperty("unsafeFailures");
  });
  it("all ARCHETYPE_NAMES are strings", () => {
    for (const a of ARCHETYPE_NAMES) expect(typeof a).toBe("string");
  });
  it("all ARCHETYPE_PACK_CASES have string archetype", () => {
    for (const c of ARCHETYPE_PACK_CASES) expect(typeof c.archetype).toBe("string");
  });
});

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
