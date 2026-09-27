/**
 * Governance: ONE current cash/finance survival reading.
 *
 * Cash flow's `cashflowState` and Finance's `survivalState` are two readings of the same business that
 * can disagree, go out of date, or rest on amended figures. The arbitration between them (freshness by
 * evidence period, amended Finance figures, explicit conflict, the fail-safe gate state) lives only in
 * src/services/owner-spine/current-cash-finance-reading.ts. No consumer may re-implement it:
 *   - the raw arbiter (resolveCashFinanceSignal) is called only there;
 *   - any code that combines both readings (reads `cashflowState` and `survivalState`) must go through
 *     `currentCashFinanceReading`.
 * Domain-local pages/dashboards that show ONE source's own state, and the diagnosis services that write
 * it, never combine them and are outside this rule.
 *
 * Formal Consulting Mode's recommendation cash gate is NOT an Owner-Mode consumer: it keeps the
 * pre-consolidation semantics — both states go straight to the pure gate, which takes the worse of the two
 * (no source arbitration, no freshness preference). It is named here and pinned to exactly that shape.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";

const ROOT = process.cwd();
const SHARED = "src/services/owner-spine/current-cash-finance-reading.ts";
const ARBITER = "src/domain/owner-guidance/cash-finance-conflict.ts";
/** Pure domain rules that take BOTH states as explicit inputs from a caller (no source selection of their own). */
const PURE_TWO_STATE_RULES = new Set([
  "src/domain/owner-strategy/command-center.ts", // evaluateCashSafetyGate(input.cash…): its only caller passes no cash reading
  "src/domain/domain-training/domains/cash-survival.ts", // training-scenario content, not live owner data
  "src/domain/domain-training/domains/cash-survival.cases.ts", // training-scenario fixtures
  "src/domain/owner-finance/cash-safety-gate.ts", // the pure gate: evaluates the two states its caller passes (Owner gate: the shared reading's gateState; Consulting: both raw states, worst-of)
  "src/domain/owner-strategy/command-center.types.ts", // a type declaration
]);

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
const FILES = sourceFiles(join(ROOT, "src"));
const rel = (f: string) => relative(ROOT, f).replace(/\\/g, "/");
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, " ")).replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");

/** Consulting Mode's worst-of gate callers (no arbitration: both raw states into the pure gate). */
const CONSULTING_WORST_OF = new Set(["src/services/owner-finance/recommendation-cash-safety.service.ts"]);

describe("the current cash/finance reading has one source", () => {
  it("the raw arbiter is called only by the shared reading", () => {
    const callers = FILES.filter((f) => rel(f) !== ARBITER && /\bresolveCashFinanceSignal\s*\(/.test(stripComments(readFileSync(f, "utf8")))).map(rel);
    expect(callers).toEqual([SHARED]);
  });

  it("every consumer combining Cash flow and Finance survival goes through currentCashFinanceReading", () => {
    const offenders: string[] = [];
    const consumers: string[] = [];
    for (const file of FILES) {
      const r = rel(file);
      if (r === SHARED || r === ARBITER || PURE_TWO_STATE_RULES.has(r) || CONSULTING_WORST_OF.has(r)) continue;
      const src = stripComments(readFileSync(file, "utf8"));
      if (!(/\bcashflowState\b/.test(src) && /\bsurvivalState\b/.test(src))) continue;
      // Domain-local display/writer files mention only their own source's field; combining both is the rule's subject.
      if (/\bcurrentCashFinanceReading\s*\(/.test(src)) consumers.push(r);
      else offenders.push(r);
    }
    expect(offenders).toEqual([]);
    // The Owner-Mode consumers the parity suite covers (plus Home's cash card, in the Home service).
    expect(consumers.sort()).toEqual([
      "src/app/api/owner/dashboard/route.ts",
      "src/services/owner-guidance/owner-now-view.service.ts",
      "src/services/owner-home/home.service.ts",
      "src/services/owner-home/owner-candidate-builder.ts",
      "src/services/owner-mode/owner-action-gate.service.ts",
    ]);
  });

  it("Consulting Mode's cash gate takes the WORST of each business's raw states (pure worst-of) and arbitrates nothing", () => {
    for (const r of CONSULTING_WORST_OF) {
      const src = stripComments(readFileSync(join(ROOT, r), "utf8"));
      // Per business: both raw states into the worst-of rule; across businesses: the worst; the pure gate gets it.
      expect(src, r).toMatch(/consultingBusinessCashState\(\s*cashRow\?\.cashflowState,\s*finRow\?\.survivalState\s*\)/);
      expect(src, r).toMatch(/const state = consultingWorstCashState\(perBusiness\);\s*[\s\S]*assertCashSafetyForPromotion\(\s*state,\s*state,/);
      expect(src, r).not.toMatch(/\bcurrentCashFinanceReading\b|\bresolveCashFinanceSignal\b|gateState|\baverage\b|\breduce\(/);
    }
  });
});
