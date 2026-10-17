// @vitest-environment jsdom
/**
 * N4 — internal identifiers never reach the owner. One shared mapping; every missing-information list goes through it.
 */
import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { ownerFieldLabel, ownerMissingItemText, ownerMissingItems, ownerSafeText, OWNER_FIELD_LABEL } from "@/domain/owner-spine/owner-field-labels";
import { classifyOwnerFindingCode, resolveOwnerDecision, type OwnerDecisionCandidate } from "@/domain/owner-spine/owner-decision";
import { NO_CHANGE_FACTS } from "@/__tests__/owner-decision/change-facts-fixture";
import { OwnerDecisionCard } from "@/components/owner/OwnerDecisionCard";
import { SupervisorSummary } from "@/components/owner/SupervisorSummary";
import { AdjudicationQueue } from "@/components/owner/AdjudicationQueue";
import * as fs from "fs";
import * as path from "path";

afterEach(() => cleanup());

/** The words an implementation prints that an owner must never read as such. */
const RAW = /\b(bankBalance|cashOnHand|cashInHand|refundReworkCost|totalLiquidFunds|dataConfidenceScore)\b|\bundefined\b|\bnull\b|\bNaN\b|\[object Object\]/;

describe("shared owner field labels", () => {
  it("maps the identifiers the audit saw to plain words", () => {
    expect(ownerFieldLabel("bankBalance")).toBe("bank balance");
    expect(ownerFieldLabel("cashOnHand")).toBe("cash in hand");
    expect(ownerFieldLabel("refundReworkCost")).toBe("refunds, redone work and complaint costs");
  });
  it("any camelCase / snake_case key still reads as words (a field added later is never printed raw)", () => {
    expect(ownerFieldLabel("someBrandNewMetric")).toBe("some brand new metric");
    expect(ownerFieldLabel("cash_debt")).toBe("cash debt");
  });
  it("no mapped label itself contains an identifier", () => {
    for (const label of Object.values(OWNER_FIELD_LABEL)) expect(label).not.toMatch(/[a-z][A-Z]/);
  });
  it("ownerSafeText replaces embedded identifiers and bare null/undefined, and leaves ordinary prose alone", () => {
    expect(ownerSafeText("Add bankBalance and cashOnHand first")).toBe("Add bank balance and cash in hand first");
    expect(ownerSafeText("value is null, threshold undefined")).toBe("value is not entered, threshold not entered");
    expect(ownerSafeText("Add your bank balance.")).toBe("Add your bank balance.");
  });
  it("missing items are reworded and de-duplicated after rewording (cashOnHand and cashInHand are one thing)", () => {
    expect(ownerMissingItems(["cashOnHand", "bankBalance", "cashInHand"])).toEqual(["cash in hand", "bank balance"]);
    expect(ownerMissingItemText("bankBalance", { capitalise: true })).toBe("Bank balance");
  });
});

function candidate(over: Partial<OwnerDecisionCandidate> = {}): OwnerDecisionCandidate {
  return {
    candidateId: "domain_action:liq", businessId: "b", workspaceId: "w", source: "domain_action", domain: "finance", sourceId: "liq",
    priorityClass: classifyOwnerFindingCode("FIN_OPP_LIQUIDITY_UNCONFIRMED"), findingCode: "FIN_OPP_LIQUIDITY_UNCONFIRMED", findingId: null,
    title: "Add your cash position, if you know it, to confirm how long your cash will last", explanation: "", severity: "medium",
    priorityScore: 40, expectedImpactScore: 40, confidence: 1, effortScore: 10, status: "proposed", ownerActionRequired: true, blocking: false,
    evidence: [], missingData: ["cashOnHand", "bankBalance"], verificationMetric: "totalLiquidFunds", evidenceAsOf: null,
    stale: false, exclusion: null, targetRoute: "/owner/finance", ...over,
  };
}

