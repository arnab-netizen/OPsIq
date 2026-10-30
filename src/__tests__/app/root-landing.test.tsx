import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";

// The root route is a server component that depends on the root-decision service + redirect.
// Mock both so we can exercise its routing decision deterministically.
// F-AUTH-ROOT-SINGLE-TX: the session validation, policy check, and owner-login-href decision all
// live in resolveAuthenticatedRootDecision() (root-redirect.service.ts) -- mocked directly here
// (this page no longer calls @/services/auth at all) so this suite exercises the REAL decision the
// page makes (call the service once, redirect only for `kind: "redirect"`) instead of accidentally
// passing via an unrelated thrown-error fail-closed path.
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/services/root-redirect.service", () => ({ resolveAuthenticatedRootDecision: vi.fn() }));

import HomePage, { metadata } from "@/app/page";
import LandingPage from "@/components/landing/LandingPage";
import { resolveAuthenticatedRootDecision } from "@/services/root-redirect.service";
import { redirect } from "next/navigation";

const resolveAuthenticatedRootDecisionMock = vi.mocked(resolveAuthenticatedRootDecision);
const redirectMock = vi.mocked(redirect);

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

describe("root route (/) landing behavior", () => {
  it("renders the public landing page (not a redirect) for logged-out visitors", async () => {
    resolveAuthenticatedRootDecisionMock.mockResolvedValue({ kind: "anonymous" });

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

  it("redirects an authenticated visitor to whatever destination the root-decision service resolves", async () => {
    resolveAuthenticatedRootDecisionMock.mockResolvedValue({ kind: "redirect", href: "/dashboard" });

    await HomePage();

    expect(resolveAuthenticatedRootDecisionMock).toHaveBeenCalled();
    expect(redirectMock).toHaveBeenCalledWith("/dashboard");
  });

  it("redirects a proven self-serve owner to the owner destination the decision resolves, not a hardcoded /dashboard", async () => {
    resolveAuthenticatedRootDecisionMock.mockResolvedValue({ kind: "redirect", href: "/owner/first-run" });

    await HomePage();

    expect(redirectMock).toHaveBeenCalledWith("/owner/first-run");
  });

  it("renders the public landing page (not a redirect) when the decision is anonymous, even if a cookie existed", async () => {
    resolveAuthenticatedRootDecisionMock.mockResolvedValue({ kind: "anonymous" });

    await HomePage();

    expect(redirectMock).not.toHaveBeenCalled();
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
    resolveAuthenticatedRootDecisionMock.mockResolvedValue({ kind: "anonymous" });

    const element = await HomePage();
    const scripts = getJsonLdScripts(element);
    expect(scripts.length).toBe(2);

    const parsed = scripts.map((s) => JSON.parse(s.props.dangerouslySetInnerHTML.__html));
    const types = parsed.map((p) => p["@type"]).sort();
    expect(types).toEqual(["Organization", "WebApplication"]);
  });

  it("gives both entities a stable @id and links the application to the organization as publisher", async () => {
    resolveAuthenticatedRootDecisionMock.mockResolvedValue({ kind: "anonymous" });

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
    resolveAuthenticatedRootDecisionMock.mockResolvedValue({ kind: "anonymous" });

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
    resolveAuthenticatedRootDecisionMock.mockResolvedValue({ kind: "anonymous" });

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
    // The landing page renders exactly two images: the real OpsIQ brand logo (header) and the one
    // real-product screenshot (fictional demo data). No Product-Hunt-specific badge/screenshot
    // asset, and no script tags.
    const imgs = container.querySelectorAll("img");
    expect(imgs.length).toBe(2);
    // The logo is an image-only link to "/" -- its alt text is the link's sole accessible
    // name, so it must describe the destination ("home"), not just restate the brand.
    expect(imgs[0].getAttribute("alt")).toBe("OpsIQ home");
    expect(imgs[1].getAttribute("src") ?? "").toContain("opsiq-owner-priority-demo.png");
    expect(container.querySelectorAll("script").length).toBe(0);
  });
});
