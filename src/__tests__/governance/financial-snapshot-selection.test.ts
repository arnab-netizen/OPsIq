/**
 * Governance: ONE definition of "the current financial snapshot", and every reader of financial
 * evidence classified.
 *
 * Every owner-advice / gating read of the latest OwnerFinancialSnapshot must go through
 * `currentEffectiveFinancialSnapshotQuery` (src/services/owner-finance/financial-snapshot-selection.ts):
 * business-scoped, unsuperseded, ordered by evidence period. A hand-written `findFirst({ ... })`, or
 * the first row of a history list (`listFinancialSnapshots(...)[0]`), re-invents that choice — the
 * recurring defect class where an amended snapshot, another business's figures, or insertion order
 * decided what counts as current.
 *
 * Every file that reads financial evidence (the snapshot model, its history list, or a Finance cycle —
 * whose `snapshot` relation is the diagnosis-bound evidence) must be classified below:
 *   DIAGNOSIS_BOUND   — reads a Finance diagnosis (cycle) and, where needed, the exact snapshot it ran on;
 *   CURRENT_EFFECTIVE — reads the current effective snapshot through the selector;
 *   HISTORICAL_LIST   — lists versions/cycles for history display; never takes "the current" from it;
 *   MODEL_SERVICE     — the model's own service (by id, exact-period duplicate check, amendment chain).
 * A new reader fails this test until it is classified, and the proof document's table must list
 * exactly the classified files (docs/opsiq/architecture/OWNER_DECISION_CONSOLIDATION_PROOF.md §5c).
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";

const ROOT = process.cwd();
const SELECTOR = "src/services/owner-finance/financial-snapshot-selection.ts";
const MODEL_SERVICE = "src/services/owner-finance/snapshot.service.ts";

type ReaderClass = "DIAGNOSIS_BOUND" | "CURRENT_EFFECTIVE" | "HISTORICAL_LIST" | "MODEL_SERVICE";

/** Every financial-evidence reader in src (non-test), classified. */
const FINANCIAL_EVIDENCE_READERS: Readonly<Record<string, readonly ReaderClass[]>> = {
  "src/app/api/owner/dashboard/route.ts": ["DIAGNOSIS_BOUND"],
  "src/app/api/owner/finance/businesses/[businessId]/snapshots/route.ts": ["HISTORICAL_LIST"],
  "src/services/owner-budget/budget.service.ts": ["CURRENT_EFFECTIVE"],
  "src/services/owner-budget/signal-router.service.ts": ["CURRENT_EFFECTIVE"],
  "src/services/owner-condition/business-condition.service.ts": ["DIAGNOSIS_BOUND", "CURRENT_EFFECTIVE"],
  "src/services/owner-finance/action.service.ts": ["DIAGNOSIS_BOUND", "CURRENT_EFFECTIVE"],
  "src/services/owner-finance/baseline.service.ts": ["DIAGNOSIS_BOUND"],
  "src/services/owner-finance/dashboard.service.ts": ["DIAGNOSIS_BOUND", "CURRENT_EFFECTIVE", "HISTORICAL_LIST"],
  "src/services/owner-finance/diagnosis.service.ts": ["DIAGNOSIS_BOUND"],
  "src/services/owner-finance/recommendation-cash-safety.service.ts": ["DIAGNOSIS_BOUND"],
  "src/services/owner-finance/recommendation-margin-safety.service.ts": ["CURRENT_EFFECTIVE"],
  "src/services/owner-finance/snapshot.service.ts": ["MODEL_SERVICE", "HISTORICAL_LIST"],
  "src/services/owner-finance/verification.service.ts": ["DIAGNOSIS_BOUND", "CURRENT_EFFECTIVE"],
  "src/services/owner-guidance/owner-now-view.service.ts": ["DIAGNOSIS_BOUND"],
  "src/services/owner-home/owner-candidate-builder.ts": ["DIAGNOSIS_BOUND"],
  "src/services/owner-home/owner-change-facts.ts": ["DIAGNOSIS_BOUND"],
  "src/services/owner-mode/analyze-business.service.ts": ["CURRENT_EFFECTIVE"],
  "src/services/owner-mode/opportunity-decision.service.ts": ["CURRENT_EFFECTIVE"],
  "src/services/owner-mode/owner-action-gate.service.ts": ["DIAGNOSIS_BOUND", "CURRENT_EFFECTIVE"],
  "src/services/owner-mode/owner-db-providers.ts": ["CURRENT_EFFECTIVE"],
  "src/services/owner-mode/owner-progress.service.ts": ["DIAGNOSIS_BOUND"],
  "src/services/owner-trust/trust.service.ts": ["DIAGNOSIS_BOUND"],
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

/** The whole of src (tests and generated client excluded). */
const FILES = sourceFiles(join(ROOT, "src"));
const rel = (f: string) => relative(ROOT, f).replace(/\\/g, "/");
const lineOf = (src: string, index: number) => src.slice(0, index).split("\n").length;
/** Comments removed (line breaks kept so line numbers stay right). */
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, " ")).replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");

