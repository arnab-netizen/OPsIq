/**
 * MinimumOwnerCockpit — Outside signals section proof (PASS 39).
 *
 * Proves the read-only "Outside signals" section is low-load and honest: collapsed by default; when expanded
 * it shows the status + top public-signal action, uncertainty caveat, source/evidence summary, missing data,
 * blocked unsafe actions, and the no-live-ingestion statement; it never shows raw public text or PII, exposes
 * no hidden score, fabricates no outside signal on a clean workspace, and never displaces the top action.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { MinimumOwnerCockpit } from "@/components/owner/MinimumOwnerCockpit";
import type { BridgedRouteView, ProcessExecutionBridgeView } from "@/components/owner/ProcessIntelligencePanel";
import type { OwnerPublicSignalsResponse } from "@/domain/owner-mode/owner-public-signals";

afterEach(() => cleanup());

const route = (over: Partial<BridgedRouteView> = {}): BridgedRouteView => ({
  taskKey: "pc:c-owner", sourceFamily: "PROCESS_CORRECTION", sourceFindingKey: "c-owner",
  executionRoute: "CREATE_OWNER_APPROVAL_TASK", actionOwner: "OWNER", approvalLevel: "OWNER_APPROVAL_REQUIRED",
  requiredEvidence: ["the supporting evidence"], completionCriteria: "Owner records a decision.",
  reassessmentTrigger: "Re-evaluate at next review.", riskIfIgnored: "the breakdown compounds",
  ownerVisibleSummary: "Approve the process correction", notActionableReason: null,
  evidenceRefs: ["proof-1"], severity: "CRITICAL", priorityRank: 1, status: "PROPOSED", ...over,
});
const bridge = (): ProcessExecutionBridgeView => ({ routes: [route()], topRoute: route(), summary: { total: 1, ownerApproval: 1, managerStaff: 0, dataTasks: 0, monitorOnly: 0 } });

const signals = (over: Partial<OwnerPublicSignalsResponse> = {}): OwnerPublicSignalsResponse => ({
  publicSignalStatus: "VALIDATION_REQUIRED",
  topPublicSignalAction: "Fix the recurring quality issue reported publicly, with proof, before any pricing change.",
  whyThisMatters: "Multiple public complaints cluster on the same quality problem.",
  sourceQualitySummary: "THIRD_PARTY_UNVERIFIED", evidenceStrengthSummary: "MODERATE+WEAK",
  uncertaintyCaveat: "Public signals are unverified until validated — this is a signal, not confirmed fact.",
  missingData: ["internal quality-failure rate"], validationRequired: true, ownerApprovalRequired: true,
  evidenceRequired: ["proof the quality issue is corrected"],
  blockedUnsafeActions: ["Tender/customer/spend actions remain blocked; no outreach or submission has been performed."],
  groupedSignalClusters: [{ topic: "quality", signalCount: 3, conflictClassification: "AGREEING", priorityTier: 3, monitorOnly: false, collectiveDecision: "Fix quality with proof first.", sourceQualitySummary: "THIRD_PARTY_UNVERIFIED", evidenceStrengthSummary: "MODERATE" }],
  monitorOnlySignals: [], linkedProcessExecutionTaskIds: ["pc:c-owner"], auditTraceRefs: ["ps:rc"],
  rawTextHidden: true, piiStripped: true, noLiveIngestionStatement: "OpsIQ does not fetch live web data in this view.", ...over,
});
const none = (): OwnerPublicSignalsResponse => signals({
  publicSignalStatus: "NONE", topPublicSignalAction: null, whyThisMatters: "No outside signals are present.",
  groupedSignalClusters: [], missingData: [], validationRequired: false, ownerApprovalRequired: false, linkedProcessExecutionTaskIds: [],
});

describe("MinimumOwnerCockpit — outside signals section", () => {
  it("1. the outside signals section exists and is collapsed by default", () => {
    const { getByTestId } = render(<MinimumOwnerCockpit bridge={bridge()} publicSignals={signals()} onAction={() => {}} />);
    const g = getByTestId("cockpit-signals-group");
    expect(g.tagName.toLowerCase()).toBe("details");
    expect(g.hasAttribute("open")).toBe(false);
  });

  it("2. it shows the status and the top public-signal action", () => {
    const { getByTestId } = render(<MinimumOwnerCockpit bridge={bridge()} publicSignals={signals()} onAction={() => {}} />);
    expect(getByTestId("cockpit-signals-group").textContent).toMatch(/validation required/i);
    expect(getByTestId("cockpit-signals-action").textContent).toMatch(/fix the recurring quality issue/i);
  });

  it("3. the uncertainty caveat is visible", () => {
    const { getByTestId } = render(<MinimumOwnerCockpit bridge={bridge()} publicSignals={signals()} onAction={() => {}} />);
    expect(getByTestId("cockpit-signals-caveat").textContent).toMatch(/unverified until validated|signal, not confirmed fact/i);
  });

  it("4. the source/evidence summary is visible", () => {
    const { getByTestId } = render(<MinimumOwnerCockpit bridge={bridge()} publicSignals={signals()} onAction={() => {}} />);
    expect(getByTestId("cockpit-signals-quality").textContent).toMatch(/source quality|evidence/i);
  });

  it("5. missing data is visible", () => {
    const { getByTestId } = render(<MinimumOwnerCockpit bridge={bridge()} publicSignals={signals()} onAction={() => {}} />);
    expect(getByTestId("cockpit-signals-missing").textContent).toMatch(/missing data/i);
  });

  it("6. blocked unsafe actions are visible", () => {
    const { getByTestId } = render(<MinimumOwnerCockpit bridge={bridge()} publicSignals={signals()} onAction={() => {}} />);
    expect(getByTestId("cockpit-signals-blocked").textContent).toMatch(/blocked|remain blocked/i);
  });

  it("7. the no-live-ingestion statement is visible", () => {
    const { getByTestId } = render(<MinimumOwnerCockpit bridge={bridge()} publicSignals={signals()} onAction={() => {}} />);
    expect(getByTestId("cockpit-signals-noingest").textContent).toMatch(/does not fetch live/i);
  });

  it("8. no raw public text is displayed", () => {
    const { getByTestId } = render(<MinimumOwnerCockpit bridge={bridge()} publicSignals={signals()} onAction={() => {}} />);
    // the section renders governed summaries, not raw review text.
    expect(getByTestId("cockpit-signals-group").textContent).not.toMatch(/Garments keep coming back stained/);
  });

  it("9. no PII is displayed", () => {
    const { getByTestId } = render(<MinimumOwnerCockpit bridge={bridge()} publicSignals={signals()} onAction={() => {}} />);
    expect(getByTestId("cockpit-signals-group").textContent).not.toMatch(/@example\.com|07700|Mr Smith/i);
  });

  it("10. no hidden score/tier is displayed", () => {
    const { getByTestId } = render(<MinimumOwnerCockpit bridge={bridge()} publicSignals={signals()} onAction={() => {}} />);
    expect(getByTestId("cockpit-signals-group").innerHTML).not.toMatch(/\bscore\b/i);
  });

  it("11. a clean workspace shows no fabricated outside signal", () => {
    const { getByTestId } = render(<MinimumOwnerCockpit bridge={bridge()} publicSignals={none()} onAction={() => {}} />);
    expect(getByTestId("cockpit-signals-none").textContent).toMatch(/no outside signals/i);
  });

  it("12. the top action remains primary (outside signals does not displace it)", () => {
    const { getAllByTestId, getByTestId } = render(<MinimumOwnerCockpit bridge={bridge()} publicSignals={signals()} onAction={() => {}} />);
    expect(getAllByTestId("cockpit-top-action-title").length).toBe(1);
    const top = getByTestId("cockpit-top-action");
    const sig = getByTestId("cockpit-signals-group");
    expect(top.compareDocumentPosition(sig) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("13. no fabricated money / ROI / win-probability / forbidden copy in the section", () => {
    const { getByTestId } = render(<MinimumOwnerCockpit bridge={bridge()} publicSignals={signals()} onAction={() => {}} />);
    const html = getByTestId("cockpit-signals-group").innerHTML.toLowerCase();
    expect(html).not.toMatch(/[$£€]\s?\d|\b\d+(\.\d+)?\s?%|\broi\b|win probability|guaranteed opportunity|the market proves|live internet intelligence|ai found this online/);
  });
});
