/**
 * UX-05 compatibility: a finance action stores its description when it is created, so an action saved before the
 * wording changed still carries "Guided setup or on the Cashflow page". For a bank-balance action (proved by its code)
 * that text must be presented as the current instruction next to the direct entry link; every other action and
 * already-current text is shown exactly as stored. Stored rows are never rewritten.
 */
import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  BANK_BALANCE_OWNER_ACTION,
  presentBankBalanceActionText,
  presentBankBalanceEvidenceLine,
} from "@/domain/owner-finance/bank-balance-entry";
import { classifyOwnerFindingCode, resolveOwnerDecision, type OwnerDecisionCandidate } from "@/domain/owner-spine/owner-decision";
import { OwnerDecisionCard } from "@/components/owner/OwnerDecisionCard";
import { FindingCard } from "@/components/owner/FindingCard";
import { NO_CHANGE_FACTS } from "@/__tests__/owner-decision/change-facts-fixture";

const LEGACY_DESCRIPTION =
  "If you know them, add your cash in hand and bank balance in Guided setup or on the Cashflow page. Enter 0 only if you really hold nothing there, and leave a figure blank if you don't know it — OpsIQ will say what it can't conclude rather than guess.";
const LEGACY_EVIDENCE = "enter the bank balance (or 0 if you hold nothing in the bank) in Guided setup or Cashflow";

describe("presentBankBalanceActionText", () => {
  it.each(["FINREC_CONFIRM_BANK_BALANCE", "FIN_LIQUIDITY_UNCONFIRMED"])("shows the current instruction for a saved legacy %s action", (code) => {
    const shown = presentBankBalanceActionText(code, LEGACY_DESCRIPTION);
    expect(shown).toBe(BANK_BALANCE_OWNER_ACTION);
    expect(shown).not.toMatch(/Cashflow page|Guided setup/);
    expect(shown).toMatch(/total across your bank accounts/);
    expect(shown).toMatch(/Enter 0 only if you really hold nothing there/);
  });

  it("covers other historical phrasings of the same navigation", () => {
    for (const legacy of ["Add your bank balance in Cashflow.", "Open Guided setup and enter the bank balance."]) {
      expect(presentBankBalanceActionText("FINREC_CONFIRM_BANK_BALANCE", legacy)).toBe(BANK_BALANCE_OWNER_ACTION);
    }
  });

  it("leaves an already-current bank-balance description untouched", () => {
    expect(presentBankBalanceActionText("FINREC_CONFIRM_BANK_BALANCE", BANK_BALANCE_OWNER_ACTION)).toBe(BANK_BALANCE_OWNER_ACTION);
    expect(presentBankBalanceActionText("FINREC_CONFIRM_BANK_BALANCE", "Enter your total bank balance.")).toBe("Enter your total bank balance.");
  });

  it("never touches any other action's description, even one that mentions Cashflow or Guided setup", () => {
    expect(presentBankBalanceActionText("FINREC_IMPROVE_MARGIN", LEGACY_DESCRIPTION)).toBe(LEGACY_DESCRIPTION);
    expect(presentBankBalanceActionText("CASH_LOW_RUNWAY", "Review your Cashflow forecast.")).toBe("Review your Cashflow forecast.");
    expect(presentBankBalanceActionText(null, LEGACY_DESCRIPTION)).toBe(LEGACY_DESCRIPTION);
    expect(presentBankBalanceActionText(undefined, "")).toBe("");
  });
});

describe("presentBankBalanceEvidenceLine", () => {
  it("drops only the exact legacy clause, and only for the bank-balance finding", () => {
    expect(presentBankBalanceEvidenceLine("FIN_LIQUIDITY_UNCONFIRMED", LEGACY_EVIDENCE)).toBe("enter the bank balance (or 0 if you hold nothing in the bank)");
    expect(presentBankBalanceEvidenceLine("FIN_LOW_MARGIN", LEGACY_EVIDENCE)).toBe(LEGACY_EVIDENCE);
    expect(presentBankBalanceEvidenceLine("FIN_LIQUIDITY_UNCONFIRMED", "cash in hand is recorded; bank balance is not")).toBe("cash in hand is recorded; bank balance is not");
  });
});

