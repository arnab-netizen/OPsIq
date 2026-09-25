/**
 * PR migration release signal (ci.yml "Production migration release signal").
 * Uses a throwaway git repository in a temp dir — no network, no database.
 */
import { describe, expect, it } from "vitest";
import { execFileSync } from "child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join, resolve } from "path";
import {
  classifyMigrationChanges,
  classifySql,
  collectFromGit,
  DESTRUCTIVE_ACK,
  formatSignal,
  // @ts-expect-error -- plain ESM script without type declarations
} from "../../../scripts/release/migration-release-signal.mjs";

const ROOT = resolve(__dirname, "../../..");
const OLD = "20260924100000_add_beta_request_acquisition_attribution";
const NEW = "20260926090000_add_example_column";

function repo() {
  const dir = mkdtempSync(join(tmpdir(), "migration-signal-"));
  const git = (...args: string[]) =>
    execFileSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", ...args], { cwd: dir, encoding: "utf8" }).trim();
  const write = (path: string, body: string) => {
    mkdirSync(join(dir, path, ".."), { recursive: true });
    writeFileSync(join(dir, path), body);
  };
  git("init", "-q");
  write(`prisma/migrations/${OLD}/migration.sql`, 'ALTER TABLE "a" ADD COLUMN "b" TEXT;\n');
  write("prisma/migrations/migration_lock.toml", 'provider = "postgresql"\n');
  write("src/app.ts", "export {};\n");
  git("add", "-A");
  git("commit", "-qm", "base");
  const base = git("rev-parse", "HEAD");
  const commit = () => {
    git("add", "-A");
    git("commit", "-qm", "head", "--allow-empty");
    return git("rev-parse", "HEAD");
  };
  return { dir, git, write, base, commit };
}

function signal(dir: string, base: string, head: string) {
  const cwd = process.cwd();
  process.chdir(dir);
  try {
    return classifyMigrationChanges(collectFromGit(base, head));
  } finally {
    process.chdir(cwd);
  }
}

