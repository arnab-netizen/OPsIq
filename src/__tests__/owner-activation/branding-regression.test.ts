/**
 * Branding regression guard.
 *
 * Production rendered the legacy name "Rebilix" on the login screen, the document title, the
 * onboarding heading and the primary diagnosis call to action. This test fails the build if any
 * user-visible source file reintroduces it.
 *
 * Scope is deliberately the shipped application source. Test directories are excluded because a test
 * must be able to name the string it is asserting the absence of, and tests are not a user surface.
 * Historical audit documents under docs/ keep the old name on purpose — they are a record of what was
 * true at the time, not a user surface.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const SRC = join(process.cwd(), "src");
const LEGACY_BRAND = /Rebilix/;

/** Directories that are not shipped user surfaces. */
const EXCLUDED_DIRS = new Set(["__tests__", "tests", "generated"]);

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (EXCLUDED_DIRS.has(entry)) continue;
      walk(full, out);
    } else if (/\.(ts|tsx)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

describe("user-visible branding", () => {
  const files = walk(SRC);

  it("scans a meaningful number of source files", () => {
    expect(files.length).toBeGreaterThan(100);
  });

  it("contains no occurrence of the legacy product name anywhere in src/", () => {
    const offenders = files.filter((f) => LEGACY_BRAND.test(readFileSync(f, "utf8")));
    expect(offenders.map((f) => f.replace(process.cwd(), ""))).toEqual([]);
  });
});

describe("primary owner-facing surfaces name the product correctly", () => {
  const surfaces = [
    "app/layout.tsx",
    "app/login/page.tsx",
    "app/signup/page.tsx",
    "app/onboarding/page.tsx",
    "ui/shell/app-header.tsx",
    "components/dashboard/FirstDiagnosisCta.tsx",
  ];

  for (const surface of surfaces) {
    it(`${surface} says OpsIQ`, () => {
      const contents = readFileSync(join(SRC, surface), "utf8");
      expect(contents).toContain("OpsIQ");
      expect(contents).not.toMatch(LEGACY_BRAND);
    });
  }
});
