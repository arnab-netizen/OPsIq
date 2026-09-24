/**
 * Acquisition attribution (src/lib/attribution/acquisition-attribution.ts).
 */

import { describe, it, expect } from "vitest";
import {
  ACQUISITION_ATTRIBUTION_STORAGE_KEY,
  captureFirstTouchAttribution,
  cleanPath,
  deriveAttribution,
} from "@/lib/attribution/acquisition-attribution";

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    data,
  };
}

function browser(href: string, referrer = "", storage = memoryStorage()) {
  return { location: { href }, document: { referrer }, sessionStorage: storage };
}

describe("deriveAttribution", () => {
  it("captures all five utm tags, the landing path without query, and the external referrer host", () => {
    expect(
      deriveAttribution({
        href: "https://opsiq.solutions/resources/cash-gap?utm_source=linkedin&utm_medium=social&utm_campaign=launch&utm_content=post-1&utm_term=cash%20flow",
        referrer: "https://www.linkedin.com/feed/update/123?tracking=abc",
      })
    ).toEqual({
      utmSource: "linkedin",
      utmMedium: "social",
      utmCampaign: "launch",
      utmContent: "post-1",
      utmTerm: "cash flow",
      landingPath: "/resources/cash-gap",
      referrerHost: "www.linkedin.com",
    });
  });

  it("never records OpsIQ itself (either host) or a same-host page as the referrer", () => {
    for (const referrer of ["https://opsiq.solutions/", "https://www.opsiq.solutions/about", "http://localhost:3000/x"]) {
      const href = referrer.includes("localhost") ? "http://localhost:3000/resources" : "https://opsiq.solutions/resources";
      expect(deriveAttribution({ href, referrer }).referrerHost).toBeUndefined();
    }
  });

  it("omits empty/whitespace utm values and caps them at 200 characters", () => {
    const a = deriveAttribution({ href: `https://opsiq.solutions/?utm_source=%20%20&utm_campaign=${"c".repeat(250)}`, referrer: "" });
    expect(a.utmSource).toBeUndefined();
    expect(a.utmCampaign).toHaveLength(200);
  });

  it("ignores non-http referrers and unparseable referrers", () => {
    expect(deriveAttribution({ href: "https://opsiq.solutions/", referrer: "android-app://com.x" }).referrerHost).toBeUndefined();
    expect(deriveAttribution({ href: "https://opsiq.solutions/", referrer: "not a url" }).referrerHost).toBeUndefined();
  });

  it("drops an over-long landing path instead of sending an invalid value", () => {
    expect(deriveAttribution({ href: `https://opsiq.solutions/${"a".repeat(400)}`, referrer: "" }).landingPath).toBeUndefined();
  });
});

describe("captureFirstTouchAttribution", () => {
  it("records the first page's attribution and keeps it for later pages in the same tab", () => {
    const storage = memoryStorage();
    const first = captureFirstTouchAttribution(browser("https://opsiq.solutions/resources/a?utm_source=x", "https://news.ycombinator.com/", storage));
    const later = captureFirstTouchAttribution(browser("https://opsiq.solutions/?utm_source=y", "", storage));
    expect(first).toEqual({ utmSource: "x", landingPath: "/resources/a", referrerHost: "news.ycombinator.com" });
    expect(later).toEqual(first);
  });

  it("re-sanitizes stored values (tampered storage cannot inject invalid fields)", () => {
    const storage = memoryStorage({
      [ACQUISITION_ATTRIBUTION_STORAGE_KEY]: JSON.stringify({ landingPath: "https://evil.example/", referrerHost: "BAD HOST", utmSource: "ok", extra: "x" }),
    });
    expect(captureFirstTouchAttribution(browser("https://opsiq.solutions/", "", storage))).toEqual({ utmSource: "ok" });
  });

  it("degrades to current-page attribution when storage throws", () => {
    const throwing = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    expect(captureFirstTouchAttribution(browser("https://opsiq.solutions/resources?utm_medium=email", "", throwing))).toEqual({
      utmMedium: "email",
      landingPath: "/resources",
    });
  });
});

describe("cleanPath", () => {
  it("accepts encoded root-relative paths and rejects anything else", () => {
    expect(cleanPath("/resources/caf%C3%A9")).toBe("/resources/caf%C3%A9");
    expect(cleanPath("/a?b=c")).toBeUndefined();
    expect(cleanPath("resources")).toBeUndefined();
    expect(cleanPath(42)).toBeUndefined();
  });
});
