/** /agency funnel events: exactly five names, no form content, no repeats, no false completions, example vs edited (jsdom). */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent } from "@testing-library/react";

const track = vi.hoisted(() => vi.fn());
vi.mock("@vercel/analytics", () => ({ track }));

import AgencyDiagnosticPage from "@/app/agency/page";
import { AgencyDiagnosticClient } from "@/app/agency/AgencyDiagnosticClient";
import { AgencyCtaTracker } from "@/app/agency/AgencyCtaTracker";

const NAMES = [
  "AGENCY_DIAGNOSTIC_START",
  "AGENCY_DIAGNOSTIC_COMPLETE_EXAMPLE",
  "AGENCY_DIAGNOSTIC_COMPLETE_EDITED",
  "AGENCY_FEEDBACK_CLICK",
  "AGENCY_CTA_CLICK",
];

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

  it("does not count an invalid submission as any completion", () => {
    render(<AgencyDiagnosticClient />);
    fireEvent.change(screen.getByLabelText(/Hours scoped/i), { target: { value: "0" } });
    submit();
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(track.mock.calls.some((c) => /COMPLETE/.test(String(c[0])))).toBe(false);
    expect(screen.queryByRole("link", { name: /email feedback/i })).toBeNull();
  });

  it("records an unchanged example submission as COMPLETE_EXAMPLE only, once, with no START", () => {
    render(<AgencyDiagnosticClient />);
    submit();
    submit();
    expect(track.mock.calls).toEqual([["AGENCY_DIAGNOSTIC_COMPLETE_EXAMPLE"]]);
  });

  it("records changed inputs as COMPLETE_EDITED once, never again on resubmit, and carries no data", () => {
    render(<AgencyDiagnosticClient />);
    fireEvent.change(screen.getByLabelText(/Hours scoped/i), { target: { value: "0" } });
    submit();
    fireEvent.change(screen.getByLabelText(/Hours scoped/i), { target: { value: "123456" } });
    submit();
    submit();
    expect(screen.getByRole("heading", { name: /fix this first|no clear issue/i })).toBeTruthy();
    expect(track.mock.calls.filter((c) => c[0] === "AGENCY_DIAGNOSTIC_COMPLETE_EDITED")).toEqual([["AGENCY_DIAGNOSTIC_COMPLETE_EDITED"]]);
    expect(track.mock.calls.some((c) => c[0] === "AGENCY_DIAGNOSTIC_COMPLETE_EXAMPLE")).toBe(false);
  });

  it("treats an edit that is reverted to the example values as an example run", () => {
    render(<AgencyDiagnosticClient />);
    const hours = screen.getByLabelText(/Hours scoped/i) as HTMLInputElement;
    const original = hours.value;
    fireEvent.change(hours, { target: { value: "55" } });
    fireEvent.change(hours, { target: { value: original } });
    submit();
    expect(track.mock.calls.map((c) => c[0])).toEqual(["AGENCY_DIAGNOSTIC_START", "AGENCY_DIAGNOSTIC_COMPLETE_EXAMPLE"]);
  });

  it("emits at most one event of each name per page load across example then edited runs", () => {
    render(<AgencyDiagnosticClient />);
    submit();
    fireEvent.change(screen.getByLabelText(/Hours scoped/i), { target: { value: "90" } });
    submit();
    submit();
    const names = track.mock.calls.map((c) => c[0]);
    expect(names).toEqual(["AGENCY_DIAGNOSTIC_COMPLETE_EXAMPLE", "AGENCY_DIAGNOSTIC_START", "AGENCY_DIAGNOSTIC_COMPLETE_EDITED"]);
    expect(new Set(names).size).toBe(names.length);
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

describe("optional feedback link", () => {
  function openFeedbackLink() {
    render(<AgencyDiagnosticClient />);
    submit();
    return screen.getByRole("link", { name: /email feedback/i }) as HTMLAnchorElement;
  }

  it("appears only with a valid result, as an accessible mailto link to the existing support mailbox", () => {
    render(<AgencyDiagnosticClient />);
    expect(screen.queryByRole("link", { name: /email feedback/i })).toBeNull();
    submit();
    const link = screen.getByRole("link", { name: /email feedback/i }) as HTMLAnchorElement;
    expect(link.getAttribute("href")).toMatch(/^mailto:contact\.us@opsiq\.solutions\?/);
    expect(link.textContent).toMatch(/contact\.us@opsiq\.solutions/);
    expect(document.body.textContent).toMatch(/Was this useful\? Tell us what worked or what was missing\./);
    expect(document.body.textContent).toMatch(/nothing is sent unless you send it/);
  });

  it("puts no entered, example or derived value in the email: fixed subject and body only", () => {
    render(<AgencyDiagnosticClient />);
    fireEvent.change(screen.getByLabelText(/Hours scoped/i), { target: { value: "424242" } });
    submit();
    const href = (screen.getByRole("link", { name: /email feedback/i }) as HTMLAnchorElement).getAttribute("href") ?? "";
    const decoded = decodeURIComponent(href);
    expect(decoded).not.toMatch(/support@/i);
    expect(decoded).not.toMatch(/424242|100000|55000|30000|\d{3,}|%|margin is|fix this first/i);
    const url = new URL(href);
    expect(url.searchParams.get("subject")).toBe("Agency Decision Diagnostic feedback");
    expect(url.searchParams.get("body")).toMatch(/^What worked:/);
  });

  it("fires FEEDBACK_CLICK once with no properties, and leaves the diagnostic result and the beta CTA untouched", () => {
    const link = openFeedbackLink();
    link.addEventListener("click", (e) => e.preventDefault());
    fireEvent.click(link);
    fireEvent.click(link);
    expect(track.mock.calls.filter((c) => c[0] === "AGENCY_FEEDBACK_CLICK")).toEqual([["AGENCY_FEEDBACK_CLICK"]]);
    expect(screen.getByRole("heading", { name: /fix this first/i })).toBeTruthy();
  });

  it("makes no network call when feedback is initiated", () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const link = openFeedbackLink();
    link.addEventListener("click", (e) => e.preventDefault());
    fireEvent.click(link);
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
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
    expect(text).toMatch(/do not\s+include the numbers you enter/);
    expect(text).toMatch(/feedback-link clicks/);
    expect(text).toMatch(/only as whether the illustrative example values were changed/);
    expect(text).toMatch(/If you choose to email feedback, we receive only what you write/);
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
