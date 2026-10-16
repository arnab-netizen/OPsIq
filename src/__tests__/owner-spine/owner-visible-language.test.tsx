// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { ownerValueText } from "@/lib/metric-label";
import { FindingCard } from "@/components/owner/FindingCard";

afterEach(() => cleanup());

describe("owner-visible text never prints raw null / undefined", () => {
  it("ownerValueText: missing is 'not entered', numbers and zero are shown as they are", () => {
    expect(ownerValueText(null)).toBe("not entered");
    expect(ownerValueText(undefined)).toBe("not entered");
    expect(ownerValueText(0)).toBe("0");
    expect(ownerValueText(31.25)).toBe("31.25");
    expect(ownerValueText(Number.NaN)).toBe("not available");
    expect(ownerValueText(true)).toBe("yes");
  });
  it("a finding with no measured value or threshold shows neither the word 'null' nor 'undefined'", () => {
    const { container } = render(
      <FindingCard finding={{ id: "f", findingType: "risk", title: "t", summary: "s", sourceMetric: "bankBalance", sourceValue: null, threshold: null, severity: "high", confidence: 0.5 }} />,
    );
    expect(container.textContent).not.toMatch(/\bnull\b|\bundefined\b|bankBalance/);
    expect(container.textContent).toMatch(/bank balance is not entered/);
  });
});
