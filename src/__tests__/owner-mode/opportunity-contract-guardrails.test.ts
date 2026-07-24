/**
 * Jarvis 360 Slice 11 — opportunity / contract / marketing guardrails (pure). No DB.
 */
import { describe, it, expect } from "vitest";
import {
  screenOpportunity,
  screenContractQuote,
  shouldRunMarketing,
} from "@/domain/owner-mode/opportunity-contract-guardrails";

describe("opportunity-contract-guardrails — module contract assertions", () => {
  it("screenOpportunity is a function", () => { expect(typeof screenOpportunity).toBe("function"); });
  it("screenContractQuote is a function", () => { expect(typeof screenContractQuote).toBe("function"); });
  it("shouldRunMarketing is a function", () => { expect(typeof shouldRunMarketing).toBe("function"); });
  it("screenOpportunity({...}) returns an object", () => { expect(typeof screenOpportunity({ fitScore: 0.8, marginPct: 0.4, marginFloorPct: 0.15, capacityStatus: "safe", paymentRisk: "low" })).toBe("object"); });
  it("screenOpportunity result has verdict field", () => { expect(screenOpportunity({ fitScore: 0.8, marginPct: 0.4, marginFloorPct: 0.15, capacityStatus: "safe", paymentRisk: "low" })).toHaveProperty("verdict"); });
  it("screenOpportunity accept case verdict is 'accept'", () => { expect(screenOpportunity({ fitScore: 0.8, marginPct: 0.4, marginFloorPct: 0.15, capacityStatus: "safe", paymentRisk: "low" }).verdict).toBe("accept"); });
  it("screenContractQuote({...}) returns an object", () => { expect(typeof screenContractQuote({ price: 1000, directCost: 400, marginFloorPct: 0.2, paymentTermsDays: 30, capacityStatus: "safe" })).toBe("object"); });
  it("screenContractQuote result has verdict field", () => { expect(screenContractQuote({ price: 1000, directCost: 400, marginFloorPct: 0.2, paymentTermsDays: 30, capacityStatus: "safe" })).toHaveProperty("verdict"); });
  it("shouldRunMarketing({...}) returns an object", () => { expect(typeof shouldRunMarketing({ financialState: "SAFE", capacityStatus: "safe", qualityRed: false, reputationRed: false })).toBe("object"); });
  it("shouldRunMarketing all-clear result has run field", () => { expect(shouldRunMarketing({ financialState: "SAFE", capacityStatus: "safe", qualityRed: false, reputationRed: false })).toHaveProperty("run"); });
  it("shouldRunMarketing all-clear run is true", () => { expect(shouldRunMarketing({ financialState: "SAFE", capacityStatus: "safe", qualityRed: false, reputationRed: false }).run).toBe(true); });
  it("screenOpportunity reject below-margin verdict is 'reject'", () => { expect(screenOpportunity({ fitScore: 0.9, marginPct: 0.05, marginFloorPct: 0.15, capacityStatus: "safe", paymentRisk: "low" }).verdict).toBe("reject"); });
  it("shouldRunMarketing CRITICAL blocks run", () => { expect(shouldRunMarketing({ financialState: "CRITICAL", capacityStatus: "safe", qualityRed: false, reputationRed: false }).run).toBe(false); });
  it("screenContractQuote reject below-margin verdict is 'reject'", () => { expect(screenContractQuote({ price: 100, directCost: 95, marginFloorPct: 0.2, paymentTermsDays: 15, capacityStatus: "safe" }).verdict).toBe("reject"); });
});

describe("screenOpportunity", () => {
  it("rejects below-margin opportunities", () => {
    expect(screenOpportunity({ fitScore: 0.9, marginPct: 0.05, marginFloorPct: 0.15, capacityStatus: "safe", paymentRisk: "low" }).verdict).toBe("reject");
  });
  it("defers when capacity is blocked", () => {
    expect(screenOpportunity({ fitScore: 0.9, marginPct: 0.4, marginFloorPct: 0.15, capacityStatus: "blocked", paymentRisk: "low" }).verdict).toBe("defer");
  });
  it("defers on high payment risk and rejects low fit", () => {
    expect(screenOpportunity({ fitScore: 0.9, marginPct: 0.4, marginFloorPct: 0.15, capacityStatus: "safe", paymentRisk: "high" }).verdict).toBe("defer");
    expect(screenOpportunity({ fitScore: 0.2, marginPct: 0.4, marginFloorPct: 0.15, capacityStatus: "safe", paymentRisk: "low" }).verdict).toBe("reject");
  });
  it("accepts profitable, fulfillable, low-risk", () => {
    expect(screenOpportunity({ fitScore: 0.8, marginPct: 0.4, marginFloorPct: 0.15, capacityStatus: "safe", paymentRisk: "low" }).verdict).toBe("accept");
  });
});

describe("screenContractQuote", () => {
  it("rejects a quote below the margin-floor price", () => {
    const r = screenContractQuote({ price: 100, directCost: 95, marginFloorPct: 0.2, paymentTermsDays: 15, capacityStatus: "safe" });
    expect(r.verdict).toBe("reject");
  });
  it("defers on long payment terms", () => {
    const r = screenContractQuote({ price: 1000, directCost: 500, marginFloorPct: 0.2, paymentTermsDays: 90, capacityStatus: "safe" });
    expect(r.verdict).toBe("defer");
  });
  it("accepts a healthy quote and requires owner approval when long-dated", () => {
    const r = screenContractQuote({ price: 1000, directCost: 400, marginFloorPct: 0.2, paymentTermsDays: 45, capacityStatus: "safe" });
    expect(r.verdict).toBe("accept");
    expect(r.ownerApprovalRequired).toBe(true);
    expect(r.marginPct).toBeGreaterThan(20);
  });
});

describe("shouldRunMarketing", () => {
  it("blocks when cash unsafe / capacity blocked / quality or reputation red", () => {
    expect(shouldRunMarketing({ financialState: "CRITICAL", capacityStatus: "safe", qualityRed: false, reputationRed: false }).run).toBe(false);
    expect(shouldRunMarketing({ financialState: "SAFE", capacityStatus: "blocked", qualityRed: false, reputationRed: false }).run).toBe(false);
    expect(shouldRunMarketing({ financialState: "SAFE", capacityStatus: "safe", qualityRed: true, reputationRed: false }).run).toBe(false);
  });
  it("runs (with stop-loss) when all clear", () => {
    const r = shouldRunMarketing({ financialState: "SAFE", capacityStatus: "safe", qualityRed: false, reputationRed: false });
    expect(r.run).toBe(true);
    expect(r.stopLossRequired).toBe(true);
  });
});
