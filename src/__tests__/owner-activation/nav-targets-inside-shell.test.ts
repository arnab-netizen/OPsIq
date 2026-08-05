/**
 * Structural guard: every navigation target must render inside the app shell.
 *
 * Regression this closes: "Decisions" was added to the sidebar pointing at /dashboard/inbox, which at
 * the time lived at src/app/dashboard/inbox — OUTSIDE the (authenticated) route group. That route
 * therefore rendered with no layout guard and no sidebar, so clicking the nav item dropped the owner
 * onto a page with no way back. String-searching the nav cannot catch this; only resolving each href
 * to the file that serves it can.
 */
import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { readFileSync } from "node:fs";

const SRC = join(process.cwd(), "src");
const APP = join(SRC, "app");

/** Every href declared in the sidebar, read from source so the test cannot drift from the nav. */
function navHrefs(): string[] {
  const nav = readFileSync(join(SRC, "ui/shell/sidebar-nav.tsx"), "utf8");
  return [...nav.matchAll(/href: "([^"]+)"/g)].map((m) => m[1]);
}

/** Does a page file exist for this URL path inside the (authenticated) route group? */
function resolvesInsideAuthenticatedGroup(urlPath: string): boolean {
  const segments = urlPath.replace(/^\//, "");
  return existsSync(join(APP, "(authenticated)", segments, "page.tsx"));
}

/** Does a page file exist for this URL path anywhere in the app directory? */
function resolvesAnywhere(urlPath: string): boolean {
  const segments = urlPath.replace(/^\//, "");
  return (
    existsSync(join(APP, segments, "page.tsx")) || resolvesInsideAuthenticatedGroup(urlPath)
  );
}

describe("navigation targets", () => {
  const hrefs = navHrefs();

  it("reads a realistic number of hrefs from the sidebar source", () => {
    expect(hrefs.length).toBeGreaterThan(15);
  });

  it("every nav href resolves to a real page — no dead links", () => {
    const dead = hrefs.filter((h) => !resolvesAnywhere(h));
    expect(dead).toEqual([]);
  });

  it("every nav href renders inside the (authenticated) shell", () => {
    // A nav item that renders outside the shell has no sidebar, so the owner cannot navigate onward.
    const outside = hrefs.filter((h) => !resolvesInsideAuthenticatedGroup(h));
    expect(outside).toEqual([]);
  });

  it("the decision inbox specifically is inside the shell and guarded", () => {
    expect(resolvesInsideAuthenticatedGroup("/dashboard/inbox")).toBe(true);
    expect(existsSync(join(APP, "dashboard/inbox/page.tsx"))).toBe(false);
  });

  it("the data hub is inside the shell", () => {
    expect(resolvesInsideAuthenticatedGroup("/owner/data")).toBe(true);
  });

  it("the authenticated layout still redirects unauthenticated users to /login", () => {
    const layout = readFileSync(join(APP, "(authenticated)/layout.tsx"), "utf8");
    expect(layout).toMatch(/redirect\("\/login"\)/);
  });
});

describe("data hub reaches the intake surfaces in one click", () => {
  it("links directly to manual entry and to the governed upload path", () => {
    const hub = readFileSync(join(APP, "(authenticated)/owner/data/page.tsx"), "utf8");
    expect(hub).toContain('href: "/owner/manual-entry"');
    expect(hub).toContain('href: "/owner/intake"');
  });

  it("both intake destinations exist as real pages", () => {
    expect(resolvesInsideAuthenticatedGroup("/owner/manual-entry")).toBe(true);
    expect(resolvesInsideAuthenticatedGroup("/owner/intake")).toBe(true);
  });
});
