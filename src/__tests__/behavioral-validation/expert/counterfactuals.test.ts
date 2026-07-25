import { describe, it, expect } from "vitest";
import { COUNTERFACTUALS, runCounterfactual } from "@/behavioral-validation/expert/counterfactuals";

describe("counterfactual case testing — module contract assertions", () => {
  it("COUNTERFACTUALS is an array", () => { expect(Array.isArray(COUNTERFACTUALS)).toBe(true); });
  it("COUNTERFACTUALS has 10 entries", () => { expect(COUNTERFACTUALS).toHaveLength(10); });
  it("runCounterfactual is a function", () => { expect(typeof runCounterfactual).toBe("function"); });
  it("COUNTERFACTUALS[0] is an object", () => { expect(typeof COUNTERFACTUALS[0]).toBe("object"); });
  it("COUNTERFACTUALS[0].id is a non-empty string", () => { expect(typeof COUNTERFACTUALS[0].id).toBe("string"); expect(COUNTERFACTUALS[0].id.length).toBeGreaterThan(0); });
  it("COUNTERFACTUALS[0].mustDifferOn is a non-empty array", () => { expect(Array.isArray(COUNTERFACTUALS[0].mustDifferOn)).toBe(true); expect(COUNTERFACTUALS[0].mustDifferOn.length).toBeGreaterThan(0); });
  it("all COUNTERFACTUALS entries have a non-empty id", () => { for (const p of COUNTERFACTUALS) expect(p.id.length).toBeGreaterThan(0); });
  it("all COUNTERFACTUALS entries have mustDifferOn array with ≥1 entries", () => { for (const p of COUNTERFACTUALS) expect(p.mustDifferOn.length).toBeGreaterThan(0); });
  it("COUNTERFACTUALS contains cashlow_receivables_vs_discounts", () => { expect(COUNTERFACTUALS.find((p) => p.id === "cashlow_receivables_vs_discounts")).toBeDefined(); });
  it("COUNTERFACTUALS contains opportunity_advance_vs_60day", () => { expect(COUNTERFACTUALS.find((p) => p.id === "opportunity_advance_vs_60day")).toBeDefined(); });
  it("COUNTERFACTUALS contains roas_profitable_vs_loss_after_returns", () => { expect(COUNTERFACTUALS.find((p) => p.id === "roas_profitable_vs_loss_after_returns")).toBeDefined(); });
  it("COUNTERFACTUALS contains premium_vs_price_sensitive", () => { expect(COUNTERFACTUALS.find((p) => p.id === "premium_vs_price_sensitive")).toBeDefined(); });
  it("all COUNTERFACTUALS ids are unique", () => { const ids = COUNTERFACTUALS.map((p) => p.id); expect(new Set(ids).size).toBe(COUNTERFACTUALS.length); });
  it("COUNTERFACTUALS has no null/undefined entries", () => { for (const p of COUNTERFACTUALS) expect(p).not.toBeNull(); });
});

describe("counterfactual case testing", () => {
  it("a counterfactual pair library exists", () => {
    expect(COUNTERFACTUALS.length).toBe(10);
    for (const p of COUNTERFACTUALS) expect(p.mustDifferOn.length).toBeGreaterThan(0);
  });

  it("every pair produces materially different advice on its declared dimension", async () => {
    for (const pair of COUNTERFACTUALS) {
      const r = await runCounterfactual(pair);
      expect(r.differs, `${pair.id} must diverge on ${pair.mustDifferOn.join("/")}`).toBe(true);
    }
  });

  it("same-symptom / different-root-cause cases produce different advice", async () => {
    const r = await runCounterfactual(COUNTERFACTUALS.find((p) => p.id === "cashlow_receivables_vs_discounts")!);
    expect(r.differs).toBe(true);
  });

  it("same opportunity / different payment terms → different verdict", async () => {
    const r = await runCounterfactual(COUNTERFACTUALS.find((p) => p.id === "opportunity_advance_vs_60day")!);
    expect(r.divergedOn).toContain("calculationTrace");
  });

  it("same marketing metric / different net margin → different verdict", async () => {
    const r = await runCounterfactual(COUNTERFACTUALS.find((p) => p.id === "roas_profitable_vs_loss_after_returns")!);
    expect(r.differs).toBe(true);
  });

  it("same business / different location → location-aware advice", async () => {
    const r = await runCounterfactual(COUNTERFACTUALS.find((p) => p.id === "premium_vs_price_sensitive")!);
    expect(r.divergedOn).toContain("localConsiderations");
  });
});
