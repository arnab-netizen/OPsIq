/**
 * Executive Cockpit consolidation — jsdom component test (browser-free UI proof).
 *
 * Proves the progressive-disclosure / anti-overload layout primitives: CockpitGroup is a collapsed
 * <details> by default (secondary content is opted into, not dumped on the owner), still renders its
 * children in the DOM, exposes an accessible summary, and honours defaultOpen; CockpitSubsection keeps a
 * label with its panel.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { CockpitGroup, CockpitSubsection } from "@/components/owner/ProcessIntelligencePanel";

afterEach(() => cleanup());

describe("Executive Cockpit consolidation", () => {
  it("CockpitGroup is a collapsed <details> by default (progressive disclosure, no overload)", () => {
    const { getByTestId } = render(
      <CockpitGroup testid="grp" title="Fix & follow-through">
        <div data-testid="child">inner content</div>
      </CockpitGroup>,
    );
    const details = getByTestId("grp");
    expect(details.tagName.toLowerCase()).toBe("details");
    expect(details.hasAttribute("open")).toBe(false);
    // Children are present in the DOM even while collapsed (available on expand, not fetched on demand).
    expect(getByTestId("child").textContent).toBe("inner content");
  });

  it("CockpitGroup shows its title (and optional subtitle) in the summary", () => {
    const { getByTestId } = render(
      <CockpitGroup testid="grp" title="Reduce your workload & govern actions" subtitle="Avoidable owner burden">
        <div />
      </CockpitGroup>,
    );
    const summary = getByTestId("grp-summary");
    expect(summary.tagName.toLowerCase()).toBe("summary");
    expect(summary.textContent).toMatch(/Reduce your workload & govern actions/);
    expect(summary.textContent).toMatch(/Avoidable owner burden/);
  });

  it("CockpitGroup honours defaultOpen for a group that should start expanded", () => {
    const { getByTestId } = render(
      <CockpitGroup testid="grp" title="Open group" defaultOpen>
        <div />
      </CockpitGroup>,
    );
    expect(getByTestId("grp").hasAttribute("open")).toBe(true);
  });

  it("CockpitSubsection keeps a heading label with its panel", () => {
    const { getByText, getByTestId } = render(
      <CockpitSubsection title="What OpsIQ may do without asking">
        <div data-testid="panel">panel</div>
      </CockpitSubsection>,
    );
    expect(getByText("What OpsIQ may do without asking").tagName.toLowerCase()).toBe("h3");
    expect(getByTestId("panel")).toBeTruthy();
  });
});
