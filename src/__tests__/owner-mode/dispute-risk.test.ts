/**
 * Dispute → Business Risk mapping — pure. Governed proof-dispute categories map to Profit-Leak +
 * Constraint drivers with an attributable signal shape, honest missing-data (no fabricated
 * revenue/churn/redo figure), and no overclassification of OTHER.
 */
import { describe, it, expect } from "vitest";
import { buildDisputeRiskAnalysis, type DisputeRecordInput } from "@/domain/owner-mode/dispute-risk";
import { ProofDisputeCategory } from "@/domain/execution/proof-dispute";

const WS = "ws-1";
const AT = "2026-07-05T00:00:00.000Z";
const rec = (over: Partial<DisputeRecordInput> = {}): DisputeRecordInput => ({
  proofId: "p1", disputeCategory: ProofDisputeCategory.REWORK_REQUIRED, reason: "rewash", auditEventId: "au1", occurredAt: new Date(AT), ...over,
});

describe("dispute-risk mapping", () => {
  it("REWORK_REQUIRED → REWORK_REDO_COST + QUALITY; feeds rework + quality aggregates", () => {
    const r = buildDisputeRiskAnalysis(WS, [rec()], AT);
    const sig = r.risks[0];
    expect(sig.profitLeakType).toBe("REWORK_REDO_COST");
    expect(sig.constraintType).toBe("QUALITY");
    expect(sig.sourceAuditEventId).toBe("au1");
    expect(r.aggregates.disputeReworkCount).toBe(1);
    expect(r.aggregates.disputeQualityCount).toBe(1);
  });

  it("CUSTOMER_COMPLAINT → COMPLAINT_REVENUE_RISK, discloses missing complaint model (no revenue figure)", () => {
    const r = buildDisputeRiskAnalysis(WS, [rec({ disputeCategory: ProofDisputeCategory.CUSTOMER_COMPLAINT })], AT);
    const sig = r.risks[0];
    expect(sig.profitLeakType).toBe("COMPLAINT_REVENUE_RISK");
    expect(sig.missingData.join(" ")).toMatch(/no per-event complaint model/i);
    expect(r.aggregates.disputeComplaintCount).toBe(1);
  });

  it("SUSPECTED_FAKE → WEAK_PROOF_REWORK_RISK + STAFF; MANAGER_REVIEW_ERROR → MANAGER", () => {
    const fake = buildDisputeRiskAnalysis(WS, [rec({ disputeCategory: ProofDisputeCategory.SUSPECTED_FAKE_OR_REUSED_PROOF })], AT);
    expect(fake.risks[0].profitLeakType).toBe("WEAK_PROOF_REWORK_RISK");
    expect(fake.risks[0].constraintType).toBe("STAFF");
    expect(fake.aggregates.disputeStaffCount).toBe(1);
    const mgr = buildDisputeRiskAnalysis(WS, [rec({ disputeCategory: ProofDisputeCategory.MANAGER_REVIEW_ERROR })], AT);
    expect(mgr.risks[0].constraintType).toBe("MANAGER");
    expect(mgr.aggregates.disputeManagerCount).toBe(1);
  });

  it("OTHER is not overclassified (no profit/constraint mapping, low confidence)", () => {
    const r = buildDisputeRiskAnalysis(WS, [rec({ disputeCategory: ProofDisputeCategory.OTHER })], AT);
    expect(r.risks[0].profitLeakType).toBeNull();
    expect(r.risks[0].constraintType).toBeNull();
    expect(r.risks[0].confidence).toBe("LOW");
    expect(r.aggregates.disputeReworkCount).toBe(0);
  });

  it("a repeated category escalates to HIGH severity", () => {
    const recs = [rec({ proofId: "a" }), rec({ proofId: "b" }), rec({ proofId: "c" })];
    const r = buildDisputeRiskAnalysis(WS, recs, AT);
    expect(r.risks.every((s) => s.severity === "HIGH")).toBe(true);
  });

  it("topRisk ranks a fake-proof dispute above a single rework; no fake numeric impact anywhere", () => {
    const r = buildDisputeRiskAnalysis(WS, [rec(), rec({ proofId: "p2", disputeCategory: ProofDisputeCategory.SUSPECTED_FAKE_OR_REUSED_PROOF })], AT);
    expect(r.topRisk?.disputeCategory).toBe(ProofDisputeCategory.SUSPECTED_FAKE_OR_REUSED_PROOF);
    // Every mapped risk discloses missing measurement rather than a fabricated number.
    for (const s of r.risks) expect(s.missingData.length).toBeGreaterThan(0);
    expect(r.risks.every((s) => s.workspaceId === WS)).toBe(true);
  });
});
