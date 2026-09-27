/**
 * Hard presentation invariant: for the same business and state,
 *   Home primary == Cockpit primary == Priorities #1 (== Owner Now View headline target).
 *
 * All four surfaces render the SAME server-resolved `CurrentOwnerDecision`; none of them may elect a
 * different winner — not even when the process-execution bridge offers a governed route about
 * something else (the Cockpit used to label that route "Your top priority now") or when Now View's
 * own operating signals point elsewhere.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, waitFor, within } from "@testing-library/react";
import OwnerPrioritiesPage from "@/app/(authenticated)/owner/priorities/page";
import OwnerHomePage from "@/app/(authenticated)/owner/home/page";
import { MinimumOwnerCockpit } from "@/components/owner/MinimumOwnerCockpit";
import { ActiveBusinessProvider } from "@/context/active-business-context";
import { classifyOwnerFindingCode, resolveOwnerDecision, type OwnerDecisionCandidate } from "@/domain/owner-spine/owner-decision";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const BIZ = "biz-1";
const WS = "ws-1";

function cand(findingCode: string, title: string, domain: OwnerDecisionCandidate["domain"], severity: OwnerDecisionCandidate["severity"], priorityScore: number): OwnerDecisionCandidate {
  return {
    candidateId: `domain_action:${domain}:${findingCode}`, businessId: BIZ, workspaceId: WS, source: "domain_action", domain,
    sourceId: findingCode, priorityClass: classifyOwnerFindingCode(findingCode), findingCode, findingId: null, title, explanation: "",
    severity, priorityScore, expectedImpactScore: 50, confidence: 0.9, effortScore: 30, status: "proposed", ownerActionRequired: true,
    blocking: false, evidence: [], missingData: [], verificationMetric: null, evidenceAsOf: null, stale: false, exclusion: null,
    targetRoute: `/owner/${domain}`,
  };
}

// A realistic conflict: a saturated growth item vs a lower-scored cash-survival item.
const DECISION = JSON.parse(JSON.stringify(resolveOwnerDecision({
  businessId: BIZ,
  workspaceId: WS,
  candidates: [
    cand("STR_OPP_STRONG_RETURN", "Open the second outlet", "strategy", "low", 100),
    cand("CF_LOW_RUNWAY", "Protect your cash runway", "cashflow", "high", 55),
    cand("FIN_DISCOUNT_LEAKAGE", "Tighten discounting", "finance", "medium", 70),
  ],
  diagnosedDomains: ["cashflow", "finance", "strategy"],
  dataSufficiency: { status: "sufficient", lowestDataConfidenceScore: 90, lowConfidenceDomains: [], missingCriticalData: [] },
  staleDomains: [],
  strategy: null,
  reassessment: { days: 7, reason: "weekly" },
  previous: null,
  events: [],
  
  now: new Date("2026-09-27T10:00:00.000Z"),
})));
const PRIMARY = "Protect your cash runway";

// A real-shaped governed route (process-execution bridge) about something OTHER than the primary.
const GOVERNED_ROUTE = {
  taskKey: "pc:biz-1:SOMETHING_ELSE", sourceFamily: "PROCESS_CORRECTION", sourceFindingKey: "c-else",
  executionRoute: "CREATE_OWNER_APPROVAL_TASK", actionOwner: "OWNER", approvalLevel: "OWNER_APPROVAL_REQUIRED",
  requiredEvidence: ["the supporting evidence"], completionCriteria: "Recorded decision.",
  reassessmentTrigger: "Next review.", riskIfIgnored: "Costs stay invisible",
  ownerVisibleSummary: "Capture unit cost per job", notActionableReason: null, evidenceRefs: ["proof-1"],
  severity: "CRITICAL", priorityRank: 1, status: "PROPOSED", canStart: true,
};

function stubServer() {
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      const ok = (body: unknown) => Promise.resolve({ ok: true, status: 200, json: async () => body });
      if (url.includes("/api/owner/businesses")) return ok({ businesses: [{ id: BIZ, name: "QA Biz", businessType: "generic_local_service", currency: "INR", isActive: true }] });
      if (url.includes("/api/owner/home")) return ok({ businesses: [{ id: BIZ, name: "QA Biz" }], selectedBusinessId: BIZ, hasData: false, domainsWired: [], summary: null, currentOwnerDecision: DECISION });
      if (url.includes("/api/owner/now-view")) return ok({ ownerDecision: DECISION, processExecution: { topRoute: GOVERNED_ROUTE, routes: [GOVERNED_ROUTE] }, view: {} });
      return ok({ risks: [], alerts: [], decisions: [], unreadCount: 0 });
    })
  );
}

describe("Home = Cockpit = Priorities #1 (same canonical decision, no local election)", () => {
  it("the canonical primary is the cash-survival item, not the saturated growth item", () => {
    expect(DECISION.primaryTarget.title).toBe(PRIMARY);
  });

  it("Priorities renders the canonical primary as #1, and the governed route never outranks it", async () => {
    stubServer();
    render(<ActiveBusinessProvider><OwnerPrioritiesPage /></ActiveBusinessProvider>);
    await waitFor(() => expect(screen.getAllByTestId("priority-item").length).toBe(3));
    const items = screen.getAllByTestId("priority-item");
    expect(within(items[0]).getByText(PRIMARY)).toBeTruthy();
    expect(items.map((el) => el.getAttribute("data-candidate-id"))).toEqual(DECISION.attention.map((t: { candidateId: string }) => t.candidateId));
    expect(screen.getByTestId("owner-decision-title").textContent).toBe(PRIMARY);
    // The governed route is present, unranked, and clearly not the main target.
    expect(within(screen.getByTestId("priorities-governed-work")).getByText("Capture unit cost per job")).toBeTruthy();
  });

  it("Home renders the same primary", async () => {
    stubServer();
    render(<ActiveBusinessProvider><OwnerHomePage /></ActiveBusinessProvider>);
    await waitFor(() => expect(screen.getByTestId("owner-decision-title")).toBeTruthy());
    expect(screen.getByTestId("owner-decision-title").textContent).toBe(PRIMARY);
  });

  it("Cockpit renders the same primary above governed work, and never calls the governed route the top priority", () => {
    render(
      <MinimumOwnerCockpit
        bridge={{ topRoute: GOVERNED_ROUTE, routes: [GOVERNED_ROUTE] } as never}
        ownerDecision={DECISION}
        activeBusinessId={BIZ}
      />
    );
    expect(screen.getByTestId("owner-decision-title").textContent).toBe(PRIMARY);
    expect(screen.queryByText("Your top priority now")).toBeNull();
    expect(screen.getByText("Governed work you can start")).toBeTruthy();
    const cockpit = screen.getByTestId("owner-cockpit");
    const decisionEl = within(cockpit).getByTestId("owner-decision");
    const governedEl = within(cockpit).getByTestId("cockpit-top-action");
    expect(decisionEl.compareDocumentPosition(governedEl) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("Cockpit clean state (no governed route) shows the canonical primary, not a Finance-first card", () => {
    render(<MinimumOwnerCockpit bridge={null} ownerDecision={DECISION} activeBusinessId={BIZ} />);
    expect(screen.getByTestId("owner-decision-title").textContent).toBe(PRIMARY);
    expect(screen.queryByTestId("cockpit-finance-priority-primary")).toBeNull();
    expect(screen.queryByTestId("cockpit-domain-priority-primary")).toBeNull();
  });
});
