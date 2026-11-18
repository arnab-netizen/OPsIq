/** Deterministic release planning: full chain vs ledger, zero/many migrations, drift and destructive changes. */
import { describe, expect, it } from "vitest";
// @ts-expect-error -- plain ESM script without type declarations
import { planRelease, destructiveReasons } from "../../../scripts/release/release-plan.mjs";

const c = (name: string, checksum: string | null = name) => ({ name, checksum });
const row = (name: string, o: Record<string, unknown> = {}) => ({ migration_name: name, checksum: name, finished_at: new Date(), rolled_back_at: null, ...o });
const SAFE = "CREATE TABLE \"t\" (id uuid PRIMARY KEY); CREATE INDEX \"i\" ON \"t\"(id);";

describe("planRelease", () => {
  it("zero-migration release: chain equals ledger -> NOOP (runtime-role verification still applies downstream)", () => {
    expect(planRelease({ committed: [c("001"), c("002")], rows: [row("001"), row("002")] })).toMatchObject({ action: "NOOP", pending: [] });
  });
  it("one or many pending migrations -> MIGRATE in ascending order, regardless of what the last push contained", () => {
    const r = planRelease({ committed: [c("003"), c("001"), c("002"), c("004")].sort((a, b) => a.name.localeCompare(b.name)), rows: [row("001"), row("002")], sqlByName: { "003": SAFE, "004": SAFE } });
    expect(r).toMatchObject({ action: "MIGRATE", pending: ["003", "004"] });
  });
  it("recovers previously unapplied migrations from a failed or cancelled release (ledger-driven, not diff-driven)", () => {
    expect(planRelease({ committed: [c("001"), c("002"), c("003")], rows: [row("001")], sqlByName: { "002": SAFE, "003": SAFE } })).toMatchObject({ action: "MIGRATE", pending: ["002", "003"] });
  });
  it("BLOCKS failed, in-progress or rolled-back ledger rows", () => {
    expect(planRelease({ committed: [c("001")], rows: [row("001", { finished_at: null })] }).action).toBe("BLOCK");
    expect(planRelease({ committed: [c("001")], rows: [row("001", { rolled_back_at: new Date() })] }).action).toBe("BLOCK");
  });
  it("BLOCKS an applied migration whose checksum changed", () => {
    const r = planRelease({ committed: [c("001", "new")], rows: [row("001", { checksum: "old" })] });
    expect(r.action).toBe("BLOCK");
    expect(r.reasons.join()).toMatch(/modified/);
  });
  it("BLOCKS a pending migration older than an applied one (out of order)", () => {
    const r = planRelease({ committed: [c("001"), c("002"), c("003")], rows: [row("001"), row("003")], sqlByName: { "002": SAFE } });
    expect(r.action).toBe("BLOCK");
    expect(r.reasons.join()).toMatch(/out of order/);
  });
  it("BLOCKS unreadable chain/ledger and a migration directory without migration.sql", () => {
    expect(planRelease({ committed: null, rows: [] }).action).toBe("BLOCK");
    expect(planRelease({ committed: [c("001")], rows: null as never }).action).toBe("BLOCK");
    expect(planRelease({ committed: [c("001", null)], rows: [] }).action).toBe("BLOCK");
  });
  it("BLOCKS when the SQL of a pending migration is not available to inspect", () => {
    expect(planRelease({ committed: [c("001")], rows: [] }).action).toBe("BLOCK");
  });
  it("destructive or incompatible pending migrations are never automatic and are named", () => {
    for (const sql of ['DROP TABLE "x";', 'ALTER TABLE "x" DROP COLUMN "y";', 'TRUNCATE "x";', 'DELETE FROM "x";', 'ALTER TABLE "x" ALTER COLUMN "y" TYPE text;', 'ALTER TABLE "x" RENAME COLUMN "a" TO "b";', 'ALTER TABLE "x" ALTER COLUMN "y" SET NOT NULL;', 'GRANT ALL ON "x" TO PUBLIC;', "CREATE ROLE evil;"]) {
      const r = planRelease({ committed: [c("001")], rows: [], sqlByName: { "001": sql } });
      expect(r.action, sql).toBe("BLOCK");
      expect(Object.keys(r.destructive)).toEqual(["001"]);
    }
  });
  it("comments and string literals do not trigger or hide destructive detection", () => {
    expect(destructiveReasons("-- DROP TABLE x\nCREATE TABLE y (a text DEFAULT 'DROP TABLE z');")).toEqual([]);
    expect(destructiveReasons("/* harmless */ DROP TABLE x;")).not.toEqual([]);
    expect(destructiveReasons("DELETE FROM x WHERE id = 1;")).toEqual([]);
  });
});
