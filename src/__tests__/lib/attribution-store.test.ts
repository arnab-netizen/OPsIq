/**
 * Consent-gated, site-wide first/last-touch attribution (src/lib/attribution/attribution-store.ts).
 */
import { describe, it, expect } from "vitest";
import {
  captureAttributionOnConsent,
  clearStoredAttribution,
  getAttributionSnapshot,
  sanitizeUtmTagsForTransport,
  FIRST_TOUCH_STORAGE_KEY,
  LAST_TOUCH_STORAGE_KEY,
} from "@/lib/attribution/attribution-store";
import { CLARITY_CONSENT_STORAGE_KEY } from "@/lib/analytics/clarity-policy";

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
    data,
  };
}

function win(href: string, referrer = "", localStorage = memoryStorage()) {
  return { location: { href }, document: { referrer }, localStorage };
}

function grant(storage: ReturnType<typeof memoryStorage>) {
  storage.setItem(CLARITY_CONSENT_STORAGE_KEY, "granted");
}
function deny(storage: ReturnType<typeof memoryStorage>) {
  storage.setItem(CLARITY_CONSENT_STORAGE_KEY, "denied");
}

describe("captureAttributionOnConsent — no consent", () => {
  it("writes nothing when there is no consent choice yet", () => {
    const storage = memoryStorage();
    captureAttributionOnConsent(win("https://opsiq.solutions/?utm_source=test&utm_medium=test&utm_campaign=test", "", storage));
    expect(storage.data.size).toBe(0);
  });

  it("writes nothing when consent is denied", () => {
    const storage = memoryStorage();
    deny(storage);
    captureAttributionOnConsent(win("https://opsiq.solutions/?utm_source=test", "", storage));
    expect(storage.getItem(FIRST_TOUCH_STORAGE_KEY)).toBeNull();
    expect(storage.getItem(LAST_TOUCH_STORAGE_KEY)).toBeNull();
  });

  it("getAttributionSnapshot reports nothing without consent even if something were somehow stored", () => {
    const storage = memoryStorage({
      [FIRST_TOUCH_STORAGE_KEY]: JSON.stringify({ utmSource: "leftover" }),
    });
    expect(getAttributionSnapshot({ localStorage: storage })).toEqual({ firstTouch: null, lastTouch: null });
  });
});

describe("captureAttributionOnConsent — consent granted", () => {
  it("captures first-touch and last-touch from a campaign landing", () => {
    const storage = memoryStorage();
    grant(storage);
    captureAttributionOnConsent(win("https://opsiq.solutions/?utm_source=test&utm_medium=test&utm_campaign=test", "", storage));
    const snapshot = getAttributionSnapshot({ localStorage: storage });
    expect(snapshot.firstTouch).toEqual({ utmSource: "test", utmMedium: "test", utmCampaign: "test" });
    expect(snapshot.lastTouch).toEqual({ utmSource: "test", utmMedium: "test", utmCampaign: "test" });
  });

  it("never overwrites first-touch on a later page view, even a later campaign", () => {
    const storage = memoryStorage();
    grant(storage);
    captureAttributionOnConsent(win("https://opsiq.solutions/?utm_source=linkedin&utm_medium=social", "", storage));
    captureAttributionOnConsent(win("https://opsiq.solutions/resources?utm_source=google&utm_medium=cpc", "", storage));
    const snapshot = getAttributionSnapshot({ localStorage: storage });
    expect(snapshot.firstTouch).toEqual({ utmSource: "linkedin", utmMedium: "social" });
  });

  it("overwrites last-touch on every fresh campaign visit", () => {
    const storage = memoryStorage();
    grant(storage);
    captureAttributionOnConsent(win("https://opsiq.solutions/?utm_source=linkedin&utm_medium=social", "", storage));
    captureAttributionOnConsent(win("https://opsiq.solutions/resources?utm_source=google&utm_medium=cpc", "", storage));
    const snapshot = getAttributionSnapshot({ localStorage: storage });
    expect(snapshot.lastTouch).toEqual({ utmSource: "google", utmMedium: "cpc" });
    // First touch is still untouched.
    expect(snapshot.firstTouch).toEqual({ utmSource: "linkedin", utmMedium: "social" });
  });

  it("leaves last-touch alone on internal navigation with no campaign tags of its own", () => {
    const storage = memoryStorage();
    grant(storage);
    captureAttributionOnConsent(win("https://opsiq.solutions/?utm_source=linkedin", "", storage));
    captureAttributionOnConsent(win("https://opsiq.solutions/about", "", storage)); // plain internal nav, no utm
    const snapshot = getAttributionSnapshot({ localStorage: storage });
    expect(snapshot.lastTouch).toEqual({ utmSource: "linkedin" });
  });

  it("survives internal navigation: first-touch persists across many subsequent page views", () => {
    const storage = memoryStorage();
    grant(storage);
    captureAttributionOnConsent(win("https://opsiq.solutions/?utm_source=x&utm_campaign=launch", "", storage));
    for (const path of ["/about", "/resources", "/resources/some-article", "/beta"]) {
      captureAttributionOnConsent(win(`https://opsiq.solutions${path}`, "", storage));
    }
    expect(getAttributionSnapshot({ localStorage: storage }).firstTouch).toEqual({ utmSource: "x", utmCampaign: "launch" });
  });

  it("retroactively captures the CURRENT page once consent flips from no-choice to granted", () => {
    const storage = memoryStorage();
    const page = win("https://opsiq.solutions/?utm_source=retro&utm_campaign=mid-visit", "", storage);
    // No consent yet: the caller (AttributionCapture) would not even invoke capture, but prove the
    // module itself is a no-op too (belt and suspenders).
    captureAttributionOnConsent(page);
    expect(getAttributionSnapshot({ localStorage: storage })).toEqual({ firstTouch: null, lastTouch: null });
    // Visitor grants consent while still on this same page.
    grant(storage);
    captureAttributionOnConsent(page);
    expect(getAttributionSnapshot({ localStorage: storage }).firstTouch).toEqual({ utmSource: "retro", utmCampaign: "mid-visit" });
  });
});

