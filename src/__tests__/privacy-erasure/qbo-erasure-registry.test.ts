import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { HANDLED_TABLES } from "@/services/privacy-erasure/qbo-erasure.service";

/**
 * Static completeness guard. Every model that holds a foreign key INTO the QuickBooks tables or INTO the Finance / Cashflow
 * snapshot-cycle-action-verification family must be one the erasure service handles. A new dependent model fails this test until
 * it is classified (and the erasure extended) — it cannot silently start retaining QuickBooks-derived data. (Soft, FK-less
 * references are covered at run time by the generic residue scan, which turns an unhandled hit into a dry-run BLOCKER.)
 */
const schema = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8");

interface Model { name: string; table: string; relationTargets: string[] }
function parseModels(): Model[] {
  const out: Model[] = [];
  const re = /^model (\w+) \{([\s\S]*?)^\}/gm;
  for (let m = re.exec(schema); m; m = re.exec(schema)) {
    const body = m[2];
    const table = /@@map\("([^"]+)"\)/.exec(body)?.[1] ?? m[1];
    const targets: string[] = [];
    for (const line of body.split("\n")) {
      const f = /^\s*\w+\s+(\w+)\??(\[\])?\s+@relation\(.*fields:\s*\[/.exec(line);
      if (f) targets.push(f[1]);
    }
    out.push({ name: m[1], table, relationTargets: targets });
  }
  return out;
}
const models = parseModels();

const TARGETS = new Set([
  "OwnerFinancialSnapshot", "OwnerFinanceCycle", "OwnerFinanceFinding", "OwnerFinanceAction", "OwnerFinanceVerification", "OwnerFinanceOutcomeSignal",
  "OwnerCashflowSnapshot", "OwnerCashflowCycle", "OwnerCashflowFinding", "OwnerCashflowAction", "OwnerCashflowVerification",
  "OwnerDecisionRecord", "OwnerOutcomeAssessment", "OwnerApprovalRequest", "ControlledLearningCandidate",
  ...models.filter((m) => m.name.startsWith("Qbo")).map((m) => m.name),
]);

describe("QBO erasure registry completeness", () => {
  it("every Qbo* model is handled by the erasure service", () => {
    for (const m of models.filter((x) => x.name.startsWith("Qbo"))) expect(HANDLED_TABLES.has(m.table), `${m.name} (${m.table}) is not handled by the erasure`).toBe(true);
  });
  it("every model holding a foreign key into the QuickBooks / diagnosis family is handled (or is a controlled-learning child the service discovers)", () => {
    const dependents = models.filter((m) => m.relationTargets.some((t) => TARGETS.has(t)));
    const unhandled = dependents.filter((m) => !HANDLED_TABLES.has(m.table) && !m.table.startsWith("controlled_learning_")).map((m) => m.name);
    expect(unhandled).toEqual([]);
  });
  it("every handled table exists in the schema (no typos)", () => {
    const tables = new Set(models.map((m) => m.table));
    for (const t of HANDLED_TABLES) expect(tables.has(t) || t === "privacy_erasure_requests", `${t} not found in schema`).toBe(true);
  });
});
