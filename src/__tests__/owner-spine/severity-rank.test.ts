/**
 * Unit: canonical finding severity ranking (owner-spine contracts).
 * `severity` is persisted as a plain string, so ranking happens after read.
 */
import { describe, it, expect } from "vitest";
import { ownerSeverityRank, rankOwnerFindingsBySeverity } from "@/domain/owner-spine/contracts";
import { ALPHABETICAL_DB_FINDINGS, CANONICAL_CODES, codes } from "./severity-order-fixtures";

describe("ownerSeverityRank", () => {
  it("orders critical > high > medium > low", () => {
    expect(ownerSeverityRank("critical")).toBeGreaterThan(ownerSeverityRank("high"));
    expect(ownerSeverityRank("high")).toBeGreaterThan(ownerSeverityRank("medium"));
    expect(ownerSeverityRank("medium")).toBeGreaterThan(ownerSeverityRank("low"));
  });

  it("ranks unknown and inherited-property strings below low", () => {
    expect(ownerSeverityRank("bogus")).toBe(0);
    expect(ownerSeverityRank("toString")).toBe(0);
    expect(ownerSeverityRank("low")).toBeGreaterThan(0);
  });
});

describe("rankOwnerFindingsBySeverity", () => {
  it("ranks the alphabetical DB order into canonical order without mutating input", () => {
    const input = ALPHABETICAL_DB_FINDINGS.map((f) => ({ ...f }));
    const before = codes(input);
    expect(codes(rankOwnerFindingsBySeverity(input))).toEqual(CANONICAL_CODES);
    expect(codes(input)).toEqual(before);
  });

  it("breaks ties by impact, then urgency, then confidence, then code", () => {
    const f = (code: string, impactScore: number, urgencyScore: number, confidence: number) => ({
      code, severity: "high", impactScore, urgencyScore, confidence,
    });
    const ranked = rankOwnerFindingsBySeverity([
      f("E", 50, 50, 0.5),
      f("D", 50, 50, 0.5),
      f("C", 50, 50, 0.9),
      f("B", 50, 90, 0.1),
      f("A", 90, 10, 0.1),
    ]);
    expect(codes(ranked)).toEqual(["A", "B", "C", "D", "E"]);
  });

  it("treats missing scores as 0 and places unknown severities last", () => {
    const ranked = rankOwnerFindingsBySeverity([
      { code: "X", severity: "unknown", impactScore: 100 },
      { code: "L", severity: "low" },
      { code: "C", severity: "critical", impactScore: null },
    ]);
    expect(codes(ranked)).toEqual(["C", "L", "X"]);
  });
});
