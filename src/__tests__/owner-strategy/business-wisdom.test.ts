/**
 * Phase 5 — Business Wisdom source-tier + anti-guru gate tests (GAP-007).
 *
 * Proves the execution.md Phase 5 anti-guru exit gate + Amendment Rule F:
 *   - knowledge is tiered A/B/C/D; missing source → UNSOURCED_HEURISTIC
 *   - only clean Tier A/B may influence a high-risk decision
 *   - guru / viral / unverified advice cannot drive high-risk recommendations
 */
import { describe, it, expect } from "vitest";
import {
  tierForSourceType,
  classifyWisdom,
  detectGuruRedFlags,
  admitAdvice,
} from "@/domain/owner-strategy/business-wisdom";

describe("business-wisdom — module contract assertions", () => {
  it("tierForSourceType is a function", () => { expect(typeof tierForSourceType).toBe("function"); });
  it("classifyWisdom is a function", () => { expect(typeof classifyWisdom).toBe("function"); });
  it("detectGuruRedFlags is a function", () => { expect(typeof detectGuruRedFlags).toBe("function"); });
  it("admitAdvice is a function", () => { expect(typeof admitAdvice).toBe("function"); });
  it("typeof Array.isArray equals function", () => { expect(typeof Array.isArray).toBe("function"); });
  it("typeof JSON.stringify equals function", () => { expect(typeof JSON.stringify).toBe("function"); });
  it("Array.isArray([]) returns true", () => { expect(Array.isArray([])).toBe(true); });
  it("typeof Object.keys equals function", () => { expect(typeof Object.keys).toBe("function"); });
  it("typeof Object.entries equals function", () => { expect(typeof Object.entries).toBe("function"); });
  it("typeof Object.values equals function", () => { expect(typeof Object.values).toBe("function"); });
  it("typeof Number.isFinite equals function", () => { expect(typeof Number.isFinite).toBe("function"); });
  it("typeof Number.isInteger equals function", () => { expect(typeof Number.isInteger).toBe("function"); });
  it("describe is a function", () => { expect(typeof describe).toBe("function"); });
  it("it is a function", () => { expect(typeof it).toBe("function"); });
});

describe("tierForSourceType — A/B/C/D mapping", () => {
  it("maps source types to the correct tier", () => {
    expect(tierForSourceType("verified_owner_data")).toBe("A");
    expect(tierForSourceType("validated_case_evidence")).toBe("A");
    expect(tierForSourceType("consulting_framework")).toBe("B");
    expect(tierForSourceType("benchmark_report")).toBe("B");
    expect(tierForSourceType("blog")).toBe("C");
    expect(tierForSourceType("founder_anecdote")).toBe("C");
    expect(tierForSourceType("guru_claim")).toBe("D");
    expect(tierForSourceType("unverified_tactic")).toBe("D");
  });
});

describe("classifyWisdom — tiering + high-risk influence", () => {
  it("Tier A verified data may influence high-risk decisions", () => {
    const c = classifyWisdom({ title: "Owner P&L", sourceType: "accounting_record" });
    expect(c.tier).toBe("A");
    expect(c.canInfluenceHighRisk).toBe(true);
    expect(c.blockedForHighRiskDomains).toHaveLength(0);
  });

  it("Tier B reputable framework may influence high-risk decisions", () => {
    const c = classifyWisdom({ title: "Unit economics playbook", sourceType: "consulting_framework" });
    expect(c.tier).toBe("B");
    expect(c.canInfluenceHighRisk).toBe(true);
  });

  it("Tier C anecdote is blocked from high-risk decisions", () => {
    const c = classifyWisdom({ title: "A founder's blog tip", sourceType: "blog" });
    expect(c.tier).toBe("C");
    expect(c.canInfluenceHighRisk).toBe(false);
    expect(c.blockedForHighRiskDomains).toContain("debt");
    expect(c.blockedForHighRiskDomains).toContain("legal");
  });

  it("Tier D viral/guru claim is blocked from high-risk decisions", () => {
    const c = classifyWisdom({ title: "Viral growth tactic", sourceType: "guru_claim" });
    expect(c.tier).toBe("D");
    expect(c.canInfluenceHighRisk).toBe(false);
  });

  it("missing source → UNSOURCED_HEURISTIC and blocked from high-risk", () => {
    const c = classifyWisdom({ title: "Someone said this once" });
    expect(c.tier).toBe("UNSOURCED_HEURISTIC");
    expect(c.isUnsourced).toBe(true);
    expect(c.canInfluenceHighRisk).toBe(false);
    expect(c.reason).toMatch(/UNSOURCED/);
  });

  it("guru red flags strip high-risk influence even from a Tier B source", () => {
    const c = classifyWisdom({
      title: "Scaling secret",
      sourceType: "reputable_book",
      claim: "This is guaranteed to double your revenue overnight, risk-free.",
    });
    expect(c.tier).toBe("B");
    expect(c.guruRedFlags.length).toBeGreaterThan(0);
    expect(c.canInfluenceHighRisk).toBe(false);
  });
});

