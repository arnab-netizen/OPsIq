// @vitest-environment jsdom
/**
 * First-user failure recovery on the public auth pages: a verification token is single use, so the page must
 * make exactly one request (even when React runs effects twice), and every failure has a self-service way on.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { StrictMode } from "react";
import { render, screen, cleanup, waitFor } from "@testing-library/react";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));
let token: string | null = "tok123";
vi.mock("next/navigation", () => ({
  useSearchParams: () => ({ get: (k: string) => (k === "token" ? token : null) }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

import VerifyEmailPage from "@/app/verify-email/page";

const fetchMock = vi.fn();
beforeEach(() => {
  token = "tok123";
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("verify-email page", () => {
  it("posts the single-use token exactly once, even under StrictMode's double effect", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: () => Promise.resolve({ success: true }) });
    render(<StrictMode><VerifyEmailPage /></StrictMode>);
    await waitFor(() => expect(screen.getByText(/email verified/i)).toBeTruthy());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/first read/i)).toBeTruthy();
  });
  it("an expired or already-used link offers a new link AND a sign-in path (never a dead end)", async () => {
    fetchMock.mockResolvedValue({ ok: false, json: () => Promise.resolve({ error: "This verification link is invalid or has expired." }) });
    render(<VerifyEmailPage />);
    await waitFor(() => expect(screen.getByText(/invalid or has expired/i)).toBeTruthy());
    expect(screen.getByRole("link", { name: /request a new verification link/i }).getAttribute("href")).toBe("/resend-verification");
    expect(screen.getByRole("link", { name: /sign in/i }).getAttribute("href")).toBe("/login");
    expect(document.body.textContent).not.toMatch(/contact support/i);
  });
  it("a missing token offers the same recovery without any request", () => {
    token = null;
    render(<VerifyEmailPage />);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByRole("link", { name: /request a new verification link/i })).toBeTruthy();
  });
  it("a network failure is recoverable", async () => {
    fetchMock.mockRejectedValue(new Error("offline"));
    render(<VerifyEmailPage />);
    await waitFor(() => expect(screen.getByText(/something went wrong/i)).toBeTruthy());
    expect(screen.getByRole("link", { name: /request a new verification link/i })).toBeTruthy();
  });
});
