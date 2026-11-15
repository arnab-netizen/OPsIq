/**
 * Regression: engagement report findings must be ranked by canonical severity
 * (critical → high → medium → low). `Finding.severity` is a plain String
 * column, so the former DB `orderBy: [{ severity: "desc" }, ...]` returned
 * medium, low, high, critical. Mocked db returns findings newest-first.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const findingMany = vi.fn();
vi.mock("@/lib/db", () => ({
  db: {
    engagement: {
      findUnique: vi.fn(async () => ({
        id: "e-1", code: "ENG-1", title: "Engagement", healthStatus: "stable",
        clientAccount: { id: "ca-1", name: "Client" },
      })),
    },
    businessConditionProfile: { findFirst: vi.fn(async () => null) },
    finding: { findMany: (...a: unknown[]) => findingMany(...a) },
    recommendation: { findMany: vi.fn(async () => []) },
    action: { findMany: vi.fn(async () => []) },
    kPI: { findMany: vi.fn(async () => []) },
  },
  getDbInstance: vi.fn(),
}));
vi.mock("@/services/business-impact/business-impact.service", () => ({
  generateBusinessImpact: vi.fn(async () => ({
    impactLevel: "low",
    estimatedLoss: 0,
    timeImpact: { timelineToFailure: null, urgencyWindow: null },
    recoveryImpact: { recoveryProbability: 1 },
    ownerDecision: { required: false, decision: null, reason: null },
    topImpactDrivers: [],
  })),
}));

import { generateEngagementReport } from "@/services/report-generator";

const row = (id: string, severity: string) => ({
  id, title: id, summary: "s", severity, findingType: "risk", status: "identified",
  createdAt: new Date("2026-09-01T00:00:00.000Z"),
});

beforeEach(() => findingMany.mockReset());

describe("engagement report — finding severity order", () => {
  it("ranks findings critical → high → medium → low, newest-first within a tier", async () => {
    // Newest-first DB order; severities deliberately interleaved.
    findingMany.mockResolvedValue([
      row("med-new", "medium"),
      row("low", "low"),
      row("high", "high"),
      row("crit", "critical"),
      row("med-old", "medium"),
    ]);
    const report = await generateEngagementReport("e-1", "ws-1");
    expect(report.findings.map((f) => f.id)).toEqual(["crit", "high", "med-new", "med-old", "low"]);
    expect(JSON.stringify(findingMany.mock.calls)).not.toMatch(/"severity":"(asc|desc)"/);
  });
});
