// @vitest-environment jsdom
/**
 * AttributionCapture: mounts globally, captures UTM attribution only once analytics consent is
 * "granted", retroactively captures the current page the instant consent is granted while still on
 * it, and clears stored attribution on withdrawal. Mirrors the mocking conventions of
 * clarity-consent.test.tsx (same consent storage key, same "fresh module per test" need since
 * module-level subscriptions are involved).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, act } from "@testing-library/react";
import { FIRST_TOUCH_STORAGE_KEY, LAST_TOUCH_STORAGE_KEY } from "@/lib/attribution/attribution-store";

const CONSENT_KEY = "opsiq_analytics_consent_v1";

let mockPathname = "/";
vi.mock("next/navigation", () => ({ usePathname: () => mockPathname }));

// `url` is the full path+query (what window.location.href carries); `usePathname()` in real Next.js
// never includes the query string, so mockPathname strips it the same way, which matters for the
// private-app-prefix check (a query string must never defeat it).
async function mountAt(url: string) {
  vi.resetModules();
  mockPathname = url.split("?")[0];
  window.history.replaceState({}, "", url);
  const { AttributionCapture } = await import("@/components/analytics/AttributionCapture");
  const utils = render(<AttributionCapture />);
  await act(async () => {});
  return utils;
}

beforeEach(() => {
  window.localStorage.clear();
});
afterEach(() => cleanup());

describe("no consent", () => {
  it("captures nothing when there is no consent choice yet", async () => {
    await mountAt("/?utm_source=test&utm_medium=test&utm_campaign=test");
    expect(window.localStorage.getItem(FIRST_TOUCH_STORAGE_KEY)).toBeNull();
    expect(window.localStorage.getItem(LAST_TOUCH_STORAGE_KEY)).toBeNull();
  });

  it("captures nothing when consent was declined", async () => {
    window.localStorage.setItem(CONSENT_KEY, "denied");
    await mountAt("/?utm_source=test");
    expect(window.localStorage.getItem(FIRST_TOUCH_STORAGE_KEY)).toBeNull();
  });
});

describe("consent granted", () => {
  it("captures first- and last-touch on landing with campaign params", async () => {
    window.localStorage.setItem(CONSENT_KEY, "granted");
    await mountAt("/?utm_source=test&utm_medium=test&utm_campaign=test");
    expect(JSON.parse(window.localStorage.getItem(FIRST_TOUCH_STORAGE_KEY)!)).toMatchObject({
      utmSource: "test",
      utmMedium: "test",
      utmCampaign: "test",
    });
    expect(JSON.parse(window.localStorage.getItem(LAST_TOUCH_STORAGE_KEY)!)).toMatchObject({ utmSource: "test" });
  });

  it("runs on the private app surface too without writing anything there is nothing eligible for", async () => {
    window.localStorage.setItem(CONSENT_KEY, "granted");
    await mountAt("/dashboard?utm_source=should-not-capture");
    expect(window.localStorage.getItem(FIRST_TOUCH_STORAGE_KEY)).toBeNull();
  });
});

describe("retroactive capture", () => {
  it("captures the current landing page the moment consent is granted, without a fresh navigation", async () => {
    await mountAt("/?utm_source=retro&utm_campaign=mid-visit");
    expect(window.localStorage.getItem(FIRST_TOUCH_STORAGE_KEY)).toBeNull();

    // Visitor accepts analytics while still on this same page/path — the already-mounted component
    // is subscribed to the "storage" event (useSyncExternalStore), so this alone must trigger capture.
    await act(async () => {
      window.localStorage.setItem(CONSENT_KEY, "granted");
      window.dispatchEvent(new Event("storage"));
    });

    expect(JSON.parse(window.localStorage.getItem(FIRST_TOUCH_STORAGE_KEY)!)).toMatchObject({
      utmSource: "retro",
      utmCampaign: "mid-visit",
    });
  });
});

describe("withdrawal", () => {
  it("clears stored attribution when consent moves to denied", async () => {
    window.localStorage.setItem(CONSENT_KEY, "granted");
    await mountAt("/?utm_source=test");
    expect(window.localStorage.getItem(FIRST_TOUCH_STORAGE_KEY)).not.toBeNull();

    await act(async () => {
      window.localStorage.setItem(CONSENT_KEY, "denied");
      window.dispatchEvent(new Event("storage"));
    });

    expect(window.localStorage.getItem(FIRST_TOUCH_STORAGE_KEY)).toBeNull();
  });
});
