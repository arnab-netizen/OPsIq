// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { ownerConfidenceLevel, ownerConfidenceLabel, ownerConfidencePhrase } from "@/domain/owner-spine/confidence-vocabulary";
import { confidenceTierFromScore } from "@/domain/owner-finance/data-confidence";
import { buildFirstMoneyRead } from "@/domain/owner-first-run/first-money-read";
import { FindingCard } from "@/components/owner/FindingCard";

afterEach(() => cleanup());

describe("one confidence vocabulary: the same number reads the same on every owner surface", () => {
  it.each([[100, "HIGH", "High confidence"], [85, "HIGH", "High confidence"], [84, "MODERATE", "Moderate confidence"], [60, "MODERATE", "Moderate confidence"], [59, "LOW", "Low confidence"], [30, "LOW", "Low confidence"], [29, "INSUFFICIENT", "Too low to rely on"], [0, "INSUFFICIENT", "Too low to rely on"]] as const)(
    "%s → %s",
    (score, level, label) => {
      expect(ownerConfidenceLevel(score)).toBe(level);
      expect(ownerConfidenceLabel(score)).toBe(label);
      // the finance tier is the same thresholds (HIGH/MEDIUM/LOW/BLOCKED ↔ HIGH/MODERATE/LOW/INSUFFICIENT)
      expect({ HIGH: "HIGH", MEDIUM: "MODERATE", LOW: "LOW", BLOCKED: "INSUFFICIENT" }[confidenceTierFromScore(score)]).toBe(level);
    },
  );
  it("non-finite input is the lowest level, never a high one", () => {
    expect(ownerConfidenceLevel(Number.NaN)).toBe("INSUFFICIENT");
    expect(ownerConfidencePhrase(Number.NaN)).toBe("Too low to rely on (0/100)");
  });
  it("a finding at 0.85 reads 'High confidence (85/100)' — not 'Very sure', 'Fairly confident' or a bare number", () => {
    const { container } = render(
      <FindingCard finding={{ id: "f", findingType: "opportunity", title: "t", summary: "s", sourceMetric: "x", sourceValue: 1, threshold: null, severity: "low", confidence: 0.85 }} />,
    );
    expect(container.textContent).toMatch(/High confidence \(85\/100\)/);
    expect(container.textContent).not.toMatch(/Very sure|Fairly confident|Reasonably sure/);
  });
  it("the first read words the same score with the same label", () => {
    const read = (confidenceScore: number) =>
      buildFirstMoneyRead({
        finding: null, action: null, dataRequest: null, confidenceScore, evidenceQuality: "ACTUAL", missingEvidence: [],
        period: { start: "2026-09-01T00:00:00.000Z", end: "2026-09-30T00:00:00.000Z", state: "completed" },
      });
    expect(read(85).confidenceLabel).toBe(ownerConfidenceLabel(85));
    expect(read(70).confidenceLabel).toBe(ownerConfidenceLabel(70));
    expect(read(40).confidenceLabel).toMatch(/^Low confidence/);
    expect(read(10).confidenceLabel).toMatch(/^Too low to rely on/);
  });
});
