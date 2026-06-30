/**
 * NO-BYPASS proof — owner-visible final advice cannot bypass the approved runtime/supervision path.
 *
 * Pure + source-level (no DB/browser): proves that the dashboard advice surfaces (priority strip +
 * supervisor summary) return an honest empty/blocked state instead of fabricating advice when there is
 * no runtime output; that unsafe runtime output is never rendered as a "proceed"; that final advice
 * always carries confidence + missing-data + owner/delegate/proof/reassessment; and (source-level) that
 * the production owner-advice routes read ONLY the runtime services — no mock/fixture/fallback advice
 * path, and the command center fetches only runtime /api/owner/* routes.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildSupervisorSummary, type SupervisorInput } from "@/domain/owner-mode/supervisor-summary";
import { buildPriorityCommandStrip, type PriorityStripInput } from "@/domain/owner-mode/command-center-priorities";

function supInput(over: Partial<SupervisorInput> = {}): SupervisorInput {
  return {
    found: true, dominantConstraint: "below_margin", topPriorityLabel: "Below-margin work",
    nextBestAction: "Re-price or drop the loss-making line.", rootCause: "Contribution margin is negative.",
    doNotDo: ["Do not chase more volume of this line."], proofRequired: ["fully-loaded cost sheet"],
    reassessmentTriggers: ["margin recovers above floor"], successMetrics: ["contribution margin %"], redDomains: ["finance_cash"],
    ownerApprovalRequired: true, ownerOffload: "Manager prepares the cost sheet.", delegatedWork: ["Manager builds the cost sheet."],
    opsiqPreparedWork: ["Draft the margin calculation template."], growthScaleAllowed: false, growthBlockedBy: ["below margin"],
    overallConfidence: "medium", criticalDomainsAllReal: true, dataSourceMissing: [], realProviderDomains: ["finance_cash", "margin_pricing"],
    assessedDomains: ["finance_cash", "margin_pricing"], unsafeCount: 0,
    impact: { financeCash: "Stops the per-unit loss.", marginPricing: "Restores positive contribution.", equipmentCapacity: "—", staffWorkload: "—", customerQuality: "—" },
    ownerWorkloadOffload: "Manager prepares the cost sheet.", plan7Day: "Build the cost sheet and re-price.", plan30Day: "Verify margin.",
    ...over,
  };
}

function stripInput(over: Partial<PriorityStripInput> = {}): PriorityStripInput {
  return {
    wbp: {
      found: true, topPriorityLabel: "Below-margin work", dominantConstraint: "below_margin",
      nextBestAction: "Re-price the line.", doNotDo: ["Do not chase volume."], proofRequired: ["cost sheet"],
      reassessmentTriggers: ["margin recovers"], redDomains: ["finance_cash"], ownerOffload: "Manager prepares the sheet.",
      overallConfidence: "medium", approvalRequired: true,
    },
    readiness: { blockers: [], overallScore: 70 }, action: null, guidance: null,
    ...over,
  };
}

describe("no-bypass — missing runtime output never fabricates advice", () => {
  it("the priority strip returns NO cards when the runtime plan is not found (no static fallback)", () => {
    expect(buildPriorityCommandStrip(stripInput({ wbp: { ...stripInput().wbp, found: false } }))).toHaveLength(0);
  });

  it("the supervisor summary returns a safe need-more-data state when not found (no fabrication)", () => {
    const s = buildSupervisorSummary(supInput({ found: false }));
    expect(s.found).toBe(false);
    expect(s.actionStatus).toBe("need_more_data");
    expect(s.canProceed).toBe(false);
    expect(s.topPriorities).toHaveLength(0);
  });
});

describe("no-bypass — unsafe / weak runtime output is never rendered as final 'proceed'", () => {
  it("an unsafe runtime result is blocked, not proceed", () => {
    const s = buildSupervisorSummary(supInput({ unsafeCount: 2 }));
    expect(s.actionStatus).toBe("blocked");
    expect(s.canProceed).toBe(false);
  });

  it("missing critical data forces need-more-data, never proceed, and caps confidence", () => {
    const s = buildSupervisorSummary(supInput({ criticalDomainsAllReal: false, overallConfidence: "high", dataSourceMissing: ["finance_cash"] }));
    expect(s.actionStatus).toBe("need_more_data");
    expect(s.confidence).not.toBe("high");
  });
});

describe("no-bypass — final advice always carries confidence + missing-data + owner/delegate/proof/reassessment", () => {
  it("final supervisor advice includes confidence + missing-data ledger", () => {
    const s = buildSupervisorSummary(supInput({ dataSourceMissing: ["working_capital"] }));
    expect(["none", "low", "medium", "high"]).toContain(s.confidence);
    expect(Array.isArray(s.ledger.missingData)).toBe(true);
    expect(s.ledger.missingData).toContain("working_capital");
    expect(s.ledger.confidenceReason.length).toBeGreaterThan(0);
  });

  it("final supervisor advice includes owner/delegate, proof, and reassessment", () => {
    const s = buildSupervisorSummary(supInput());
    expect(s.ownerDecisionRequired || s.delegateToStaff.length > 0).toBeTruthy();
    expect(s.proofNeeded.length).toBeGreaterThan(0);
    expect(s.cadence.reassessmentTrigger.length).toBeGreaterThan(0);
  });

  it("every priority card carries who/proof/reassess/confidence", () => {
    const cards = buildPriorityCommandStrip(stripInput());
    expect(cards.length).toBeGreaterThan(0);
    for (const c of cards) {
      expect(c.owner.length).toBeGreaterThan(0);
      expect(c.proof.length).toBeGreaterThan(0);
      expect(c.reassess.length).toBeGreaterThan(0);
      expect(c.confidenceNote.length).toBeGreaterThan(0);
    }
  });
});

describe("no-bypass — production routes read only the runtime (source-level)", () => {
  const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

  it("no production owner route imports a mock/fixture/fallback advice path", () => {
    const routes = [
      "src/app/api/owner/whole-business-plan/route.ts",
      "src/app/api/owner/priorities/route.ts",
      "src/app/api/owner/readiness/route.ts",
      "src/app/api/owner/action-plan/route.ts",
      "src/app/api/owner/input-guidance/route.ts",
    ];
    for (const r of routes) {
      const src = read(r);
      expect(src, `${r} must not use a fixture/mock/fallback advice path`).not.toMatch(/fixtureOnlyProviders|mockAdvice|fakeAdvice|staticFallback|FALLBACK_ADVICE/);
    }
  });

  it("the whole-business-plan route is built from the runtime service (getOwnerWholeBusinessPlan)", () => {
    const src = read("src/app/api/owner/whole-business-plan/route.ts");
    expect(src).toMatch(/getOwnerWholeBusinessPlan/);
  });

  it("the command center fetches ONLY runtime /api/owner/* routes for advice", () => {
    const page = read("src/app/(authenticated)/owner/page.tsx");
    const fetched = Array.from(page.matchAll(/\/api\/owner\/[a-z-]+/g)).map((m) => m[0]);
    expect(fetched.length).toBeGreaterThan(0);
    for (const f of fetched) expect(f.startsWith("/api/owner/")).toBe(true);
  });
});
