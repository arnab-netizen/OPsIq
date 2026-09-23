import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";

// The root route is a server component that depends on session + redirect.
// Mock both so we can exercise its routing decision deterministically.
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/services/auth", () => ({ getSession: vi.fn() }));

import HomePage, { metadata } from "@/app/page";
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
    // The logged-out branch returns a fragment containing the homepage JSON-LD
    // script tag alongside the LandingPage component element.
    const children = (element as { props: { children: unknown } }).props.children;
    const childArray = Array.isArray(children) ? children : [children];
    const types = childArray.map((child) => (child as { type?: unknown } | null)?.type);
    expect(types).toContain(LandingPage);
    expect(types).toContain("script");
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

describe("root route (/) structured data", () => {
  function getJsonLdScripts(element: Awaited<ReturnType<typeof HomePage>>) {
    const children = (element as { props: { children: unknown } }).props.children;
    const childArray = Array.isArray(children) ? children : [children];
    return childArray.filter((child) => (child as { type?: unknown } | null)?.type === "script") as Array<{
      props: { dangerouslySetInnerHTML: { __html: string } };
    }>;
  }

  it("renders exactly two JSON-LD script tags, each parsing as valid, distinct JSON", async () => {
    getSessionMock.mockResolvedValue(null);

    const element = await HomePage();
    const scripts = getJsonLdScripts(element);
    expect(scripts.length).toBe(2);

    const parsed = scripts.map((s) => JSON.parse(s.props.dangerouslySetInnerHTML.__html));
    const types = parsed.map((p) => p["@type"]).sort();
    expect(types).toEqual(["Organization", "WebApplication"]);
  });

  it("gives both entities a stable @id and links the application to the organization as publisher", async () => {
    getSessionMock.mockResolvedValue(null);

    const element = await HomePage();
    const scripts = getJsonLdScripts(element);
    const parsed = scripts.map((s) => JSON.parse(s.props.dangerouslySetInnerHTML.__html));

    const app = parsed.find((p) => p["@type"] === "WebApplication");
    const org = parsed.find((p) => p["@type"] === "Organization");
    expect(app["@id"]).toBe("https://opsiq.solutions/#software");
    expect(org["@id"]).toBe("https://opsiq.solutions/#organization");
    expect(app.publisher).toEqual({ "@id": org["@id"] });
  });

  it("references the real, existing logo asset and canonical domain -- no invented URLs", async () => {
    getSessionMock.mockResolvedValue(null);

    const element = await HomePage();
    const scripts = getJsonLdScripts(element);
    const parsed = scripts.map((s) => JSON.parse(s.props.dangerouslySetInnerHTML.__html));
    const org = parsed.find((p) => p["@type"] === "Organization");

    expect(org.logo).toBe("https://opsiq.solutions/opsiq-logo.png");
    expect(org.url).toBe("https://opsiq.solutions/");
    // This is a string-equality check only -- it proves this PR left the two pre-existing
    // sameAs URLs unchanged and added no new one (e.g. a founder's personal account). It does
    // NOT verify these two URLs are OpsIQ's official profiles or that they are reachable; this
    // test suite has no network access and makes no claim either way about that.
    expect(org.sameAs).toEqual([
      "https://www.linkedin.com/company/opsiq-hq/",
      "https://x.com/opsiqsolutions",
    ]);
  });

  it("never invents a rating or review to satisfy rich-result eligibility", async () => {
    getSessionMock.mockResolvedValue(null);

    const element = await HomePage();
    const scripts = getJsonLdScripts(element);
    const parsed = scripts.map((s) => JSON.parse(s.props.dangerouslySetInnerHTML.__html));

    for (const entity of parsed) {
      expect(entity).not.toHaveProperty("aggregateRating");
      expect(entity).not.toHaveProperty("review");
    }
  });

  it("gives the shared og:image/twitter:image the same accurate, non-empty alt text", () => {
    const ogImages = metadata.openGraph?.images;
    const ogImage = Array.isArray(ogImages) ? ogImages[0] : ogImages;
    const twitterImages = metadata.twitter?.images;
    const twitterImage = Array.isArray(twitterImages) ? twitterImages[0] : twitterImages;

    expect(ogImage).toMatchObject({ url: "/og-image.png" });
    expect(twitterImage).toMatchObject({ url: "/og-image.png" });

    const ogAlt = typeof ogImage === "object" ? ogImage?.alt : undefined;
    const twitterAlt = typeof twitterImage === "object" ? twitterImage?.alt : undefined;
    expect(typeof ogAlt).toBe("string");
    expect((ogAlt as string).length).toBeGreaterThan(0);
    expect(twitterAlt).toBe(ogAlt);
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

  it("includes a primary 'Request beta access' CTA instead of a direct /signup link", () => {
    const { container } = render(<LandingPage />);
    const signupLinks = container.querySelectorAll('a[href="/signup"]');
    expect(signupLinks.length).toBe(0);

    const betaTriggers = Array.from(container.querySelectorAll("button")).filter(
      (b) => b.textContent === "Request beta access"
    );
    expect(betaTriggers.length).toBeGreaterThan(0);
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
    // The only image the landing page renders is the real OpsIQ brand logo (header) -- no
    // Product-Hunt-specific badge/screenshot asset, and no script tags.
    const imgs = container.querySelectorAll("img");
    expect(imgs.length).toBe(1);
    // The logo is an image-only link to "/" -- its alt text is the link's sole accessible
    // name, so it must describe the destination ("home"), not just restate the brand.
    expect(imgs[0].getAttribute("alt")).toBe("OpsIQ home");
    expect(container.querySelectorAll("script").length).toBe(0);
  });
});