/** Any access to the snapshot model (dot, bracket or raw SQL), its history list, or a Finance cycle. */
const READER_PATTERNS: readonly RegExp[] = [
  /\bownerFinancialSnapshot\s*\.\s*find/,
  /\[\s*["'`]ownerFinancialSnapshot["'`]\s*\]/,
  /\bowner_financial_snapshots\b/,
  /\blistFinancialSnapshots\s*\(/,
  /\bownerFinanceCycle\s*\.\s*find/,
  /\[\s*["'`]ownerFinanceCycle["'`]\s*\]/,
  /["'`]ownerFinanceCycle["'`]/,
];

function readers(): string[] {
  return FILES.filter((f) => rel(f) !== SELECTOR && READER_PATTERNS.some((re) => re.test(readFileSync(f, "utf8")))).map(rel).sort();
}

describe("financial snapshot selection is centralised", () => {
  it("scans the whole real source tree", () => {
    const names = FILES.map(rel);
    expect(names).toContain("src/services/owner-mode/owner-action-gate.service.ts");
    expect(names).toContain("src/app/api/owner/dashboard/route.ts");
    expect(names.some((n) => n.startsWith("src/components/"))).toBe(true);
  });

  it("no code outside the model service touches OwnerFinancialSnapshot except through the selector (any access form)", () => {
    // Every mention of the model (comments stripped) must be one of: a read through the selector, a
    // structural DI type declaring that read, or a Prisma type reference. Aliasing the delegate,
    // destructuring, aggregate/groupBy, bracket access and raw SQL all fail here.
    const ALLOWED = [
      /^ownerFinancialSnapshot\s*\.\s*(findFirst|findMany)\(\s*currentEffectiveFinancialSnapshotQuery\(/,
      /^ownerFinancialSnapshot\s*:\s*\{\s*findFirst\(args:\s*CurrentEffectiveSnapshotQuery</,
    ];
    // A Prisma TYPE reference (PrismaClient["ownerFinancialSnapshot"]["findFirst"] inside a type) is not a
    // read; a runtime bracket access is. Only the type-position form is allowed.
    const TYPE_REFERENCE = /PrismaClient\["$/;
    const offenders: string[] = [];
    for (const file of FILES) {
      const r = rel(file);
      if (r === MODEL_SERVICE || r === SELECTOR) continue;
      const src = stripComments(readFileSync(file, "utf8"));
      const re = /\bownerFinancialSnapshot\b|\bowner_financial_snapshots\b/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(src))) {
        const rest = src.slice(m.index);
        const typeRef = TYPE_REFERENCE.test(src.slice(Math.max(0, m.index - 20), m.index)) && /^ownerFinancialSnapshot"\]\["findFirst"\]>/.test(rest);
        if (!typeRef && !ALLOWED.some((a) => a.test(rest))) offenders.push(`${r}:${lineOf(src, m.index)} ${rest.slice(0, 80).replace(/\s+/g, " ")}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("'the current snapshot' is never taken from the history list: its only caller is the snapshots route, returning it whole", () => {
    // Any other use — `[0]`, destructuring, `.at(0)`, `.then(r => r[0])`, `.find(...)`, another caller —
    // fails here.
    const uses: string[] = [];
    for (const file of FILES) {
      const r = rel(file);
      if (r === MODEL_SERVICE) continue;
      const src = stripComments(readFileSync(file, "utf8"));
      const re = /\blistFinancialSnapshots\b/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(src))) {
        if (/import\s*\{[^}]*$/.test(src.slice(Math.max(0, m.index - 300), m.index))) continue; // the import itself
        const before = src.slice(Math.max(0, m.index - 30), m.index);
        const after = src.slice(m.index);
        const returnedWhole = /return\s+(await\s+)?$/.test(before) && /^listFinancialSnapshots\([^;\n]*\);/.test(after) && !/\)\s*[.[]/.test(after.slice(0, after.indexOf(";")));
        uses.push(`${r}:${returnedWhole ? "returned whole" : "other use"}`);
      }
    }
    expect(uses).toEqual(["src/app/api/owner/finance/businesses/[businessId]/snapshots/route.ts:returned whole"]);
  });

  it("the history list is never renamed (import alias, destructuring rename) — every use stays visible to the scan above", () => {
    const renamed: string[] = [];
    for (const file of FILES) {
      const src = stripComments(readFileSync(file, "utf8"));
      const re = /\blistFinancialSnapshots\s*(?:as|:)\s*[A-Za-z_$]/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(src))) renamed.push(`${rel(file)}:${lineOf(src, m.index)}`);
    }
    expect(renamed).toEqual([]);
  });

  it("the model service has no 'latest' wrapper: its exports are fixed and its only ordered read is the history list", () => {
    // A new export (e.g. a getLatestFinancialSnapshot()) or an ordered lookup inside the model service
    // would silently re-create "latest" outside the selector — both fail here until reviewed.
    const src = stripComments(readFileSync(join(ROOT, MODEL_SERVICE), "utf8"));
    const exported = [...src.matchAll(/^export\s+(?:async\s+)?(?:function|const|let|class)\s+([A-Za-z_$][\w$]*)/gm)].map((m) => m[1]).sort();
    expect(exported).toEqual([
      "amendFinancialSnapshot",
      "createFinancialSnapshot",
      "getFinancialSnapshot",
      "listFinancialSnapshots",
      "resolveCurrentSnapshotId",
      "rowToFinanceInput",
      "toFinanceInput",
    ]);
    const orderedReads = [...src.matchAll(/orderBy\s*:/g)].map((m) => lineOf(src, m.index));
    const listStart = lineOf(src, src.indexOf("export async function listFinancialSnapshots"));
    const listEnd = lineOf(src, src.indexOf("\n}\n", src.indexOf("export async function listFinancialSnapshots")));
    expect(orderedReads.every((line) => line > listStart && line <= listEnd)).toBe(true);
  });

  it("every financial-evidence reader is classified, and every classification names a real reader", () => {
    expect(readers()).toEqual(Object.keys(FINANCIAL_EVIDENCE_READERS).sort());
  });

  it("only HISTORICAL_LIST readers call listFinancialSnapshots", () => {
    const callers = FILES.filter((f) => /\blistFinancialSnapshots\s*\(/.test(readFileSync(f, "utf8"))).map(rel);
    for (const c of callers) expect(FINANCIAL_EVIDENCE_READERS[c], c).toContain("HISTORICAL_LIST");
  });

  it("the proof document's reader table lists exactly the classified readers with the same classes", () => {
    const doc = readFileSync(join(ROOT, "docs/opsiq/architecture/OWNER_DECISION_CONSOLIDATION_PROOF.md"), "utf8");
    const start = doc.indexOf("<!-- financial-evidence-readers:start -->");
    const end = doc.indexOf("<!-- financial-evidence-readers:end -->");
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const rows: Record<string, string[]> = {};
    for (const m of doc.slice(start, end).matchAll(/^\|\s*`(src\/[^`]+)`\s*\|\s*([A-Z_, ]+?)\s*\|/gm)) {
      rows[m[1]] = m[2].split(",").map((x) => x.trim());
    }
    expect(rows).toEqual(Object.fromEntries(Object.entries(FINANCIAL_EVIDENCE_READERS).map(([k, v]) => [k, [...v]])));
  });

  it("the selector orders by evidence period and excludes superseded snapshots", async () => {
    const { currentEffectiveFinancialSnapshotQuery } = await import("@/services/owner-finance/financial-snapshot-selection");
    const q = currentEffectiveFinancialSnapshotQuery({ workspaceId: "w", businessId: "b" }, { id: true });
    expect(q.where).toEqual({ workspaceId: "w", businessId: "b", supersededById: null });
    expect(q.orderBy[0]).toEqual({ periodEnd: "desc" });
    expect(q.select).toEqual({ id: true });
  });
});
