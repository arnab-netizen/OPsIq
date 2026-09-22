/**
 * Login page — duplicate-submit / timeout-retry defense (client layer).
 *
 * Pairs with src/__tests__/auth/login-duplicate-session-repro.db.test.ts, which proves
 * the server route alone creates a new Session on every successful invocation with no
 * dedup. That DB test intentionally still reproduces two Sessions when the real route is
 * invoked twice directly — the fix lives here, at the only place that can decide whether
 * a second HTTP request for the same logical login action is ever sent in the first place.
 *
 * These tests mock `fetch` and never touch a database; they prove exactly one thing:
 * for one logical login action (single click, rapid double-click/double-Enter, or a
 * client-side timeout), the login page sends AT MOST ONE POST /api/auth/login. A later,
 * fully independent, deliberate retry after the first action has settled is unaffected —
 * it is free to send its own request.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import LoginPage from "@/app/login/page";

function okResponse() {
  return { ok: true, json: async () => ({ user: { id: "u1", email: "a@b.com", name: null } }) } as Response;
}

function fillCredentials() {
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: "smoke@example.com" } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "correct-horse-battery-staple" } });
}

beforeEach(() => {
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { ...window.location, href: "" },
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("LoginPage — one logical login action sends at most one request", () => {
  it("1. normal login: one submit, exactly one POST, success navigates to /", async () => {
    const fetchMock = vi.fn(async () => okResponse());
    vi.stubGlobal("fetch", fetchMock);

    render(<LoginPage />);
    fillCredentials();
    fireEvent.submit(screen.getByRole("button", { name: /sign in/i }).closest("form")!);

    // "/" (not a hardcoded "/dashboard") so the root page's centralized
    // isSelfServeOwnerContext policy check decides the authenticated
    // session's canonical Home — see src/app/page.tsx.
    await waitFor(() => expect(window.location.href).toBe("/"));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("2. rapid double-submit (double-click / Enter pressed twice) sends only one POST", async () => {
    let resolveFetch: (() => void) | undefined;
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = () => resolve(okResponse());
        })
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<LoginPage />);
    fillCredentials();
    const form = screen.getByRole("button", { name: /sign in/i }).closest("form")!;

    // Two submits fired back-to-back, before the first request has settled —
    // simulates a double-click or Enter pressed twice in immediate succession.
    fireEvent.submit(form);
    fireEvent.submit(form);

    expect(fetchMock).toHaveBeenCalledTimes(1);

    resolveFetch?.();
    await waitFor(() => expect(window.location.href).toBe("/"));
    // Still exactly one — the second submit was ignored outright, not queued.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("3. a client-side timeout does not automatically retry (no second POST) and shows login-appropriate recovery copy", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            const err = new Error("The operation was aborted");
            err.name = "AbortError";
            reject(err);
          });
        })
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<LoginPage />);
    fillCredentials();
    fireEvent.submit(screen.getByRole("button", { name: /sign in/i }).closest("form")!);

    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Advance past the page's 15s client timeout and flush the resulting rejection.
    await vi.advanceTimersByTimeAsync(15_000);

    await vi.waitFor(() =>
      expect(screen.getByText(/sign-in is taking longer than expected/i)).toBeTruthy()
    );
    // The old behavior (before this fix) auto-retried here, producing a second POST.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("4. a deliberate later retry, after the first action has settled, is a distinct action and sends its own POST", async () => {
    vi.useFakeTimers();
    const firstFetch = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            const err = new Error("The operation was aborted");
            err.name = "AbortError";
            reject(err);
          });
        })
    );
    vi.stubGlobal("fetch", firstFetch);

    render(<LoginPage />);
    fillCredentials();
    const form = screen.getByRole("button", { name: /sign in/i }).closest("form")!;
    fireEvent.submit(form);
    await vi.advanceTimersByTimeAsync(15_000);
    await vi.waitFor(() => expect(screen.getByText(/sign-in is taking longer than expected/i)).toBeTruthy());
    expect(firstFetch).toHaveBeenCalledTimes(1);

    // The first action has now fully settled (as a failure). The user reads the
    // message and deliberately tries again — a new, independent logical action.
    const secondFetch = vi.fn(async () => okResponse());
    vi.stubGlobal("fetch", secondFetch);
    vi.useRealTimers();

    fireEvent.submit(form);
    await waitFor(() => expect(window.location.href).toBe("/"));
    expect(secondFetch).toHaveBeenCalledTimes(1);
  });
});

// UX-06 Wave A1 (Section P): the password field renders the Show/Hide toggle, and
// toggling it never itself submits the form (no fetch call as a side effect).
describe("Login page — password visibility control (UX-06 Wave A1)", () => {
  it("renders a Show password control and never submits when it is clicked", () => {
    const spy = vi.fn(async () => okResponse());
    vi.stubGlobal("fetch", spy);
    render(<LoginPage />);
    fillCredentials();

    const toggle = screen.getByRole("button", { name: "Show password" });
    fireEvent.click(toggle);

    expect(screen.getByLabelText("Password")).toHaveProperty("type", "text");
    expect(screen.getByRole("button", { name: "Hide password" })).toBeInTheDocument();
    expect(spy).not.toHaveBeenCalled();
  });
});
