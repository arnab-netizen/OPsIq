/**
 * Governance — EVERY reader of an evidence-period table (the diagnosis cycles and the snapshot tables they
 * rest on, including the metric snapshots the Wealth, Recovery and Now View readers use) is CLASSIFIED.
 *
 * Detection is by the table's delegate NAME anywhere in the file's code (comments excluded), not by one call
 * shape — so a direct Prisma read, a read through `tx`/`prisma`/an alias, a destructured delegate
 * (`const { ownerSalesCycle: c } = db`), a delegate handed to a helper wrapper (`latestOf(db.ownerSalesCycle)`),
 * a dynamic `db[model]` naming the table, or a list read followed by `[0]` all count. The registry pins the
 * exact number of mentions per file and table: a NEW reader (a new file, or a new mention in a classified
 * file) fails until it is classified here, so no reader can appear unreviewed.
 *
 * Classes (a file may hold several):
 *   CURRENT_EVIDENCE   selects the current reading: must apply the completed-period policy
 *                      (currentEvidenceWhere / completedSnapshotWhere / currentEffectiveFinancialSnapshotQuery /
 *                      an explicit `periodEnd: { lte: <now> }`);
 *   PROVISIONAL_AWARE  reads the in-progress period: must use the provisional policy
 *                      (provisionalEvidenceWhere / provisionalSnapshotWhere / evidencePeriodState /
 *                      loadProvisionalCashFinance);
 *   HISTORY_LIST       write paths, by-id reads and history lists (never selects current evidence) — reason;
 *   STRATEGY_SCENARIO  Strategy scenarios (not evidence periods) — none of these tables;
 *   EXEMPT             no evidence selection at all — reason.
 * The period helpers are never given a literal date, and a spread helper filter is never overridden by a
 * later key in the same object (both would silently re-admit in-progress or future periods).
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

const TABLES = [
  "ownerMetricSnapshot", "recoveryCycle",
  "ownerFinancialSnapshot", "ownerFinanceCycle",
  "ownerCashflowSnapshot", "ownerCashflowCycle",
  "ownerSalesSnapshot", "ownerSalesCycle",
  "ownerOperationsSnapshot", "ownerOperationsCycle",
  "ownerSopSnapshot", "ownerSopCycle",
  "ownerMarketingSnapshot", "ownerMarketingCycle",
] as const;

type ReaderClass = "CURRENT_EVIDENCE" | "PROVISIONAL_AWARE" | "HISTORY_LIST" | "STRATEGY_SCENARIO" | "EXEMPT";
interface RegistryEntry { file: string; classes: ReaderClass[]; reason: string; mentions: Partial<Record<(typeof TABLES)[number], number>> }

export const EVIDENCE_PERIOD_READER_REGISTRY: readonly RegistryEntry[] = [
  { file: "src/app/api/owner/dashboard/route.ts", classes: ["CURRENT_EVIDENCE", "PROVISIONAL_AWARE"], reason: "dashboard health: current completed cycles + in-progress tightening", mentions: {"ownerFinanceCycle": 2, "ownerCashflowCycle": 2} },
  { file: "src/domain/owner-mode/control-correlation.ts", classes: ["EXEMPT"], reason: "names the table in an explanatory string; no read", mentions: {"ownerMetricSnapshot": 1} },
  { file: "src/services/founder-recovery/action.service.ts", classes: ["CURRENT_EVIDENCE"], reason: "re-diagnosis reads the latest COMPLETED snapshot", mentions: {"ownerMetricSnapshot": 1} },
  { file: "src/services/founder-recovery/cycle.service.ts", classes: ["CURRENT_EVIDENCE", "HISTORY_LIST"], reason: "write path; the trend baseline is the latest earlier COMPLETED period", mentions: {"recoveryCycle": 5} },
  { file: "src/services/founder-recovery/dashboard.service.ts", classes: ["CURRENT_EVIDENCE", "PROVISIONAL_AWARE", "HISTORY_LIST"], reason: "current completed cycle; in-progress snapshot labelled; cycle history list and the latest diagnosis of the snapshot shown (by snapshotId)", mentions: {"ownerMetricSnapshot": 1, "recoveryCycle": 3} },
  { file: "src/services/founder-recovery/snapshot.service.ts", classes: ["HISTORY_LIST"], reason: "write path (create) and by-id / history-list reads", mentions: {"ownerMetricSnapshot": 4} },
  { file: "src/services/founder-recovery/verification.service.ts", classes: ["CURRENT_EVIDENCE"], reason: "re-diagnosis reads the latest COMPLETED snapshot", mentions: {"ownerMetricSnapshot": 1} },
  { file: "src/services/owner-budget/budget.service.ts", classes: ["CURRENT_EVIDENCE"], reason: "current effective financial snapshot", mentions: {"ownerFinancialSnapshot": 2} },
  { file: "src/services/owner-budget/signal-router.service.ts", classes: ["CURRENT_EVIDENCE"], reason: "current effective financial snapshot", mentions: {"ownerFinancialSnapshot": 1} },
  { file: "src/services/owner-cashflow/action.service.ts", classes: ["CURRENT_EVIDENCE"], reason: "re-diagnosis reads the latest COMPLETED snapshot", mentions: {"ownerCashflowSnapshot": 1} },
  { file: "src/services/owner-cashflow/dashboard.service.ts", classes: ["CURRENT_EVIDENCE", "PROVISIONAL_AWARE", "HISTORY_LIST"], reason: "current completed cycle; in-progress snapshot labelled; cycle history list and the latest diagnosis of the snapshot shown (by snapshotId)", mentions: {"ownerCashflowSnapshot": 1, "ownerCashflowCycle": 3} },
  { file: "src/services/owner-cashflow/diagnosis.service.ts", classes: ["HISTORY_LIST"], reason: "write path: cycle creation, sequence numbering, by-id reads", mentions: {"ownerCashflowCycle": 5} },
  { file: "src/services/owner-cashflow/snapshot.service.ts", classes: ["HISTORY_LIST"], reason: "write path (create/amend) and by-id / history-list reads; never selects current evidence", mentions: {"ownerCashflowSnapshot": 4} },
  { file: "src/services/owner-cashflow/verification.service.ts", classes: ["CURRENT_EVIDENCE"], reason: "re-diagnosis reads the latest COMPLETED snapshot", mentions: {"ownerCashflowSnapshot": 1} },
  { file: "src/services/owner-condition/business-condition.service.ts", classes: ["CURRENT_EVIDENCE"], reason: "current completed cycles", mentions: {"recoveryCycle": 6, "ownerFinancialSnapshot": 1, "ownerFinanceCycle": 1, "ownerCashflowCycle": 1, "ownerSalesCycle": 1, "ownerOperationsCycle": 1, "ownerSopCycle": 1, "ownerMarketingCycle": 1} },
  { file: "src/services/owner-finance/action.service.ts", classes: ["CURRENT_EVIDENCE"], reason: "re-diagnosis: current completed cycle / current effective snapshot", mentions: {"ownerFinancialSnapshot": 1, "ownerFinanceCycle": 1} },
  { file: "src/services/owner-finance/baseline.service.ts", classes: ["EXEMPT"], reason: "follows the amendment chain of one diagnosed snapshot by id (measured baseline), never selects current evidence", mentions: {"ownerFinanceCycle": 1} },
  { file: "src/services/owner-finance/dashboard.service.ts", classes: ["CURRENT_EVIDENCE", "HISTORY_LIST"], reason: "current completed cycle, current effective and in-progress snapshots; cycle history list, the latest diagnosis of the snapshot shown (by snapshotId), and the P1-1 diagnosis-dependency check (a newer eligible cashflow enrichment arriving since that diagnosis ran)", mentions: {"ownerFinancialSnapshot": 2, "ownerFinanceCycle": 3, "ownerCashflowSnapshot": 1} },
  { file: "src/services/owner-finance/diagnosis.service.ts", classes: ["HISTORY_LIST"], reason: "write path: cycle creation, sequence numbering, by-id reads; the cash row is read as of the diagnosed snapshot's own period end", mentions: {"ownerFinanceCycle": 6, "ownerCashflowSnapshot": 1} },
  { file: "src/services/owner-finance/recommendation-cash-safety.service.ts", classes: ["CURRENT_EVIDENCE", "PROVISIONAL_AWARE"], reason: "Consulting cash gate: completed cycles + in-progress tightening", mentions: {"ownerFinanceCycle": 2, "ownerCashflowCycle": 2} },
  { file: "src/services/owner-finance/recommendation-margin-safety.service.ts", classes: ["CURRENT_EVIDENCE"], reason: "current effective financial snapshot", mentions: {"ownerFinancialSnapshot": 2} },
  { file: "src/services/owner-finance/snapshot.service.ts", classes: ["HISTORY_LIST"], reason: "write path (create/amend chain) and by-id / history-list reads", mentions: {"ownerFinancialSnapshot": 9} },
  { file: "src/services/owner-finance/verification.service.ts", classes: ["CURRENT_EVIDENCE"], reason: "re-diagnosis: current completed cycle / current effective snapshot", mentions: {"ownerFinancialSnapshot": 1, "ownerFinanceCycle": 1} },
  { file: "src/services/owner-guidance/owner-now-view.service.ts", classes: ["CURRENT_EVIDENCE", "PROVISIONAL_AWARE"], reason: "current completed cycles and metric periods + in-progress tightening", mentions: {"ownerMetricSnapshot": 4, "ownerFinanceCycle": 2, "ownerCashflowCycle": 2} },
  { file: "src/services/owner-home/owner-candidate-builder.ts", classes: ["CURRENT_EVIDENCE", "PROVISIONAL_AWARE"], reason: "current completed cycles; in-progress / future domains reported", mentions: {"recoveryCycle": 2, "ownerFinanceCycle": 2, "ownerCashflowCycle": 2, "ownerSalesCycle": 2, "ownerOperationsCycle": 2, "ownerSopCycle": 2, "ownerMarketingCycle": 2} },
  { file: "src/services/owner-home/owner-change-facts.ts", classes: ["CURRENT_EVIDENCE"], reason: "current evidence and its completed baseline", mentions: {"recoveryCycle": 1, "ownerFinanceCycle": 1, "ownerCashflowCycle": 1, "ownerSalesCycle": 1, "ownerOperationsCycle": 1, "ownerSopCycle": 1, "ownerMarketingCycle": 1} },
  { file: "src/services/owner-marketing/action.service.ts", classes: ["CURRENT_EVIDENCE"], reason: "re-diagnosis reads the latest COMPLETED snapshot", mentions: {"ownerMarketingSnapshot": 1} },
  { file: "src/services/owner-marketing/dashboard.service.ts", classes: ["CURRENT_EVIDENCE", "PROVISIONAL_AWARE", "HISTORY_LIST"], reason: "current completed cycle; in-progress snapshot labelled; cycle history list and the latest diagnosis of the snapshot shown (by snapshotId)", mentions: {"ownerMarketingSnapshot": 1, "ownerMarketingCycle": 3} },
  { file: "src/services/owner-marketing/diagnosis.service.ts", classes: ["HISTORY_LIST"], reason: "write path: cycle creation, sequence numbering, by-id reads", mentions: {"ownerMarketingCycle": 5} },
  { file: "src/services/owner-marketing/snapshot.service.ts", classes: ["HISTORY_LIST"], reason: "write path (create/amend) and by-id / history-list reads; never selects current evidence", mentions: {"ownerMarketingSnapshot": 4} },
  { file: "src/services/owner-marketing/verification.service.ts", classes: ["CURRENT_EVIDENCE"], reason: "re-diagnosis reads the latest COMPLETED snapshot", mentions: {"ownerMarketingSnapshot": 1} },
  { file: "src/services/owner-mode/analyze-business.service.ts", classes: ["CURRENT_EVIDENCE"], reason: "current effective financial snapshot", mentions: {"ownerFinancialSnapshot": 1} },
  { file: "src/services/owner-mode/opportunity-decision.service.ts", classes: ["CURRENT_EVIDENCE"], reason: "current effective financial snapshot", mentions: {"ownerFinancialSnapshot": 2} },
  { file: "src/services/owner-mode/owner-action-gate.service.ts", classes: ["CURRENT_EVIDENCE", "PROVISIONAL_AWARE"], reason: "gate: current completed cycles + in-progress tightening", mentions: {"ownerFinancialSnapshot": 2, "ownerFinanceCycle": 2, "ownerCashflowCycle": 2} },
  { file: "src/services/owner-mode/owner-db-providers.ts", classes: ["CURRENT_EVIDENCE"], reason: "latest completed snapshots", mentions: {"ownerMetricSnapshot": 3, "ownerFinancialSnapshot": 2, "ownerCashflowSnapshot": 2} },
  { file: "src/services/owner-mode/owner-progress.service.ts", classes: ["CURRENT_EVIDENCE"], reason: "current completed cycles", mentions: {"ownerFinanceCycle": 2, "ownerSalesCycle": 2, "ownerOperationsCycle": 2, "ownerSopCycle": 2} },
  { file: "src/services/owner-operations/action.service.ts", classes: ["CURRENT_EVIDENCE"], reason: "re-diagnosis reads the latest COMPLETED snapshot", mentions: {"ownerOperationsSnapshot": 1} },
  { file: "src/services/owner-operations/dashboard.service.ts", classes: ["CURRENT_EVIDENCE", "PROVISIONAL_AWARE", "HISTORY_LIST"], reason: "current completed cycle; in-progress snapshot labelled; cycle history list and the latest diagnosis of the snapshot shown (by snapshotId)", mentions: {"ownerOperationsSnapshot": 1, "ownerOperationsCycle": 3} },
  { file: "src/services/owner-operations/diagnosis.service.ts", classes: ["HISTORY_LIST"], reason: "write path: cycle creation, sequence numbering, by-id reads", mentions: {"ownerOperationsCycle": 5} },
  { file: "src/services/owner-operations/snapshot.service.ts", classes: ["HISTORY_LIST"], reason: "write path (create/amend) and by-id / history-list reads; never selects current evidence", mentions: {"ownerOperationsSnapshot": 4} },
  { file: "src/services/owner-operations/verification.service.ts", classes: ["CURRENT_EVIDENCE"], reason: "re-diagnosis reads the latest COMPLETED snapshot", mentions: {"ownerOperationsSnapshot": 1} },
  { file: "src/services/owner-sales/action.service.ts", classes: ["CURRENT_EVIDENCE"], reason: "re-diagnosis reads the latest COMPLETED snapshot", mentions: {"ownerSalesSnapshot": 1} },
  { file: "src/services/owner-sales/dashboard.service.ts", classes: ["CURRENT_EVIDENCE", "PROVISIONAL_AWARE", "HISTORY_LIST"], reason: "current completed cycle; in-progress snapshot labelled; cycle history list and the latest diagnosis of the snapshot shown (by snapshotId)", mentions: {"ownerSalesSnapshot": 1, "ownerSalesCycle": 3} },
  { file: "src/services/owner-sales/diagnosis.service.ts", classes: ["HISTORY_LIST"], reason: "write path: cycle creation, sequence numbering, by-id reads", mentions: {"ownerSalesCycle": 5} },
  { file: "src/services/owner-sales/snapshot.service.ts", classes: ["HISTORY_LIST"], reason: "write path (create/amend) and by-id / history-list reads; never selects current evidence", mentions: {"ownerSalesSnapshot": 4} },
  { file: "src/services/owner-sales/verification.service.ts", classes: ["CURRENT_EVIDENCE"], reason: "re-diagnosis reads the latest COMPLETED snapshot", mentions: {"ownerSalesSnapshot": 1} },
  { file: "src/services/owner-sop/action.service.ts", classes: ["CURRENT_EVIDENCE"], reason: "re-diagnosis reads the latest COMPLETED snapshot", mentions: {"ownerSopSnapshot": 1} },
  { file: "src/services/owner-sop/dashboard.service.ts", classes: ["CURRENT_EVIDENCE", "PROVISIONAL_AWARE", "HISTORY_LIST"], reason: "current completed cycle; in-progress snapshot labelled; cycle history list and the latest diagnosis of the snapshot shown (by snapshotId)", mentions: {"ownerSopSnapshot": 1, "ownerSopCycle": 3} },
  { file: "src/services/owner-sop/diagnosis.service.ts", classes: ["HISTORY_LIST"], reason: "write path: cycle creation, sequence numbering, by-id reads", mentions: {"ownerSopCycle": 5} },
  { file: "src/services/owner-sop/snapshot.service.ts", classes: ["HISTORY_LIST"], reason: "write path (create/amend) and by-id / history-list reads; never selects current evidence", mentions: {"ownerSopSnapshot": 4} },
  { file: "src/services/owner-sop/verification.service.ts", classes: ["CURRENT_EVIDENCE"], reason: "re-diagnosis reads the latest COMPLETED snapshot", mentions: {"ownerSopSnapshot": 1} },
  { file: "src/services/owner-spine/provisional-cash-finance.ts", classes: ["PROVISIONAL_AWARE"], reason: "the in-progress period loader (re-checks each row's period)", mentions: {"ownerFinanceCycle": 2, "ownerCashflowCycle": 2} },
  { file: "src/services/owner-strategy/command-center.service.ts", classes: ["CURRENT_EVIDENCE", "PROVISIONAL_AWARE"], reason: "wealth classification from the latest COMPLETED period; in-progress period labelled", mentions: {"ownerMetricSnapshot": 2} },
  { file: "src/services/owner-strategy/goal.service.ts", classes: ["CURRENT_EVIDENCE"], reason: "goal trajectory from COMPLETED periods; a currency-exclusion count", mentions: {"ownerMetricSnapshot": 2} },
  { file: "src/services/owner-strategy/wealth-path.service.ts", classes: ["CURRENT_EVIDENCE", "PROVISIONAL_AWARE"], reason: "wealth path from the latest COMPLETED period; in-progress period labelled", mentions: {"ownerMetricSnapshot": 2} },
  { file: "src/services/owner-trust/trust.service.ts", classes: ["CURRENT_EVIDENCE"], reason: "current completed cycles", mentions: {"ownerFinanceCycle": 1, "ownerCashflowCycle": 1, "ownerSalesCycle": 1, "ownerOperationsCycle": 1, "ownerSopCycle": 1, "ownerMarketingCycle": 1} },
];

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => "\n".repeat(m.split("\n").length - 1))
    .replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1");
}

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === "__tests__" || name === "generated" || name === "node_modules") continue;
      sourceFiles(p, out);
    } else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

function mentions(code: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const t of TABLES) {
    const n = (code.match(new RegExp(`\\b${t}\\b`, "g")) ?? []).length;
    if (n) out[t] = n;
  }
  return out;
}

const FILES = sourceFiles("src").map((f) => ({ file: f.replace(/\\/g, "/"), code: stripComments(readFileSync(f, "utf8")) }));
const COMPLETED_POLICY = /currentEvidenceWhere\(|completedSnapshotWhere\(|currentEffectiveFinancialSnapshotQuery\(|periodEnd:\s*\{\s*lte:/;
const PROVISIONAL_POLICY = /provisionalEvidenceWhere\(|provisionalSnapshotWhere\(|evidencePeriodState\(|loadProvisionalCashFinance\(/;

describe("governance — evidence-period reader registry", () => {
  it("every reader of an evidence-period table is registered with its exact mentions (a new reader fails until classified)", () => {
    const actual = new Map(FILES.map((f) => [f.file, mentions(f.code)] as const).filter(([, m]) => Object.keys(m).length > 0));
    const registered = new Map(EVIDENCE_PERIOD_READER_REGISTRY.map((e) => [e.file, e.mentions] as const));
    const unclassified = [...actual.keys()].filter((f) => !registered.has(f));
    expect(unclassified, "unclassified evidence-period readers — classify them in EVIDENCE_PERIOD_READER_REGISTRY").toEqual([]);
    const drifted = [...actual.entries()].filter(([f, m]) => JSON.stringify(sortKeys(m)) !== JSON.stringify(sortKeys(registered.get(f) ?? {})));
    expect(drifted.map(([f, m]) => `${f}: ${JSON.stringify(m)}`), "a classified file gained or lost a reader — re-classify it").toEqual([]);
    const stale = [...registered.keys()].filter((f) => !actual.has(f));
    expect(stale, "registry entries for files that no longer read these tables").toEqual([]);
  });

  it("each class is honoured by its file", () => {
    const byFile = new Map(FILES.map((f) => [f.file, f.code]));
    const problems: string[] = [];
    for (const e of EVIDENCE_PERIOD_READER_REGISTRY) {
      const code = byFile.get(e.file) ?? "";
      if (e.classes.length === 0) problems.push(`${e.file}: no class`);
      if (e.classes.includes("CURRENT_EVIDENCE") && !COMPLETED_POLICY.test(code)) problems.push(`${e.file}: CURRENT_EVIDENCE without the completed-period policy`);
      if (e.classes.includes("PROVISIONAL_AWARE") && !PROVISIONAL_POLICY.test(code)) problems.push(`${e.file}: PROVISIONAL_AWARE without the provisional policy`);
      if ((e.classes.includes("HISTORY_LIST") || e.classes.includes("EXEMPT")) && e.reason.trim().length < 10) problems.push(`${e.file}: ${e.classes.join("/")} needs a reason`);
      if (e.classes.includes("STRATEGY_SCENARIO")) problems.push(`${e.file}: STRATEGY_SCENARIO never applies to an evidence-period table`);
    }
    expect(problems).toEqual([]);
  });

  it("the period helpers are never given a literal date (which would re-admit in-progress or future periods)", () => {
    const literal: string[] = [];
    const call = /\b(currentEvidenceWhere|provisionalEvidenceWhere|completedSnapshotWhere|provisionalSnapshotWhere)\(\s*([^)]*)\)/g;
    for (const f of FILES) {
      if (f.file.endsWith("current-diagnosis-cycle.ts")) continue;
      for (const m of f.code.matchAll(call)) {
        const arg = m[2].trim();
        if (/^new Date\(\s*["'`\d]/.test(arg) || /^\d/.test(arg) || /^["'`]/.test(arg)) literal.push(`${f.file}: ${m[0]}`);
      }
      for (const m of f.code.matchAll(/currentEffectiveFinancialSnapshotQuery\(([^;]*?)\)\s*[,;)\n]/g)) {
        if (/new Date\(\s*["'`\d]/.test(m[1])) literal.push(`${f.file}: ${m[0].slice(0, 80)}`);
      }
    }
    expect(literal).toEqual([]);
  });

  it("a spread period filter is never overridden by a later key in the same object", () => {
    const overridden: string[] = [];
    const patterns = [
      /\.\.\.(currentEvidenceWhere|provisionalEvidenceWhere)\([^)]*\)\s*,\s*snapshot\s*:/g,
      /\.\.\.(completedSnapshotWhere|provisionalSnapshotWhere)\([^)]*\)\s*,\s*(periodEnd|periodStart)\s*:/g,
    ];
    for (const f of FILES) for (const re of patterns) for (const m of f.code.matchAll(re)) overridden.push(`${f.file}: ${m[0]}`);
    expect(overridden).toEqual([]);
  });

  it("probes: the registry would catch aliased, destructured and wrapped readers", () => {
    const probes = [
      "const fc = tx.ownerFinanceCycle; await fc.findFirst({ orderBy: { createdAt: 'desc' } });",
      "const { ownerFinanceCycle: fc } = db; await fc.findFirst({});",
      "await latestOf(db.ownerSalesCycle, businessId);",
      "const rows = await prisma.ownerMetricSnapshot.findMany({ where: {} }); const x = rows[0];",
      "await (db as never as Record<string, { findFirst: () => unknown }>)['ownerCashflowCycle'].findFirst();",
    ];
    for (const p of probes) expect(Object.keys(mentions(stripComments(p))).length, p).toBeGreaterThan(0);
  });
});

function sortKeys(o: Record<string, number | undefined>): Record<string, number | undefined> {
  return Object.fromEntries(Object.entries(o).sort(([a], [b]) => (a < b ? -1 : 1)));
}
