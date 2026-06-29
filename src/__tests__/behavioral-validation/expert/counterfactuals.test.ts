import { describe, it, expect } from "vitest";
import { COUNTERFACTUALS, runCounterfactual } from "@/behavioral-validation/expert/counterfactuals";

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
