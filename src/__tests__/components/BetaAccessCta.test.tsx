/**
 * BetaAccessCta — the homepage's controlled-beta capture modal/form.
 *
 * DB-free: fetch is stubbed directly (same pattern as
 * owner-now-view-page.test.tsx / decision-inbox-empty-states.test.tsx). The
 * real server contract (POST /api/beta-requests) is covered separately in
 * src/__tests__/api/beta-requests.test.ts; this suite proves the component's
 * own accessible open/submit/success/error/double-submit behavior.
 */

import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { BetaAccessCta } from "@/components/landing/BetaAccessCta";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderCta() {
  return render(<BetaAccessCta triggerClassName="cta-trigger" />);
}

describe("BetaAccessCta", () => {
  it("renders a trigger with the expected label and no modal initially", () => {
    renderCta();
    expect(screen.getByRole("button", { name: "Request beta access" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opens the accessible modal with a labeled email field on click", () => {
    renderCta();
    fireEvent.click(screen.getByRole("button", { name: "Request beta access" }));

    const dialog = screen.getByRole("dialog", { name: "Request beta access" });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByLabelText("First name (optional)")).toBeInTheDocument();
  });

  it("closes on Escape and restores focus to the trigger", () => {
    renderCta();
    const trigger = screen.getByRole("button", { name: "Request beta access" });
    fireEvent.click(trigger);
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("submits the normalized email and omits an empty first name", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, message: "Your beta request has been received." }),
    });
    vi.stubGlobal("fetch", fetchMock);

    renderCta();
    fireEvent.click(screen.getByRole("button", { name: "Request beta access" }));
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "a@example.com" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Request beta access" }).slice(-1)[0]);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body as string);
    expect(body.email).toBe("a@example.com");
    expect(body).not.toHaveProperty("firstName");
  });

  it("includes first name when provided", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, message: "Received." }),
    });
    vi.stubGlobal("fetch", fetchMock);

    renderCta();
    fireEvent.click(screen.getByRole("button", { name: "Request beta access" }));
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "a@example.com" } });
    fireEvent.change(screen.getByLabelText("First name (optional)"), { target: { value: "Ada" } });

    const submitButtons = screen.getAllByRole("button", { name: "Request beta access" });
    fireEvent.click(submitButtons[submitButtons.length - 1]);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.firstName).toBe("Ada");
  });

  it("shows the server's success message and stops showing the form", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ success: true, message: "Your beta request has been received. Access opens gradually." }),
      })
    );

    renderCta();
    fireEvent.click(screen.getByRole("button", { name: "Request beta access" }));
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "a@example.com" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Request beta access" }).slice(-1)[0]);

    expect(await screen.findByText(/access opens gradually/i)).toBeInTheDocument();
    expect(screen.queryByLabelText("Email")).toBeNull();
  });

  it("shows a failure state and keeps the form usable to retry", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ error: "Too many requests. Please wait and try again." }),
      })
    );

    renderCta();
    fireEvent.click(screen.getByRole("button", { name: "Request beta access" }));
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "a@example.com" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Request beta access" }).slice(-1)[0]);

    expect(await screen.findByRole("alert")).toHaveTextContent(/too many requests/i);
    // The form is still present so the visitor can correct and retry.
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
  });

  it("shows a generic failure state on a network error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    renderCta();
    fireEvent.click(screen.getByRole("button", { name: "Request beta access" }));
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "a@example.com" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Request beta access" }).slice(-1)[0]);

    expect(await screen.findByRole("alert")).toHaveTextContent(/something went wrong/i);
  });

  it("disables the submit button while a request is in flight (double-submit protection)", async () => {
    let resolveFetch: (value: unknown) => void = () => {};
    const pending = new Promise((resolve) => {
      resolveFetch = resolve;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockReturnValue(pending)
    );

    renderCta();
    fireEvent.click(screen.getByRole("button", { name: "Request beta access" }));
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "a@example.com" } });
    const submitButton = screen.getAllByRole("button", { name: "Request beta access" }).slice(-1)[0];
    fireEvent.click(submitButton);

    await waitFor(() => expect(submitButton).toBeDisabled());

    resolveFetch({ ok: true, json: async () => ({ success: true, message: "Received." }) });
    await screen.findByText(/received/i);
  });

  it("preserves the full typed email across keystrokes and never steals focus to Close (regression)", () => {
    // Regression for a production bug: BetaAccessCta's `resetAndClose` (passed as
    // Modal's `onClose`) is intentionally not useCallback-wrapped, so it is a fresh
    // closure on every render. Typing into the controlled Email input re-renders the
    // component on every keystroke; Modal must not treat that as a reason to re-run its
    // "focus the first focusable element" step, or focus jumps to Close and the input's
    // value is effectively lost after the first character.
    renderCta();
    fireEvent.click(screen.getByRole("button", { name: "Request beta access" }));

    const email = screen.getByLabelText("Email") as HTMLInputElement;
    email.focus();

    let value = "";
    for (const ch of "person@example.com") {
      value += ch;
      fireEvent.change(email, { target: { value } });
      expect(document.activeElement).toBe(email);
      expect(document.activeElement).not.toBe(screen.getByRole("button", { name: "Close" }));
    }

    expect(email.value).toBe("person@example.com");
  });

  it("preserves the full typed first name across keystrokes and never steals focus to Close (regression)", () => {
    renderCta();
    fireEvent.click(screen.getByRole("button", { name: "Request beta access" }));

    const firstName = screen.getByLabelText("First name (optional)") as HTMLInputElement;
    firstName.focus();

    let value = "";
    for (const ch of "Ada") {
      value += ch;
      fireEvent.change(firstName, { target: { value } });
      expect(document.activeElement).toBe(firstName);
      expect(document.activeElement).not.toBe(screen.getByRole("button", { name: "Close" }));
    }

    expect(firstName.value).toBe("Ada");
  });

  it("resets the form when reopened after a success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ success: true, message: "Received." }),
      })
    );

    renderCta();
    fireEvent.click(screen.getByRole("button", { name: "Request beta access" }));
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "a@example.com" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Request beta access" }).slice(-1)[0]);
    expect(await screen.findByText(/received/i)).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: "Close" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Request beta access" }));

    const emailInput = screen.getByLabelText("Email") as HTMLInputElement;
    expect(emailInput.value).toBe("");
  });
});