describe("Home: the resolver never lets an internal key into missing information", () => {
  const decision = resolveOwnerDecision({
    businessId: "b", workspaceId: "w", candidates: [candidate()], diagnosedDomains: ["finance"],
    dataSufficiency: { status: "caution", lowestDataConfidenceScore: 50, lowConfidenceDomains: [], missingCriticalData: ["revenue", "bankBalance"] },
    staleDomains: [], strategy: null, reassessment: { days: 14, reason: "r" },
    changeFacts: NO_CHANGE_FACTS, gate: null, now: new Date("2026-10-10T00:00:00Z"),
  });
  it("missingInformation is in owner words", () => {
    expect(decision.missingInformation.join(" | ")).not.toMatch(RAW);
    expect(decision.missingInformation).toContain("Bank balance");
    expect(decision.missingInformation).toContain("Cash in hand");
  });
  it("the whole decision payload an owner can read contains none of the raw identifiers in its missing-information text", () => {
    expect(JSON.stringify(decision.missingInformation)).not.toMatch(RAW);
  });
  it("the rendered Home decision card shows owner words", () => {
    const { container } = render(<OwnerDecisionCard decision={decision} />);
    expect(container.textContent).not.toMatch(RAW);
  });
});

describe("components that print missing data", () => {
  it("SupervisorSummary prints owner words for the ledger's missing data", () => {
    const summary = {
      found: true, emergency: false, mainIssue: "m", whyItMatters: "w", doNow: "d", doNotDo: [], ownerDecisionRequired: null, delegateToStaff: [],
      opsiqPreparedWork: [], proofNeeded: [], confidence: "medium", actionStatus: "need_more_data", canProceed: false,
      ledger: { knownFacts: [], assumptions: [], missingData: ["bankBalance", "cashOnHand", "refundReworkCost"], confidenceReason: "c", whatWouldChange: "x" },
      impact: [], cadence: { now: "", today: "", thisWeek: "", reassessmentTrigger: "", kpiWatch: "", stopLoss: "", nextReview: "" }, topPriorities: [],
    };
    const { container } = render(<SupervisorSummary summary={summary} />);
    const text = container.querySelector('[data-testid="supervisor-missing-assumptions"]')?.textContent ?? "";
    expect(text).toMatch(/bank balance, cash in hand, refunds, redone work and complaint costs/);
    expect(container.textContent).not.toMatch(RAW);
  });
  it("AdjudicationQueue prints owner words for an item's missing data", () => {
    const item = {
      id: "q1", sourceType: "PROOF", sourceRef: "r", findingType: "t", title: "A proof needs review", severity: "HIGH", sourceCompleteness: "PARTIAL" as const,
      ownerExplanation: "e", supportingProofCount: 0, representativeProofRefs: [], proofIds: [], actorId: null, actorRole: null, recommendedAction: "r",
      missingData: ["bankBalance"], currentAdjudicationStatus: null, adjudicable: true,
    };
    const { container } = render(<AdjudicationQueue items={[item] as never} outcomeOptions={[]} onAdjudicate={async () => ({ ok: true, message: "" })} />);
    expect(container.textContent).toMatch(/Missing data: bank balance/);
    expect(container.textContent).not.toMatch(RAW);
  });
});

describe("static guard: no owner component joins a raw missingData list", () => {
  const dir = path.resolve(__dirname, "../../components/owner");
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".tsx"));
  it("every `.missingData…join(` in src/components/owner goes through ownerMissingItems", () => {
    const offenders: string[] = [];
    for (const f of files) {
      const lines = fs.readFileSync(path.join(dir, f), "utf8").split("\n");
      lines.forEach((l, i) => {
        if (/missingData[^\n]*\.join\(/.test(l) && !/ownerMissingItems\(/.test(l)) offenders.push(`${f}:${i + 1}`);
      });
    }
    expect(offenders).toEqual([]);
  });
});
