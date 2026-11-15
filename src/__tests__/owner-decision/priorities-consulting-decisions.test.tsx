/**
 * Decision 4A — consultant blocked decisions on /owner/priorities, only for users with engagement/consulting
 * access:
 *   - a self-serve owner (no ENGAGEMENT_VIEW) never requests /api/decisions/list and sees no such section;
 *   - an engagement-capable user sees the blocked decisions in a separately labelled, unnumbered section
 *     AFTER the canonical decision, linking to the Decision Inbox;
 *   - the canonical decision stays the sole overall target: the consulting decisions are never merged into
 *     its numbered order and carry no top/first/highest wording.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, waitFor, within } from "@testing-library/react";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { CapabilitiesProvider } from "@/context/capabilities-context";
import { classifyOwnerFindingCode, resolveOwnerDecision, type OwnerDecisionCandidate } from "@/domain/owner-spine/owner-decision";
import { NO_CHANGE_FACTS } from "./change-facts-fixture";

const ctx = { activeBusinessId: "biz-1" as string | null, needsBusinessRecovery: false, businesses: [{ id: "biz-1", name: "Biz" }] };
vi.mock("@/context/active-business-context", () => ({ useActiveBusiness: () => ctx }));

import OwnerPrioritiesPage from "@/app/(authenticated)/owner/priorities/page";

function cand(findingCode: string, title: string, domain: OwnerDecisionCandidate["domain"]): OwnerDecisionCandidate {
  return {
    candidateId: `domain_action:${findingCode}`, businessId: "biz-1", workspaceId: "ws-1", source: "domain_action", domain, sourceId: findingCode,
    priorityClass: classifyOwnerFindingCode(findingCode), findingCode, findingId: null, title, explanation: "", severity: "high", priorityScore: 60,
    expectedImpactScore: 50, confidence: 0.9, effortScore: 40, status: "proposed", ownerActionRequired: true, blocking: false, evidence: [], missingData: [],
    verificationMetric: null, evidenceAsOf: null, stale: false, exclusion: null, targetRoute: `/owner/${domain}`,
  };
}
const decision = resolveOwnerDecision({
  businessId: "biz-1", workspaceId: "ws-1",
  candidates: [cand("CF_LOW_RUNWAY", "Extend the cash runway", "cashflow"), cand("SALES_LOW_CONVERSION", "Fix lead follow-up", "sales")],
  diagnosedDomains: ["cashflow", "sales"],
  dataSufficiency: { status: "sufficient", lowestDataConfidenceScore: 90, lowConfidenceDomains: [], missingCriticalData: [] },
  staleDomains: [], strategy: null, reassessment: { days: 14, reason: "test" }, changeFacts: NO_CHANGE_FACTS, gate: null, now: new Date("2026-09-27T00:00:00Z"),
});

const requested: string[] = [];
function stub() {
  requested.length = 0;
  vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    requested.push(url);
    if (url.includes("/api/owner/now-view")) return Promise.resolve({ ok: true, status: 200, json: async () => ({ ownerDecision: decision }) });
    if (url.includes("/api/decisions/list")) {
      return Promise.resolve({ ok: true, status: 200, json: async () => ({ decisions: [{ id: "d1", title: "Approve the supplier switch", blockReason: "Awaiting the client's sign-off", status: "blocked" }] }) });
    }
    return Promise.resolve({ ok: true, status: 200, json: async () => ({ risks: [], alerts: [] }) });
  }));
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Priorities — consulting decisions (Decision 4A)", () => {
  it("a self-serve owner never requests the consultant Decision Inbox and sees no consulting section", async () => {
    stub();
    render(<CapabilitiesProvider capabilities={[CAPABILITIES.OWNER_VIEW, CAPABILITIES.OWNER_MANAGE]}><OwnerPrioritiesPage /></CapabilitiesProvider>);
    await waitFor(() => expect(screen.getByTestId("priorities-attention")).toBeTruthy());
    expect(requested.some((u) => u.includes("/api/decisions/list"))).toBe(false);
    expect(screen.queryByTestId("priorities-consulting-decisions")).toBeNull();
  });

  it("without any capability context (rendered on its own) nothing extra is requested", async () => {
    stub();
    render(<OwnerPrioritiesPage />);
    await waitFor(() => expect(screen.getByTestId("priorities-attention")).toBeTruthy());
    expect(requested.some((u) => u.includes("/api/decisions/list"))).toBe(false);
  });

  it("an engagement-capable user sees blocked decisions in their own unnumbered section after the canonical decision; the canonical target stays the sole overall target", async () => {
    stub();
    render(<CapabilitiesProvider capabilities={[CAPABILITIES.OWNER_VIEW, CAPABILITIES.ENGAGEMENT_VIEW]}><OwnerPrioritiesPage /></CapabilitiesProvider>);
    const section = await waitFor(() => screen.getByTestId("priorities-consulting-decisions"));
    expect(requested.filter((u) => u.includes("/api/decisions/list"))).toEqual(["/api/decisions/list?status=blocked&limit=20"]);
    expect(within(section).getByText("Consulting decisions requiring attention")).toBeTruthy();
    expect(within(section).getByText("Approve the supplier switch")).toBeTruthy();
    expect(within(section).getByRole("link", { name: /Decision Inbox/ }).getAttribute("href")).toBe("/dashboard/inbox");
    // Unnumbered, and no ranking words.
    expect(section.querySelector("ol")).toBeNull();
    expect(section.textContent ?? "").not.toMatch(/\b(top|first|highest|#1|main target)\b/i);
    // The canonical order is untouched: the same numbered items, the main target first, and the consulting
    // decision is not among them.
    const numbered = screen.getAllByTestId("priority-item");
    expect(numbered.map((n) => n.getAttribute("data-candidate-id"))).toEqual(decision.attention.map((t) => t.candidateId));
    expect(numbered[0].getAttribute("data-candidate-id")).toBe(decision.primaryTarget!.candidateId);
    expect(within(screen.getByTestId("priorities-attention")).queryByText("Approve the supplier switch")).toBeNull();
    // The consulting section follows the canonical order in the document.
    expect(screen.getByTestId("priorities-attention").compareDocumentPosition(section) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
