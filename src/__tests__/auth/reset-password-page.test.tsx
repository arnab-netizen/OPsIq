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
let searchParamsValue = "";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
  useSearchParams: () => new URLSearchParams(searchParamsValue),
}));

import ResetPasswordPage from "@/app/reset-password/page";

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  pushMock.mockReset();
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
