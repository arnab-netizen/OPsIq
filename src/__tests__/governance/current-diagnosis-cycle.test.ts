/**
 * Governance: ONE definition of a domain's CURRENT diagnosis cycle.
 *
 * A diagnosis can be run on any snapshot — including a back-filled OLDER period — and takes the next
 * sequence number, so "the latest run" is not the current truth. Every read of a domain's current cycle
 * must order by the shared constants (src/services/owner-spine/current-diagnosis-cycle.ts): latest
 * evidence period for evidence domains, last evaluation for Strategy scenarios. A hand-written
 * `orderBy: { sequenceNumber | createdAt | cycleNumber: "desc" }` on a cycle read re-invents "latest" —
 * the defect class where a back-filled period silently became the current reading.
 *
 * The only other orderings allowed are the write-path reads and cycle-history lists listed below, each
 * counted per file (a new one fails until it is reviewed and listed).
 *
 * A cycle model reached INDIRECTLY — by delegate name (`db[CYCLE_DELEGATES[d]]`, `(db as …)[spec.model]`),
 * by an alias (`const m = db.ownerFinanceCycle`) or through a wrapper taking the delegate — is held to the
 * same rule: in any file that names a cycle model that way, every ordered read on a non-`db` receiver
 * must use a shared order (no hand-written object, and no conditional arm that is not a shared order).
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";

const ROOT = process.cwd();
const CYCLE_READ = /\b(owner(?:Finance|Cashflow|Sales|Operations|Sop|Marketing|Strategy)Cycle|recoveryCycle)\s*\.\s*(findFirst|findFirstOrThrow|findMany)\s*\(/g;
const SHARED_ORDER = /\bCURRENT_(DIAGNOSIS|RECOVERY|STRATEGY)_CYCLE_ORDER\b/;

/**
 * Reads that legitimately order by run number (never "which diagnosis is current"): write-path reads
 * (allocating the next sequence number, a diagnosis's own drift baseline, the latest run on one given
 * snapshot) and cycle-HISTORY lists for display (every run, newest first).
 */
const WRITE_PATH_ORDERED_READS: Readonly<Record<string, number>> = {
  // next cycleNumber for a new Recovery cycle + the cycle history list (listCycles)
  "src/services/founder-recovery/cycle.service.ts": 2,
  // cycle history lists shown on each domain page (every run, newest first)
  "src/services/founder-recovery/dashboard.service.ts": 1,
  "src/services/owner-cashflow/dashboard.service.ts": 1,
  "src/services/owner-finance/dashboard.service.ts": 1,
  "src/services/owner-marketing/dashboard.service.ts": 1,
  "src/services/owner-operations/dashboard.service.ts": 1,
  "src/services/owner-sales/dashboard.service.ts": 1,
  "src/services/owner-sop/dashboard.service.ts": 1,
  "src/services/owner-strategy/dashboard.service.ts": 1,
  // next sequence number for a new cycle of each domain
  "src/services/owner-cashflow/diagnosis.service.ts": 1,
  "src/services/owner-marketing/diagnosis.service.ts": 1,
  "src/services/owner-operations/diagnosis.service.ts": 1,
  "src/services/owner-sales/diagnosis.service.ts": 1,
  "src/services/owner-sop/diagnosis.service.ts": 1,
  "src/services/owner-strategy/diagnosis.service.ts": 1,
  // next sequence number + the previous run for this diagnosis's data-confidence drift
  "src/services/owner-finance/diagnosis.service.ts": 2,
  // the latest run on ONE given snapshot (by snapshotId) — not a choice between evidence
  "src/services/owner-finance/baseline.service.ts": 1,
};

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (name === "__tests__" || name === "generated" || name === "node_modules") continue;
    const st = statSync(p);
    if (st.isDirectory()) out.push(...sourceFiles(p));
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

const FILES = sourceFiles(join(ROOT, "src"));
const rel = (f: string) => relative(ROOT, f).replace(/\\/g, "/");
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, " ")).replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");

/** The argument text of a call starting at `open` (the index of its "("), balanced. */
function callArgs(src: string, open: number): string {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "(") depth++;
    else if (src[i] === ")" && --depth === 0) return src.slice(open + 1, i);
  }
  return src.slice(open + 1);
}

/** The cycle's own orderBy (top level of the args object), ignoring orderBy inside nested includes. */
function topLevelOrderBy(args: string): string | null {
  let depth = 0;
  for (let i = 0; i < args.length; i++) {
    const c = args[i];
    if (c === "{" || c === "[" || c === "(") depth++;
    else if (c === "}" || c === "]" || c === ")") depth--;
    else if (depth === 1 && args.startsWith("orderBy", i) && /^orderBy\s*:/.test(args.slice(i))) {
      const rest = args.slice(i).replace(/^orderBy\s*:\s*/, "");
      return rest.slice(0, 120);
    }
    else if (depth === 1 && /^\.\.\.\s*[A-Za-z_$]/.test(args.slice(i))) {
      // a spread of a shared options object (e.g. `...latest`) — resolved by name below
      const name = /^\.\.\.\s*([A-Za-z_$][\w$]*)/.exec(args.slice(i))![1];
      return `...${name}`;
    }
  }
  return null;
}

