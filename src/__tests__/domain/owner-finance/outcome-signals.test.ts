/**
 * Finance closed-loop learning — outcome-signals domain unit tests.
 * Covers scenarios A-K from the spec test matrix (pure domain, no DB).
 */
import { describe, it, expect } from "vitest";
import {
  computeEffectivenessAggregate,
  buildEffectivenessMap,
  modifierAllowedForSeverity,
  extractReachedTargetFromVerification,
  MIN_SAMPLE,
  MAX_MODIFIER,
  type FinanceEffectivenessSignal,
} from "@/domain/owner-finance/outcome-signals";

// ─── Helpers ────────────────────────────────────────────────────────────────

function sig(findingCode: string, reachedTarget: boolean): FinanceEffectivenessSignal {
  return { findingCode, recommendationCode: `REC_${findingCode}`, reachedTarget };
}

function sigs(findingCode: string, successes: number, failures: number): FinanceEffectivenessSignal[] {
  return [
    ...Array.from({ length: successes }, () => sig(findingCode, true)),
    ...Array.from({ length: failures }, () => sig(findingCode, false)),
  ];
}

// ─── Scenario A: signal with reachedTarget=true ─────────────────────────────

describe("Scenario A — reachedTarget=true signals", () => {
  it("aggregate counts as improved", () => {
    const agg = computeEffectivenessAggregate("FIN_LOW_MARGIN", [sig("FIN_LOW_MARGIN", true)]);
    expect(agg.improvedCount).toBe(1);
    expect(agg.n).toBe(1);
  });
  it("rawSuccessRate is 1.0 for a single success", () => {
    const agg = computeEffectivenessAggregate("X", [sig("X", true)]);
    expect(agg.rawSuccessRate).toBe(1.0);
  });
});

// ─── Scenario B: signal with reachedTarget=false (negative outcome) ──────────

describe("Scenario B — reachedTarget=false (negative outcome)", () => {
  it("aggregate counts zero improved", () => {
    const agg = computeEffectivenessAggregate("FIN_LOW_MARGIN", [sig("FIN_LOW_MARGIN", false)]);
    expect(agg.improvedCount).toBe(0);
  });
  it("rawSuccessRate is 0 for a single failure", () => {
    const agg = computeEffectivenessAggregate("X", [sig("X", false)]);
    expect(agg.rawSuccessRate).toBe(0);
  });
});

// ─── Scenario F: MIN_SAMPLE guard — n < MIN_SAMPLE → modifier = 0 ──────────

describe("Scenario F — cold-start / MIN_SAMPLE guard", () => {
  it(`MIN_SAMPLE constant is ${MIN_SAMPLE}`, () => {
    expect(MIN_SAMPLE).toBe(3);
  });
  it("modifier is 0 when n=1", () => {
    const agg = computeEffectivenessAggregate("X", [sig("X", true)]);
    expect(agg.modifier).toBe(0);
  });
  it("modifier is 0 when n=2", () => {
    const agg = computeEffectivenessAggregate("X", sigs("X", 2, 0));
    expect(agg.modifier).toBe(0);
  });
  it("modifier is non-zero when n=MIN_SAMPLE and all succeed", () => {
    const agg = computeEffectivenessAggregate("X", sigs("X", MIN_SAMPLE, 0));
    expect(agg.modifier).toBeGreaterThan(0);
  });
  it("modifier is non-zero when n=MIN_SAMPLE and all fail", () => {
    const agg = computeEffectivenessAggregate("X", sigs("X", 0, MIN_SAMPLE));
    expect(agg.modifier).toBeLessThan(0);
  });
});

// ─── Scenario G: modifier applied at n=MIN_SAMPLE ───────────────────────────

describe("Scenario G — modifier at n=MIN_SAMPLE (100% success)", () => {
  it("shrunkSuccessRate exceeds prior (0.5) for 100% success", () => {
    const agg = computeEffectivenessAggregate("X", sigs("X", MIN_SAMPLE, 0));
    expect(agg.shrunkSuccessRate).toBeGreaterThan(0.5);
  });
  it("modifier is positive for 100% success at MIN_SAMPLE", () => {
    const agg = computeEffectivenessAggregate("X", sigs("X", MIN_SAMPLE, 0));
    expect(agg.modifier).toBeGreaterThan(0);
  });
  it("modifier is negative for 0% success at MIN_SAMPLE", () => {
    const agg = computeEffectivenessAggregate("X", sigs("X", 0, MIN_SAMPLE));
    expect(agg.modifier).toBeLessThan(0);
  });
  it("modifier is zero for 50% success (at prior)", () => {
    // Bayesian shrinkage: (2 + 2.5) / (4 + 5) = 4.5/9 = 0.5, deviation = 0
    const agg = computeEffectivenessAggregate("X", sigs("X", 2, 2));
    expect(agg.modifier).toBe(0);
  });
});

// ─── Scenario H: modifier capped at MAX_MODIFIER ────────────────────────────

