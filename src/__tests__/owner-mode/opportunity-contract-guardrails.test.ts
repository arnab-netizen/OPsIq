/**
 * Jarvis 360 Slice 11 — opportunity / contract / marketing guardrails (pure). No DB.
 */
import { describe, it, expect } from "vitest";
import {
  screenOpportunity,
  screenContractQuote,
  shouldRunMarketing,
} from "@/domain/owner-mode/opportunity-contract-guardrails";

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
