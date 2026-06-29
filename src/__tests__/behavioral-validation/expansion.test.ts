import { describe, it, expect } from "vitest";
import { EXPANDED_CASES, distributionOf, REQUIRED_DISTRIBUTION, expandCases, casesForMode } from "@/behavioral-validation/expansion";
import { SEED_CASES } from "@/behavioral-validation/seed-cases";
import { behavioralCaseSchema } from "@/behavioral-validation/schema";

describe("case expansion", () => {
  const dist = distributionOf(EXPANDED_CASES);

  it("produces at least 200 cases with unique ids", () => {
    expect(EXPANDED_CASES.length).toBeGreaterThanOrEqual(200);
    expect(new Set(EXPANDED_CASES.map((c) => c.id)).size).toBe(EXPANDED_CASES.length);
  });

  it("meets every required distribution minimum", () => {
    for (const [k, min] of Object.entries(REQUIRED_DISTRIBUTION)) {
      expect((dist as unknown as Record<string, number>)[k]).toBeGreaterThanOrEqual(min as number);
    }
  });

  it("covers at least 12 distinct locations and all 12 archetypes", () => {
    expect(dist.distinctLocations).toBeGreaterThanOrEqual(12);
    expect(dist.distinctArchetypes).toBe(12);
  });

  it("every expanded case keeps a traceable sourceSeedCaseId pointing at a real seed", () => {
    const seedIds = new Set(SEED_CASES.map((c) => c.id));
    for (const c of EXPANDED_CASES) expect(seedIds.has(c.sourceSeedCaseId)).toBe(true);
  });

  it("expansion never erases a seed invariant (root cause / tempting / correct / proof / reassessment)", () => {
    const bySeed = new Map(SEED_CASES.map((c) => [c.id, c]));
    for (const c of EXPANDED_CASES) {
      const seed = bySeed.get(c.sourceSeedCaseId)!;
      expect(c.hiddenRootCause).toBe(seed.hiddenRootCause);
      expect(c.temptingBadDecision).toBe(seed.temptingBadDecision);
      expect(c.correctExpertDecision).toBe(seed.correctExpertDecision);
      // guidance arrays are append-only supersets of the seed's
      for (const s of seed.opsiqShouldSay) expect(c.opsiqShouldSay).toContain(s);
      for (const p of seed.proofRequired) expect(c.proofRequired).toContain(p);
      expect(c.reassessmentTrigger).toBe(seed.reassessmentTrigger);
    }
  });

  it("every expanded case still validates against the schema", () => {
    for (const c of EXPANDED_CASES) expect(() => behavioralCaseSchema.parse(c)).not.toThrow();
  });

  it("is deterministic — same input yields identical ids", () => {
    const a = expandCases(SEED_CASES).map((c) => c.id);
    const b = expandCases(SEED_CASES).map((c) => c.id);
    expect(a).toEqual(b);
  });

  it("mode selection sizes are correct", () => {
    expect(casesForMode("smoke").length).toBe(25);
    expect(casesForMode("hostile").length).toBeLessThanOrEqual(60);
    expect(casesForMode("hostile").every((c) => c.flags.hostile)).toBe(true);
    expect(casesForMode("core").length).toBeGreaterThanOrEqual(200);
  });
});
