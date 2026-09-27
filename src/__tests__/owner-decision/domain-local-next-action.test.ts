/**
 * Domain pages: the local "next step within this area" uses the SAME canonical comparator restricted to
 * the domain's own eligible actions — never priority-score/finding-code order, never a completed,
 * cancelled or verified action, and never a second cross-domain election.
 */
import { describe, it, expect } from "vitest";
import { domainLocalNextAction } from "@/services/owner-home/owner-decision-candidates";

const row = (id: string, findingCode: string, findingId: string, over: Record<string, unknown> = {}) => ({
  id, findingCode, findingId, title: id, status: "proposed", priorityScore: 100, expectedImpactScore: 90, confidence: 0.9, effortScore: 30, verifications: [], ...over,
});

describe("domainLocalNextAction", () => {
  const cycle = { findings: [{ id: "f-run", code: "FIN_LOW_RUNWAY", severity: "high" }, { id: "f-rec", code: "FIN_HIGH_RECEIVABLES", severity: "high" }] };

  it("ranks by business class before finding code (runway beats receivables at equal scores)", () => {
    // Priority-score → finding-code order would pick FIN_HIGH_RECEIVABLES ("H" < "L").
    const actions = [row("receivables", "FIN_HIGH_RECEIVABLES", "f-rec"), row("runway", "FIN_LOW_RUNWAY", "f-run")];
    expect(domainLocalNextAction(actions, cycle, "finance")?.id).toBe("runway");
  });

  it("never returns a completed, cancelled or verified action", () => {
    const actions = [
      row("runway-done", "FIN_LOW_RUNWAY", "f-run", { status: "completed" }),
      row("runway-verified", "FIN_LOW_RUNWAY", "f-run", { verifications: [{ status: "verified_improved", targetDirection: "up", afterValue: 90, targetValue: 60, createdAt: "2026-09-01" }] }),
      row("receivables-cancelled", "FIN_HIGH_RECEIVABLES", "f-rec", { status: "cancelled" }),
      row("receivables", "FIN_HIGH_RECEIVABLES", "f-rec"),
    ];
    expect(domainLocalNextAction(actions, cycle, "finance")?.id).toBe("receivables");
  });

  it("returns null when nothing is open", () => {
    expect(domainLocalNextAction([row("x", "FIN_LOW_RUNWAY", "f-run", { status: "completed" })], cycle, "finance")).toBeNull();
  });
});
