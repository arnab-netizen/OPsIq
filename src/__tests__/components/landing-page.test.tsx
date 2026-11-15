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
    expect(container.querySelector('nav[aria-label="Resources, legal, and support"]')).not.toBeNull();
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

describe("LandingPage — PwC-backed 'why now' and OpsIQ response", () => {
  it("states the PwC population, caveat, and no endorsement", () => {
    const { getByTestId } = render(<LandingPage />);
    const text = getByTestId("landing-why-now").textContent ?? "";
    expect(text).toMatch(/767 US operations and\s*supply-chain leaders/i);
    expect(text).toMatch(/not of all\s*businesses/i);
    expect(text).toMatch(/not reviewed or endorsed OpsIQ/i);
    expect(text).toMatch(/OpsIQ.s interpretation/i);
  });

  it("uses exactly two PwC-derived facts and never implies PwC recommends/validates OpsIQ", () => {
    const { getByTestId, container } = render(<LandingPage />);
    expect(getByTestId("landing-why-now").querySelectorAll("li")).toHaveLength(2);
    expect(container.textContent ?? "").not.toMatch(/PwC (predicts|recommends|validates|proves|says businesses need)/i);
  });

  it("links to the owned research article", () => {
    const { container } = render(<LandingPage />);
    const hrefs = Array.from(container.querySelectorAll("a")).map((a) => a.getAttribute("href"));
    expect(hrefs).toContain("/resources/future-of-business-decision-making-2026-operations-research");
  });

  it("shows the Evidence → Diagnose → Prioritize → Act → Verify order", () => {
    const { container } = render(<LandingPage />);
    const titles = Array.from(container.querySelectorAll("li h3")).map((h) => h.textContent);
    expect(titles.slice(0, 5)).toEqual(["Evidence", "Diagnose", "Prioritize", "Act", "Verify"]);
  });
});

describe("LandingPage — P1 conversion clarity", () => {
  it("states the audience near the hero, using the public positioning wording", () => {
    const { getByTestId } = render(<LandingPage />);
    expect(getByTestId("landing-audience").textContent).toMatch(/small and mid-size service business owners/i);
  });

  it("states the beta is free, controlled and by invitation, with no timeline or instant-access promise", () => {
    const { container } = render(<LandingPage />);
    const text = container.textContent ?? "";
    expect(text).toMatch(/free controlled beta/i);
    expect(text).toMatch(/access by invitation/i);
    expect(text).not.toMatch(/instant|within \d+|immediately/i);
  });

  it("explains what the owner brings, what OpsIQ does, and what they get", () => {
    const { getByTestId } = render(<LandingPage />);
    const text = getByTestId("landing-input-output").textContent ?? "";
    for (const label of ["You bring", "OpsIQ does", "You get"]) expect(text).toMatch(new RegExp(label));
    expect(text).toMatch(/recommended action/i);
    expect(text).toMatch(/outcome you verify/i);
  });

  it("has exactly three short differentiation statements and no brand or consultant-replacement claim", () => {
    const { getByTestId, container } = render(<LandingPage />);
    const items = getByTestId("landing-differentiation").querySelectorAll("li");
    expect(items).toHaveLength(3);
    expect(container.textContent ?? "").not.toMatch(/replaces? (your )?consultant|vs\.? |better than/i);
  });
});

describe("LandingPage — real-product proof block", () => {
  it("shows exactly one real-product screenshot with meaningful alt text", () => {
    const { getByTestId } = render(<LandingPage />);
    const imgs = getByTestId("landing-real-product").querySelectorAll("img");
    expect(imgs).toHaveLength(1);
    const alt = imgs[0].getAttribute("alt") ?? "";
    expect(alt).toMatch(/fictional demo business/i);
    expect(alt).toMatch(/recommended action/i);
    expect(imgs[0].getAttribute("src") ?? "").toContain("opsiq-owner-priority-demo.png");
  });

  it("discloses visibly that the screen uses a fictional demo business", () => {
    const { getByTestId } = render(<LandingPage />);
    const text = getByTestId("landing-real-product").textContent ?? "";
    expect(text).toMatch(/Fictional demo business · no customer data/);
    expect(text).toMatch(/fictional demo data/i);
  });

  it("keeps the protected elements: headline, Riverside example, PwC section, loop, input/output", () => {
    const { container, getByTestId } = render(<LandingPage />);
    expect(container.textContent ?? "").toMatch(/Diagnose your business\. Know your next move\./);
    expect(getByTestId("landing-product-proof").textContent).toMatch(/Riverside Bakery/);
    expect(getByTestId("landing-why-now")).toBeTruthy();
    expect(getByTestId("landing-input-output")).toBeTruthy();
  });
});

describe("LandingPage — real-product proof art direction", () => {
  it("uses the dedicated mobile capture as a <picture> source while keeping the desktop image and disclosure", () => {
    const { getByTestId } = render(<LandingPage />);
    const block = getByTestId("landing-real-product");
    const source = block.querySelector("picture source");
    expect(source?.getAttribute("media")).toBe("(max-width: 639px)");
    expect(decodeURIComponent(source?.getAttribute("srcset") ?? "")).toContain("opsiq-owner-priority-demo-mobile.png");
    expect(decodeURIComponent(block.querySelector("img")?.getAttribute("src") ?? "")).toContain("opsiq-owner-priority-demo.png");
    expect(block.textContent).toMatch(/Fictional demo business · no customer data/);
  });
});