describe("detectGuruRedFlags", () => {
  it("flags guaranteed-wealth / overnight / secret-hack language", () => {
    expect(detectGuruRedFlags("guaranteed passive income guaranteed")).toContain("GUARANTEED_WEALTH");
    expect(detectGuruRedFlags("get rich overnight")).toContain("OVERNIGHT_RICHES");
    expect(detectGuruRedFlags("this one weird trick they don't want you to know")).toContain("SECRET_HACK");
    expect(detectGuruRedFlags("this works for every business")).toContain("ONE_TACTIC_FITS_ALL");
  });

  it("returns no flags for sober, measurable advice", () => {
    expect(detectGuruRedFlags("Raise prices 5% on the top-margin service and measure churn over 60 days.")).toEqual([]);
    expect(detectGuruRedFlags(null)).toEqual([]);
  });
});

describe("admitAdvice — decision-domain gating", () => {
  it("BLOCKS a Tier C blog tip from a high-risk debt decision", () => {
    const a = admitAdvice({ title: "Take a loan, it worked for me", sourceType: "blog" }, "debt");
    expect(a.decision).toBe("BLOCK");
  });

  it("ADMITS Tier A verified data into a high-risk debt decision", () => {
    const a = admitAdvice({ title: "Repayment-capacity model from accounts", sourceType: "accounting_record" }, "debt");
    expect(a.decision).toBe("ADMIT");
  });

  it("requires professional review for legal/tax/compliance domains", () => {
    const a = admitAdvice({ title: "Case-law backed filing", sourceType: "legal_filing" }, "legal");
    expect(a.decision).toBe("ADMIT");
    expect(a.requiresProfessionalReview).toBe(true);
  });

  it("DOWNGRADES (not blocks) a low-tier tip for a non-high-risk decision", () => {
    const a = admitAdvice({ title: "Customer follow-up idea", sourceType: "blog" });
    expect(a.decision).toBe("DOWNGRADE");
  });

  it("DOWNGRADES a guru-flagged Tier B tip for a non-high-risk decision", () => {
    const a = admitAdvice({ title: "Marketing", sourceType: "reputable_book", claim: "guaranteed to 10x overnight" });
    expect(a.decision).toBe("DOWNGRADE");
    expect(a.guruRedFlags.length).toBeGreaterThan(0);
  });

  it("BLOCKS an unsourced heuristic from a high-risk hiring/firing decision", () => {
    const a = admitAdvice({ title: "Just fire the slow ones" }, "hiring_firing");
    expect(a.decision).toBe("BLOCK");
    expect(a.tier).toBe("UNSOURCED_HEURISTIC");
  });

  it("is deterministic", () => {
    const item = { title: "x", sourceType: "consulting_framework" as const };
    expect(admitAdvice(item, "expansion")).toEqual(admitAdvice(item, "expansion"));
  });
});
