/**
 * Vercel Web Analytics policy for the public site
 * (src/lib/analytics/public-page-analytics.ts + PublicPageAnalytics).
 */

import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import {
  filterPublicPageView,
  isPublicAnalyticsPath,
  sanitizePublicPageViewUrl,
  shouldMountPageAnalytics,
} from "@/lib/analytics/public-page-analytics";

const analyticsProps = vi.hoisted(() => ({ last: null as null | Record<string, unknown> }));
vi.mock("@vercel/analytics/next", () => ({
  Analytics: (props: Record<string, unknown>) => {
    analyticsProps.last = props;
    return null;
  },
}));

import { PublicPageAnalytics } from "@/components/analytics/PublicPageAnalytics";

describe("isPublicAnalyticsPath", () => {
  it.each(["/", "/about", "/beta", "/privacy", "/terms", "/resources", "/resources/", "/resources/profitable-but-short-on-cash", "/tools", "/tools/", "/tools/profit-margin-calculator", "/tools/profit-margin-calculator/", "/tools/client-profitability-calculator", "/tools/agency-retainer-pricing-calculator", "/tools/agency-utilization-calculator", "/tools/agency-scope-creep-calculator", "/tools/agency-hourly-rate-calculator", "/tools/agency-capacity-calculator", "/agency", "/agency/"])(
    "counts public page %s",
    (path) => expect(isPublicAnalyticsPath(path)).toBe(true)
  );

  it.each([
    "/owner/cockpit",
    "/owner/finance",
    "/dashboard",
    "/admin/beta-requests",
    "/settings",
    "/onboarding",
    "/login",
    "/signup",
    "/reset-password",
    "/api/beta-requests",
    "/resourcesx",
    "/aboutus",
    "/tools/other-tool",
    "/tools/client-profitability-calculatorx",
    "/tools/agency-capacity-calculator/internal",
    "/tools/profit-margin-calculatorx",
    "/agencyx",
    "/agency/internal",
  ])("never counts non-public path %s", (path) => expect(isPublicAnalyticsPath(path)).toBe(false));
});

describe("sanitizePublicPageViewUrl", () => {
  it("keeps only utm_* parameters and drops the fragment", () => {
    expect(
      sanitizePublicPageViewUrl(
        "https://opsiq.solutions/resources/cash-gap?utm_source=linkedin&utm_campaign=launch&email=a%40b.com&token=abc#section"
      )
    ).toBe("https://opsiq.solutions/resources/cash-gap?utm_source=linkedin&utm_campaign=launch");
  });

  it("reports a bare path when no utm tags are present", () => {
    expect(sanitizePublicPageViewUrl("https://opsiq.solutions/resources?ref=x")).toBe("https://opsiq.solutions/resources");
  });

  it("returns null for private pages and unparseable URLs", () => {
    expect(sanitizePublicPageViewUrl("https://opsiq.solutions/owner/finance?businessId=123")).toBeNull();
    expect(sanitizePublicPageViewUrl("not a url")).toBeNull();
  });
});

describe("filterPublicPageView (beforeSend)", () => {
  it("passes a sanitized public page view and drops private ones", () => {
    expect(filterPublicPageView({ type: "pageview", url: "https://opsiq.solutions/?utm_source=x&q=1" })).toEqual({
      type: "pageview",
      url: "https://opsiq.solutions/?utm_source=x",
    });
    expect(filterPublicPageView({ type: "pageview", url: "https://opsiq.solutions/dashboard" })).toBeNull();
  });
});

describe("shouldMountPageAnalytics", () => {
  it.each([
    [{ VERCEL_ENV: "production" }, true],
    [{ VERCEL_ENV: "preview" }, false],
    [{ VERCEL_ENV: "development" }, false],
    [{}, false],
  ])("env %j → mount: %s", (env, expected) => expect(shouldMountPageAnalytics(env)).toBe(expected));
});

describe("PublicPageAnalytics", () => {
  it("mounts Vercel Analytics with the public-page beforeSend filter and no custom configuration", () => {
    render(<PublicPageAnalytics />);
    expect(analyticsProps.last).toEqual({ beforeSend: filterPublicPageView });
  });
});


describe("beforeSend handles custom-event objects as well as page views", () => {
  it("passes an allowlisted event through with query parameters stripped", async () => {
    const { filterPublicPageView } = await import("@/lib/analytics/public-page-analytics");
    const out = filterPublicPageView({ type: "event", url: "https://opsiq.solutions/tools/agency-capacity-calculator?income=123456&utm_source=li", name: "calculator_start" });
    expect(out).toEqual({ type: "event", url: "https://opsiq.solutions/tools/agency-capacity-calculator?utm_source=li", name: "calculator_start" });
  });
  it("drops an event raised on a private page", async () => {
    const { filterPublicPageView } = await import("@/lib/analytics/public-page-analytics");
    expect(filterPublicPageView({ type: "event", url: "https://opsiq.solutions/owner/finance", name: "calculator_start" })).toBeNull();
  });
});
