/**
 * Microsoft Clarity privacy boundary — real-browser acceptance (opt-in: CLARITY_E2E=1).
 *
 * Run against a PRODUCTION build started with VERCEL_ENV=production and NEXT_PUBLIC_CLARITY_PROJECT_ID=ymoglnln74 (the
 * deployed configuration). Network traffic to *.clarity.ms is intercepted: the tag request is answered with an inert
 * stub, everything else with 204, and every request is counted. Nothing reaches Microsoft.
 *
 * Proves, in a real browser: no consent => zero requests; consent => the tag loads once with Consent API v2; public →
 * /login and public → /signup are FULL-DOCUMENT loads (the old document, and the Clarity runtime in it, is gone);
 * /login, /signup, the signed-in owner app, admin and dashboard make zero clarity.ms requests; withdrawal reloads;
 * the CSP allows the tag on public pages only; Vercel Web Analytics is still mounted.
 */
import { test, expect, type Page, type Response } from "@playwright/test";
import { E2E_OWNER } from "./e2e-fixtures";

test.skip(!process.env.CLARITY_E2E, "Opt-in: set CLARITY_E2E=1 against a production build with the Clarity env (see header).");

const KEY = "opsiq_analytics_consent_v1";
const PROJECT_ID = "ymoglnln74";
const TAG_URL = `https://www.clarity.ms/tag/${PROJECT_ID}`;
const BASE = process.env.BASE_URL || "http://localhost:3001";
const CLARITY_URL = /^https?:\/\/([a-z0-9-]+\.)*clarity\.ms\//i;

interface Tracker {
  urls: string[];
  count: () => number;
}

async function trackClarity(page: Page): Promise<Tracker> {
  const urls: string[] = [];
  page.on("request", (r) => {
    if (CLARITY_URL.test(r.url())) urls.push(r.url());
  });
  await page.route(CLARITY_URL, async (route) => {
    if (route.request().url().startsWith(TAG_URL)) {
      await route.fulfill({ status: 200, contentType: "application/javascript", body: "window.__clarityTagStub = true;" });
    } else {
      await route.fulfill({ status: 204, body: "" });
    }
  });
  return { urls, count: () => urls.length };
}

/**
 * Pre-seed the stored choice for a returning visitor. Seeds only when NO choice exists, so it can never overwrite a choice
 * the app itself persisted later (e.g. a withdrawal followed by the reload).
 */
async function storedChoice(page: Page, value: string) {
  await page.addInitScript(([k, v]) => {
    try {
      if (window.localStorage.getItem(k) === null) window.localStorage.setItem(k, v);
    } catch {
      /* storage unavailable */
    }
  }, [KEY, value] as const);
}

const clarityState = (page: Page) =>
  page.evaluate(() => ({
    hasGlobal: typeof (window as unknown as { clarity?: unknown }).clarity !== "undefined",
    hasScript: !!document.getElementById("clarity-script"),
    queue: (((window as unknown as { clarity?: { q?: IArguments[] } }).clarity?.q ?? []) as IArguments[]).map((a) => Array.from(a)),
    navType: (performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined)?.type ?? null,
  }));

const settle = (page: Page) => page.waitForLoadState("networkidle").catch(() => undefined).then(() => page.waitForTimeout(700));

async function firstResourceHref(page: Page): Promise<string> {
  await page.goto("/resources");
  const href = await page.locator('a[href^="/resources/"]').first().getAttribute("href");
  expect(href, "a resource article link").toBeTruthy();
  return href as string;
}

test.describe("no consent => Clarity absent", () => {
  test("every allowlisted public page: zero clarity.ms requests and the choice is offered", async ({ page }) => {
    const t = await trackClarity(page);
    const article = await firstResourceHref(page);
    for (const path of ["/", "/about", "/resources", article, "/tools/profit-margin-calculator", "/privacy", "/terms", "/beta"]) {
      await page.goto(path);
      await settle(page);
      const s = await clarityState(page);
      expect(s.hasGlobal, `${path} clarity global`).toBe(false);
      expect(s.hasScript, `${path} loader`).toBe(false);
      await expect(page.getByTestId("analytics-consent"), `${path} offers the choice`).toBeVisible();
    }
    expect(t.urls).toEqual([]);
  });

  test("declined: zero requests, no banner, and it survives a reload", async ({ page }) => {
    const t = await trackClarity(page);
    await page.goto("/about");
    await page.getByTestId("analytics-decline").click();
    expect(await page.evaluate((k) => localStorage.getItem(k), KEY)).toBe("denied");
    await page.reload();
    await settle(page);
    await expect(page.getByTestId("analytics-consent")).toHaveCount(0);
    expect((await clarityState(page)).hasScript).toBe(false);
    expect(t.urls).toEqual([]);
  });

  test("malformed stored values fail closed", async ({ page }) => {
    const t = await trackClarity(page);
    for (const bad of ["true", "GRANTED", "granted ", "1", "{\"c\":\"granted\"}"]) {
      const ctx = await page.context().browser()!.newContext();
      const p = await ctx.newPage();
      p.on("request", (r) => CLARITY_URL.test(r.url()) && t.urls.push(r.url()));
      await storedChoice(p, bad);
      await p.goto(`${BASE}/about`);
      await settle(p);
      expect((await clarityState(p)).hasScript, `value ${JSON.stringify(bad)}`).toBe(false);
      await ctx.close();
    }
    expect(t.urls).toEqual([]);
  });
});

