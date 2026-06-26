import { describe, it, expect } from "vitest";
import { evaluateDomain, scoreCase } from "@/domain/domain-training/harness/scoring";
import { respondPricingDecisions, type PricingInput } from "@/domain/domain-training/domains/pricing-decisions";
import { PRICING_DECISIONS_CASES } from "@/domain/domain-training/domains/pricing-decisions.cases";
import { TrainingLevel, REQUIRED_SCENARIO_TYPES, MIN_CASES_PER_DOMAIN } from "@/domain/domain-training/training-types";

const respond = (cse: { input: unknown }) => respondPricingDecisions(cse.input as PricingInput);

describe("[D3] pricing decisions — executable scored training", () => {
  it("carries >=21 cases covering every required scenario type", () => {
    expect(PRICING_DECISIONS_CASES.length).toBeGreaterThanOrEqual(MIN_CASES_PER_DOMAIN);
    const covered = new Set(PRICING_DECISIONS_CASES.map((c) => c.scenarioType));
    for (const t of REQUIRED_SCENARIO_TYPES) expect(covered.has(t)).toBe(true);
  });

  it("reaches LEVEL_5 (>=90% avg, zero unsafe failures)", () => {
    const ev = evaluateDomain(PRICING_DECISIONS_CASES, respond);
    if (!ev.passedLevel5) {
      const weak = ev.perCase.filter((p) => p.score < 90 || p.hardFail);
      throw new Error(`avg=${ev.averageScore} unsafe=${ev.unsafeFailures} weak=${JSON.stringify(weak)}`);
    }
    expect(ev.level).toBe(TrainingLevel.LEVEL_5_OUTCOME_VERIFIED);
    expect(ev.unsafeFailures).toBe(0);
  });

  it("governed — blind competitor matching + below-floor blocked", () => {
    const r = respondPricingDecisions(PRICING_DECISIONS_CASES.find((c) => c.id === "D3-05")!.input);
    expect(r.whatNotToDo).toContain("no blind competitor matching");
    expect(r.whatNotToDo).toContain("no below-floor pricing");
  });

  it("governed — broad price change under risk requires a test", () => {
    expect(respondPricingDecisions(PRICING_DECISIONS_CASES.find((c) => c.id === "D3-06")!.input).whatNotToDo)
      .toContain("no broad price change without a test");
  });

  it("governed — B2B discount without contribution proof blocked", () => {
    expect(respondPricingDecisions(PRICING_DECISIONS_CASES.find((c) => c.id === "D3-10")!.input).whatNotToDo)
      .toContain("no B2B discount without contribution proof");
  });

  it("governed — missing/contradictory data → BLOCKED; compliance → ESCALATE", () => {
    expect(respondPricingDecisions(PRICING_DECISIONS_CASES.find((c) => c.id === "D3-07")!.input).confidence).toBe("BLOCKED");
    expect(respondPricingDecisions(PRICING_DECISIONS_CASES.find((c) => c.id === "D3-21")!.input).confidence).toBe("BLOCKED");
    expect(respondPricingDecisions(PRICING_DECISIONS_CASES.find((c) => c.id === "D3-20")!.input).confidence).toBe("ESCALATE");
  });

  it("never emits a vetoed action; unsafe response hard-fails", () => {
    for (const cse of PRICING_DECISIONS_CASES) expect(respondPricingDecisions(cse.input).unsafeEmitted).toHaveLength(0);
    const cse = PRICING_DECISIONS_CASES.find((c) => c.id === "D3-05")!;
    const bad = { ...respondPricingDecisions(cse.input), unsafeEmitted: ["discounting_below_margin"] };
    expect(scoreCase(cse, bad).hardFail).toBe(true);
  });
});
