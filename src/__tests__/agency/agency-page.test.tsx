/** /agency page: SEO contract, form flow, and the no-network privacy promise (jsdom). */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent } from "@testing-library/react";
import AgencyDiagnosticPage, { metadata } from "@/app/agency/page";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("agency diagnostic page", () => {
  it("keeps title and description inside search-result limits with a clean canonical", () => {
    expect(String(metadata.title).length).toBeLessThanOrEqual(60);
    expect(String(metadata.description).length).toBeLessThanOrEqual(155);
    expect(metadata.alternates?.canonical).toBe("https://opsiq.solutions/agency");
  });

  it("renders one h1 and ten inputs", () => {
    render(<AgencyDiagnosticPage />);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getAllByRole("spinbutton")).toHaveLength(10);
  });

  it("shows a priority result for the worked example without any network call", () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const beacon = vi.fn();
    Object.defineProperty(navigator, "sendBeacon", { value: beacon, configurable: true });
    render(<AgencyDiagnosticPage />);
    fireEvent.click(screen.getByRole("button", { name: /find my first priority/i }));
    expect(screen.getByRole("heading", { name: /fix this first/i })).toBeTruthy();
    expect(screen.getByText(/Delivery margin is 45%/)).toBeTruthy();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(beacon).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("shows validation errors for an invalid input instead of a result", () => {
    render(<AgencyDiagnosticPage />);
    fireEvent.change(screen.getByLabelText(/Hours scoped/i), { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: /find my first priority/i }));
    expect(screen.getByRole("alert").textContent).toMatch(/Hours scoped must be greater than zero/);
    expect(screen.queryByRole("heading", { name: /fix this first/i })).toBeNull();
  });
});

describe("optional beta invitation under a completed result", () => {
  it("is absent before a result and on an invalid submission, and present only after a valid result", () => {
    render(<AgencyDiagnosticPage />);
    expect(document.querySelector('[data-agency-cta="result"]')).toBeNull();
    fireEvent.change(screen.getByLabelText(/Hours scoped/i), { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: /find my first priority/i }));
    expect(document.querySelector('[data-agency-cta="result"]')).toBeNull();
    fireEvent.change(screen.getByLabelText(/Hours scoped/i), { target: { value: "100" } });
    fireEvent.click(screen.getByRole("button", { name: /find my first priority/i }));
    const invitation = document.querySelector('[data-agency-cta="result"]');
    expect(invitation).not.toBeNull();
    expect(invitation?.textContent).toMatch(/do not need an account/i);
  });

  it("makes no network call and sends no beacon when the result and invitation render", () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const beacon = vi.fn();
    Object.defineProperty(navigator, "sendBeacon", { value: beacon, configurable: true });
    render(<AgencyDiagnosticPage />);
    fireEvent.click(screen.getByRole("button", { name: /find my first priority/i }));
    expect(document.querySelector('[data-agency-cta="result"]')).not.toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(beacon).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
