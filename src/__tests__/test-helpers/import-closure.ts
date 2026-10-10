/**
 * Transitive LOCAL import closure of TypeScript source files (test helper for architecture guards).
 *
 * Deliberately small: it understands `import ... from`, `export ... from`, side-effect `import "x"`, dynamic `import("x")` and
 * `require("x")`, strips comments first (so documentation that merely NAMES a module is not an import), resolves `@/` and relative
 * specifiers to files, and ignores packages. It is not a general dependency analyzer.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, normalize } from "node:path";

export interface ClosureFs {
  /** Source text of a repo-relative file, or null when it does not exist. */
  read: (rel: string) => string | null;
}

export const realFs = (root: string): ClosureFs => ({
  read: (rel) => (existsSync(join(root, rel)) ? readFileSync(join(root, rel), "utf8") : null),
});

const stripComments = (src: string): string => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

export function importSpecifiers(source: string): string[] {
  const code = stripComments(source);
  const out = new Set<string>();
  const patterns = [
    /(?:^|[\n;])\s*(?:import|export)\s(?:type\s)?[^;'"]*?\sfrom\s*["']([^"']+)["']/g,
    /(?:^|[\n;])\s*import\s*["']([^"']+)["']/g,
    /\bimport\(\s*["']([^"']+)["']\s*\)/g,
    /\brequire\(\s*["']([^"']+)["']\s*\)/g,
  ];
  for (const re of patterns) for (const m of code.matchAll(re)) out.add(m[1]);
  return [...out];
}

const EXT = ["", ".ts", ".tsx", "/index.ts", "/index.tsx"];

function resolveLocal(spec: string, from: string, fs: ClosureFs): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = join("src", spec.slice(2));
  else if (spec.startsWith("./") || spec.startsWith("../")) base = join(dirname(from), spec);
  else return null; // a package
  base = normalize(base);
  for (const e of EXT) {
    const candidate = `${base}${e}`;
    if (/\.(ts|tsx)$/.test(candidate) && fs.read(candidate) !== null) return candidate;
  }
  return null;
}

/** Every local file reachable from `entries` (entries included). */
export function importClosure(entries: readonly string[], fs: ClosureFs): Set<string> {
  const seen = new Set<string>();
  const stack = [...entries];
  while (stack.length > 0) {
    const file = stack.pop() as string;
    if (seen.has(file)) continue;
    const src = fs.read(file);
    if (src === null) continue;
    seen.add(file);
    for (const spec of importSpecifiers(src)) {
      const target = resolveLocal(spec, file, fs);
      if (target && !seen.has(target)) stack.push(target);
    }
  }
  return seen;
}
