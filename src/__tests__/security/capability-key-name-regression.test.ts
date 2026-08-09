/**
 * Capability key-name regression test
 *
 * Prevents recurrence of the capability key-name bug where route files use
 * string literals like "DECISION_ACCEPT" (key name) instead of
 * CAPABILITIES.DECISION_ACCEPT ("decision:accept") in requireCapabilities arrays.
 *
 * hasCapability() does caps.includes(capability) against VALUE strings, so a
 * key name never matches — every request is rejected with 403 regardless of
 * the actor's actual permissions.
 */

import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";
import { CAPABILITIES } from "@/domain/constants/capabilities";

// Build the set of all uppercase key names from CAPABILITIES
const CAPABILITY_KEY_NAMES = new Set(Object.keys(CAPABILITIES));

// Also build a pattern that matches the bare string in requireCapabilities: ["KEY_NAME"]
const KEY_REGEX = new RegExp(`requireCapabilities\\s*:\\s*\\[([^\\]]*)\\]`, "g");
// Match both single-quoted and double-quoted string literals inside requireCapabilities
const LITERAL_REGEX = /['"]([^'"]+)['"]/g;

function walkDir(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      results.push(...walkDir(full));
    } else if (full.endsWith(".ts") && !full.endsWith(".test.ts")) {
      results.push(full);
    }
  }
  return results;
}

const API_ROUTE_DIR = join(process.cwd(), "src", "app", "api");

describe("Capability key-name regression — route files must use CAPABILITIES values not key names", () => {
  const files = walkDir(API_ROUTE_DIR);

  it("scans at least 10 route files (sanity check)", () => {
    expect(files.length).toBeGreaterThanOrEqual(10);
  });

  it("all CAPABILITIES keys are uppercase strings", () => {
    for (const key of CAPABILITY_KEY_NAMES) {
      expect(key).toMatch(/^[A-Z][A-Z_]+$/);
    }
  });

  it("all CAPABILITIES values are lowercase colon-separated strings", () => {
    for (const [key, value] of Object.entries(CAPABILITIES)) {
      expect(typeof value).toBe("string");
      expect(value).toMatch(/^[a-z][a-z_]+:[a-z_]+$/);
    }
  });

  describe("no route file uses capability KEY NAMES as string literals in requireCapabilities", () => {
    for (const filePath of files) {
      const relPath = filePath.replace(process.cwd() + "/", "");
      it(`${relPath} has no key-name literals in requireCapabilities`, () => {
        const content = readFileSync(filePath, "utf-8");
        const requireMatches = [...content.matchAll(KEY_REGEX)];
        for (const reqMatch of requireMatches) {
          const inner = reqMatch[1];
          const literalMatches = [...inner.matchAll(LITERAL_REGEX)];
          for (const litMatch of literalMatches) {
            const literal = litMatch[1];
            // If the literal IS a known capability key name, that's the bug
            expect(
              CAPABILITY_KEY_NAMES.has(literal),
              `${relPath}: found capability KEY NAME "${literal}" as string literal in requireCapabilities — must use CAPABILITIES.${literal} instead`
            ).toBe(false);
          }
        }
      });
    }
  });
});
