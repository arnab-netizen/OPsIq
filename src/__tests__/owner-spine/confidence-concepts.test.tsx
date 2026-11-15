// @vitest-environment jsdom
/**
 * N5 — the four different things called "confidence" each carry their own explicit label.
 *
 * The same underlying evidence is shown on Home (main-target confidence), Money (data completeness), a finding card (finding
 * strength) and Goals (forecast confidence). They are different quantities and may differ; the tests pin that each has its own
 * label, that no two share one, that the shared 4-step scale is used for the 0–100 concepts, and that the bare word "confidence"
 * is never the whole label.
 */
import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import {
  OWNER_CONFIDENCE_CONCEPT,
  ownerConceptScorePhrase,
  ownerForecastConfidencePhrase,
  ownerTargetConfidencePhrase,
} from "@/domain/owner-spine/confidence-vocabulary";
import { FindingCard } from "@/components/owner/FindingCard";
import { OwnerDecisionCard } from "@/components/owner/OwnerDecisionCard";
import { classifyOwnerFindingCode, resolveOwnerDecision, type OwnerDecisionCandidate } from "@/domain/owner-spine/owner-decision";
import { NO_CHANGE_FACTS } from "@/__tests__/owner-decision/change-facts-fixture";

afterEach(() => cleanup());

describe("N5 — concept labels", () => {
  it("every concept has a distinct, explicit label and a one-line statement of what it measures", () => {
    const labels = Object.values(OWNER_CONFIDENCE_CONCEPT).map((c) => c.label);
    expect(new Set(labels).size).toBe(labels.length);
    expect(OWNER_CONFIDENCE_CONCEPT.DATA_COMPLETENESS.label).toBe("Data completeness");
    expect(OWNER_CONFIDENCE_CONCEPT.FINDING_STRENGTH.label).toBe("Finding strength");
    expect(OWNER_CONFIDENCE_CONCEPT.TARGET_CONFIDENCE.label).toBe("Confidence in this main target");
    expect(OWNER_CONFIDENCE_CONCEPT.GOAL_FORECAST.label).toBe("Forecast confidence");
    for (const c of Object.values(OWNER_CONFIDENCE_CONCEPT)) {
      expect(c.measures.length).toBeGreaterThan(30);
      expect(c.label).not.toBe("Confidence");
    }
  });

  it("the 0–100 concepts share the scale but not the label", () => {
    expect(ownerConceptScorePhrase("DATA_COMPLETENESS", 50)).toBe("Data completeness: Low (50/100)");
    expect(ownerConceptScorePhrase("FINDING_STRENGTH", 100)).toBe("Finding strength: High (100/100)");
    expect(ownerConceptScorePhrase("DATA_COMPLETENESS", 29)).toBe("Data completeness: Too low to rely on (29/100)");
    expect(ownerConceptScorePhrase("FINDING_STRENGTH", Number.NaN)).toBe("Finding strength: Too low to rely on (0/100)");
  });

  it("level concepts map their own levels, and an unknown level is 'Not rated', never a guess", () => {
    expect(ownerTargetConfidencePhrase("moderate")).toBe("Confidence in this main target: Moderate");
    expect(ownerTargetConfidencePhrase("insufficient")).toBe("Confidence in this main target: Too low to rely on");
    expect(ownerTargetConfidencePhrase("???")).toBe("Confidence in this main target: Not rated");
    expect(ownerForecastConfidencePhrase("MEDIUM")).toBe("Forecast confidence: Moderate");
    expect(ownerForecastConfidencePhrase("")).toBe("Forecast confidence: Not rated");
  });
});

function candidate(): OwnerDecisionCandidate {
  return {
    candidateId: "domain_action:x", businessId: "b", workspaceId: "w", source: "domain_action", domain: "finance", sourceId: "x",
    priorityClass: classifyOwnerFindingCode("FIN_OPP_LEAKAGE_REDUCTION"), findingCode: "FIN_OPP_LEAKAGE_REDUCTION", findingId: null,
    title: "Recover margin from cost leakage", explanation: "", severity: "medium", priorityScore: 60, expectedImpactScore: 50, confidence: 0.6,
    effortScore: 35, status: "proposed", ownerActionRequired: true, blocking: false, evidence: [], missingData: [], verificationMetric: null,
    evidenceAsOf: null, stale: false, exclusion: null, targetRoute: "/owner/finance",
  };
}

describe("N5 — the same evidence, shown by each surface", () => {
  // One business: 50% of the information supplied (Money / Home completeness), a finding the figures strongly support (100),
  // and a main target held to moderate confidence by the missing information (Home).
  const decision = resolveOwnerDecision({
    businessId: "b", workspaceId: "w", candidates: [candidate()], diagnosedDomains: ["finance"],
    dataSufficiency: { status: "caution", lowestDataConfidenceScore: 50, lowConfidenceDomains: [], missingCriticalData: [] },
    staleDomains: [], strategy: null, reassessment: { days: 14, reason: "r" }, changeFacts: NO_CHANGE_FACTS, gate: null, now: new Date("2026-10-10T00:00:00Z"),
  });

  it("Home card says WHAT it is confident about", () => {
    render(<OwnerDecisionCard decision={decision} />);
    const text = screen.getByTestId("owner-decision-confidence").textContent ?? "";
    expect(text).toMatch(/^Confidence in this main target: /);
    expect(text).not.toMatch(/Finding strength|Data completeness|Forecast/);
  });

  it("a finding card says it is the strength of THIS finding, and that it is separate from data completeness", () => {
    const { container } = render(
      <FindingCard finding={{ id: "f", findingType: "risk", title: "t", summary: "s", sourceMetric: "x", sourceValue: 1, threshold: null, severity: "low", confidence: 1 }} />,
    );
    const strength = container.querySelector('[data-testid="finding-strength"]')?.textContent ?? "";
    expect(strength).toBe("Finding strength: High (100/100)");
    expect(container.textContent).toMatch(/separate from data completeness/i);
    expect(container.textContent).not.toMatch(/How sure OpsIQ is/);
  });

  it("the three labels on one screen are all different, so no two figures read as contradictory measurements of one thing", () => {
    const data = ownerConceptScorePhrase("DATA_COMPLETENESS", 50);
    const finding = ownerConceptScorePhrase("FINDING_STRENGTH", 100);
    const target = ownerTargetConfidencePhrase("moderate");
    const heads = [data, finding, target].map((p) => p.split(":")[0]);
    expect(new Set(heads).size).toBe(3);
    expect(data).toBe("Data completeness: Low (50/100)");
    expect(finding).toBe("Finding strength: High (100/100)");
  });
});