describe("Scenario H — modifier capped at MAX_MODIFIER", () => {
  it(`MAX_MODIFIER constant is ${MAX_MODIFIER}`, () => {
    expect(MAX_MODIFIER).toBe(0.10);
  });
  it("modifier never exceeds +MAX_MODIFIER (100% success, large n)", () => {
    const agg = computeEffectivenessAggregate("X", sigs("X", 100, 0));
    expect(agg.modifier).toBeLessThanOrEqual(MAX_MODIFIER);
  });
  it("modifier never falls below -MAX_MODIFIER (0% success, large n)", () => {
    const agg = computeEffectivenessAggregate("X", sigs("X", 0, 100));
    expect(agg.modifier).toBeGreaterThanOrEqual(-MAX_MODIFIER);
  });
  it("modifier approaches +MAX_MODIFIER asymptotically with high n success", () => {
    const agg = computeEffectivenessAggregate("X", sigs("X", 1000, 0));
    // Bayesian shrinkage asymptotes to MAX_MODIFIER; n=1000 yields ~0.0995 (within 0.1%)
    expect(agg.modifier).toBeCloseTo(MAX_MODIFIER, 2);
  });
  it("modifier approaches -MAX_MODIFIER asymptotically with high n failure", () => {
    const agg = computeEffectivenessAggregate("X", sigs("X", 0, 1000));
    // Bayesian shrinkage asymptotes to -MAX_MODIFIER; n=1000 yields ~-0.0995 (within 0.1%)
    expect(agg.modifier).toBeCloseTo(-MAX_MODIFIER, 2);
  });
});

// ─── Scenario I: critical severity never gets modifier ───────────────────────

describe("Scenario I — critical severity blocked", () => {
  it("modifierAllowedForSeverity returns false for critical", () => {
    expect(modifierAllowedForSeverity("critical")).toBe(false);
  });
  it("modifierAllowedForSeverity returns true for warning", () => {
    expect(modifierAllowedForSeverity("warning")).toBe(true);
  });
  it("modifierAllowedForSeverity returns true for opportunity", () => {
    expect(modifierAllowedForSeverity("opportunity")).toBe(true);
  });
  it("modifierAllowedForSeverity returns true for info", () => {
    expect(modifierAllowedForSeverity("info")).toBe(true);
  });
});

// ─── Scenario J: Bayesian shrinkage — 0% success pulls toward prior ─────────

describe("Scenario J — Bayesian shrinkage at 0% success", () => {
  it("shrunkSuccessRate is above 0 for 0% raw (Bayesian prior pulls up)", () => {
    const agg = computeEffectivenessAggregate("X", sigs("X", 0, MIN_SAMPLE));
    expect(agg.rawSuccessRate).toBe(0);
    expect(agg.shrunkSuccessRate).toBeGreaterThan(0);
  });
  it("shrunkSuccessRate converges to 0 as n grows with 0% raw", () => {
    const small = computeEffectivenessAggregate("X", sigs("X", 0, MIN_SAMPLE));
    const large = computeEffectivenessAggregate("X", sigs("X", 0, 1000));
    expect(large.shrunkSuccessRate).toBeLessThan(small.shrunkSuccessRate);
  });
});

// ─── Scenario K: Bayesian shrinkage — 100% success pushes toward +modifier ──

describe("Scenario K — Bayesian shrinkage at 100% success", () => {
  it("shrunkSuccessRate converges to 1.0 as n grows with 100% raw", () => {
    const large = computeEffectivenessAggregate("X", sigs("X", 1000, 0));
    expect(large.shrunkSuccessRate).toBeGreaterThan(0.99);
  });
  it("modifier is monotonically increasing with n (all success)", () => {
    const n3 = computeEffectivenessAggregate("X", sigs("X", MIN_SAMPLE, 0)).modifier;
    const n10 = computeEffectivenessAggregate("X", sigs("X", 10, 0)).modifier;
    const n100 = computeEffectivenessAggregate("X", sigs("X", 100, 0)).modifier;
    expect(n10).toBeGreaterThan(n3);
    expect(n100).toBeGreaterThan(n10);
  });
});

// ─── Scenario L: empty effectiveness map when no signals ────────────────────

describe("Scenario L — empty map when no signals", () => {
  it("buildEffectivenessMap returns empty Map for empty signal list", () => {
    const map = buildEffectivenessMap([]);
    expect(map.size).toBe(0);
  });
  it("map.get() returns undefined for unknown code", () => {
    const map = buildEffectivenessMap([]);
    expect(map.get("FIN_LOW_MARGIN")).toBeUndefined();
  });
  it("undefined modifier coalesces to 0 via nullish chain", () => {
    const map = buildEffectivenessMap([]);
    expect(map.get("FIN_LOW_MARGIN")?.modifier ?? 0).toBe(0);
  });
});

// ─── buildEffectivenessMap — multi-code grouping ─────────────────────────────

