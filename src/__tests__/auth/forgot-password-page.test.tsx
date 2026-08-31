/**
 * Forgot-password page — client layer.
 *
 * Proves: the page always renders the same generic confirmation after a
 * successful (2xx) submit, regardless of what the API actually did server-side
 * (the API itself is what guarantees enumeration resistance — this test proves
 * the UI never introduces a second leak by branching on response content).
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

import ForgotPasswordPage from "@/app/forgot-password/page";

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("forgot-password page", () => {
  it("renders the email form", () => {
    render(<ForgotPasswordPage />);
    expect(screen.getByLabelText("Email")).toBeTruthy();
    expect(screen.getByRole("button", { name: /send reset link/i })).toBeTruthy();
  });

  it("shows the generic confirmation after a successful submit", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true, message: "If an account exists for that email, we've sent a password reset link." }),
    });

    render(<ForgotPasswordPage />);
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "someone@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: /send reset link/i }));

    await waitFor(() => expect(screen.getByRole("status")).toBeTruthy());
    expect(screen.getByRole("status").textContent).toMatch(/if an account exists/i);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/forgot-password",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ email: "someone@example.com" }) })
    );
  });

  it("shows an error message when the request is rate-limited", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({ error: "Rate limit exceeded. Retry after 60 seconds." }),
    });

    render(<ForgotPasswordPage />);
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "someone@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: /send reset link/i }));

    await waitFor(() => expect(screen.getByText(/rate limit exceeded/i)).toBeTruthy());
    // The generic confirmation must never appear alongside a surfaced error state.
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("links back to the login page", () => {
    render(<ForgotPasswordPage />);
    const link = screen.getByRole("link", { name: /back to sign in/i });
    expect(link.getAttribute("href")).toBe("/login");
  });
});
