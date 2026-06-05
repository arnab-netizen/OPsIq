import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";

// The root route is a server component that depends on session + redirect.
// Mock both so we can exercise its routing decision deterministically.
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/services/auth", () => ({ getSession: vi.fn() }));

import HomePage from "@/app/page";
import LandingPage from "@/components/landing/LandingPage";
import { getSession } from "@/services/auth";
import { redirect } from "next/navigation";

const getSessionMock = vi.mocked(getSession);
const redirectMock = vi.mocked(redirect);

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

describe("root route (/) landing behavior", () => {
  it("renders the public landing page (not a redirect) for logged-out visitors", async () => {
    getSessionMock.mockResolvedValue(null);

    const element = await HomePage();

    expect(redirectMock).not.toHaveBeenCalled();
    // The logged-out branch returns the LandingPage component element.
    expect((element as { type: unknown }).type).toBe(LandingPage);
  });

  it("still redirects authenticated visitors to /dashboard", async () => {
    getSessionMock.mockResolvedValue({
      user: { id: "u1" } as never,
      sessionId: "s1",
      expiresAt: new Date(Date.now() + 60_000),
    });

    await HomePage();

    expect(redirectMock).toHaveBeenCalledWith("/dashboard");
  });
});

describe("LandingPage content", () => {
  it("shows public landing content explaining the product", () => {
    const { container } = render(<LandingPage />);
    const h1 = container.querySelector("h1");
    expect(h1).not.toBeNull();
    expect(h1?.textContent ?? "").toMatch(/next move/i);
    expect(container.textContent ?? "").toMatch(/diagnosis/i);
  });

  it("includes a primary CTA to /signup", () => {
    const { container } = render(<LandingPage />);
    const signupLinks = container.querySelectorAll('a[href="/signup"]');
    expect(signupLinks.length).toBeGreaterThan(0);
  });

  it("includes a secondary link to /login", () => {
    const { container } = render(<LandingPage />);
    const loginLinks = container.querySelectorAll('a[href="/login"]');
    expect(loginLinks.length).toBeGreaterThan(0);
  });

  it("includes a support mailto link", () => {
    const { container } = render(<LandingPage />);
    const mailto = container.querySelector('a[href^="mailto:"]');
    expect(mailto).not.toBeNull();
  });

  it("does not call diagnosis/business APIs (no network calls on render)", () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    try {
      render(<LandingPage />);
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("introduces no Product Hunt copy or asset dependency", () => {
    const { container } = render(<LandingPage />);
    expect(container.textContent ?? "").not.toMatch(/product hunt/i);
    // No external image/script assets are required by the landing page.
    expect(container.querySelectorAll("img").length).toBe(0);
    expect(container.querySelectorAll("script").length).toBe(0);
  });
});
