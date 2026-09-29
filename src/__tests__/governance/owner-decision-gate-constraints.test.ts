/**
 * Governance: every production resolution of the canonical owner decision (and of a domain's canonically
 * eligible steps) is given the business's owner action-gate constraints, so it never elects or lists a
 * step the server-side gate would refuse at that state (owner-decision.ts canonicalEligibility).
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";

const ROOT = process.cwd();
const RESOLVER = "src/domain/owner-spine/owner-decision.ts";

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

function callArgs(src: string, open: number): string {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "(") depth++;
    else if (src[i] === ")" && --depth === 0) return src.slice(open + 1, i);
  }
  return src.slice(open + 1);
}

describe("the canonical decision always models the action gate's constraints", () => {
  it("every production call of resolveOwnerDecision / canonicalEligibility / domainLocalCanonicalStep passes `gate`", () => {
    const calls: string[] = [];
    const missing: string[] = [];
    for (const f of sourceFiles(join(ROOT, "src"))) {
      if (rel(f) === RESOLVER) continue;
      const src = stripComments(readFileSync(f, "utf8"));
      const re = /\b(resolveOwnerDecision|canonicalEligibility|domainLocalCanonicalStep)\s*\(/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(src))) {
        const args = callArgs(src, m.index + m[0].length - 1);
        const where = `${rel(f)}:${src.slice(0, m.index).split("\n").length} ${m[1]}`;
        calls.push(where);
        // A real constraints value: `gate` named (shorthand or `gate: <expr>`), never `gate: null|undefined`.
        if (!/\bgate\b/.test(args) || /\bgate\s*:\s*(?:null|undefined)\b/.test(args)) missing.push(where);
      }
    }
    expect(calls.length).toBeGreaterThanOrEqual(3);
    expect(missing).toEqual([]);
  });

  it("the constraints come from the gate's own loader (one source of safety state)", () => {
    for (const f of ["src/services/owner-home/home.service.ts", "src/services/owner-home/owner-candidate-builder.ts"]) {
      expect(readFileSync(join(ROOT, f), "utf8"), f).toMatch(/\bloadOwnerGateConstraints\s*\(/);
    }
    const gate = readFileSync(join(ROOT, "src/services/owner-mode/owner-action-gate.service.ts"), "utf8");
    expect(gate).toMatch(/\bevaluateOwnerActionGate\s*\(/);
    expect(readFileSync(join(ROOT, RESOLVER), "utf8")).toMatch(/\bevaluateOwnerActionGate\s*\(/);
  });
});
