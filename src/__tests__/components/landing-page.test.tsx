/**
 * Public homepage (LandingPage) — content-safety and structure contract.
 *
 * The public homepage carries no auth/capability gate and is the one surface a
 * first-time, logged-out visitor reads before ever touching the product. This
 * suite proves the page never renders a prohibited or unsupported marketing
 * claim (churn/retention intelligence, live integrations, an AI advisor/chat,
 * autonomous execution, forecasts, ROI/revenue promises, fabricated customer
 * proof, or "no paid AI provider needed" as a value claim), that the product-
 * proof example is clearly labeled fictional, and that the page keeps its
 * real landmark/heading structure.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import LandingPage from "@/components/landing/LandingPage";

afterEach(() => cleanup());

const PROHIBITED_PATTERNS: Array<{ label: string; pattern: RegExp }> = [
  { label: "churn/retention intelligence", pattern: /churn|retention (score|intelligence)|concentration risk/i },
  { label: "live integrations", pattern: /quickbooks|hubspot|connect(ed)? to your (bank|accounting)|integrat(es?|ion)/i },
  { label: "AI advisor/chat capability", pattern: /ask (opsiq|ai)|ai (chat|advisor|copilot)|chat with/i },
  { label: "autonomous execution", pattern: /automatically (sends|executes|runs|applies)|autonomous/i },
  { label: "forecasts/predictions", pattern: /forecast|predicts?\b/i },
  { label: "ROI/profit/revenue improvement", pattern: /\bROI\b|increase(d)? (profit|revenue)|boost (profit|revenue)/i },
  { label: "customers/logos/testimonials", pattern: /trusted by|our customers|testimonial|case study/i },
  { label: "fabricated confidence percentage", pattern: /\d+(\.\d+)?%\s*(confiden|accura)/i },
  { label: "no-paid-AI-provider as a value claim", pattern: /no paid ai provider/i },
  { label: "unsupported generic trust language", pattern: /enterprise-grade|highly accurate|secure by design|trusted ai/i },
];

describe("LandingPage — prohibited/unsupported claims never render", () => {
  it.each(PROHIBITED_PATTERNS)("never renders: $label", ({ pattern }) => {
    const { container } = render(<LandingPage />);
    expect(container.textContent ?? "").not.toMatch(pattern);
  });
});

describe("LandingPage — product-proof example is honestly labeled", () => {
  it("labels the demo sequence as an illustrative, non-real example", () => {
    const { getByTestId } = render(<LandingPage />);
    const proof = getByTestId("landing-product-proof");
    expect(proof.textContent).toMatch(/illustrative example/i);
    expect(proof.textContent).toMatch(/not a real customer/i);
  });

  it("the proof sequence covers signal, finding, why-it-matters, priority, action, and evidence", () => {
    const { getByTestId } = render(<LandingPage />);
    const proof = getByTestId("landing-product-proof").textContent ?? "";
    for (const label of ["Business signal", "Finding", "Why it matters", "Priority", "Recommended action", "Evidence"]) {
      expect(proof).toMatch(new RegExp(label, "i"));
    }
  });
});

describe("LandingPage — structure and CTAs", () => {
  it("has exactly one h1, and every other heading is h2 or h3 (no skipped levels)", () => {
    const { container } = render(<LandingPage />);
    expect(container.querySelectorAll("h1").length).toBe(1);
    expect(container.querySelectorAll("h4, h5, h6").length).toBe(0);
  });

  it("keeps the real landmark structure: header, main, footer, two labeled nav regions", () => {
    const { container } = render(<LandingPage />);
    expect(container.querySelector("header")).not.toBeNull();
    expect(container.querySelector("main")).not.toBeNull();
    expect(container.querySelector("footer")).not.toBeNull();
    expect(container.querySelector('nav[aria-label="Primary"]')).not.toBeNull();
    expect(container.querySelector('nav[aria-label="Legal and support"]')).not.toBeNull();
  });

  it("every primary/secondary CTA points at /signup or /login, never a dead link", () => {
    const { container } = render(<LandingPage />);
    const hrefs = Array.from(container.querySelectorAll("a")).map((a) => a.getAttribute("href"));
    expect(hrefs.length).toBeGreaterThan(0);
    for (const href of hrefs) {
      expect(href).toBeTruthy();
    }
    expect(hrefs).toContain("/signup");
    expect(hrefs).toContain("/login");
  });

  it("mentions Money, Sales, and Operations by name (the real, shipped decision domains) and no others", () => {
    const { container } = render(<LandingPage />);
    const text = container.textContent ?? "";
    expect(text).toMatch(/Money/);
    expect(text).toMatch(/Sales/);
    expect(text).toMatch(/Operations/);
  });

  it("never mentions Preview/Coming-Soon capabilities (Recovery, Strategy, Marketing, AI Copilot, Integrations) as public homepage claims", () => {
    const { container } = render(<LandingPage />);
    const text = container.textContent ?? "";
    for (const label of ["Recovery", "Strategy", "Marketing", "AI Copilot"]) {
      expect(text).not.toMatch(new RegExp(`\\b${label}\\b`));
    }
  });
});
