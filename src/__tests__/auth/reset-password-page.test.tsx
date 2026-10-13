/**
 * Reset-password page — client layer.
 *
 * Proves: a missing token shows an explicit "invalid link" state without ever
 * calling the API; a valid submission POSTs { token, password }; a mismatched
 * confirmation is caught client-side before any request is sent; and a
 * successful reset never logs the user in automatically (every session was
 * just revoked server-side) — it redirects to /login instead.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const pushMock = vi.fn();
const replaceMock = vi.fn();
let searchParamsValue = "";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, replace: replaceMock }),
  useSearchParams: () => new URLSearchParams(searchParamsValue),
}));

import ResetPasswordPage from "@/app/reset-password/page";

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  pushMock.mockReset();
  replaceMock.mockReset();
  searchParamsValue = "";
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("reset-password page", () => {
  it("shows an invalid-link state and never calls the API when no token is present in the URL", () => {
    render(<ResetPasswordPage />);
    expect(screen.getByText(/invalid or missing its token/i)).toBeTruthy();
    expect(screen.queryByLabelText("New password")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a mismatched confirmation locally without calling the API", () => {
    searchParamsValue = "token=abc123";
    render(<ResetPasswordPage />);

    fireEvent.change(screen.getByLabelText("New password"), { target: { value: "password-one-123" } });
    fireEvent.change(screen.getByLabelText("Confirm new password"), { target: { value: "password-two-456" } });
    fireEvent.click(screen.getByRole("button", { name: /reset password/i }));

    expect(screen.getByText(/passwords do not match/i)).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("submits { token, password } and shows success without an automatic sign-in", async () => {
    vi.useFakeTimers();
    searchParamsValue = "token=abc123";
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ success: true }) });

    render(<ResetPasswordPage />);
    fireEvent.change(screen.getByLabelText("New password"), { target: { value: "a-fresh-new-password-9" } });
    fireEvent.change(screen.getByLabelText("Confirm new password"), { target: { value: "a-fresh-new-password-9" } });
    fireEvent.click(screen.getByRole("button", { name: /reset password/i }));

    await vi.waitFor(() => expect(screen.getByRole("status")).toBeTruthy());
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/reset-password",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ token: "abc123", password: "a-fresh-new-password-9" }),
      })
    );
    // No cookie/session is set by this page itself — success only schedules a
    // redirect to /login, never a direct dashboard navigation.
    expect(pushMock).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2000);
    expect(pushMock).toHaveBeenCalledWith("/login");
  });

  it("surfaces the server's generic invalid-token error", async () => {
    searchParamsValue = "token=expired-or-fake";
    fetchMock.mockResolvedValue({
      ok: false,
      json: async () => ({ error: "This password reset link is invalid or has expired. Please request a new one." }),
    });

    render(<ResetPasswordPage />);
    fireEvent.change(screen.getByLabelText("New password"), { target: { value: "another-password-1" } });
    fireEvent.change(screen.getByLabelText("Confirm new password"), { target: { value: "another-password-1" } });
    fireEvent.click(screen.getByRole("button", { name: /reset password/i }));

    await waitFor(() => expect(screen.getByText(/invalid or has expired/i)).toBeTruthy());
  });
});

// UX-06 Wave A1 (Section P): both password fields render independent Show/Hide
// toggles, and revealing one never affects the other's visibility.
describe("reset-password page — password visibility control (UX-06 Wave A1)", () => {
  it("New password and Confirm new password toggle independently", () => {
    searchParamsValue = "token=abc123";
    render(<ResetPasswordPage />);

    fireEvent.change(screen.getByLabelText("New password"), { target: { value: "a-fresh-new-password-9" } });
    fireEvent.change(screen.getByLabelText("Confirm new password"), { target: { value: "a-fresh-new-password-9" } });

    const toggles = screen.getAllByRole("button", { name: "Show password" });
    expect(toggles).toHaveLength(2);
    fireEvent.click(toggles[0]!);

    expect(screen.getByLabelText("New password")).toHaveProperty("type", "text");
    expect(screen.getByLabelText("Confirm new password")).toHaveProperty("type", "password");
    // The value survived the toggle.
    expect(screen.getByLabelText("New password")).toHaveProperty("value", "a-fresh-new-password-9");
  });
});

// Email ownership before credential trust: ?setup=1 is the first-time "Choose your password" step reached after the
// mailbox was proven. It must collect the three policy consents; the plain reset page must not.
describe("reset-password page — first-time setup mode", () => {
  it("setup=1 shows 'Choose your password' with the three consents; a plain reset shows none", () => {
    searchParamsValue = "token=abc123&setup=1";
    const { unmount } = render(<ResetPasswordPage />);
    expect(screen.getByText("Choose your password")).toBeTruthy();
    expect(screen.getAllByRole("checkbox")).toHaveLength(3);
    expect(screen.getByLabelText(/I accept the\s*Terms/i)).toBeTruthy();
    expect(screen.getByLabelText(/Privacy notice/i)).toBeTruthy();
    expect(screen.getByLabelText(/Beta notice/i)).toBeTruthy();
    unmount();

    searchParamsValue = "token=abc123";
    render(<ResetPasswordPage />);
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
    expect(screen.getByText("Set a new password")).toBeTruthy();
  });

  it("setup mode will not submit without all consents, then POSTs them and follows the server's redirect", async () => {
    searchParamsValue = "token=abc123&setup=1";
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ success: true, redirectTo: "/owner/first-run" }) });

    render(<ResetPasswordPage />);
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "a-fresh-new-password-9" } });
    fireEvent.change(screen.getByLabelText("Confirm password"), { target: { value: "a-fresh-new-password-9" } });
    const submit = screen.getByRole("button", { name: /set password and continue/i });
    expect(submit).toBeDisabled();
    expect(fetchMock).not.toHaveBeenCalled();

    for (const box of screen.getAllByRole("checkbox")) fireEvent.click(box);
    expect(submit).not.toBeDisabled();
    fireEvent.click(submit);

    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith("/owner/first-run"));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body)).toEqual({
      token: "abc123",
      password: "a-fresh-new-password-9",
      acceptTerms: true,
      acceptPrivacy: true,
      acceptBetaNotice: true,
    });
  });

  it("a plain reset URL whose account actually needs first-time setup switches into setup mode on the server's say-so", async () => {
    searchParamsValue = "token=abc123";
    fetchMock.mockResolvedValue({
      ok: false,
      json: async () => ({ error: "You must accept the Terms, the Privacy Notice and the Beta Notice to continue.", code: "consent_required" }),
    });
    render(<ResetPasswordPage />);
    fireEvent.change(screen.getByLabelText("New password"), { target: { value: "a-fresh-new-password-9" } });
    fireEvent.change(screen.getByLabelText("Confirm new password"), { target: { value: "a-fresh-new-password-9" } });
    fireEvent.click(screen.getByRole("button", { name: /reset password/i }));
    await waitFor(() => expect(screen.getAllByRole("checkbox")).toHaveLength(3));
  });
});

// Lost / expired / reused setup link: the owner always gets a guided way forward (static copy, no new endpoint).
describe("reset-password page — guided recovery for a link that no longer works", () => {
  async function submitSetup(status: number, body: Record<string, unknown>) {
    searchParamsValue = "token=old-link&setup=1";
    fetchMock.mockResolvedValue({ ok: false, status, json: async () => body });
    render(<ResetPasswordPage />);
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "a-fresh-new-password-9" } });
    fireEvent.change(screen.getByLabelText("Confirm password"), { target: { value: "a-fresh-new-password-9" } });
    for (const box of screen.getAllByRole("checkbox")) fireEvent.click(box);
    fireEvent.click(screen.getByRole("button", { name: /set password and continue/i }));
  }

  it("an invalid/expired/used link offers 'Send me a new link' to /forgot-password with the one-line explanation", async () => {
    await submitSetup(400, { error: "This password reset link is invalid or has expired. Please request a new one." });
    await waitFor(() => expect(screen.getByTestId("new-link-help")).toBeTruthy());
    expect(screen.getByRole("link", { name: "Send me a new link" }).getAttribute("href")).toBe("/forgot-password");
    expect(screen.getByText("Links work once and expire after an hour.")).toBeTruthy();
  });

  it("a server error view offers the same way forward", async () => {
    await submitSetup(500, { error: "Something went wrong. Please try again." });
    await waitFor(() => expect(screen.getByRole("link", { name: "Send me a new link" })).toBeTruthy());
  });

  it("a network failure offers the same way forward", async () => {
    searchParamsValue = "token=old-link";
    fetchMock.mockRejectedValue(new Error("offline"));
    render(<ResetPasswordPage />);
    fireEvent.change(screen.getByLabelText("New password"), { target: { value: "a-fresh-new-password-9" } });
    fireEvent.change(screen.getByLabelText("Confirm new password"), { target: { value: "a-fresh-new-password-9" } });
    fireEvent.click(screen.getByRole("button", { name: /reset password/i }));
    await waitFor(() => expect(screen.getByRole("link", { name: "Send me a new link" })).toBeTruthy());
  });

  it("a fixable form problem (rate limit, short password, missing consent) is NOT presented as a dead link", async () => {
    await submitSetup(429, { error: "Too many attempts. Please wait and try again." });
    await waitFor(() => expect(screen.getByText(/too many attempts/i)).toBeTruthy());
    expect(screen.queryByTestId("new-link-help")).toBeNull();
  });

  it("the missing-token view uses the same action", () => {
    searchParamsValue = "";
    render(<ResetPasswordPage />);
    expect(screen.getByRole("link", { name: "Send me a new link" }).getAttribute("href")).toBe("/forgot-password");
  });

  it("the disabled setup button explains itself until all three boxes are ticked", () => {
    searchParamsValue = "token=abc123&setup=1";
    render(<ResetPasswordPage />);
    expect(screen.getByRole("button", { name: /set password and continue/i })).toBeDisabled();
    expect(screen.getByTestId("setup-consent-hint").textContent).toBe("Tick all three boxes to continue");
    for (const box of screen.getAllByRole("checkbox")) fireEvent.click(box);
    expect(screen.queryByTestId("setup-consent-hint")).toBeNull();
  });
});