describe("migration release signal", () => {
  it("no migration change → NO_MIGRATION_CHANGE, passes (normal release path unaffected)", () => {
    const r = repo();
    r.write("src/app.ts", "export const x = 1;\n");
    const res = signal(r.dir, r.base, r.commit());
    expect(res.verdict).toBe("NO_MIGRATION_CHANGE");
    expect(res.ok).toBe(true);
    expect(formatSignal(res)).toContain("no production migration required");
    rmSync(r.dir, { recursive: true, force: true });
  });

  it("migration added (additive, the incident shape) → PRODUCTION MIGRATION REQUIRED with name, class and procedure; passes", () => {
    const r = repo();
    r.write(`prisma/migrations/${NEW}/migration.sql`, 'ALTER TABLE "a" ADD COLUMN "c" TEXT, ADD COLUMN "d" DOUBLE PRECISION;\n');
    const res = signal(r.dir, r.base, r.commit());
    expect(res.verdict).toBe("PRODUCTION_MIGRATION_REQUIRED");
    expect(res.ok).toBe(true);
    expect(res.added).toEqual([{ name: NEW, destructive: [], acknowledged: false }]);
    const text = formatSignal(res);
    expect(text).toContain("PRODUCTION MIGRATION REQUIRED");
    expect(text).toContain(NEW);
    expect(text).toContain("additive");
    expect(text).toContain("Migrate Production Database");
    rmSync(r.dir, { recursive: true, force: true });
  });

  it("existing migration modified → BLOCKED (applied migrations are immutable)", () => {
    const r = repo();
    r.write(`prisma/migrations/${OLD}/migration.sql`, 'ALTER TABLE "a" ADD COLUMN "b" INTEGER;\n');
    const res = signal(r.dir, r.base, r.commit());
    expect(res.ok).toBe(false);
    expect(res.modified).toEqual([OLD]);
    rmSync(r.dir, { recursive: true, force: true });
  });

  it("existing migration deleted, renamed, or the lock file changed → BLOCKED", () => {
    const del = repo();
    del.git("rm", "-rq", `prisma/migrations/${OLD}`);
    const d = signal(del.dir, del.base, del.commit());
    expect(d.ok).toBe(false);
    expect(d.deleted).toEqual([OLD]);

    const ren = repo();
    ren.git("mv", `prisma/migrations/${OLD}`, `prisma/migrations/${NEW}`);
    const n = signal(ren.dir, ren.base, ren.commit());
    expect(n.ok).toBe(false);
    expect(n.deleted).toEqual([OLD]);

    const lock = repo();
    lock.write("prisma/migrations/migration_lock.toml", 'provider = "mysql"\n');
    const l = signal(lock.dir, lock.base, lock.commit());
    expect(l.ok).toBe(false);
    expect(l.blockers.join("\n")).toContain("migration_lock.toml");
    for (const x of [del, ren, lock]) rmSync(x.dir, { recursive: true, force: true });
  });

  it("potentially destructive migration → BLOCKED unless explicitly acknowledged (expand/contract)", () => {
    const r = repo();
    r.write(`prisma/migrations/${NEW}/migration.sql`, 'ALTER TABLE "a" DROP COLUMN "b";\n');
    const blocked = signal(r.dir, r.base, r.commit());
    expect(blocked.ok).toBe(false);
    expect(blocked.added[0].destructive.length).toBeGreaterThan(0);

    r.write(`prisma/migrations/${NEW}/migration.sql`, `${DESTRUCTIVE_ACK}\nALTER TABLE "a" DROP COLUMN "b";\n`);
    const acked = signal(r.dir, r.base, r.commit());
    expect(acked.ok).toBe(true);
    expect(acked.verdict).toBe("PRODUCTION_MIGRATION_REQUIRED");
    expect(formatSignal(acked)).toContain("POTENTIALLY DESTRUCTIVE");
    rmSync(r.dir, { recursive: true, force: true });
  });

  it("invalid or out-of-order migration names → BLOCKED", () => {
    const r = repo();
    r.write("prisma/migrations/20200101000000_older_than_base/migration.sql", 'ALTER TABLE "a" ADD COLUMN "z" TEXT;\n');
    r.write("prisma/migrations/bad-name/migration.sql", 'ALTER TABLE "a" ADD COLUMN "y" TEXT;\n');
    const res = signal(r.dir, r.base, r.commit());
    expect(res.ok).toBe(false);
    expect(res.blockers.join("\n")).toMatch(/sorts before the latest existing migration/);
    expect(res.blockers.join("\n")).toMatch(/bad-name: name must match/);
    rmSync(r.dir, { recursive: true, force: true });
  });

  it("classifies additive vs destructive SQL, ignoring comments", () => {
    expect(classifySql('ALTER TABLE "t" ADD COLUMN "x" TEXT;\nCREATE INDEX "i" ON "t"("x");')).toEqual([]);
    expect(classifySql('ALTER TABLE "t" ADD COLUMN "x" TEXT NOT NULL DEFAULT \'a\';')).toEqual([]);
    expect(classifySql('ALTER TABLE "t" ALTER COLUMN "x" DROP NOT NULL;')).toEqual([]);
    expect(classifySql("-- DROP TABLE users;\n/* TRUNCATE x; */\nSELECT 1;")).toEqual([]);
    expect(classifySql('DROP TABLE "t";')).not.toEqual([]);
    expect(classifySql('ALTER TABLE "t" RENAME COLUMN "a" TO "b";')).not.toEqual([]);
    expect(classifySql('ALTER TABLE "t" ALTER COLUMN "a" SET NOT NULL;')).not.toEqual([]);
    expect(classifySql('ALTER TABLE "t" ALTER COLUMN "a" TYPE INTEGER;')).not.toEqual([]);
    expect(classifySql('ALTER TABLE "t" ADD COLUMN "a" TEXT NOT NULL;')).not.toEqual([]);
    expect(classifySql('UPDATE "t" SET "a" = 1;')).not.toEqual([]);
    expect(classifySql('DELETE FROM "t";')).not.toEqual([]);
  });

  it("the incident migration itself is classified additive", () => {
    const sql = readFileSync(
      join(ROOT, "prisma/migrations/20260925120000_add_verification_baseline_provenance/migration.sql"),
      "utf8"
    );
    expect(classifySql(sql)).toEqual([]);
  });

  it("ci.yml runs the signal for every PR in the required build-and-test job, before dependency install", () => {
    const ci = readFileSync(join(ROOT, ".github/workflows/ci.yml"), "utf8");
    const job = ci.slice(ci.indexOf("\n  build-and-test:"), ci.indexOf("\n  db-verify:"));
    const step = job.indexOf("name: Production migration release signal");
    expect(step).toBeGreaterThan(-1);
    expect(step).toBeLessThan(job.indexOf("name: Install dependencies"));
    const body = job.slice(step, job.indexOf("\n\n", step));
    expect(body).not.toMatch(/\bif:/);
    expect(body).toContain("scripts/release/migration-release-signal.mjs");
    expect(body).toContain("github.event.pull_request.base.sha");
  });
});
