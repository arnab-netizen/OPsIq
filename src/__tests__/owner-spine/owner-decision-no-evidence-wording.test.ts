/**
 * N8 — "There is no business data yet" was shown to a business that HAD saved costs and cash (revenue unknown). With no
 * diagnosed domain the truthful statement is that nothing has been analysed yet, not that nothing exists.
 */
import { describe, it, expect } from "vitest";
import { resolveOwnerDecision } from "@/domain/owner-spine/owner-decision";
import { NO_CHANGE_FACTS } from "@/__tests__/owner-decision/change-facts-fixture";

const decide = (missingCriticalData: string[]) =>
  resolveOwnerDecision({
    businessId: "b", workspaceId: "w", candidates: [], diagnosedDomains: [],
    dataSufficiency: { status: "insufficient", lowestDataConfidenceScore: 0, lowConfidenceDomains: [], missingCriticalData },
    staleDomains: [], strategy: null, reassessment: { days: 14, reason: "r" }, changeFacts: NO_CHANGE_FACTS, gate: null, now: new Date("2026-10-10T00:00:00Z"),
  });

describe("N8 — no analysed evidence is not 'no business data'", () => {
  it("never claims there is no data; says nothing has been analysed", () => {
    const d = decide(["revenue"]);
    expect(d.state).toBe("NO_EVIDENCE");
    const text = [...d.confidence.reasons, ...d.missingInformation].join(" | ");
    expect(text).not.toMatch(/no business data/i);
    expect(d.confidence.reasons).toContain("OpsIQ has no completed analysis of your figures yet.");
  });
  it("the request for information is 'add or complete', so it is true for a business that already saved some figures", () => {
    expect(decide([]).missingInformation[0]).toMatch(/Add or complete your business numbers/);
  });
  it("what is missing is named in owner words", () => {
    expect(decide(["revenue", "bankBalance"]).missingInformation).toEqual(expect.arrayContaining(["Revenue", "Bank balance"]));
  });
});