describe("clearStoredAttribution", () => {
  it("removes both first- and last-touch (consent withdrawal)", () => {
    const storage = memoryStorage();
    grant(storage);
    captureAttributionOnConsent(win("https://opsiq.solutions/?utm_source=x", "", storage));
    clearStoredAttribution({ localStorage: storage });
    expect(storage.getItem(FIRST_TOUCH_STORAGE_KEY)).toBeNull();
    expect(storage.getItem(LAST_TOUCH_STORAGE_KEY)).toBeNull();
  });
});

describe("tamper resistance", () => {
  it("re-sanitizes stored JSON on read instead of trusting it (malicious stored value is dropped)", () => {
    const storage = memoryStorage({
      [CLARITY_CONSENT_STORAGE_KEY]: "granted",
      [FIRST_TOUCH_STORAGE_KEY]: JSON.stringify({ utmSource: "<script>alert(1)</script>", utmMedium: "ok" }),
    });
    // sanitize() from acquisition-attribution.ts only trims/length-caps (no char allowlist at that
    // layer — see cleanUtm), so this proves re-sanitization runs at all, and that the TRANSPORT-time
    // allowlist (sanitizeUtmTagsForTransport) is what actually strips the dangerous value before send.
    const snapshot = getAttributionSnapshot({ localStorage: storage });
    const safe = sanitizeUtmTagsForTransport(snapshot.firstTouch);
    expect(safe.utmSource).toBeUndefined();
    expect(safe.utmMedium).toBe("ok");
  });
});

describe("sanitizeUtmTagsForTransport", () => {
  it("passes through realistic campaign values with common safe punctuation", () => {
    const tags = { utmSource: "news-letter_Q4.2026", utmMedium: "social", utmCampaign: "50%-off, launch:2026" };
    expect(sanitizeUtmTagsForTransport(tags)).toEqual(tags);
  });

  it.each([
    ["a script tag", "<script>alert(1)</script>"],
    ["a javascript: scheme", "javascript:alert(1)"],
    ["an onerror handler injection", "\"><img src=x onerror=alert(1)>"],
    ["a quote-breakout attempt", "x\"onmouseover=\"alert(1)"],
    ["a backtick/template-literal character", "`alert(1)`"],
    ["an ampersand/query-delimiter character", "a&b=c"],
    ["a backslash", "a\\b"],
    ["an over-long value (201 chars)", "x".repeat(201)],
  ])("drops %s entirely rather than forwarding any part of it", (_label, value) => {
    expect(sanitizeUtmTagsForTransport({ utmSource: value })).toEqual({});
  });

  it("returns {} for null/undefined input", () => {
    expect(sanitizeUtmTagsForTransport(null)).toEqual({});
    expect(sanitizeUtmTagsForTransport(undefined)).toEqual({});
  });
});