function orderedReads(file: string): Array<{ line: number; order: string; shared: boolean }> {
  const src = stripComments(readFileSync(file, "utf8"));
  const out: Array<{ line: number; order: string; shared: boolean }> = [];
  CYCLE_READ.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = CYCLE_READ.exec(src))) {
    const order = topLevelOrderBy(callArgs(src, m.index + m[0].length - 1));
    if (order === null) continue; // by id / unique key: not a "latest" choice
    let shared = SHARED_ORDER.test(order);
    if (!shared) {
      // `orderBy: order` / `...latest`: the named local must itself be one of the shared constants.
      const name = /^(?:\.\.\.)?([A-Za-z_$][\w$]*)\s*[,}\n]/.exec(order + "\n")?.[1];
      if (name) {
        const def = new RegExp(`(?:const|let)\\s+${name}\\s*=\\s*([^;]*)`).exec(src)?.[1] ?? "";
        shared = SHARED_ORDER.test(def);
      }
    }
    out.push({ line: src.slice(0, m.index).split("\n").length, order: order.split("\n")[0], shared });
  }
  return out;
}

describe("the current diagnosis cycle has one definition", () => {
  it("scans the whole real source tree", () => {
    const names = FILES.map(rel);
    expect(names).toContain("src/services/owner-home/owner-candidate-builder.ts");
    expect(names).toContain("src/services/owner-guidance/owner-now-view.service.ts");
  });

  it("every ordered cycle read uses a shared current-cycle order, except the listed write-path reads and history lists", () => {
    const hand: Record<string, number> = {};
    const detail: string[] = [];
    for (const file of FILES) {
      for (const r of orderedReads(file)) {
        if (r.shared) continue;
        hand[rel(file)] = (hand[rel(file)] ?? 0) + 1;
        detail.push(`${rel(file)}:${r.line} ${r.order}`);
      }
    }
    expect(hand, detail.join("\n")).toEqual(WRITE_PATH_ORDERED_READS);
  });

  it("the advice/gating readers read cycles in the shared order", () => {
    for (const f of [
      "src/services/owner-home/owner-candidate-builder.ts",
      "src/services/owner-home/owner-change-facts.ts",
      "src/services/owner-guidance/owner-now-view.service.ts",
      "src/services/owner-mode/owner-action-gate.service.ts",
      "src/services/owner-finance/recommendation-cash-safety.service.ts",
      "src/services/owner-condition/business-condition.service.ts",
    ]) {
      const src = readFileSync(join(ROOT, f), "utf8");
      expect(SHARED_ORDER.test(src), f).toBe(true);
    }
  });

  it("the shared orders put the evidence period first (Strategy: last evaluation)", async () => {
    const { CURRENT_DIAGNOSIS_CYCLE_ORDER, CURRENT_RECOVERY_CYCLE_ORDER, CURRENT_STRATEGY_CYCLE_ORDER } = await import("@/services/owner-spine/current-diagnosis-cycle");
    expect(CURRENT_DIAGNOSIS_CYCLE_ORDER).toEqual([{ snapshot: { periodEnd: "desc" } }, { snapshot: { createdAt: "desc" } }, { sequenceNumber: "desc" }]);
    expect(CURRENT_RECOVERY_CYCLE_ORDER).toEqual([{ snapshot: { periodEnd: "desc" } }, { snapshot: { createdAt: "desc" } }, { cycleNumber: "desc" }]);
    expect(CURRENT_STRATEGY_CYCLE_ORDER).toEqual([{ sequenceNumber: "desc" }]);
  });

  it("dynamic delegates, aliases and wrappers of cycle models cannot hide a custom order", () => {
    const CYCLE_NAME = "(?:owner(?:Finance|Cashflow|Sales|Operations|Sop|Marketing|Strategy)Cycle|recoveryCycle)";
    const QUOTED = new RegExp(`["'\`]${CYCLE_NAME}["'\`]`);
    const ALIAS = new RegExp(`=\\s*[^;=]*\\bdb\\b[^;=]*\\.${CYCLE_NAME}\\s*[;,)\\n]`);
    const INDIRECT_READ = /(?<![.\w$])(?!db\b|tx\b)([A-Za-z_$][\w$]*)\s*\.\s*(findFirst|findFirstOrThrow|findMany)\s*\(/g;
    const indirectFiles: string[] = [];
    const offenders: string[] = [];
    for (const file of FILES) {
      const src = stripComments(readFileSync(file, "utf8"));
      if (!QUOTED.test(src) && !ALIAS.test(src)) continue;
      indirectFiles.push(rel(file));
      INDIRECT_READ.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = INDIRECT_READ.exec(src))) {
        const order = topLevelOrderBy(callArgs(src, m.index + m[0].length - 1));
        if (order === null) continue;
        const text = order.split("\n")[0];
        let shared = SHARED_ORDER.test(text) && !/[{[]/.test(text.replace(/[,}\]]+\s*$/, ""));
        // `orderBy: spec.order`: every `order:` entry of the file's model table must be a shared constant.
        if (!shared && /^[A-Za-z_$][\w$]*\.order\b/.test(text)) {
          const orders = [...src.matchAll(/\border\s*:\s*([^,}\n]+)/g)].map((x) => x[1].trim());
          shared = orders.length > 0 && orders.every((o) => SHARED_ORDER.test(o) && !/[{[]/.test(o));
        }
        if (!shared) offenders.push(`${rel(file)}:${src.slice(0, m.index).split("\n").length} ${m[1]}.${m[2]} orderBy ${text}`);
      }
    }
    // The detector finds the known indirect readers (non-vacuous).
    expect(indirectFiles).toEqual(expect.arrayContaining(["src/services/owner-home/owner-change-facts.ts", "src/services/owner-trust/trust.service.ts"]));
    expect(offenders).toEqual([]);
  });
});
