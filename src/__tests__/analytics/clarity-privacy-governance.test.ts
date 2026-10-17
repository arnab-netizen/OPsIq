/**
 * Static privacy-boundary scans over the real source tree (no server). These fail the build if someone later:
 *  - links from a public page to a private/auth route with a client-side <Link>, or navigates programmatically there;
 *  - adds the Clarity Identify API, custom tags/events, an unmask attribute, or a stop() dependency;
 *  - references clarity.ms from anywhere but the sanctioned files;
 *  - mounts the Clarity component outside the root layout, or touches the Vercel Web Analytics wiring.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";
import { isDocumentNavigationRequired, SERVER_REDIRECTING_PUBLIC_PATHS } from "@/lib/analytics/clarity-policy";

const ROOT = process.cwd();
const rel = (p: string) => relative(ROOT, p).replace(/\\/g, "/");

function walk(dir: string, accept: (p: string) => boolean, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next" || name === "generated") continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, accept, out);
    else if (accept(p)) out.push(p);
  }
  return out;
}

const SRC_FILES = walk(join(ROOT, "src"), (p) => /\.(ts|tsx)$/.test(p) && !/__tests__|\.test\.tsx?$/.test(p));
const read = (p: string) => readFileSync(p, "utf8");
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, " ")).replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");

// Everything a logged-out visitor on a Clarity-eligible page can see or click.
const PUBLIC_SURFACE = [
  "src/app/page.tsx",
  "src/app/about",
  "src/app/beta",
  "src/app/resources",
  "src/app/tools",
  "src/app/privacy",
  "src/app/terms",
  "src/components/landing",
  "src/components/resources",
  "src/components/tools",
].flatMap((entry) => {
  const abs = join(ROOT, entry);
  return statSync(abs).isDirectory() ? walk(abs, (p) => /\.(ts|tsx)$/.test(p) && !/\.test\.tsx?$/.test(p)) : [abs];
});

describe("public surface: no client-side navigation into private/auth routes", () => {
  it("scans real files", () => {
    const names = PUBLIC_SURFACE.map(rel);
    expect(names).toContain("src/components/landing/PublicSiteHeader.tsx");
    expect(names).toContain("src/app/beta/page.tsx");
    expect(names).toContain("src/components/landing/PublicBetaCta.tsx");
  });

  it("no next/link <Link href> literal needs a full-document navigation (use PublicLink / a plain anchor)", () => {
    const offenders: string[] = [];
    for (const f of PUBLIC_SURFACE) {
      const src = strip(read(f));
      for (const m of src.matchAll(/<Link\b[^>]*?\bhref\s*=\s*(?:"([^"]+)"|'([^']+)'|\{\s*["'`]([^"'`]+)["'`]\s*\})/gs)) {
        const href = m[1] ?? m[2] ?? m[3];
        if (href.startsWith("/") && isDocumentNavigationRequired(href)) offenders.push(`${rel(f)}: <Link href="${href}">`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("every PublicLink / anchor literal into a non-eligible route is a full-document navigation by construction", () => {
    for (const href of ["/login", "/signup"]) expect(isDocumentNavigationRequired(href)).toBe(true);
  });

  it("the known auth entry points use PublicLink", () => {
    expect(read(join(ROOT, "src/components/landing/PublicSiteHeader.tsx"))).toMatch(/<PublicLink href="\/login"/);
    expect(read(join(ROOT, "src/components/landing/PublicBetaCta.tsx"))).toMatch(/<PublicLink\s+href="\/signup"/);
    const landing = read(join(ROOT, "src/components/landing/LandingPage.tsx"));
    expect((landing.match(/<PublicLink href="\/login"/g) ?? []).length).toBe(2);
    const beta = read(join(ROOT, "src/app/beta/page.tsx"));
    expect((beta.match(/<PublicLink href="\/signup"/g) ?? []).length).toBe(2);
  });

  it("markdown-rendered resource links go through PublicLink", () => {
    expect(read(join(ROOT, "src/components/resources/ResourceBody.tsx"))).toMatch(/<PublicLink key=\{key\}/);
  });

  it("no programmatic navigation (router/location) from the public surface; the only server redirect is the homepage's", () => {
    const offenders: string[] = [];
    const redirecting: string[] = [];
    for (const f of PUBLIC_SURFACE) {
      const src = strip(read(f));
      if (/\buseRouter\b|\brouter\.(push|replace)\b|window\.location\.(href|assign|replace)\s*=|location\.(assign|replace)\(/.test(src)) offenders.push(rel(f));
      if (/\bredirect\s*\(|\bpermanentRedirect\s*\(/.test(src)) redirecting.push(rel(f));
    }
    expect(offenders).toEqual([]);
    // src/app/page.tsx redirects a SIGNED-IN visitor to /owner/* or /dashboard. That is safe only because every link to "/"
    // is a full-document navigation (SERVER_REDIRECTING_PUBLIC_PATHS); any new redirecting page must be declared there.
    expect(redirecting).toEqual(["src/app/page.tsx"]);
    expect([...SERVER_REDIRECTING_PUBLIC_PATHS]).toEqual(["/"]);
    expect(isDocumentNavigationRequired("/")).toBe(true);
  });

  it("no content (markdown) file links to a private or auth route", () => {
    const contentDir = join(ROOT, "content");
    const bad: string[] = [];
    for (const f of walk(contentDir, (p) => /\.(md|mdx|json|ts|tsx)$/.test(p))) {
      for (const m of read(f).matchAll(/\]\((\/[^)\s]*)\)|href=["'](\/[^"']*)["']/g)) {
        const href = m[1] ?? m[2];
        if (isDocumentNavigationRequired(href)) bad.push(`${rel(f)}: ${href}`);
      }
    }
    expect(bad).toEqual([]);
  });
});

describe("Clarity usage is minimal and fixed", () => {
  const all = SRC_FILES.map((f) => ({ f: rel(f), s: strip(read(f)) }));

  it("never calls the Identify API or any custom tag/event/upgrade command", () => {
    const hits = all.filter(({ s }) => /clarity\s*\(\s*["'`](identify|set|event|upgrade|consent)["'`]/.test(s) || /Clarity\.(identify|setTag|event|upgrade)\b/.test(s)).map((x) => x.f);
    expect(hits).toEqual([]);
  });

  it("never adds data-clarity-unmask (or any data-clarity-* override) anywhere in src, content or public", () => {
    const files = [...SRC_FILES, ...walk(join(ROOT, "content"), () => true), ...walk(join(ROOT, "public"), (p) => /\.(html|svg|js)$/.test(p))];
    const hits = files.filter((f) => /data-clarity-(unmask|mask|region)/i.test(read(f))).map(rel);
    expect(hits).toEqual([]);
  });

  it("does not depend on an undocumented stop API", () => {
    const hits = all.filter(({ s }) => /clarity\s*\(\s*["'`](stop|pause|shutdown|disable|unload)["'`]/.test(s)).map((x) => x.f);
    expect(hits).toEqual([]);
  });

  it("the only commands ever issued to Clarity are the consent signal", () => {
    const issuing = all.filter(({ s }) => /\bw\.clarity\s*\(/.test(s) || /\bclarity\s*\(\s*["'`]/.test(s));
    expect(issuing.map((x) => x.f)).toEqual(["src/components/analytics/ClarityConsent.tsx"]);
    const comp = read(join(ROOT, "src/components/analytics/ClarityConsent.tsx"));
    expect((comp.match(/w\.clarity\s*\(\s*"([a-z0-9]+)"/gi) ?? []).map((x) => x.replace(/.*"([a-z0-9]+)"/i, "$1"))).toEqual(["consentv2"]);
  });

  it("clarity.ms is referenced only from the policy module (and next.config for the CSP)", () => {
    const hits = all.filter(({ s }) => /clarity\.ms/i.test(s)).map((x) => x.f);
    expect(hits).toEqual(["src/lib/analytics/clarity-policy.ts"]);
    expect(read(join(ROOT, "next.config.ts"))).toContain("https://scripts.clarity.ms");
  });

  it("the Clarity component is mounted only by the root layout, never by an authenticated or private layout/page", () => {
    const users = all.filter(({ s }) => /from\s+["']@\/components\/analytics\/ClarityConsent["']/.test(s)).map((x) => x.f);
    expect(users).toEqual(["src/app/layout.tsx", "src/components/analytics/AnalyticsPreferencesButton.tsx"]);
    // the preferences button only imports the event name; it is rendered solely by /privacy; every eligible page gets the floating control from ClarityConsent
    const renderers = all.filter(({ s }) => /<AnalyticsPreferencesButton\b/.test(s)).map((x) => x.f);
    expect(renderers).toEqual(["src/app/privacy/page.tsx"]);
  });

  it("nothing in the authenticated or private app trees references Clarity at all", () => {
    const privateTrees = ["src/app/(authenticated)", "src/app/api", "src/app/login", "src/app/signup", "src/app/dashboard", "src/app/operator"];
    const hits: string[] = [];
    for (const t of privateTrees) {
      for (const f of walk(join(ROOT, t), (p) => /\.(ts|tsx)$/.test(p) && !/\.test\./.test(p))) if (/clarity/i.test(strip(read(f)).replace(/clarity/gi, (m, i, str) => (/\b(clarity|Clarity)\b/.test(str.slice(Math.max(0, i - 1), i + 8)) ? m : ""))) && /ClarityConsent|clarity\.ms|clarity-policy|window\.clarity/i.test(read(f))) hits.push(rel(f));
    }
    expect(hits).toEqual([]);
  });
});

describe("Vercel Web Analytics is untouched", () => {
  const layout = read(join(ROOT, "src/app/layout.tsx"));
  it("the root layout still mounts PublicPageAnalytics behind shouldMountPageAnalytics", () => {
    expect(layout).toContain('import { PublicPageAnalytics } from "@/components/analytics/PublicPageAnalytics"');
    expect(layout).toMatch(/\{shouldMountPageAnalytics\(\) && <PublicPageAnalytics \/>\}/);
  });
  it("the Vercel component and its allowlist do not reference Clarity or consent", () => {
    expect(read(join(ROOT, "src/components/analytics/PublicPageAnalytics.tsx"))).not.toMatch(/clarity|consent/i);
    expect(read(join(ROOT, "src/lib/analytics/public-page-analytics.ts"))).not.toMatch(/clarity|consent/i);
  });
  it("the Vercel analytics dependency is still in use and unchanged", () => {
    expect(read(join(ROOT, "src/components/analytics/PublicPageAnalytics.tsx"))).toContain('from "@vercel/analytics/next"');
  });
});
