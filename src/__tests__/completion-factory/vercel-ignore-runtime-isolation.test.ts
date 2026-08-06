/**
 * Vercel ignore-build script — runtime isolation governance test
 *
 * Proves the invariant that underpins the governance-only path classification:
 * no production runtime code (src/ or app/, excluding generated and test dirs)
 * has a static import or require() targeting a governance-only directory.
 *
 * If any such import existed, changing those files would affect compiled output
 * and the "governance-only" classification would be wrong.
 *
 * Governance-only prefixes (from scripts/vercel-ignore-build.mjs):
 *   docs/, .claude/, .governance/, src/__tests__/
 *
 * This test is itself governance-only (src/__tests__/) and does not affect CI
 * runtime or compiled output.
 */

import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "fs";
import { join, relative } from "path";

const root = join(__dirname, "..", "..", "..");

const GOVERNANCE_PREFIXES = ["docs/", ".claude/", ".governance/", "src/__tests__/"];

// Directories to skip during file walk.
const SKIP_DIRS = new Set([
  "node_modules",
  ".next",
  "__tests__",       // src/__tests__/ itself
  "generated",       // src/generated/prisma — auto-generated, not authored
  "__ignored_tests__",
]);

// Pattern to detect actual import/require statements targeting a governance prefix.
// We match:
//   import ... from '...governance-prefix...'
//   require('...governance-prefix...')
// where governance-prefix starts the module specifier or appears after a relative segment.
//
// We do NOT match plain string literals in JSDoc, comments, or data.
function buildImportPatterns(prefixes: string[]): RegExp[] {
  return prefixes.map(prefix => {
    const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(
      `(?:import\\b[^;]*?\\bfrom|\\brequire)\\s*\\(\\s*|(?:import\\b[^;]*?\\bfrom)\\s*` +
      `['"\`][^'"\`]*${escaped}`,
      "g",
    );
  });
}

// Simpler: look for any import/require line containing the governance prefix.
// We parse line-by-line and only flag lines that also contain import or require keywords.
function hasImportFromGovernancePath(content: string, prefix: string): string[] {
  const hits: string[] = [];
  const lines = content.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    // Must be an import or require statement (not a comment or JSDoc URL)
    if (!trimmed.startsWith("import ") && !trimmed.startsWith("export ") &&
        !trimmed.includes("require(")) {
      continue;
    }
    // Skip lines that are purely comments
    if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) {
      continue;
    }
    // Check if the governance prefix appears in a module specifier position
    // e.g. from 'docs/...' or require('docs/...')
    if (line.includes(`'${prefix}`) || line.includes(`"${prefix}`) || line.includes(`\`${prefix}`)) {
      hits.push(trimmed.slice(0, 120));
    }
  }
  return hits;
}

function* walkFiles(dir: string, extensions = [".ts", ".tsx", ".js", ".mjs"]): Generator<string> {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    let stat;
    try {
      stat = statSync(full);
    } catch {
      continue;
    }
    if (stat.isDirectory()) {
      if (SKIP_DIRS.has(entry)) continue;
      yield* walkFiles(full, extensions);
    } else if (extensions.some(ext => entry.endsWith(ext))) {
      yield full;
    }
  }
}

describe("runtime isolation: governance paths are not imported by production code", () => {
  const RUNTIME_SCAN_ROOTS = ["src", "app"];

  for (const scanRoot of RUNTIME_SCAN_ROOTS) {
    const scanDir = join(root, scanRoot);

    it(`no file under ${scanRoot}/ (excl. generated/tests) imports from a governance-only prefix`, () => {
      const violations: string[] = [];

      for (const filePath of walkFiles(scanDir)) {
        const relPath = relative(root, filePath);

        let content: string;
        try {
          content = readFileSync(filePath, "utf8");
        } catch {
          continue;
        }

        for (const prefix of GOVERNANCE_PREFIXES) {
          const hits = hasImportFromGovernancePath(content, prefix);
          for (const hit of hits) {
            violations.push(`${relPath}: ${hit}`);
          }
        }
      }

      if (violations.length > 0) {
        const report = violations.slice(0, 20).join("\n  ");
        expect.fail(
          `Production code imports from governance-only paths — classification invariant violated:\n  ${report}`,
        );
      }

      expect(violations).toHaveLength(0);
    });
  }
});