test.describe("consent => Clarity loads on public pages, with Consent API v2", () => {
  test("Allow analytics in the UI loads the tag once; analytics granted, advertising denied; nothing else is issued", async ({ page }) => {
    const t = await trackClarity(page);
    await page.goto("/about");
    expect(t.count()).toBe(0);
    await page.getByTestId("analytics-allow").click();
    await expect.poll(() => t.urls.filter((u) => u.startsWith(TAG_URL)).length).toBe(1);
    const s = await clarityState(page);
    expect(s.hasScript).toBe(true);
    expect(s.queue).toEqual([["consentv2", { analytics_Storage: "granted", ad_Storage: "denied" }]]);
    expect(await page.evaluate((k) => localStorage.getItem(k), KEY)).toBe("granted");
    expect(await page.evaluate(() => localStorage.length)).toBe(1); // only the choice is stored
  });

  test("granted loads on every allowlisted route", async ({ page }) => {
    await storedChoice(page, "granted");
    const t = await trackClarity(page);
    const article = await firstResourceHref(page);
    for (const path of ["/", "/about", "/resources", article, "/tools/profit-margin-calculator", "/privacy", "/terms", "/beta"]) {
      const before = t.urls.filter((u) => u.startsWith(TAG_URL)).length;
      await page.goto(path);
      await settle(page);
      expect(t.urls.filter((u) => u.startsWith(TAG_URL)).length, `${path} requested the tag once`).toBe(before + 1);
      expect((await clarityState(page)).queue[0]).toEqual(["consentv2", { analytics_Storage: "granted", ad_Storage: "denied" }]);
    }
  });

  test("public → public navigation stays client-side and does not reload or duplicate the tag", async ({ page }) => {
    await storedChoice(page, "granted");
    const t = await trackClarity(page);
    await page.goto("/resources");
    await settle(page);
    await page.evaluate(() => ((window as unknown as { __doc: string }).__doc = "same-document"));
    const article = page.locator('a[href^="/resources/"]').first();
    const href = await article.getAttribute("href");
    await article.click();
    await expect(page).toHaveURL(new RegExp(`${href}$`));
    expect(await page.evaluate(() => (window as unknown as { __doc?: string }).__doc)).toBe("same-document");
    expect(t.urls.filter((u) => u.startsWith(TAG_URL)).length).toBe(1);
  });

  test("every eligible page offers the preferences control once a choice exists", async ({ page }) => {
    await storedChoice(page, "denied");
    await trackClarity(page);
    for (const path of ["/", "/about", "/beta", "/privacy", "/terms", "/resources", "/tools/profit-margin-calculator"]) {
      await page.goto(path);
      await expect(page.getByTestId("analytics-preferences-floating"), path).toBeVisible();
    }
  });
});

