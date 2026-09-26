/**
 * Owner Strategy / Trust — canonical severity order (Decision Overhaul, severity sort).
 *
 * Root cause pinned: OwnerStrategyFinding.severity is a plain string column, so
 * `orderBy: { severity: "asc" }` returned critical, high, LOW, MEDIUM (alphabetical). Strategy
 * readers, the strategy domain score and the Trust explanations now rank with the canonical
 * spine order (critical → high → medium → low). No DB: the Prisma client is mocked.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  findMany: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  getDbInstance: vi.fn(async () => undefined),
  db: {
    ownerStrategyCycle: { findFirst: mocks.findFirst },
    ownerStrategyFinding: { findMany: mocks.findMany },
  },
}));

import { rankOwnerFindingsBySeverity, ownerSeverityRank } from "@/domain/owner-spine/contracts";
import { getStrategyDiagnosis, listStrategyCycleFindings } from "@/services/owner-strategy/diagnosis.service";
import { strategyCycleToDomainScore } from "@/services/owner-condition/business-condition.service";
import { getCycleExplanations } from "@/services/owner-trust/trust.service";

/** Rows in the order the DB returns them for `orderBy severity asc` (alphabetical). */
function alphabeticalRows() {
  return [
    { id: "1", code: "STR_UNAFFORDABLE", severity: "critical", impactScore: 75, urgencyScore: 90, confidence: 0.9, findingType: "risk", title: "t", summary: "s", sourceMetric: "affordabilityRatio", sourceValue: 0.4, threshold: 0.5, evidence: [], missingData: [], verificationMetric: "affordabilityRatio" },
    { id: "2", code: "STR_NEGATIVE_WORST_CASE", severity: "high", impactScore: 55, urgencyScore: 70, confidence: 0.9, findingType: "risk", title: "t", summary: "s", sourceMetric: "worstMonthlyProfitDelta", sourceValue: -1, threshold: 0, evidence: [], missingData: [], verificationMetric: "worstMonthlyProfitDelta" },
    { id: "3", code: "STR_OPP_FAST_PAYBACK", severity: "low", impactScore: 50, urgencyScore: 35, confidence: 0.9, findingType: "opportunity", title: "t", summary: "s", sourceMetric: "paybackMonths", sourceValue: 8, threshold: 18, evidence: [], missingData: [], verificationMetric: "paybackMonths" },
    { id: "4", code: "STR_MISSING_RISK_LEVEL", severity: "medium", impactScore: 35, urgencyScore: 45, confidence: 1, findingType: "risk", title: "t", summary: "s", sourceMetric: "riskLevel", sourceValue: null, threshold: null, evidence: [], missingData: ["riskLevel"], verificationMetric: "worstMonthlyProfitDelta" },
  ];
}
const SEVERITY_ORDER = ["critical", "high", "medium", "low"];

beforeEach(() => {
  mocks.findFirst.mockReset();
  mocks.findMany.mockReset();
});

describe("canonical severity rank", () => {
  it("ranks critical > high > medium > low; unknown last", () => {
    expect(["low", "medium", "high", "critical"].map(ownerSeverityRank)).toEqual([0, 1, 2, 3]);
    expect(ownerSeverityRank("severe")).toBe(-1);
    const ranked = rankOwnerFindingsBySeverity([...alphabeticalRows(), { severity: "bogus", code: "Z" }]);
    expect(ranked.map((f) => f.severity)).toEqual([...SEVERITY_ORDER, "bogus"]);
  });
  it("breaks ties by impact, then urgency, then confidence, then code", () => {
    const rows = [
      { severity: "high", impactScore: 40, urgencyScore: 50, confidence: 0.5, code: "B" },
      { severity: "high", impactScore: 40, urgencyScore: 50, confidence: 0.5, code: "A" },
      { severity: "high", impactScore: 40, urgencyScore: 60, confidence: 0.5, code: "C" },
      { severity: "high", impactScore: 90, urgencyScore: 10, confidence: 0.1, code: "D" },
    ];
    expect(rankOwnerFindingsBySeverity(rows).map((r) => r.code)).toEqual(["D", "C", "A", "B"]);
  });
});

describe("Strategy readers return canonical order", () => {
  it("getStrategyDiagnosis (also the Trust reader) ranks findings", async () => {
    mocks.findFirst.mockResolvedValue({ id: "c", findings: alphabeticalRows(), actions: [] });
    const cycle = await getStrategyDiagnosis("c", "ws");
    expect(cycle.findings.map((f: { severity: string }) => f.severity)).toEqual(SEVERITY_ORDER);
  });
  it("listStrategyCycleFindings ranks findings", async () => {
    mocks.findFirst.mockResolvedValue({ id: "c" });
    mocks.findMany.mockResolvedValue(alphabeticalRows());
    const rows = await listStrategyCycleFindings("c", "ws");
    expect(rows.map((f: { severity: string }) => f.severity)).toEqual(SEVERITY_ORDER);
  });
  it("the strategy domain score's top findings skip low-severity rows ahead of medium", () => {
    const score = strategyCycleToDomainScore({ healthScore: 50, riskScore: 50, opportunityScore: 50, dataConfidenceScore: 80, findings: alphabeticalRows(), actions: [], generatedAt: new Date() });
    expect(score.topFindingCodes).toEqual(["STR_UNAFFORDABLE", "STR_NEGATIVE_WORST_CASE", "STR_MISSING_RISK_LEVEL"]);
  });
  it("Trust explanations are in canonical severity order", async () => {
    mocks.findFirst.mockResolvedValue({ id: "c", generatedAt: new Date("2026-09-26"), findings: alphabeticalRows(), actions: [] });
    const out = await getCycleExplanations("strategy", "c", "ws");
    expect(out.explanations.map((e: { severity: string }) => e.severity)).toEqual(SEVERITY_ORDER);
  });
});