describe("buildEffectivenessMap — multi-code grouping", () => {
  it("groups signals by findingCode", () => {
    const signals = [
      sig("CODE_A", true), sig("CODE_A", true), sig("CODE_A", false),
      sig("CODE_B", false), sig("CODE_B", false),
    ];
    const map = buildEffectivenessMap(signals);
    expect(map.get("CODE_A")?.n).toBe(3);
    expect(map.get("CODE_B")?.n).toBe(2);
  });
  it("CODE_A with 2/3 success has modifier > 0 (n >= MIN_SAMPLE)", () => {
    const signals = [sig("CODE_A", true), sig("CODE_A", true), sig("CODE_A", false)];
    const map = buildEffectivenessMap(signals);
    expect(map.get("CODE_A")!.modifier).toBeGreaterThan(0);
  });
  it("CODE_B with 0/2 success has modifier = 0 (n < MIN_SAMPLE)", () => {
    const signals = [sig("CODE_B", false), sig("CODE_B", false)];
    const map = buildEffectivenessMap(signals);
    expect(map.get("CODE_B")!.modifier).toBe(0);
  });
  it("keys present in map match input finding codes", () => {
    const signals = [sig("A", true), sig("B", false), sig("C", true)];
    const map = buildEffectivenessMap(signals);
    expect([...map.keys()].sort()).toEqual(["A", "B", "C"]);
  });
});

// ─── extractReachedTargetFromVerification ────────────────────────────────────

describe("extractReachedTargetFromVerification", () => {
  it("returns true when status=verified_improved and after >= target (up direction)", () => {
    expect(extractReachedTargetFromVerification({
      status: "verified_improved", afterValue: 75, targetValue: 65, targetDirection: "up",
    })).toBe(true);
  });
  it("returns false when status=verified_improved but after < target (up direction, improved but missed)", () => {
    expect(extractReachedTargetFromVerification({
      status: "verified_improved", afterValue: 60, targetValue: 65, targetDirection: "up",
    })).toBe(false);
  });
  it("returns false when status=verified_not_improved", () => {
    expect(extractReachedTargetFromVerification({
      status: "verified_not_improved", afterValue: 50, targetValue: 65, targetDirection: "up",
    })).toBe(false);
  });
  it("returns false when status=disputed", () => {
    expect(extractReachedTargetFromVerification({
      status: "disputed", afterValue: 75, targetValue: 65, targetDirection: "up",
    })).toBe(false);
  });
  it("returns false when afterValue is null", () => {
    expect(extractReachedTargetFromVerification({
      status: "verified_improved", afterValue: null, targetValue: 65, targetDirection: "up",
    })).toBe(false);
  });
  it("returns false when targetValue is null", () => {
    expect(extractReachedTargetFromVerification({
      status: "verified_improved", afterValue: 75, targetValue: null, targetDirection: "up",
    })).toBe(false);
  });
  it("handles down direction — returns true when after <= target", () => {
    expect(extractReachedTargetFromVerification({
      status: "verified_improved", afterValue: 30, targetValue: 35, targetDirection: "down",
    })).toBe(true);
  });
  it("handles down direction — returns false when after > target", () => {
    expect(extractReachedTargetFromVerification({
      status: "verified_improved", afterValue: 40, targetValue: 35, targetDirection: "down",
    })).toBe(false);
  });
});

// ─── Bayesian math invariants ─────────────────────────────────────────────────

describe("Bayesian shrinkage invariants", () => {
  it("shrunkSuccessRate is always in [0, 1]", () => {
    const cases = [
      sigs("X", 0, 10),
      sigs("X", 5, 5),
      sigs("X", 10, 0),
      sigs("X", 0, 0),
      sigs("X", 1000, 0),
    ];
    for (const c of cases) {
      const agg = computeEffectivenessAggregate("X", c);
      expect(agg.shrunkSuccessRate).toBeGreaterThanOrEqual(0);
      expect(agg.shrunkSuccessRate).toBeLessThanOrEqual(1);
    }
  });
  it("modifier is always in [-MAX_MODIFIER, MAX_MODIFIER]", () => {
    const cases = [
      sigs("X", 0, MIN_SAMPLE),
      sigs("X", MIN_SAMPLE, 0),
      sigs("X", 100, 0),
      sigs("X", 0, 100),
      sigs("X", 50, 50),
    ];
    for (const c of cases) {
      const agg = computeEffectivenessAggregate("X", c);
      expect(agg.modifier).toBeGreaterThanOrEqual(-MAX_MODIFIER);
      expect(agg.modifier).toBeLessThanOrEqual(MAX_MODIFIER);
    }
  });
  it("modifier is symmetric: 100% success modifier = -1 × 0% success modifier (large n)", () => {
    const successAgg = computeEffectivenessAggregate("X", sigs("X", 1000, 0));
    const failureAgg = computeEffectivenessAggregate("X", sigs("X", 0, 1000));
    expect(Math.abs(successAgg.modifier + failureAgg.modifier)).toBeLessThan(1e-10);
  });
  it("empty signals produce rawSuccessRate=0 and modifier=0", () => {
    const agg = computeEffectivenessAggregate("X", []);
    expect(agg.rawSuccessRate).toBe(0);
    expect(agg.modifier).toBe(0);
    expect(agg.n).toBe(0);
  });
});