describe("BetaAccessCta — acquisition attribution", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  afterEach(() => {
    window.sessionStorage.clear();
    window.history.replaceState({}, "", "/");
  });

  it("sends first-touch utm/landing attribution plus the page the request was made from", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true, message: "Received." }) });
    vi.stubGlobal("fetch", fetchMock);

    // First touch: a resource page reached from a tagged link.
    window.history.replaceState({}, "", "/resources/cash-gap?utm_source=linkedin&utm_medium=social&utm_term=cash%20flow");
    const first = renderCta();
    first.unmount();

    // Later page in the same tab, with no tags of its own: first touch is kept.
    window.history.replaceState({}, "", "/resources");
    renderCta();
    fireEvent.click(screen.getByRole("button", { name: "Request beta access" }));
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "a@example.com" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Request beta access" }).slice(-1)[0]);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body).toMatchObject({
      email: "a@example.com",
      utmSource: "linkedin",
      utmMedium: "social",
      utmTerm: "cash flow",
      landingPath: "/resources/cash-gap",
      conversionPath: "/resources",
    });
    expect(body).not.toHaveProperty("referrerHost");
  });

  it("still posts to the existing /api/beta-requests endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true, message: "Received." }) });
    vi.stubGlobal("fetch", fetchMock);
    renderCta();
    fireEvent.click(screen.getByRole("button", { name: "Request beta access" }));
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "a@example.com" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Request beta access" }).slice(-1)[0]);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0][0]).toBe("/api/beta-requests");
  });
});
