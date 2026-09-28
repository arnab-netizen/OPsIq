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
 * Every receiver counts (`db.`, `tx.`, `prisma.`, any alias, `db["ownerFinanceCycle"]`, `(db as any)[x]`), an
 * orderBy is shared only when it IS a shared constant (never a ternary or object that merely mentions one),
 * and a read whose arguments are a prebuilt object is resolved to that object (an unresolvable one fails).
 *
 * A current read of an EVIDENCE-PERIOD domain (CURRENT_DIAGNOSIS / CURRENT_RECOVERY order) also filters to
 * COMPLETED periods through the one helper (currentEvidenceWhere — never a hand-written `periodEnd` bound,
 * which could be any date): an in-progress or future period would otherwise sort first and hide the present
 * one. A PROVISIONAL read (PROVISIONAL_DIAGNOSIS_CYCLE_ORDER — the in-progress current period, which may only
 * tighten) filters with provisionalEvidenceWhere. Indirect readers (delegate names, aliases) are held to the
 * same period filters.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";

const ROOT = process.cwd();
const CYCLE_READ = /(?:\b|\[\s*["'`])(owner(?:Finance|Cashflow|Sales|Operations|Sop|Marketing|Strategy)Cycle|recoveryCycle)(?:["'`]\s*\])?\s*\.\s*(findFirst|findFirstOrThrow|findMany)\s*\(/g;
const SHARED_ORDER = /\b(?:CURRENT_(?:DIAGNOSIS|RECOVERY|STRATEGY)|PROVISIONAL_DIAGNOSIS)_CYCLE_ORDER\b/;
/** An orderBy expression that IS a shared constant (nothing else: no ternary, object or array around it). */
const EXACT_SHARED_ORDER = /^(?:[A-Za-z_$][\w$]*\.)?(?:CURRENT_(?:DIAGNOSIS|RECOVERY|STRATEGY)|PROVISIONAL_DIAGNOSIS)_CYCLE_ORDER$/;
/** A where clause restricted to COMPLETED periods — through the one helper only. */
const CURRENT_EVIDENCE_FILTER = /\bcurrentEvidenceWhere\s*\(/;
/** A where clause restricted to the in-progress (provisional) period. */
const PROVISIONAL_EVIDENCE_FILTER = /\bprovisionalEvidenceWhere\s*\(/;

/**
 * Reads that legitimately order by run number (never "which diagnosis is current"): write-path reads
 * (allocating the next sequence number, a diagnosis's own drift baseline, the latest run on one given
 * snapshot) and cycle-HISTORY lists for display (every run, newest first).
 */
const WRITE_PATH_ORDERED_READS: Readonly<Record<string, number>> = {
  // next cycleNumber for a new Recovery cycle + the cycle history list (listCycles)
  "src/services/founder-recovery/cycle.service.ts": 2,
  // cycle history lists shown on each domain page (every run, newest first) + the latest run on ONE given
  // snapshot (by snapshotId: "were these figures already diagnosed?") — not a choice between evidence
  "src/services/founder-recovery/dashboard.service.ts": 2,
  "src/services/owner-cashflow/dashboard.service.ts": 2,
  "src/services/owner-finance/dashboard.service.ts": 2,
  "src/services/owner-marketing/dashboard.service.ts": 2,
  "src/services/owner-operations/dashboard.service.ts": 2,
  "src/services/owner-sales/dashboard.service.ts": 2,
  "src/services/owner-sop/dashboard.service.ts": 2,
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
      return topLevelExpression(rest);
    }
    else if (depth === 1 && /^\.\.\.\s*[A-Za-z_$]/.test(args.slice(i))) {
      // a spread of a shared options object (e.g. `...latest`) — resolved by name below
      const name = /^\.\.\.\s*([A-Za-z_$][\w$]*)/.exec(args.slice(i))![1];
      return `...${name}`;
    }
  }
  return null;
}

/** The text of one expression up to its top-level terminator (a comma or the closing bracket). */
function topLevelExpression(text: string): string {
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === "{" || c === "[" || c === "(") depth++;
    else if (c === "}" || c === "]" || c === ")") {
      if (depth === 0) return text.slice(0, i).trim();
      depth--;
    } else if ((c === "," || c === ";") && depth === 0) return text.slice(0, i).trim();
  }
  return text.trim();
}

/** A local's initializer in the file (`const name = …`), as one expression; null when not found. */
function localDefinition(src: string, name: string): string | null {
  const m = new RegExp(`(?:const|let|var)\\s+${name.replace(/\$/g, "\\$")}\\s*(?::[^=]+)?=\\s*`).exec(src);
  return m ? topLevelExpression(src.slice(m.index + m[0].length)) : null;
}

/** Whether an orderBy expression is exactly a shared order (directly, or a local defined as exactly one). */
function isSharedOrder(src: string, order: string): boolean {
  const expr = order.replace(/^\.\.\./, "").trim();
  if (EXACT_SHARED_ORDER.test(expr)) return true;
  // A conditional is shared only when EVERY arm is exactly a shared order.
  const cond = /^[^?]+\?\s*([\w$.]+)\s*:\s*([\w$.]+)$/.exec(expr);
  if (cond) return EXACT_SHARED_ORDER.test(cond[1]) && EXACT_SHARED_ORDER.test(cond[2]);
  if (/^[A-Za-z_$][\w$]*$/.test(expr)) {
    const def = localDefinition(src, expr);
    if (def === null) return false;
    // `...latest` where latest = { orderBy: CURRENT_… }: the object's own orderBy.
    const inner = def.startsWith("{") ? topLevelOrderBy(def) : null;
    return EXACT_SHARED_ORDER.test((inner ?? def).trim());
  }
  return false;
}

/**
 * A read's effective arguments: the literal object, or — when the call passes a prebuilt local — that
 * local's object. null when the arguments cannot be resolved to an object in this file.
 */
function resolvedArgs(src: string, args: string): string | null {
  const a = args.trim();
  if (a.startsWith("{")) return a;
  if (/^[A-Za-z_$][\w$]*$/.test(a)) {
    const def = localDefinition(src, a);
    return def && def.startsWith("{") ? def : null;
  }
  return null;
}

type OrderedRead = { line: number; order: string; shared: boolean; evidenceFiltered: boolean; provisionalFiltered: boolean; kind: string | null };

/** The read's where clause as written, the local it names, and every local spread into it. */
function resolvedWhere(src: string, args: string): string {
  const whereExpr = /(?:^|[{,\s])where\s*:\s*/.exec(args);
  // `{ where, orderBy }` (shorthand) names a local called `where`.
  const shorthand = !whereExpr && /(?:^|[{,\s])where\s*(?=[,}])/.test(args);
  const whereText = whereExpr ? topLevelExpression(args.slice(whereExpr.index + whereExpr[0].length)) : shorthand ? "where" : "";
  let whereResolved = /^[A-Za-z_$][\w$]*$/.test(whereText) ? `${whereText} ${localDefinition(src, whereText) ?? ""}` : whereText;
  for (const spread of whereResolved.matchAll(/\.\.\.\s*([A-Za-z_$][\w$]*)/g)) whereResolved += ` ${localDefinition(src, spread[1]) ?? ""}`;
  return whereResolved;
}

/** Which period kind an order implies: DIAGNOSIS / RECOVERY (completed), PROVISIONAL, or none (Strategy). */
function orderKind(src: string, order: string): string | null {
  const expr = order.replace(/^\.\.\./, "").trim();
  const resolvedOrder = EXACT_SHARED_ORDER.test(expr) ? expr : (localDefinition(src, expr) ?? expr);
  return /\b(?:CURRENT_(DIAGNOSIS|RECOVERY)|(PROVISIONAL)_DIAGNOSIS)_CYCLE_ORDER/.exec(resolvedOrder)?.slice(1).find(Boolean) ?? null;
}

function orderedReads(file: string): OrderedRead[] {
  const src = stripComments(readFileSync(file, "utf8"));
  const out: OrderedRead[] = [];
  CYCLE_READ.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = CYCLE_READ.exec(src))) {
    const line = src.slice(0, m.index).split("\n").length;
    const raw = callArgs(src, m.index + m[0].length - 1);
    const args = resolvedArgs(src, raw);
    if (args === null) {
      out.push({ line, order: `<unresolvable arguments: ${raw.trim().slice(0, 60)}>`, shared: false, evidenceFiltered: false, provisionalFiltered: false, kind: null });
      continue;
    }
    const order = topLevelOrderBy(args);
    if (order === null) continue; // by id / unique key: not a "latest" choice
    if (order.startsWith("...")) {
      // A spread options object with no orderBy of its own (e.g. `...{ select }`) is not a "latest" choice.
      const def = localDefinition(src, order.slice(3).trim());
      if (def !== null && def.startsWith("{") && topLevelOrderBy(def) === null) continue;
    }
    const shared = isSharedOrder(src, order);
    const kind = orderKind(src, order);
    const where = resolvedWhere(src, args);
    const evidenceFiltered = CURRENT_EVIDENCE_FILTER.test(where) || CURRENT_EVIDENCE_FILTER.test(args);
    const provisionalFiltered = PROVISIONAL_EVIDENCE_FILTER.test(where) || PROVISIONAL_EVIDENCE_FILTER.test(args);
    out.push({ line, order: order.split("\n")[0], shared, evidenceFiltered, provisionalFiltered, kind });
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

  it("every current read of an evidence-period domain reads COMPLETED periods only (currentEvidenceWhere)", () => {
    const unfiltered: string[] = [];
    for (const file of FILES) {
      for (const r of orderedReads(file)) {
        if (r.shared && (r.kind === "DIAGNOSIS" || r.kind === "RECOVERY") && (!r.evidenceFiltered || r.provisionalFiltered)) unfiltered.push(`${rel(file)}:${r.line} ${r.order}`);
      }
    }
    expect(unfiltered).toEqual([]);
  });

  it("every provisional read reads the in-progress period only (provisionalEvidenceWhere), never the current cycle", () => {
    const wrong: string[] = [];
    const provisionalReaders: string[] = [];
    for (const file of FILES) {
      for (const r of orderedReads(file)) {
        if (r.kind !== "PROVISIONAL") continue;
        provisionalReaders.push(rel(file));
        if (!r.provisionalFiltered || r.evidenceFiltered) wrong.push(`${rel(file)}:${r.line} ${r.order}`);
      }
    }
    expect(wrong).toEqual([]);
    // Non-vacuous: the one provisional loader is found.
    expect([...new Set(provisionalReaders)]).toEqual(["src/services/owner-spine/provisional-cash-finance.ts"]);
  });

  it("the completed-period filter cannot be faked by a hand-written bound (non-vacuous)", () => {
    expect(CURRENT_EVIDENCE_FILTER.test(`where: { snapshot: { periodEnd: { lte: new Date("2999-01-01") } } }`)).toBe(false);
    expect(CURRENT_EVIDENCE_FILTER.test(`where: { ...scope, ...currentEvidenceWhere(now) }`)).toBe(true);
  });

  it("the detector rejects the evasion forms (non-vacuous)", () => {
    const probe = (code: string) => {
      const src = stripComments(code);
      CYCLE_READ.lastIndex = 0;
      const m = CYCLE_READ.exec(src);
      if (!m) return "no-read";
      const args = resolvedArgs(src, callArgs(src, m.index + m[0].length - 1));
      if (args === null) return "unresolvable";
      const order = topLevelOrderBy(args);
      return order === null ? "unordered" : isSharedOrder(src, order) ? "shared" : "hand";
    };
    expect(probe(`db.ownerFinanceCycle.findFirst({ where, orderBy: CURRENT_DIAGNOSIS_CYCLE_ORDER })`)).toBe("shared");
    expect(probe(`tx.ownerFinanceCycle.findFirst({ where, orderBy: x ? CURRENT_DIAGNOSIS_CYCLE_ORDER : { createdAt: "desc" } })`)).toBe("hand");
    expect(probe(`prisma.ownerSalesCycle.findMany({ orderBy: [CURRENT_DIAGNOSIS_CYCLE_ORDER[0], { createdAt: "desc" }] })`)).toBe("hand");
    expect(probe(`db["ownerSopCycle"].findFirst({ orderBy: { sequenceNumber: "desc" } })`)).toBe("hand");
    expect(probe(`const args = { orderBy: { createdAt: "desc" } }; db.ownerMarketingCycle.findFirst(args)`)).toBe("hand");
    expect(probe(`db.ownerMarketingCycle.findFirst(buildArgs())`)).toBe("unresolvable");
    expect(probe(`const order = cond ? CURRENT_DIAGNOSIS_CYCLE_ORDER : { createdAt: "desc" }; db.ownerOperationsCycle.findFirst({ orderBy: order })`)).toBe("hand");
    expect(probe(`db.ownerOperationsCycle.findFirst({ orderBy: s ? CURRENT_STRATEGY_CYCLE_ORDER : CURRENT_DIAGNOSIS_CYCLE_ORDER })`)).toBe("shared");
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
    // Any receiver that is not a literal cycle-model property access — an alias, a parameter, or a bracket
    // lookup such as `(db as any)[spec.model]` / `db[CYCLE_DELEGATES[d]]`.
    const INDIRECT_READ = /(?:(?<![.\w$])([A-Za-z_$][\w$]*)|(\]\s*\)?))\s*\.\s*(findFirst|findFirstOrThrow|findMany)\s*\(/g;
    const indirectFiles: string[] = [];
    const offenders: string[] = [];
    for (const file of FILES) {
      const src = stripComments(readFileSync(file, "utf8"));
      if (!QUOTED.test(src) && !ALIAS.test(src)) continue;
      indirectFiles.push(rel(file));
      INDIRECT_READ.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = INDIRECT_READ.exec(src))) {
        const receiver = m[1] ?? "]";
        if (m[1] && /^(?:db|tx|prisma)$/.test(m[1])) continue; // a literal model access, checked by CYCLE_READ
        const args = resolvedArgs(src, callArgs(src, m.index + m[0].length - 1));
        if (args === null) {
          offenders.push(`${rel(file)}:${src.slice(0, m.index).split("\n").length} ${receiver}.${m[3]} unresolvable arguments`);
          continue;
        }
        const order = topLevelOrderBy(args);
        if (order === null) continue;
        const text = order.split("\n")[0];
        let shared = isSharedOrder(src, order);
        // `orderBy: spec.order`: every `order:` entry of the file's model table must be a shared constant.
        if (!shared && /^[A-Za-z_$][\w$]*\.order\b/.test(text)) {
          const orders = [...src.matchAll(/\border\s*:\s*([^,}\n]+)/g)].map((x) => x[1].trim());
          shared = orders.length > 0 && orders.every((o) => SHARED_ORDER.test(o) && !/[{[]/.test(o));
        }
        if (!shared) offenders.push(`${rel(file)}:${src.slice(0, m.index).split("\n").length} ${receiver}.${m[3]} orderBy ${text}`);
        // An indirect read in current (evidence-period) order is held to the completed-period filter too; a
        // model table's `spec.order` counts as evidence-period order when any of its entries is one.
        const tableOrders = [...src.matchAll(/\border\s*:\s*([^,}\n]+)/g)].map((x) => x[1].trim());
        const evidenceOrder = /CURRENT_(?:DIAGNOSIS|RECOVERY)_CYCLE_ORDER/.test(text) || /CURRENT_(?:DIAGNOSIS|RECOVERY)_CYCLE_ORDER/.test(localDefinition(src, text) ?? "") ||
          (/^[A-Za-z_$][\w$]*\.order\b/.test(text) && tableOrders.some((o) => /CURRENT_(?:DIAGNOSIS|RECOVERY)_CYCLE_ORDER/.test(o)));
        const where = resolvedWhere(src, args);
        if (evidenceOrder && !(CURRENT_EVIDENCE_FILTER.test(where) || CURRENT_EVIDENCE_FILTER.test(args))) {
          offenders.push(`${rel(file)}:${src.slice(0, m.index).split("\n").length} ${receiver}.${m[3]} reads current order without currentEvidenceWhere`);
        }
      }
    }
    // The detector finds the known indirect readers (non-vacuous).
    expect(indirectFiles).toEqual(expect.arrayContaining(["src/services/owner-home/owner-change-facts.ts", "src/services/owner-trust/trust.service.ts"]));
    expect(offenders).toEqual([]);
  });
});
