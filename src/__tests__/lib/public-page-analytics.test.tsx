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
  it.each(["/", "/about", "/beta", "/privacy", "/terms", "/resources", "/resources/", "/resources/profitable-but-short-on-cash"])(
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
