// @vitest-environment jsdom
/**
 * N3 — Home must not say "no profit leak" while its own main target says a cost leak was found.
 *
 * Two readings share the word "leak": the activity-based radar (placeholder DATA_INSUFFICIENT = "cannot rate a leak") and the
 * Finance cost-leakage finding measured from the saved money figures. Both are driven here from one deterministic case.
 */
import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { identifyProfitLeaks, type ProfitLeakFinding, type ProfitLeakSignals } from "@/domain/owner-mode/profit-leak-radar";
import { financeCostLeakTarget, presentProfitLeakCard } from "@/domain/owner-mode/profit-leak-presentation";
import { classifyOwnerFindingCode, resolveOwnerDecision, type CurrentOwnerDecision, type OwnerDecisionCandidate } from "@/domain/owner-spine/owner-decision";
import { NO_CHANGE_FACTS } from "@/__tests__/owner-decision/change-facts-fixture";
import { MinimumOwnerCockpit } from "@/components/owner/MinimumOwnerCockpit";
import type { BridgedRouteView, ProcessExecutionBridgeView } from "@/components/owner/ProcessIntelligencePanel";

afterEach(() => cleanup());

const NOW = "2026-10-10T00:00:00.000Z";
const signals = (o: Partial<ProfitLeakSignals> = {}): ProfitLeakSignals => ({ workspaceId: "w", evaluatedAt: NOW, ...o });

function cand(findingCode: string, title: string, domain: OwnerDecisionCandidate["domain"] = "finance"): OwnerDecisionCandidate {
  return {
    candidateId: `domain_action:${findingCode}`, businessId: "b", workspaceId: "w", source: "domain_action", domain, sourceId: findingCode,
    priorityClass: classifyOwnerFindingCode(findingCode), findingCode, findingId: null, title, explanation: "", severity: "medium", priorityScore: 60,
    expectedImpactScore: 50, confidence: 0.8, effortScore: 30, status: "proposed", ownerActionRequired: true, blocking: false, evidence: [], missingData: [],
    verificationMetric: null, evidenceAsOf: null, stale: false, exclusion: null, targetRoute: `/owner/${domain}`,
  };
}
const decide = (candidates: OwnerDecisionCandidate[]): CurrentOwnerDecision =>
  resolveOwnerDecision({
    businessId: "b", workspaceId: "w", candidates, diagnosedDomains: ["finance"],
    dataSufficiency: { status: "sufficient", lowestDataConfidenceScore: 90, lowConfidenceDomains: [], missingCriticalData: [] },
    staleDomains: [], strategy: null, reassessment: { days: 14, reason: "r" }, changeFacts: NO_CHANGE_FACTS, gate: null, now: new Date(NOW),
  });

// The radar reads activity records; with none of them it returns the DATA_INSUFFICIENT placeholder. This is the audit case:
// the saved MONEY figures carry cost leakage, but no activity signal exists.
const placeholder = (): ProfitLeakFinding => identifyProfitLeaks(signals()).topLeak as ProfitLeakFinding;
const leakDecision = () => decide([cand("FIN_OPP_LEAKAGE_REDUCTION", "Recover margin from cost leakage")]);

// The "Also worth knowing" block only renders once the bridge has a top route (see minimum-owner-cockpit-profit-leak.test.tsx).
function bridge(): ProcessExecutionBridgeView {
  const r: BridgedRouteView = {
    taskKey: "pc:c-owner", sourceFamily: "PROCESS_CORRECTION", sourceFindingKey: "c-owner", executionRoute: "CREATE_OWNER_APPROVAL_TASK",
    actionOwner: "OWNER", approvalLevel: "OWNER_APPROVAL_REQUIRED", requiredEvidence: [], completionCriteria: "Owner records a decision.",
    reassessmentTrigger: "Re-evaluate at next review.", riskIfIgnored: "the breakdown compounds", ownerVisibleSummary: "Approve the process correction",
    notActionableReason: null, evidenceRefs: [], severity: "HIGH", priorityRank: 1, status: "PROPOSED",
  };
  return { routes: [r], topRoute: r, summary: { total: 1, ownerApproval: 1, managerStaff: 0, dataTasks: 0, monitorOnly: 0 } };
}

