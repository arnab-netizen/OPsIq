// @vitest-environment jsdom
/**
 * First-user failure recovery on the public auth pages. A verification token is single use and link scanners /
 * crawlers that execute JavaScript must not be able to burn it, so the page performs NO request on load: only an
 * explicit click on "Verify my email" sends the one state-changing POST (even on a double click or under
 * StrictMode), and every failure has a self-service way on.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { StrictMode } from "react";
import { render, screen, cleanup, waitFor, fireEvent } from "@testing-library/react";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));
let token: string | null = "tok123";
const replaceMock = vi.fn();
vi.mock("next/navigation", () => ({
  useSearchParams: () => ({ get: (k: string) => (k === "token" ? token : null) }),
  useRouter: () => ({ push: vi.fn(), replace: replaceMock }),
}));

import VerifyEmailPage from "@/app/verify-email/page";

const fetchMock = vi.fn();
beforeEach(() => {
  token = "tok123";
  fetchMock.mockReset();
  replaceMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("verify-email page", () => {
  it("performs NO request on load (scanner-safe), even under StrictMode's double effect", async () => {
    render(<StrictMode><VerifyEmailPage /></StrictMode>);
    await new Promise((r) => setTimeout(r, 20));
    expect(fetchMock).not.toHaveBeenCalled();
    const button = screen.getByRole("button", { name: "Verify my email" });
    expect(button.className).toContain("min-h-11");
    expect(button.className).toContain("w-full");
  });
  it("a click POSTs the single-use token exactly once, even on a double click, then continues to password setup", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: () => Promise.resolve({ success: true, next: "set-password", setupToken: "setup+/tok" }) });
    render(<StrictMode><VerifyEmailPage /></StrictMode>);
    const button = screen.getByRole("button", { name: "Verify my email" });
    fireEvent.click(button);
    fireEvent.click(button);
    await waitFor(() => expect(replaceMock).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/verify-email",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ token: "tok123" }) }),
    );
    expect(replaceMock).toHaveBeenCalledWith(`/reset-password?token=${encodeURIComponent("setup+/tok")}&setup=1`);
  });
  it("an already-verified account is sent to sign in", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: () => Promise.resolve({ success: true, next: "login" }) });
    render(<VerifyEmailPage />);
    fireEvent.click(screen.getByRole("button", { name: "Verify my email" }));
    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith("/login"));
  });
  it("an expired or already-used link offers a new link AND a sign-in path (never a dead end)", async () => {
    fetchMock.mockResolvedValue({ ok: false, json: () => Promise.resolve({ error: "This verification link is invalid or has expired." }) });
    render(<VerifyEmailPage />);
    fireEvent.click(screen.getByRole("button", { name: "Verify my email" }));
    await waitFor(() => expect(screen.getByText(/invalid or has expired/i)).toBeTruthy());
    expect(screen.getByRole("link", { name: /request a new verification link/i }).getAttribute("href")).toBe("/resend-verification");
    expect(screen.getByRole("link", { name: /sign in/i }).getAttribute("href")).toBe("/login");
    expect(screen.getByRole("link", { name: /reset your password/i }).getAttribute("href")).toBe("/forgot-password");
    expect(document.body.textContent).not.toMatch(/contact support/i);
    expect(replaceMock).not.toHaveBeenCalled();
  });
  it("offers sign-in / password reset BEFORE a new verification link for a used or expired link", async () => {
    fetchMock.mockResolvedValue({ ok: false, json: () => Promise.resolve({ error: "This verification link is invalid or has expired." }) });
    render(<VerifyEmailPage />);
    fireEvent.click(screen.getByRole("button", { name: "Verify my email" }));
    await waitFor(() => expect(screen.getByTestId("verify-already-done")).toBeTruthy());
    const links = screen.getAllByRole("link").map((a) => a.getAttribute("href"));
    expect(links.indexOf("/login")).toBeGreaterThan(-1);
    expect(links.indexOf("/login")).toBeLessThan(links.indexOf("/resend-verification"));
    expect(links.indexOf("/forgot-password")).toBeLessThan(links.indexOf("/resend-verification"));
    expect(screen.getByTestId("verify-already-done").textContent).toMatch(/sign in.*reset your password/i);
  });
  it("a failed attempt (429 or network error) does not leave the guard stuck: the owner can retry without reloading", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 429, json: () => Promise.resolve({ error: "Too many attempts. Please wait and try again." }) });
    fetchMock.mockRejectedValueOnce(new Error("offline"));
    fetchMock.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ success: true, next: "set-password", setupToken: "s1" }) });
    render(<VerifyEmailPage />);
    fireEvent.click(screen.getByRole("button", { name: "Verify my email" }));
    await waitFor(() => expect(screen.getByText(/too many attempts/i)).toBeTruthy());
    fireEvent.click(screen.getByTestId("verify-email-retry"));
    await waitFor(() => expect(screen.getByText(/something went wrong/i)).toBeTruthy());
    fireEvent.click(screen.getByTestId("verify-email-retry"));
    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith("/reset-password?token=s1&setup=1"));
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
  it("a missing token offers the same recovery without any request", () => {
    token = null;
    render(<VerifyEmailPage />);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Verify my email" })).toBeNull();
    expect(screen.getByRole("link", { name: /request a new verification link/i })).toBeTruthy();
  });
  it("a network failure is recoverable", async () => {
    fetchMock.mockRejectedValue(new Error("offline"));
    render(<VerifyEmailPage />);
    fireEvent.click(screen.getByRole("button", { name: "Verify my email" }));
    await waitFor(() => expect(screen.getByText(/something went wrong/i)).toBeTruthy());
    expect(screen.getByRole("link", { name: /request a new verification link/i })).toBeTruthy();
  });
});
