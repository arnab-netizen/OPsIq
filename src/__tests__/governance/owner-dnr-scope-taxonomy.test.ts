/**
 * Governance: ONE do-not-repeat scope taxonomy (src/domain/owner-mode/do-not-repeat-scope.ts).
 *
 *   - No source file writes the `scope:` prefix by hand: every producer and reader builds keys through the
 *     helper (the "scope:cash" vs "scope:cashflow" divergence came from two hand-built spellings).
 *   - The owner domains the action gate checks are exactly the helper's scope domains.
 *   - A broad area rule never holds back protective work; an exact memory applies to any intent.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";
import {
  canonicalOwnerScopeDomain,
  consultingScopeKey,
  OWNER_DNR_SCOPE_DOMAINS,
  ownerDoNotRepeatApplies,
  ownerScopeKey,
  ownerScopeLookupKeys,
  parseOwnerDnrKey,
} from "@/domain/owner-mode/do-not-repeat-scope";
import { OWNER_TARGET_INTENTS } from "@/domain/owner-spine/owner-imperatives";

const ROOT = process.cwd();
const HELPER = "src/domain/owner-mode/do-not-repeat-scope.ts";
/** `scope:` literals that are not do-not-repeat keys. */
const NOT_DNR = new Set(["src/domain/constants/capabilities.ts"]);

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (name === "__tests__" || name === "generated" || name === "node_modules") continue;
    if (statSync(p).isDirectory()) out.push(...sourceFiles(p));
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}
const rel = (f: string) => relative(ROOT, f).replace(/\\/g, "/");
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, " ")).replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");

describe("one do-not-repeat scope taxonomy", () => {
  it("no producer or reader builds a `scope:` key by hand", () => {
    const offenders = sourceFiles(join(ROOT, "src"))
      .filter((f) => rel(f) !== HELPER && !NOT_DNR.has(rel(f)))
      .filter((f) => /["'`]scope:/.test(stripComments(readFileSync(f, "utf8"))))
      .map(rel);
    expect(offenders).toEqual([]);
  });

  it("cash and cashflow are one owner scope (canonical key scope:cashflow; the legacy spelling still matches)", () => {
    expect(ownerScopeKey("cash")).toBe("scope:cashflow");
    expect(ownerScopeKey("Cashflow")).toBe("scope:cashflow");
    expect(ownerScopeLookupKeys("cash")).toEqual(ownerScopeLookupKeys("cashflow"));
    expect(ownerScopeLookupKeys("cashflow")).toEqual(expect.arrayContaining(["scope:cashflow", "scope:cash"]));
    expect(parseOwnerDnrKey("scope:cash")).toEqual({ domain: "cashflow", match: "broad", findingId: null });
    expect(parseOwnerDnrKey("scope:cashflow:finding:f1")).toEqual({ domain: "cashflow", match: "exact", findingId: "f1" });
    expect(parseOwnerDnrKey("scope:growth")).toBeNull();
  });

  it("the owner domains the action gate is called with are exactly the scope domains", () => {
    const domains = new Set<string>();
    for (const f of sourceFiles(join(ROOT, "src"))) {
      const src = stripComments(readFileSync(f, "utf8"));
      for (const m of src.matchAll(/enforceOwnerActionGates\s*\(\s*\{[\s\S]*?\bdomain\s*:\s*"([a-z]+)"/g)) domains.add(m[1]);
    }
    expect([...domains].sort()).toEqual([...OWNER_DNR_SCOPE_DOMAINS].sort());
    for (const d of domains) expect(canonicalOwnerScopeDomain(d)).toBe(d);
  });

  it("Formal Consulting Mode keeps its exact recorded keys (no aliasing)", () => {
    expect(consultingScopeKey("Cash")).toBe("scope:cash");
    expect(consultingScopeKey("operations")).toBe("scope:operations");
    expect(consultingScopeKey("  ")).toBeNull();
  });

  it("a broad area rule holds back only GROW (or an unknown intent); an exact memory holds back any intent", () => {
    for (const intent of OWNER_TARGET_INTENTS) {
      expect(ownerDoNotRepeatApplies("broad", intent), intent).toBe(intent === "GROW");
      expect(ownerDoNotRepeatApplies("exact", intent), intent).toBe(true);
    }
    expect(ownerDoNotRepeatApplies("broad", null)).toBe(true);
  });

  it("Now View reads the main target's own domain scope, never a class-derived area", () => {
    const src = readFileSync(join(ROOT, "src/services/owner-guidance/owner-now-view.service.ts"), "utf8");
    expect(src).not.toMatch(/IMPACT_AREA_BY_OWNER_CLASS/);
    expect(src).toMatch(/checkDoNotRepeatForGuidance\([^)]*topActionIntent\)/);
  });
});
