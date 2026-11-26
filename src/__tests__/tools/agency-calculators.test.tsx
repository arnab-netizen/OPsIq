/**
 * Calculator suite: registry integrity, SEO metadata, Clarity boundary, analytics payload allowlist, and the real component
 * behaviour (validation, "not available" handling, reset, events, and zero data leaving the browser).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const trackMock = vi.fn();
vi.mock("@vercel/analytics", () => ({ track: (...args: unknown[]) => trackMock(...args) }));

import { AGENCY_TOOLS, PUBLIC_TOOL_PATHS, getAgencyTool, type AgencyToolId } from "@/services/tools/agency/registry";
import { AgencyCalculator } from "@/components/tools/agency/AgencyCalculator";
import { CALC_CONFIGS, makeFmt } from "@/components/tools/agency/configs";
import { buildToolMetadata } from "@/components/tools/agency/tool-metadata";
import { TOOL_CONTENT } from "@/components/tools/agency/tool-content";
import {
  CALCULATOR_ANALYTICS_IDS,
  CALCULATOR_EVENT_NAMES,
  buildCalculatorEventPayload,
  resetCalculatorEventDedupe,
  trackCalculatorEvent,
} from "@/lib/analytics/calculator-events";
import { isClarityEligiblePath, isDocumentNavigationRequired } from "@/lib/analytics/clarity-policy";
import { isPublicAnalyticsPath } from "@/lib/analytics/public-page-analytics";
import { buildSitemap } from "@/services/public-site/sitemap";

const ROOT = process.cwd();
const IDS: AgencyToolId[] = AGENCY_TOOLS.map((t) => t.id);

beforeEach(() => {
  trackMock.mockClear();
  resetCalculatorEventDedupe();
});
afterEach(() => cleanup());

describe("registry and SEO metadata", () => {
  it("has six tools with unique routes, titles and descriptions inside the search-result length limits", () => {
    expect(AGENCY_TOOLS).toHaveLength(6);
    expect(new Set(AGENCY_TOOLS.map((t) => t.path)).size).toBe(6);
    expect(new Set(AGENCY_TOOLS.map((t) => t.title)).size).toBe(6);
    expect(new Set(AGENCY_TOOLS.map((t) => t.description)).size).toBe(6);
    for (const t of AGENCY_TOOLS) {
      expect(t.title.length).toBeLessThanOrEqual(60);
      expect(t.description.length).toBeLessThanOrEqual(155);
      expect(t.path.startsWith("/tools/")).toBe(true);
    }
  });

  it("every tool has a route file, original content, valid related links and real resource slugs", () => {
    const slugs = readdirSync(join(ROOT, "content/resources")).map((f) => f.replace(/\.md$/, ""));
    for (const t of AGENCY_TOOLS) {
      expect(existsSync(join(ROOT, "src/app", t.path, "page.tsx"))).toBe(true);
      expect(t.related.length).toBeGreaterThanOrEqual(2);
      for (const r of t.related) expect(IDS).toContain(r);
      for (const s of t.resources) expect(slugs).toContain(s);
      const c = TOOL_CONTENT[t.id];
      expect(c.definitions.length).toBeGreaterThanOrEqual(3);
      expect(c.formulas.length).toBeGreaterThanOrEqual(3);
      expect(c.faq.length).toBeGreaterThanOrEqual(3);
      expect(c.limitations.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("emits a self-referencing canonical and no noindex for every tool", () => {
    for (const t of AGENCY_TOOLS) {
      const m = buildToolMetadata(t.id);
      expect(String(m.alternates?.canonical)).toBe(`https://opsiq.solutions${t.path}`);
      expect(m.robots).toBeUndefined();
      expect(m.title).toBe(t.title);
    }
  });

  it("uses no unsupported superlatives in any public copy", () => {
    const text = JSON.stringify([AGENCY_TOOLS, TOOL_CONTENT]).toLowerCase();
    for (const banned of ["best calculator", "number one", "#1", "guarantee"]) expect(text).not.toContain(banned);
  });

  it("is in the sitemap exactly once each, with the hub and the existing calculator preserved", () => {
    const urls = buildSitemap([]).map((e) => e.url);
    for (const p of PUBLIC_TOOL_PATHS) expect(urls.filter((u) => u === `https://opsiq.solutions${p}`)).toHaveLength(1);
    expect(urls).toContain("https://opsiq.solutions/tools/profit-margin-calculator");
    expect(urls.every((u) => !u.includes("?"))).toBe(true);
  });

  it("counts page views for every public tool route and still refuses unknown tool paths", () => {
    for (const p of PUBLIC_TOOL_PATHS) expect(isPublicAnalyticsPath(p)).toBe(true);
    expect(isPublicAnalyticsPath("/tools/unknown-calculator")).toBe(false);
  });
});

describe("Clarity privacy boundary", () => {
  it("never runs session replay on the six agency calculators or the hub, and leaves the existing calculator unchanged", () => {
    for (const t of AGENCY_TOOLS) expect(isClarityEligiblePath(t.path)).toBe(false);
    expect(isClarityEligiblePath("/tools")).toBe(false);
    expect(isClarityEligiblePath("/tools/profit-margin-calculator")).toBe(true);
  });

  it("makes every link into them, the hub and /agency a full-document navigation", () => {
    for (const t of AGENCY_TOOLS) expect(isDocumentNavigationRequired(t.path)).toBe(true);
    expect(isDocumentNavigationRequired("/tools")).toBe(true);
    expect(isDocumentNavigationRequired("/agency")).toBe(true);
    expect(isDocumentNavigationRequired("/resources/which-agency-number-to-fix-first")).toBe(false);
  });
});

describe("analytics payload allowlist", () => {
  it("accepts only the five event names and known calculator ids", () => {
    expect([...CALCULATOR_EVENT_NAMES]).toEqual(["calculator_start", "calculator_complete", "calculator_related_tool_click", "calculator_agency_diagnostic_click", "agency_beta_cta_click"]);
    for (const id of CALCULATOR_ANALYTICS_IDS) expect(buildCalculatorEventPayload("calculator_start", id)).toEqual({ name: "calculator_start", props: { calculator: id } });
    expect(buildCalculatorEventPayload("calculator_start", "not-a-tool")).toBeNull();
    expect(buildCalculatorEventPayload("some_other_event", "capacity")).toBeNull();
  });

  it("sends a CTA position only for beta CTA clicks and only from the fixed list", () => {
    expect(buildCalculatorEventPayload("agency_beta_cta_click", "capacity", "header")).toEqual({ name: "agency_beta_cta_click", props: { calculator: "capacity", location: "header" } });
    expect(buildCalculatorEventPayload("agency_beta_cta_click", "capacity", "free text")).toBeNull();
    expect(buildCalculatorEventPayload("agency_beta_cta_click", "capacity")).toBeNull();
    expect(buildCalculatorEventPayload("calculator_start", "capacity", "header")).toEqual({ name: "calculator_start", props: { calculator: "capacity" } });
  });

  it("deduplicates start and complete per calculator but not link or CTA clicks", () => {
    expect(trackCalculatorEvent("calculator_start", "capacity")).toBe(true);
    expect(trackCalculatorEvent("calculator_start", "capacity")).toBe(false);
    expect(trackCalculatorEvent("calculator_start", "utilization")).toBe(true);
    expect(trackCalculatorEvent("calculator_complete", "capacity")).toBe(true);
    expect(trackCalculatorEvent("calculator_complete", "capacity")).toBe(false);
    expect(trackCalculatorEvent("calculator_related_tool_click", "capacity")).toBe(true);
    expect(trackCalculatorEvent("calculator_related_tool_click", "capacity")).toBe(true);
    expect(trackMock).toHaveBeenCalledTimes(5);
  });

  it("never throws if the provider throws", () => {
    trackMock.mockImplementationOnce(() => {
      throw new Error("provider down");
    });
    expect(trackCalculatorEvent("calculator_related_tool_click", "capacity")).toBe(false);
  });
});

function field(label: RegExp): HTMLInputElement {
  return screen.getByLabelText(label) as HTMLInputElement;
}

describe("calculator component behaviour", () => {
  it("shows hand-checked sample results for every calculator (engine, formatting and component agree)", () => {
    for (const id of IDS) {
      const config = CALC_CONFIGS[id];
      const values = Object.fromEntries(config.fields.map((f) => [f.key, Number(f.sample)]));
      const out = config.evaluate(values, makeFmt("USD"));
      expect(out.ok).toBe(true);
      const { unmount, container } = render(<AgencyCalculator id={id} />);
      if (out.ok) expect(container.textContent).toContain(out.view.headline);
      unmount();
    }
  });

  it("client profitability: sample renders the independent fixture numbers", () => {
    const { container } = render(<AgencyCalculator id="client-profitability" />);
    const t = container.textContent ?? "";
    expect(t).toContain("$10,000"); // AGI
    expect(t).toContain("$3,500"); // delivery cost
    expect(t).toContain("$6,500"); // delivery profit
    expect(t).toContain("65.0%"); // margin
    expect(t).toContain("$200"); // earned rate
    expect(t).toContain("$13,667"); // invoice at the 70% target (13,666.67 shown in whole currency units)
    expect(t).toContain("$11,667"); // required agency fee at target (11,666.67)
  });

  it("withholds results and explains why when a required field is blank, instead of showing 0", () => {
    render(<AgencyCalculator id="retainer-pricing" />);
    fireEvent.change(field(/^Estimated monthly delivery hours/), { target: { value: "" } });
    expect(screen.getByText("Results not available yet")).toBeTruthy();
    expect(screen.queryByText(/Target agency fee \$/)).toBeNull();
  });

  it("rejects negative and out-of-range values with a message and no result", () => {
    const { container } = render(<AgencyCalculator id="client-profitability" />);
    fireEvent.change(field(/^Client revenue/), { target: { value: "-100" } });
    expect(container.textContent).toContain("Results not available yet");
    expect(container.textContent).toContain("Client revenue: must be at least 0");
    fireEvent.change(field(/^Client revenue/), { target: { value: "1e15" } });
    expect(container.textContent).toContain("Results not available yet");
  });

  it("shows Not available, never Infinity or NaN, for undefined results", () => {
    const { container } = render(<AgencyCalculator id="client-profitability" />);
    fireEvent.change(field(/^Client revenue/), { target: { value: "0" } });
    fireEvent.change(field(/^Pass-through expenses included/), { target: { value: "0" } });
    const t = container.textContent ?? "";
    expect(t).toContain("Not available");
    expect(t).not.toMatch(/Infinity|NaN|undefined/);
  });

  it("rejects pass-through larger than revenue instead of showing a negative income", () => {
    const { container } = render(<AgencyCalculator id="client-profitability" />);
    fireEvent.change(field(/^Pass-through expenses included/), { target: { value: "20000" } });
    expect(container.textContent).toContain("Results not available yet");
    expect(container.textContent).toContain("Pass-through expenses are larger than revenue");
  });

  it("resets: Clear all empties the form and withholds results, Load sample restores them", () => {
    const { container } = render(<AgencyCalculator id="capacity" />);
    fireEvent.click(screen.getByText("Clear all"));
    expect(container.textContent).toContain("Enter your numbers");
    expect(field(/^Delivery staff/).value).toBe("");
    fireEvent.click(screen.getByText("Load sample"));
    expect(container.textContent).toContain("Target delivery capacity");
    expect(field(/^Delivery staff/).value).toBe("6");
  });

  it("labels period and currency, and does not convert when the currency changes", () => {
    const { container } = render(<AgencyCalculator id="retainer-pricing" />);
    expect(container.textContent).toContain("One retainer, per month");
    const before = container.textContent ?? "";
    expect(before).toContain("$5,000");
    fireEvent.change(screen.getByLabelText(/^Currency/), { target: { value: "EUR" } });
    const after = container.textContent ?? "";
    expect(after).toContain("€5,000");
    expect(after).toContain("does not convert");
  });

  it("emits calculator_start once on first edit and calculator_complete once, with no values", () => {
    render(<AgencyCalculator id="utilization" />);
    expect(trackMock).not.toHaveBeenCalled(); // sample on load is not engagement
    fireEvent.change(field(/^Revenue-generating delivery hours/), { target: { value: "500" } });
    fireEvent.change(field(/^Revenue-generating delivery hours/), { target: { value: "510" } });
    fireEvent.change(field(/^Revenue-generating delivery hours/), { target: { value: "520" } });
    const calls = trackMock.mock.calls;
    expect(calls.filter((c) => c[0] === "calculator_start")).toHaveLength(1);
    expect(calls.filter((c) => c[0] === "calculator_complete")).toHaveLength(1);
    expect(JSON.stringify(calls)).not.toMatch(/500|510|520|540|5000|160/);
    for (const c of calls) expect(Object.keys(c[1] as object)).toEqual(["calculator"]);
  });

  it("does not report completion while the inputs are invalid", () => {
    render(<AgencyCalculator id="utilization" />);
    fireEvent.change(field(/^Revenue-generating delivery hours/), { target: { value: "-5" } });
    expect(trackMock.mock.calls.filter((c) => c[0] === "calculator_complete")).toHaveLength(0);
    expect(trackMock.mock.calls.filter((c) => c[0] === "calculator_start")).toHaveLength(1);
  });

  it("never sends, stores or puts entered values in the address, and never calls the network", () => {
    const fetchSpy = vi.fn();
    const beaconSpy = vi.fn();
    const xhrSpy = vi.spyOn(XMLHttpRequest.prototype, "open");
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const replaceState = vi.spyOn(window.history, "replaceState");
    const pushState = vi.spyOn(window.history, "pushState");
    vi.stubGlobal("fetch", fetchSpy);
    Object.defineProperty(navigator, "sendBeacon", { value: beaconSpy, configurable: true });
    const before = window.location.href;
    render(<AgencyCalculator id="hourly-rate" />);
    fireEvent.change(field(/^Annual delivery payroll/), { target: { value: "987654" } });
    fireEvent.change(field(/^Annual agency overhead/), { target: { value: "123456" } });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(beaconSpy).not.toHaveBeenCalled();
    expect(xhrSpy).not.toHaveBeenCalled();
    expect(setItem).not.toHaveBeenCalled();
    expect(replaceState).not.toHaveBeenCalled();
    expect(pushState).not.toHaveBeenCalled();
    expect(window.location.href).toBe(before);
    expect(window.location.search).toBe("");
    expect(JSON.stringify(trackMock.mock.calls)).not.toMatch(/987654|123456/);
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("marks optional fields exactly once", () => {
    for (const id of IDS) {
      const { container, unmount } = render(<AgencyCalculator id={id} />);
      container.querySelectorAll("label").forEach((l) => expect((l.textContent ?? "").match(/\(optional\)/g)?.length ?? 0).toBeLessThanOrEqual(1));
      unmount();
    }
  });

  it("labels every input, marks optional fields, and links errors to their field", () => {
    for (const id of IDS) {
      const { container, unmount } = render(<AgencyCalculator id={id} />);
      const inputs = container.querySelectorAll("input");
      expect(inputs.length).toBe(CALC_CONFIGS[id].fields.length);
      inputs.forEach((i) => expect(i.closest("label")).not.toBeNull());
      unmount();
    }
    const { container } = render(<AgencyCalculator id="scope-creep" />);
    fireEvent.change(field(/^Agreed agency fee/), { target: { value: "-1" } });
    const input = field(/^Agreed agency fee/);
    expect(input.getAttribute("aria-invalid")).toBe("true");
    const describedBy = input.getAttribute("aria-describedby") ?? "";
    expect(describedBy.split(" ").some((id) => container.querySelector(`#${id}[role="alert"]`))).toBe(true);
  });
});

describe("page content", () => {
  it("each page template links directly to the agency diagnostic and to related calculators", () => {
    const src = readFileSync(join(ROOT, "src/components/tools/agency/AgencyToolPage.tsx"), "utf8");
    expect(src).toContain("AGENCY_DIAGNOSTIC_PATH");
    expect(src).toContain('data-calc-link="agency"');
    expect(src).toContain('data-calc-link="related"');
    expect(getAgencyTool("capacity").related.length).toBeGreaterThanOrEqual(2);
  });

  it("the existing profit-margin calculator page keeps its URL and now links to the agency diagnostic", () => {
    const src = readFileSync(join(ROOT, "src/app/tools/profit-margin-calculator/page.tsx"), "utf8");
    expect(src).toContain('const PATH = "/tools/profit-margin-calculator"');
    expect(src).toContain("AGENCY_DIAGNOSTIC_PATH");
    expect(src).toContain('calculator="profit-margin"');
  });
});
