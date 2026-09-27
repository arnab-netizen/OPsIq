/**
 * Governance: ONE definition of "the current financial snapshot".
 *
 * Every owner-advice / gating read of the latest OwnerFinancialSnapshot must go through
 * `currentEffectiveFinancialSnapshotQuery` (src/services/owner-finance/financial-snapshot-selection.ts):
 * business-scoped, unsuperseded, ordered by evidence period. A hand-written `findFirst({ ... })`
 * re-invents that choice — the recurring defect class where an amended snapshot, another business's
 * figures, or insertion time (`createdAt`) decided what counts as current.
 *
 * The only exemption is the model's own service (snapshot.service.ts), whose lookups are by id,
 * by exact period (duplicate check) or its version history — never "the latest".
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";

const ROOT = process.cwd();
const EXEMPT = new Set(["src/services/owner-finance/snapshot.service.ts", "src/services/owner-finance/financial-snapshot-selection.ts"]);

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

const FILES = ["src/services", "src/app", "src/lib", "src/domain", "src/infra"]
  .map((d) => join(ROOT, d))
  .flatMap((d) => {
    try { return sourceFiles(d); } catch { return []; }
  });

describe("financial snapshot selection is centralised", () => {
  it("scans the real service tree", () => {
    expect(FILES.some((f) => f.endsWith("owner-action-gate.service.ts"))).toBe(true);
  });

  it("no owner-advice or gating code reads OwnerFinancialSnapshot 'latest' by hand", () => {
    const offenders: string[] = [];
    for (const file of FILES) {
      const rel = relative(ROOT, file).replace(/\\/g, "/");
      if (EXEMPT.has(rel)) continue;
      const src = readFileSync(file, "utf8");
      const re = /ownerFinancialSnapshot\.(findFirst|findMany|findFirstOrThrow)\(\s*([^\s)]*)/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(src))) {
        if (!m[2].startsWith("currentEffectiveFinancialSnapshotQuery(")) {
          offenders.push(`${rel}:${src.slice(0, m.index).split("\n").length} ${m[0]}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("the selector orders by evidence period and excludes superseded snapshots", async () => {
    const { currentEffectiveFinancialSnapshotQuery } = await import("@/services/owner-finance/financial-snapshot-selection");
    const q = currentEffectiveFinancialSnapshotQuery({ workspaceId: "w", businessId: "b" }, { id: true });
    expect(q.where).toEqual({ workspaceId: "w", businessId: "b", supersededById: null });
    expect(q.orderBy[0]).toEqual({ periodEnd: "desc" });
    expect(q.select).toEqual({ id: true });
  });
});
