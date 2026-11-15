/** /agency funnel events: exactly three names, no form content, no repeats, no false completions (jsdom). */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent } from "@testing-library/react";

const track = vi.hoisted(() => vi.fn());
vi.mock("@vercel/analytics", () => ({ track }));

import AgencyDiagnosticPage from "@/app/agency/page";
import { AgencyDiagnosticClient } from "@/app/agency/AgencyDiagnosticClient";
import { AgencyCtaTracker } from "@/app/agency/AgencyCtaTracker";

const NAMES = ["AGENCY_DIAGNOSTIC_START", "AGENCY_DIAGNOSTIC_COMPLETE", "AGENCY_CTA_CLICK"];

beforeEach(() => track.mockClear());
afterEach(() => cleanup());

function submit() {
  fireEvent.click(screen.getByRole("button", { name: /find my first priority/i }));
}

describe("diagnostic start / complete events", () => {
  it("fires nothing on load", () => {
    render(<AgencyDiagnosticClient />);
    expect(track).not.toHaveBeenCalled();
  });

  it("fires START once however many inputs change, with no properties", () => {
    render(<AgencyDiagnosticClient />);
    const inputs = screen.getAllByRole("spinbutton");
    for (const [i, input] of inputs.entries()) fireEvent.change(input, { target: { value: String(1000 + i) } });
    fireEvent.change(inputs[0], { target: { value: "98765" } });
    expect(track.mock.calls.filter((c) => c[0] === "AGENCY_DIAGNOSTIC_START")).toEqual([["AGENCY_DIAGNOSTIC_START"]]);
  });

  it("does not count an invalid submission as COMPLETE", () => {
    render(<AgencyDiagnosticClient />);
    fireEvent.change(screen.getByLabelText(/Hours scoped/i), { target: { value: "0" } });
    submit();
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(track.mock.calls.some((c) => c[0] === "AGENCY_DIAGNOSTIC_COMPLETE")).toBe(false);
  });

  it("fires COMPLETE once after a valid result, never again on resubmit, and carries no data", () => {
    render(<AgencyDiagnosticClient />);
    fireEvent.change(screen.getByLabelText(/Hours scoped/i), { target: { value: "0" } });
    submit();
    fireEvent.change(screen.getByLabelText(/Hours scoped/i), { target: { value: "123456" } });
    submit();
    submit();
    expect(screen.getByRole("heading", { name: /fix this first|no clear issue/i })).toBeTruthy();
    const complete = track.mock.calls.filter((c) => c[0] === "AGENCY_DIAGNOSTIC_COMPLETE");
    expect(complete).toEqual([["AGENCY_DIAGNOSTIC_COMPLETE"]]);
  });

  it("never puts typed or derived values, or any event name beyond the three, into an event", () => {
    render(<AgencyDiagnosticClient />);
    fireEvent.change(screen.getByLabelText(/Hours scoped/i), { target: { value: "424242" } });
    submit();
    expect(track.mock.calls.length).toBeGreaterThan(0);
    for (const call of track.mock.calls) {
      expect(NAMES).toContain(call[0]);
      expect(call.length).toBe(1); // no properties at all on START / COMPLETE
    }
    expect(JSON.stringify(track.mock.calls)).not.toMatch(/424242|\d{3,}/);
  });
});

describe("CTA click event", () => {
  it("fires only when the real CTA is clicked, with location only", () => {
    render(
      <div>
        <header>
          <button type="button">Request beta access</button>
        </header>
        <main>
          <button type="button">Find my first priority</button>
          <a href="/privacy">Privacy</a>
          <button type="button">Request beta access</button>
        </main>
        <AgencyCtaTracker />
      </div>
    );
    fireEvent.click(screen.getByText("Privacy"));
    fireEvent.click(screen.getByRole("button", { name: "Find my first priority" }));
    expect(track).not.toHaveBeenCalled();

    const [headerCta, lowerCta] = screen.getAllByRole("button", { name: "Request beta access" });
    fireEvent.click(headerCta);
    fireEvent.click(lowerCta);
    expect(track.mock.calls).toEqual([
      ["AGENCY_CTA_CLICK", { location: "header" }],
      ["AGENCY_CTA_CLICK", { location: "lower" }],
    ]);
  });
});

describe("privacy copy and page behaviour", () => {
  it("states the precise promise: numbers stay in the browser; analytics events exclude them; no absolute claim", () => {
    render(<AgencyDiagnosticPage />);
    const text = document.body.textContent ?? "";
    expect(text).toMatch(/numbers you enter stay in your browser and are not sent to or stored by OpsIQ/);
    expect(text).toMatch(/privacy-preserving usage analytics/);
    expect(text).toMatch(/do not include the numbers you enter/);
    expect(text).not.toMatch(/nothing you enter is sent or\s+stored/);
    expect(text).not.toMatch(/anonymous/i);
  });

  it("still makes no fetch or beacon call from the form", () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const beacon = vi.fn();
    Object.defineProperty(navigator, "sendBeacon", { value: beacon, configurable: true });
    render(<AgencyDiagnosticPage />);
    submit();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(beacon).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
