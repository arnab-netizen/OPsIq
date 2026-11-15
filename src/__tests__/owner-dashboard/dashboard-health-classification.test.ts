/**
 * Pure matrix for the dashboard health classification (dashboard-health-classification.ts), driven by REAL
 * currentCashFinanceReading() outputs so the gate's fail-safe floor and "no gaps" semantics are exercised as shipped.
 */
import { describe, it, expect } from "vitest";
import { currentCashFinanceReading, type CashFinanceCycleRead } from "@/services/owner-spine/current-cash-finance-reading";
import { classifyDashboardHealth, dashboardEvidenceState, type ProgressSummary } from "@/services/owner-spine/dashboard-health-classification";

const NOW = Date.parse("2026-10-06T10:00:00Z");
const DAY = 86_400_000;
const done = (state: string, evidenceGaps: CashFinanceCycleRead["evidenceGaps"] = []): CashFinanceCycleRead => ({
  state, snapshot: { periodEnd: new Date(NOW - 5 * DAY), supersededById: null }, evidenceGaps,
});
const prov = (state: string): CashFinanceCycleRead => ({ state, snapshot: { periodEnd: new Date(NOW + 20 * DAY), supersededById: null } });
const classify = (reading: ReturnType<typeof currentCashFinanceReading>, progressSummary: ProgressSummary = "no_actions", businessName: string | null = "Acme") =>
  classifyDashboardHealth({ reading, progressSummary, businessName });

describe("classifyDashboardHealth", () => {
  it("none: no readings at all is needs_data with the first-figures reason (gateEvidenceSufficient is vacuously true)", () => {
    const reading = currentCashFinanceReading(null, null, NOW, null);
    expect(reading.gateEvidenceSufficient).toBe(true); // the primitive's documented meaning: unchanged
    expect(dashboardEvidenceState(reading)).toBe("none");
    const r = classify(reading);
    expect(r.status).toBe("needs_data");
    expect(r.needsDataReason).toBe("Add your first financial figures so OpsIQ can assess Acme.");
  });

  it("none: the reason never claims a missing bank balance, and works without a business name", () => {
    const r = classify(currentCashFinanceReading(null, null, NOW, null), "no_actions", null);
    expect(r.needsDataReason).toBe("Add your first financial figures so OpsIQ can assess this business.");
  });

  it.each(["SAFE", "WATCH"])("provisional-only %s: needs_data — the gate's AT_RISK floor is not a measured at-risk", (state) => {
    const reading = currentCashFinanceReading(null, null, NOW, { finance: prov(state), cash: null });
    expect(reading.gateState).toBe("AT_RISK"); // gate semantics: unchanged fail-safe
    expect(reading.gateDriver).toBe("unverified");
    expect(dashboardEvidenceState(reading)).toBe("provisional_unproven");
    const r = classify(reading);
    expect(r.status).toBe("needs_data");
    expect(r.needsDataReason).toMatch(/still in progress/);
  });

  it.each([["AT_RISK", "at_risk"], ["CRITICAL", "critical"], ["INSOLVENT_RISK", "critical"]])("provisional genuine danger %s stays %s", (state, expected) => {
    const reading = currentCashFinanceReading(null, null, NOW, { cash: prov(state), finance: null });
    expect(dashboardEvidenceState(reading)).toBe("present");
    expect(classify(reading).status).toBe(expected);
  });

  it("completed safe and complete → healthy (the only path)", () => {
    expect(classify(currentCashFinanceReading(done("SAFE"), null, NOW, null)).status).toBe("healthy");
    expect(classify(currentCashFinanceReading(null, done("WATCH"), NOW, null)).status).toBe("healthy");
  });

  it("completed safe but provisional WATCH on top stays healthy (provisional never relaxes or worsens a completed safe reading)", () => {
    expect(classify(currentCashFinanceReading(done("SAFE"), null, NOW, { finance: prov("WATCH") })).status).toBe("healthy");
  });

  it("completed with an evidence gap → needs_data with the specific wording", () => {
    const r = classify(currentCashFinanceReading(done("WATCH", [{ reason: "CASH_POSITION_INCOMPLETE", missing: ["bankBalance"] }]), null, NOW, null));
    expect(r.status).toBe("needs_data");
    expect(r.needsDataReason).toBe("Cash position not confirmed for Acme: enter the missing bank balance (enter 0 if there is none).");
  });

  it("a measured danger wins over an evidence gap", () => {
    const gap = [{ reason: "CASH_POSITION_INCOMPLETE" as const, missing: ["bankBalance"] }];
    expect(classify(currentCashFinanceReading(done("AT_RISK", gap), null, NOW, null)).status).toBe("at_risk");
    expect(classify(currentCashFinanceReading(done("CRITICAL", gap), null, NOW, null)).status).toBe("critical");
  });

  it("completed measured AT_RISK / CRITICAL / INSOLVENT_RISK are unchanged", () => {
    expect(classify(currentCashFinanceReading(done("AT_RISK"), null, NOW, null)).status).toBe("at_risk");
    expect(classify(currentCashFinanceReading(done("CRITICAL"), null, NOW, null)).status).toBe("critical");
    expect(classify(currentCashFinanceReading(null, done("INSOLVENT_RISK"), NOW, null)).status).toBe("critical");
  });

  it("stale completed evidence keeps its existing fail-safe (at_risk) — not changed by this fix", () => {
    const stale: CashFinanceCycleRead = { state: "SAFE", snapshot: { periodEnd: new Date(NOW - 400 * DAY), supersededById: null } };
    expect(classify(currentCashFinanceReading(stale, null, NOW, null)).status).toBe("at_risk");
  });

  it("execution risk is independent of cash evidence; healthy execution without evidence is still needs_data", () => {
    const none = currentCashFinanceReading(null, null, NOW, null);
    expect(classify(none, "blocked").status).toBe("critical");
    expect(classify(none, "at_risk").status).toBe("at_risk");
    expect(classify(none, "on_track").status).toBe("needs_data");
    expect(classify(none, "no_actions").status).toBe("needs_data");
    const provOnly = currentCashFinanceReading(null, null, NOW, { finance: prov("WATCH") });
    expect(classify(provOnly, "blocked").status).toBe("critical");
    expect(classify(provOnly, "at_risk").status).toBe("at_risk");
  });

  it("execution at_risk with safe completed evidence is at_risk; on_track with safe evidence is healthy", () => {
    const safe = currentCashFinanceReading(done("SAFE"), null, NOW, null);
    expect(classify(safe, "at_risk").status).toBe("at_risk");
    expect(classify(safe, "on_track").status).toBe("healthy");
  });
});