function candidate(over: Partial<OwnerDecisionCandidate> & { findingCode: string; title: string }): OwnerDecisionCandidate {
  return {
    candidateId: `domain_action:${over.findingCode}`, businessId: "b1", workspaceId: "w1", source: "domain_action", domain: "finance",
    sourceId: over.findingCode, priorityClass: classifyOwnerFindingCode(over.findingCode), findingCode: over.findingCode, findingId: null,
    title: over.title, explanation: over.explanation ?? "", severity: "medium", priorityScore: 60, expectedImpactScore: 50, confidence: 0.9,
    effortScore: 40, status: "proposed", ownerActionRequired: true, blocking: false, evidence: [], missingData: [], verificationMetric: null,
    evidenceAsOf: null, stale: false, exclusion: null, targetRoute: "/owner/finance",
  };
}
const decisionFor = (c: OwnerDecisionCandidate) =>
  resolveOwnerDecision({
    businessId: "b1", workspaceId: "w1", candidates: [c], diagnosedDomains: ["finance"],
    dataSufficiency: { status: "sufficient", lowestDataConfidenceScore: 90, lowConfidenceDomains: [], missingCriticalData: [] },
    staleDomains: [], strategy: null, reassessment: { days: 14, reason: "test" }, changeFacts: NO_CHANGE_FACTS, gate: null, now: new Date("2026-10-20T12:00:00Z"),
  });

describe("Home's main-target card for a saved legacy bank-balance action", () => {
  it("shows the current instruction beside the direct entry link and none of the old navigation", () => {
    const html = renderToStaticMarkup(
      createElement(OwnerDecisionCard, { decision: decisionFor(candidate({ findingCode: "FIN_LIQUIDITY_UNCONFIRMED", title: "Add your bank balance", explanation: LEGACY_DESCRIPTION })) }),
    );
    expect(html).toContain("total across your bank accounts");
    expect(html).toContain("Enter your bank balance");
    expect(html).toContain('href="/owner/cashflow"');
    expect(html).not.toContain("Cashflow page");
    expect(html).not.toContain("Guided setup");
  });

  it("shows another action's stored text exactly as saved", () => {
    const html = renderToStaticMarkup(
      createElement(OwnerDecisionCard, { decision: decisionFor(candidate({ findingCode: "FIN_LOW_MARGIN", title: "Raise your margin", explanation: "Review your Cashflow forecast." })) }),
    );
    expect(html).toContain("Review your Cashflow forecast.");
    expect(html).not.toContain("bank-balance-entry-link");
  });
});

describe("Money's finding evidence for a saved legacy bank-balance finding", () => {
  const finding = (code: string, evidence: string[]) => ({
    id: "f1", code, findingType: "opportunity", title: "Add your bank balance", summary: "s", sourceMetric: "totalLiquidFunds", sourceValue: null,
    threshold: null, severity: "medium", confidence: 0.9, evidence,
  });

  it("removes the old navigation clause", () => {
    const html = renderToStaticMarkup(createElement(FindingCard, { finding: finding("FIN_LIQUIDITY_UNCONFIRMED", [LEGACY_EVIDENCE]) }));
    expect(html).toContain("enter the bank balance (or 0 if you hold nothing in the bank)");
    expect(html).not.toContain("Guided setup");
    expect(html).not.toContain("Cashflow");
  });

  it("leaves any other finding's evidence alone", () => {
    const html = renderToStaticMarkup(createElement(FindingCard, { finding: finding("FIN_LOW_MARGIN", [LEGACY_EVIDENCE]) }));
    expect(html).toContain("in Guided setup or Cashflow");
  });
});
