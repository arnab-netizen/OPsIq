// @vitest-environment jsdom
/**
 * Public-beta presentation: "Start free" -> /signup only under OPEN_BETA; the existing request-access flow and
 * wording remain for every other mode; invite-only copy is removed only where it would contradict OPEN_BETA.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor, fireEvent } from "@testing-library/react";
import { presentationForAdmissionMode } from "@/domain/beta/public-presentation";
import { ANONYMOUS_CLIENT_EVENTS, isAnonymousClientEvent, sanitiseProductEventProps, isProductEventName, PRODUCT_EVENT_NAMES } from "@/domain/analytics/product-events";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));

import LandingPage from "@/components/landing/LandingPage";
import { PublicBetaCta, PublicBetaText, PublicBetaSwitch } from "@/components/landing/PublicBetaCta";
import { resetPublicAdmissionModeCache } from "@/lib/public-admission-client";

const fetchMock = vi.fn();
const beacon = vi.fn();
beforeEach(() => {
  resetPublicAdmissionModeCache();
  fetchMock.mockReset();
  beacon.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  Object.defineProperty(navigator, "sendBeacon", { value: beacon, configurable: true });
  beacon.mockReturnValue(true);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("presentation mapping (display only)", () => {
  it("only OPEN_BETA opens registration; everything else falls back to the stricter wording", () => {
    for (const m of ["INVITE_ONLY", "CLOSED", "WAITLIST", null, undefined, "garbage"]) {
      const p = presentationForAdmissionMode(m as never);
      expect(p.openRegistration).toBe(false);
      expect(p.primaryCtaLabel).toBe("Request beta access");
    }
    const open = presentationForAdmissionMode("OPEN_BETA");
    expect(open.openRegistration).toBe(true);
    expect(open.primaryCtaLabel).toBe("Start free");
  });
  it("OPEN_BETA copy never claims invitation or invite-only", () => {
    const open = presentationForAdmissionMode("OPEN_BETA");
    expect(JSON.stringify(open)).not.toMatch(/invit/i);
  });
});

describe("homepage under OPEN_BETA", () => {
  it("shows Start free (-> /signup) as the primary CTA in header, hero and final CTA, with no invitation copy", () => {
    const { container } = render(<LandingPage admissionMode="OPEN_BETA" />);
    const ctas = screen.getAllByTestId("start-free-cta");
    expect(ctas.length).toBeGreaterThanOrEqual(3);
    for (const a of ctas) {
      expect(a.getAttribute("href")).toBe("/signup");
      expect(a.textContent).toBe("Start free");
    }
    expect(screen.queryByText(/request beta access/i)).toBeNull();
    expect(container.textContent).not.toMatch(/invit/i);
  });
  it("records public_start_free_clicked as an anonymous, name-only beacon", () => {
    render(<LandingPage admissionMode="OPEN_BETA" />);
    fireEvent.click(screen.getAllByTestId("start-free-cta")[0]);
    expect(beacon).toHaveBeenCalledOnce();
    expect(beacon.mock.calls[0][0]).toBe("/api/product-events");
    expect(fetchMock).not.toHaveBeenCalledWith("/api/product-events", expect.anything());
  });
});

describe("homepage under INVITE_ONLY keeps the governed behaviour", () => {
  it("still offers request-access and invitation wording; no Start free", () => {
    const { container } = render(<LandingPage admissionMode="INVITE_ONLY" />);
    expect(screen.queryByTestId("start-free-cta")).toBeNull();
    expect(screen.getAllByRole("button", { name: /request beta access/i }).length).toBeGreaterThan(0);
    expect(container.textContent).toMatch(/access by invitation/i);
  });
});

describe("statically generated public pages resolve the mode after mount (server still decides signups)", () => {
  it("flips to Start free when the status endpoint says OPEN_BETA", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: () => Promise.resolve({ enabled: true, admissionMode: "OPEN_BETA" }) });
    render(<PublicBetaCta triggerClassName="x" />);
    expect(screen.queryByTestId("start-free-cta")).toBeNull(); // first paint = stricter wording
    await waitFor(() => expect(screen.getByTestId("start-free-cta").getAttribute("href")).toBe("/signup"));
  });
  it("stays on request-access when the lookup fails or mode is invite-only", async () => {
    fetchMock.mockRejectedValue(new Error("offline"));
    render(<PublicBetaCta triggerClassName="x" />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(screen.queryByTestId("start-free-cta")).toBeNull();
    expect(screen.getByRole("button", { name: /request beta access/i })).toBeTruthy();
  });
  it("text switches the same way", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: () => Promise.resolve({ admissionMode: "OPEN_BETA" }) });
    render(<p data-testid="t"><PublicBetaText field="resourceLine" /></p>);
    expect(screen.getByTestId("t").textContent).toMatch(/invite-only/);
    await waitFor(() => expect(screen.getByTestId("t").textContent).not.toMatch(/invite/i));
  });
});

describe("a mode change while the tab stays open (no hard reload)", () => {
  const notice = () => (
    <p data-testid="notice">
      <PublicBetaSwitch open="You can create an account at /signup." invite="Access currently requires an invitation." />
    </p>
  );
  const status = (admissionMode: string) => ({ ok: true, json: () => Promise.resolve({ enabled: true, admissionMode }) });

  it("a page opened after the mode becomes OPEN_BETA shows the open guidance, not a cached INVITE_ONLY answer", async () => {
    fetchMock.mockResolvedValue(status("INVITE_ONLY"));
    const first = render(notice());
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId("notice").textContent).toMatch(/requires an invitation/);
    first.unmount(); // client-side navigation away from the first public page

    fetchMock.mockResolvedValue(status("OPEN_BETA"));
    render(notice()); // client-side navigation to /beta, same document, no reload
    expect(screen.getByTestId("notice").textContent).toMatch(/requires an invitation/); // first paint stays the stricter wording
    await waitFor(() => expect(screen.getByTestId("notice").textContent).toMatch(/You can create an account/));
    expect(screen.getByTestId("notice").textContent).not.toMatch(/invitation/i);
  });

  it("goes back to the invitation wording when the mode returns to INVITE_ONLY", async () => {
    fetchMock.mockResolvedValue(status("OPEN_BETA"));
    const first = render(notice());
    await waitFor(() => expect(screen.getByTestId("notice").textContent).toMatch(/You can create an account/));
    first.unmount();

    fetchMock.mockResolvedValue(status("INVITE_ONLY"));
    render(notice());
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(screen.getByTestId("notice").textContent).toMatch(/requires an invitation/);
  });

  it("components mounted together on one page still share a single status request", async () => {
    fetchMock.mockResolvedValue(status("OPEN_BETA"));
    render(<>{notice()}<PublicBetaCta triggerClassName="x" /><p data-testid="t"><PublicBetaText field="resourceLine" /></p></>);
    await waitFor(() => expect(screen.getByTestId("start-free-cta")).toBeTruthy());
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("analytics contract", () => {
  it("anonymous client events are a closed, name-only allowlist", () => {
    expect([...ANONYMOUS_CLIENT_EVENTS]).toEqual(["public_start_free_clicked", "signup_started"]);
    expect(isAnonymousClientEvent("first_result_viewed")).toBe(false);
    expect(isAnonymousClientEvent("first_trusted_decision_interaction")).toBe(false);
  });
  it("all 17 required funnel events exist", () => {
    for (const n of [
      "public_start_free_clicked", "signup_started", "signup_completed", "email_verified", "first_run_started",
      "business_profile_completed", "first_evidence_saved", "first_diagnosis_completed", "first_result_viewed",
      "first_result_action_accepted", "first_result_corrected", "first_result_improvement_requested",
      "first_trusted_decision_interaction", "cockpit_reached", "returning_owner", "outcome_verification_started", "outcome_verified",
    ]) expect(isProductEventName(n), n).toBe(true);
    expect(PRODUCT_EVENT_NAMES.length).toBeGreaterThanOrEqual(17);
  });
  it("payload sanitiser drops money, names, free text and unknown keys", () => {
    const out = sanitiseProductEventProps({
      revenue: 12000, cashOnHand: 1500, customerName: "Acme", businessName: "Maple", email: "a@b.c", note: "free text",
      timeToFirstValueSeconds: 95, evidenceQuality: "ROUGH_ESTIMATE", confidenceTier: "LOW",
      rating: "not an enum token", reason: "WRONG_PRIORITY", questionsAnswered: 2.5,
    });
    expect(out).toEqual({ timeToFirstValueSeconds: 95, evidenceQuality: "ROUGH_ESTIMATE", confidenceTier: "LOW", reason: "WRONG_PRIORITY" });
  });
  it("numeric props are bounded to whole, non-negative durations/counts", () => {
    expect(sanitiseProductEventProps({ timeToFirstValueSeconds: -1 })).toEqual({});
    expect(sanitiseProductEventProps({ timeToFirstValueSeconds: 1.5 })).toEqual({});
    expect(sanitiseProductEventProps({ timeToFirstValueSeconds: 10 ** 12 })).toEqual({});
    expect(sanitiseProductEventProps({ questionsAnswered: 3 })).toEqual({ questionsAnswered: 3 });
  });
});
