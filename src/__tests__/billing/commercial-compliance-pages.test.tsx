import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render } from "@testing-library/react";
import PricingPage from "@/app/pricing/page";
import RefundPolicyPage from "@/app/refund-policy/page";
import TermsPage from "@/app/terms/page";
import PrivacyPage from "@/app/privacy/page";
import { PublicSiteFooter } from "@/components/landing/PublicSiteFooter";
import { buildSitemap } from "@/services/public-site/sitemap";
import { PUBLIC_PRICE_DISPLAY } from "@/domain/billing/public-pricing";

afterEach(cleanup);

describe("commercial compliance minimum (Paddle domain review content)", () => {
  it("PRICING_DECISION_REQUIRED: no final price is invented until the owner sets one", () => {
    expect(PUBLIC_PRICE_DISPLAY).toBeNull();
    const { container } = render(<PricingPage />);
    expect(container.textContent).not.toMatch(/[$€£₹]\s?\d|US\$|\d+\s?(USD|INR|EUR)/);
    expect(container.textContent).toMatch(/Paid plans have not opened yet/);
  });
  it("pricing describes the one plan, free first diagnosis, Paddle MoR, cancellation, grace and links to policies", () => {
    const { container } = render(<PricingPage />);
    const t = container.textContent ?? "";
    expect(t).toMatch(/one plan/i);
    expect(t).toMatch(/first diagnosis/i);
    expect(t).toMatch(/Merchant of Record/);
    expect(t).toMatch(/cancel any time/i);
    expect(t).toMatch(/7 days/);
    const hrefs = [...container.querySelectorAll("a")].map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual(expect.arrayContaining(["/refund-policy", "/terms", "/privacy"]));
  });
  it("refund and cancellation policy states cancellation timing, refund path, and Paddle terms", () => {
    const { container } = render(<RefundPolicyPage />);
    const t = container.textContent ?? "";
    expect(t).toMatch(/end of the\s+billing period you have already paid for/);
    expect(t).toMatch(/14 days of your most\s+recent charge/);
    expect(t).toMatch(/support@opsiq\.solutions/);
    expect(container.querySelector('a[href="https://www.paddle.com/legal/checkout-buyer-terms"]')).not.toBeNull();
  });
  it("terms cover the paid subscription without claiming everything is permanently free", () => {
    const { container } = render(<TermsPage />);
    const t = container.textContent ?? "";
    expect(t).toMatch(/Paid subscription \(when offered\)/);
    expect(t).toMatch(/Merchant of Record/);
    expect(t).not.toMatch(/no automatic paid entitlement/);
    expect(container.querySelector('a[href="/refund-policy"]')).not.toBeNull();
  });
  it("privacy discloses Paddle and what OpsIQ does and does not store", () => {
    const { container } = render(<PrivacyPage />);
    const t = container.textContent ?? "";
    expect(t).toMatch(/Paddle \(payment processing and Merchant of Record/);
    expect(t).toMatch(/never receives or stores your card number/);
  });
  it("footer navigation and sitemap expose pricing and refund policy, but never /pay", () => {
    const { container } = render(<PublicSiteFooter />);
    const hrefs = [...container.querySelectorAll("a")].map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual(expect.arrayContaining(["/pricing", "/refund-policy", "/privacy", "/terms"]));
    const urls = buildSitemap([]).map((e) => e.url);
    expect(urls.some((u) => u.endsWith("/pricing"))).toBe(true);
    expect(urls.some((u) => u.endsWith("/refund-policy"))).toBe(true);
    expect(urls.some((u) => u.endsWith("/pay"))).toBe(false);
  });
});