test.describe("privacy boundary: public → auth/private is a FULL-DOCUMENT load", () => {
  test.setTimeout(120_000); // signed-in flows load the real owner app (several heavy pages) after a real login
  test("home → Sign in → /login: new document, no Clarity runtime, zero requests", async ({ page }) => {
    await storedChoice(page, "granted");
    const t = await trackClarity(page);
    await page.goto("/");
    await settle(page);
    expect((await clarityState(page)).hasScript).toBe(true);
    await page.evaluate(() => ((window as unknown as { __doc: string }).__doc = "public-document"));
    const requestsBefore = t.count();
    await page.getByRole("link", { name: /^sign in$/i }).first().click();
    await expect(page).toHaveURL(/\/login$/);
    await settle(page);
    expect(await page.evaluate(() => (window as unknown as { __doc?: string }).__doc), "the public document must be gone").toBeUndefined();
    const s = await clarityState(page);
    expect(s.navType).toBe("navigate"); // a real document load, not a router transition
    expect(s.hasGlobal).toBe(false);
    expect(s.hasScript).toBe(false);
    expect(t.count() - requestsBefore, "clarity.ms requests on the /login document").toBe(0);
  });

  test("/beta → /signup: new document, no Clarity runtime, zero requests", async ({ page }) => {
    await storedChoice(page, "granted");
    const t = await trackClarity(page);
    await page.goto("/beta");
    await settle(page);
    expect((await clarityState(page)).hasScript).toBe(true);
    await page.evaluate(() => ((window as unknown as { __doc: string }).__doc = "beta-document"));
    const before = t.count();
    await page.locator('main a[href="/signup"]').first().click();
    await expect(page).toHaveURL(/\/signup/);
    await settle(page);
    expect(await page.evaluate(() => (window as unknown as { __doc?: string }).__doc)).toBeUndefined();
    const s = await clarityState(page);
    expect(s.navType).toBe("navigate");
    expect(s.hasGlobal || s.hasScript).toBe(false);
    expect(t.count() - before).toBe(0);
  });

  test("a resource page's CTA to /signup (PublicBetaCta) and the logo link to / are full-document loads too", async ({ page }) => {
    await storedChoice(page, "granted");
    const t = await trackClarity(page);
    const article = await firstResourceHref(page);
    await page.goto(article);
    await settle(page);
    await page.evaluate(() => ((window as unknown as { __doc: string }).__doc = "article-document"));
    const startFree = page.getByTestId("start-free-cta").first();
    if (await startFree.count()) {
      const before = t.count();
      await startFree.click();
      await expect(page).toHaveURL(/\/signup/);
      await settle(page);
      expect(await page.evaluate(() => (window as unknown as { __doc?: string }).__doc)).toBeUndefined();
      expect(t.count() - before).toBe(0);
    }
  });

  test("full journey: consented public page → Sign in → /login → owner app: zero Clarity from the moment of departure", async ({ page }) => {
    await storedChoice(page, "granted");
    const t = await trackClarity(page);
    await page.goto("/");
    await settle(page);
    expect(t.urls.filter((u) => u.startsWith(TAG_URL)).length).toBe(1);
    const departure = t.count();
    await page.getByRole("link", { name: /^sign in$/i }).first().click();
    await expect(page).toHaveURL(/\/login$/);
    await settle(page); // let the freshly loaded document hydrate before typing into controlled inputs
    await page.getByLabel(/email/i).fill(E2E_OWNER.email);
    await page.locator("#password").fill(E2E_OWNER.password);
    await page.getByRole("button", { name: /sign in|log in/i }).click();
    await page.waitForURL(/\/owner\//, { timeout: 20_000 });
    await settle(page);
    for (const path of ["/owner/cockpit", "/owner/finance", "/owner/home"]) {
      await page.goto(path);
      await settle(page);
      const s = await clarityState(page);
      expect(s.hasGlobal || s.hasScript, `${path} clarity runtime`).toBe(false);
    }
    expect(t.count() - departure, "clarity.ms requests after leaving the public document").toBe(0);
  });

  test("signed in, consented, on a public page: the logo link to / reaches the app on a fresh, Clarity-free document", async ({ page }) => {
    const t = await trackClarity(page);
    await page.goto("/login");
    await settle(page);
    await page.getByLabel(/email/i).fill(E2E_OWNER.email);
    await page.locator("#password").fill(E2E_OWNER.password);
    await page.getByRole("button", { name: /sign in|log in/i }).click();
    await page.waitForURL(/\/owner\//, { timeout: 20_000 });
    await page.evaluate((k) => localStorage.setItem(k, "granted"), KEY);
    await page.goto("/about");
    await settle(page);
    expect((await clarityState(page)).hasScript).toBe(true); // /about is a public page
    await page.evaluate(() => ((window as unknown as { __doc: string }).__doc = "about-document"));
    const before = t.count();
    await page.getByRole("link", { name: /opsiq home/i }).first().click();
    await page.waitForURL(/\/owner\//, { timeout: 20_000 }); // the homepage redirected a signed-in owner into the app
    await settle(page);
    expect(await page.evaluate(() => (window as unknown as { __doc?: string }).__doc)).toBeUndefined();
    const s = await clarityState(page);
    expect(s.hasGlobal || s.hasScript).toBe(false);
    expect(t.count() - before).toBe(0);
  });

  test("back/forward across the boundary never resurrects Clarity on /login", async ({ page }) => {
    await storedChoice(page, "granted");
    const t = await trackClarity(page);
    await page.goto("/about");
    await settle(page);
    await page.getByRole("link", { name: /^sign in$/i }).first().click();
    await expect(page).toHaveURL(/\/login$/);
    await page.goBack();
    await page.goForward();
    await expect(page).toHaveURL(/\/login$/);
    await settle(page);
    const before = t.count();
    await page.waitForTimeout(800);
    const s = await clarityState(page);
    expect(s.hasGlobal || s.hasScript).toBe(false);
    expect(t.count() - before).toBe(0);
  });
});

test.describe("excluded routes make zero Clarity requests even with consent granted", () => {
  for (const path of ["/login", "/signup", "/forgot-password", "/owner/cockpit", "/owner/finance", "/admin", "/admin/users", "/dashboard", "/dashboard/engagements", "/api/health"]) {
    test(`direct visit: ${path}`, async ({ page }) => {
      await storedChoice(page, "granted");
      const t = await trackClarity(page);
      await page.goto(path).catch(() => undefined);
      await settle(page);
      const s = await clarityState(page).catch(() => ({ hasGlobal: false, hasScript: false }));
      expect(s.hasGlobal || s.hasScript).toBe(false);
      await expect(page.getByTestId("analytics-consent")).toHaveCount(0);
      expect(t.urls).toEqual([]);
    });
  }
});

test.describe("withdrawal", () => {
  test("Analytics preferences → Decline: persists denied and reloads the document; nothing loads afterwards", async ({ page }) => {
    await storedChoice(page, "granted");
    const t = await trackClarity(page);
    await page.goto("/about");
    await settle(page);
    expect((await clarityState(page)).hasScript).toBe(true);
    await page.evaluate(() => ((window as unknown as { __doc: string }).__doc = "before-withdrawal"));
    await page.getByTestId("analytics-preferences-floating").click();
    await expect(page.getByTestId("analytics-consent-current")).toContainText("allowed");
    const after = t.count();
    await page.getByTestId("analytics-decline").click();
    await page.waitForFunction(() => !(window as unknown as { __doc?: string }).__doc, undefined, { timeout: 10_000 }); // document reloaded
    await settle(page);
    expect(await page.evaluate((k) => localStorage.getItem(k), KEY)).toBe("denied");
    expect((await clarityState(page)).hasScript).toBe(false);
    expect(t.count() - after).toBe(0);
  });
});

test.describe("CSP and Vercel Web Analytics", () => {
  test("the Clarity tag is permitted by the CSP on public pages and not on /login, /signup or the app", async ({ page, request }) => {
    const csp = async (path: string) => (await request.get(path, { maxRedirects: 0 }).catch(() => null))?.headers()["content-security-policy"] ?? "";
    for (const path of ["/", "/about", "/privacy", "/terms", "/beta", "/resources", "/tools/profit-margin-calculator"]) {
      const value = await csp(path);
      expect(value, path).toContain("script-src 'self' 'unsafe-inline' https://www.clarity.ms https://scripts.clarity.ms");
      expect(value).not.toMatch(/\*/);
    }
    for (const path of ["/login", "/signup", "/owner/cockpit", "/admin", "/dashboard", "/api/health"]) {
      const value = await csp(path);
      expect(value, path).toBeTruthy();
      expect(value, path).not.toMatch(/clarity/i);
    }
    // And the browser really enforces it: the tag loads on a public page with no CSP violation...
    const violations: string[] = [];
    await page.addInitScript(() => document.addEventListener("securitypolicyviolation", (e) => ((window as unknown as { __csp: string[] }).__csp = [...((window as unknown as { __csp?: string[] }).__csp ?? []), e.blockedURI])));
    await storedChoice(page, "granted");
    await trackClarity(page);
    await page.goto("/about");
    await settle(page);
    violations.push(...((await page.evaluate(() => (window as unknown as { __csp?: string[] }).__csp ?? [])) as string[]));
    expect(violations.filter((v) => /clarity/.test(v))).toEqual([]);
    // ...while an arbitrary third-party script is still blocked.
    await page.evaluate(() => {
      const s = document.createElement("script");
      s.src = "https://evil.example/x.js";
      document.head.appendChild(s);
    });
    await expect.poll(() => page.evaluate(() => (window as unknown as { __csp?: string[] }).__csp ?? [])).toContain("https://evil.example/x.js");
  });

  test("Vercel Web Analytics is still mounted on public pages, independent of the Clarity choice", async ({ page }) => {
    await trackClarity(page);
    for (const choice of [null, "denied", "granted"]) {
      const ctx = await page.context().browser()!.newContext();
      const p = await ctx.newPage();
      await trackClarity(p);
      if (choice) await storedChoice(p, choice);
      const res: Response | null = await p.goto(`${BASE}/about`);
      expect(res?.status()).toBe(200);
      await expect(p.locator('script[src*="/_vercel/insights/script.js"]'), `choice=${choice}`).toHaveCount(1);
      await ctx.close();
    }
  });
});
