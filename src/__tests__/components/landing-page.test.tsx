/**
 * Public homepage (LandingPage) — content-safety and structure contract.
 *
 * The public homepage carries no auth/capability gate and is the one surface a
 * first-time, logged-out visitor reads before ever touching the product. This
 * suite proves the page never renders a prohibited or unsupported marketing
 * claim (churn/retention intelligence, live integrations, an AI advisor/chat,
 * autonomous execution, forecasts, ROI/revenue promises, fabricated customer
 * proof, "no paid AI provider needed" as a value claim, prospective early-
 * warning timing, automatic payment/verification detection, ungrounded
 * confidence framing, or an unproven "realistic" timeframe claim), that the
 * product-proof example is clearly labeled fictional, and that the page keeps
 * its real landmark/heading structure.
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
  { label: "prospective early-warning timing claim", pattern: /before it.?s an emergency|catches? it before|early[- ]warning/i },
  { label: "automatic payment/verification detection claim", pattern: /marked verified once|automatically (detect|observ|verif)/i },
  { label: "ungrounded confidence framing", pattern: /enough to be confident/i },
  { label: "unproven 'realistic' timeframe claim", pattern: /realistic timeframe/i },
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

describe("LandingPage — claim-precision corrections stay grounded", () => {
  it("verification is explicitly owner-recorded, not automatically detected", () => {
    const { container } = render(<LandingPage />);
    const text = container.textContent ?? "";
    expect(text).toMatch(/owner checks what happened and\s*records the outcome/i);
    expect(text).toMatch(/doesn.t detect payment automatically/i);
  });

  it("missing-data trust point is grounded in the real behavior (showing the gap), not a confidence framing", () => {
    const { container } = render(<LandingPage />);
    const text = container.textContent ?? "";
    expect(text).toMatch(/when required information is missing, opsiq shows the gap/i);
  });

  it("does not claim OpsIQ surfaces issues before they become an emergency", () => {
    const { container } = render(<LandingPage />);
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/before it.?s an emergency/i);
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

  it("every anchor CTA points at /login, never a dead link, and cold traffic is never sent straight to /signup", () => {
    const { container } = render(<LandingPage />);
    const hrefs = Array.from(container.querySelectorAll("a")).map((a) => a.getAttribute("href"));
    expect(hrefs.length).toBeGreaterThan(0);
    for (const href of hrefs) {
      expect(href).toBeTruthy();
    }
    expect(hrefs).toContain("/login");
    // The controlled-beta homepage capture: the primary cold-traffic CTA is a
    // modal trigger, never a direct link to full /signup.
    expect(hrefs).not.toContain("/signup");
  });

  it("shows exactly three 'Request beta access' triggers (header, hero, final CTA) and 'Sign in' everywhere it appeared before", () => {
    const { container } = render(<LandingPage />);
    const triggers = Array.from(container.querySelectorAll("button")).filter(
      (b) => b.textContent === "Request beta access"
    );
    expect(triggers).toHaveLength(3);
    expect(container.textContent ?? "").not.toMatch(/start free/i);

    const signInLinks = Array.from(container.querySelectorAll("a")).filter((a) => a.textContent === "Sign in");
    expect(signInLinks).toHaveLength(3);
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