describe("N3 — the presentation is derived from BOTH readings", () => {
  it("the radar placeholder is the insufficient case", () => {
    expect(placeholder().leakType).toBe("DATA_INSUFFICIENT");
  });

  it("current Finance cost-leak recommendation + radar placeholder → never an unqualified 'no leak'", () => {
    const view = presentProfitLeakCard(placeholder(), leakDecision());
    expect(view.headline).toBe("Cost leakage found in your Money figures");
    expect(`${view.headline} ${view.scopeNote}`).not.toMatch(/no profit leak/i);
    expect(view.scopeNote).toMatch(/Recover margin from cost leakage/);
    expect(view.scopeNote).toMatch(/activity check on this card has no extra leak to add yet/);
    expect(view.showRadarExplanation).toBe(false); // the radar's own "No clear profit-leak signal yet" would restate the contradiction
    expect(view.radarFinding).toBe(false);
  });

  it("insufficient data and no Finance leak → says the check cannot rate a leak (not that none exists)", () => {
    for (const d of [null, decide([cand("SALES_LOW_CONVERSION", "Raise conversion", "sales")])]) {
      const view = presentProfitLeakCard(placeholder(), d);
      expect(view.headline).toBe("Not enough activity data to rate profit leaks yet");
      expect(view.headline).not.toMatch(/no profit leak detected/i);
      expect(view.scopeNote).toMatch(/not a finding that nothing is leaking/);
      expect(view.showRadarExplanation).toBe(true);
    }
  });

  it("a genuine radar finding keeps its original heading, area and explanation", () => {
    const real = identifyProfitLeaks(signals({ revenue: 100_000, discountAmount: 20_000, discountLeak: true })).topLeak as ProfitLeakFinding;
    expect(real.leakType).not.toBe("DATA_INSUFFICIENT");
    const view = presentProfitLeakCard(real, leakDecision());
    expect(view).toMatchObject({ headline: "Profit leak detected", radarFinding: true, scopeNote: null, showRadarExplanation: true });
  });

  it("every Finance leakage code is recognised, in the main target or a supporting step, but only for Finance", () => {
    for (const code of ["FIN_OPP_LEAKAGE_REDUCTION", "FIN_DISCOUNT_LEAKAGE", "FIN_REFUND_REWORK_LEAKAGE", "FINREC_REDUCE_LEAKAGE"]) {
      expect(financeCostLeakTarget(decide([cand(code, "x")]))).not.toBeNull();
    }
    expect(financeCostLeakTarget(decide([cand("FIN_OPP_LEAKAGE_REDUCTION", "x", "sales")]))).toBeNull();
    expect(financeCostLeakTarget(null)).toBeNull();
  });
});

describe("N3 — as rendered on Home", () => {
  it("the Home cockpit with a Finance cost-leak target and the radar placeholder never shows 'No profit leak detected yet'", () => {
    const { container } = render(<MinimumOwnerCockpit bridge={bridge()} topProfitLeak={placeholder()} ownerDecision={leakDecision()} />);
    const section = container.querySelector('[data-testid="cockpit-profit-leak-section"]');
    expect(section).not.toBeNull();
    expect(container.textContent).not.toMatch(/No profit leak detected yet/);
    expect(section?.textContent).toMatch(/Cost leakage found in your Money figures/);
    // …while the main target itself still says what the leak is
    expect(container.textContent).toMatch(/Recover margin from cost leakage/);
  });

  it("the insufficient-data state is honest on Home", () => {
    const { container } = render(<MinimumOwnerCockpit bridge={bridge()} topProfitLeak={placeholder()} ownerDecision={null} />);
    expect(container.querySelector('[data-testid="cockpit-profit-leak-section"]')?.textContent).toMatch(/Not enough activity data to rate profit leaks yet/);
    expect(container.textContent).not.toMatch(/No profit leak detected yet/);
  });
});
