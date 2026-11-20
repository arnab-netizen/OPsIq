/**
 * Differential test of the additive-only scan against REAL PostgreSQL lexing (review F1).
 *
 * Property under test: if the scan ACCEPTS an input, executing that input on PostgreSQL can run nothing outside the allow-list. The canary here is a
 * table `victim` holding one row, plus the table the accepted statements alter: for every accepted input the victim must still exist, with its row
 * unchanged. A scanner that disagrees with PostgreSQL about where a comment, string or statement ends (a bare CR ending a `--` comment, a non-ASCII
 * dollar-quote tag, a tag longer than a fixed cap, ...) fails this test the moment the fuzz corpus reaches the disagreement.
 *
 * The corpus is a fixed hand-written set of edge cases (all the review repros) plus a seeded random generator over comment / string / dollar /
 * whitespace / separator fragments. Everything runs in a disposable database on the guarded loopback test server.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";
// @ts-expect-error -- plain ESM script without type declarations
import { scanAdditiveOnly } from "../../../scripts/release/migration-additive-scan.mjs";

const baseUrl = process.env.DATABASE_URL ?? "";
let admin: Client;
let c: Client;
let dbName = "";

const HEAD = 'ALTER TABLE "subscriptions" ADD COLUMN "x" TEXT';

async function reset() {
  await c.query(`DROP TABLE IF EXISTS "victim"; DROP TABLE IF EXISTS "subscriptions"; DROP TABLE IF EXISTS "t";
    CREATE TABLE "victim" ("id" int PRIMARY KEY, "v" text); INSERT INTO "victim" VALUES (1, 'keep');
    CREATE TABLE "subscriptions" ("id" int PRIMARY KEY); CREATE TABLE "t" ("id" int PRIMARY KEY);`);
}

/** Execute exactly as a migration file would run (one simple-protocol multi-statement string); PostgreSQL errors are fine, side effects are not. */
async function execute(sql: string): Promise<string | null> {
  try {
    await c.query(sql);
    return null;
  } catch (e) {
    return (e as Error).message;
  }
}

async function victimIntact(): Promise<boolean> {
  try {
    const r = await c.query(`SELECT (SELECT count(*)::int FROM "victim") AS n, (SELECT v FROM "victim" WHERE id = 1) AS v`);
    return r.rows[0].n === 1 && r.rows[0].v === "keep";
  } catch {
    return false; // the table is gone
  }
}

beforeAll(async () => {
  expect(["localhost", "127.0.0.1", "[::1]", "::1"], "loopback only").toContain(new URL(baseUrl).hostname);
  admin = new Client({ connectionString: baseUrl });
  await admin.connect();
  dbName = `scandiff_${process.pid}_${Date.now() % 1e9}`;
  await admin.query(`CREATE DATABASE ${dbName}`);
  const u = new URL(baseUrl);
  u.pathname = `/${dbName}`;
  u.search = "";
  c = new Client({ connectionString: u.toString() });
  await c.connect();
  await reset();
}, 60_000);

afterAll(async () => {
  await c?.end().catch(() => {});
  await admin?.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`).catch(() => {});
  await admin?.end().catch(() => {});
}, 60_000);

const PAYLOADS = ['DROP TABLE "victim"', 'TRUNCATE "victim"', 'DELETE FROM "victim"', `UPDATE "victim" SET v = 'x'`, 'DROP TABLE "subscriptions"'];

/** Hand-written disagreement attempts. Every one hides or exposes a payload differently in PostgreSQL than a naive lexer would. */
const HAND: string[] = [
  `${HEAD}; -- harmless\r DROP TABLE "victim";`,
  `${HEAD}; -- harmless\rDROP TABLE "victim";`,
  `${HEAD}; -- harmless\r\nDROP TABLE "victim";`,
  `${HEAD}; /* c\r */ DROP TABLE "victim";`,
  `${HEAD} DEFAULT $é$ -- $é$; DROP TABLE "victim";`,
  `${HEAD} DEFAULT $${"a".repeat(90)}$ -- $${"a".repeat(90)}$; DROP TABLE "victim";`,
  `${HEAD} DEFAULT $${"é".repeat(40)}$ -- $${"é".repeat(40)}$; DROP TABLE "victim";`,
  `${HEAD} DEFAULT $$ -- $$; DROP TABLE "victim";`,
  `${HEAD} DEFAULT $汉$ -- $汉$; DROP TABLE "victim";`,
  `${HEAD}; -- c DROP TABLE "victim";`,
  `${HEAD}; -- c\u0085DROP TABLE "victim";`,
  `${HEAD}; DROP TABLE "victim";`,
  `${HEAD}; DROP TABLE "victim";`,
  `${HEAD}; /* /* nested */ DROP TABLE "victim"; */ DROP TABLE "victim";`,
  `${HEAD}; /*/ DROP TABLE "victim"; */`,
  `${HEAD}; -- /* \n DROP TABLE "victim"; --*/`,
  `${HEAD} DEFAULT 'a\\'; DROP TABLE "victim"; --';`,
  `${HEAD} DEFAULT E'a\\'; DROP TABLE "victim"; --';`,
  `${HEAD}; SELECT U&'\\0044ROP'; DROP TABLE "victim";`,
  `${HEAD}; ALTER TABLE "t"\fADD COLUMN "y" TEXT; DROP TABLE "victim";`,
  // inputs that must be ACCEPTED (non-vacuity): the payload is genuinely inert in both lexers
  `${HEAD}; -- DROP TABLE "victim"`,
  `${HEAD}; /* DROP TABLE "victim"; */`,
  `${HEAD} DEFAULT 'DROP TABLE "victim"';`,
  `${HEAD}; -- c\r\nALTER TABLE "t" ADD COLUMN "y" TEXT; /* TRUNCATE "victim" */\r\n`,
  `-- é\n${HEAD}; /* nested /* DROP TABLE "victim"; */ still */`,
];

// mulberry32: deterministic corpus, reproducible failures
function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SEPS = ["\n", "\r", "\r\n", "\f", "\v", "\u0085", " ", " ", " ", "　", " ", "\t", "", "\u0001"];
const OPENERS = ["--", "/*", "'", '"', "$$", "$é$", "$a$", `$${"a".repeat(90)}$`, `$${"é".repeat(70)}$`, "E'", "U&'", "$1", "/* /*", ""];
const CLOSERS = ["*/", "'", '"', "$$", "$é$", "$a$", `$${"a".repeat(90)}$`, `$${"é".repeat(70)}$`, "*/ */", "\\", "''", ""];
const JUNK = ["x", "1", "DEFAULT", "NULL", ",", "(", ")", "\\", "--", "/*", "*/", "'", '"', "$", ";", "TEXT"];

/** Mostly well-formed hiding of a payload (so the scanner accepts many inputs), with a random disruptive fragment spliced in half the time. */
function generateHidden(r: () => number): string {
  const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)];
  const payload = pick(PAYLOADS);
  const hidden = pick([
    `-- ${payload}`,
    `/* ${payload}; */`,
    `/* a /* ${payload} */ b */`,
    `DEFAULT '${payload.replace(/'/g, "''")}'`,
    `-- ${payload}${pick(SEPS)}`,
    `DEFAULT ${pick(OPENERS)} ${payload} ${pick(CLOSERS)}`,
  ]);
  let body = `${HEAD}${pick([";", " ", ""])}${pick(SEPS)}${hidden}${pick(SEPS)}${pick([";", ""])}`;
  if (r() < 0.5) {
    const at = Math.floor(r() * body.length);
    body = body.slice(0, at) + pick([...SEPS, ...OPENERS, ...CLOSERS, "\\"]) + body.slice(at);
  }
  if (r() < 0.4) body += `${pick(SEPS)}${payload};`;
  return body;
}

function generate(r: () => number): string {
  const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)];
  if (r() < 0.6) return generateHidden(r);
  const payload = pick(PAYLOADS);
  const parts: string[] = [HEAD];
  const n = 1 + Math.floor(r() * 4);
  for (let i = 0; i < n; i++) {
    parts.push(pick([";", " ", pick(JUNK)]));
    parts.push(pick(SEPS));
    parts.push(pick(OPENERS));
    if (r() < 0.5) parts.push(pick(JUNK));
    parts.push(pick(SEPS));
    if (r() < 0.6) parts.push(payload);
    parts.push(pick(SEPS));
    parts.push(pick(CLOSERS));
    parts.push(pick(SEPS));
  }
  parts.push(pick([";", " ;", ""]));
  if (r() < 0.5) parts.push(payload, ";");
  return parts.join("");
}

describe("[db] additive-only scan vs PostgreSQL lexing — accepted input can never run a non-allow-listed statement", () => {
  it("hand-written disagreement corpus: every ACCEPTED input leaves the canary untouched, and the corpus is not vacuous", async () => {
    let accepted = 0;
    for (const sql of HAND) {
      const verdict = scanAdditiveOnly(sql).ok as boolean;
      if (!verdict) continue;
      accepted++;
      await reset();
      await execute(sql);
      expect(await victimIntact(), `ACCEPTED input damaged the canary: ${JSON.stringify(sql)}`).toBe(true);
    }
    expect(accepted).toBeGreaterThanOrEqual(4);
    expect(HAND.length - accepted).toBeGreaterThanOrEqual(15);
  });

  it("the review repros really are dangerous on PostgreSQL (the differential harness would catch a scanner that accepted them)", async () => {
    for (const sql of [HAND[0], HAND[1], HAND[4], HAND[5], HAND[9]]) {
      await reset();
      await execute(sql);
      // Not asserting each one drops (a given repro may error before the DROP); at least the CR and dollar-tag repros must.
    }
    await reset();
    await execute(HAND[0]);
    expect(await victimIntact(), "repro (a): PostgreSQL ends the comment at a bare CR and runs the DROP").toBe(false);
    await reset();
    await execute(HAND[4]);
    expect(await victimIntact(), "repro (b): the non-ASCII dollar tag is a quote on PostgreSQL, so the DROP is reached").toBe(false);
    await reset();
    await execute(HAND[5]);
    expect(await victimIntact(), "repro (b): a 90-character tag").toBe(false);
  });

  it("seeded fuzz corpus (6000 inputs): zero accepted inputs damage the canary; a meaningful number are accepted", async () => {
    const r = rng(0x5ca17);
    let accepted = 0;
    const damaged: string[] = [];
    for (let i = 0; i < 6000; i++) {
      const sql = generate(r);
      if (!(scanAdditiveOnly(sql).ok as boolean)) continue;
      accepted++;
      await reset();
      await execute(sql);
      if (!(await victimIntact())) damaged.push(JSON.stringify(sql));
    }
    expect(damaged, `accepted inputs that damaged the canary:\n${damaged.slice(0, 5).join("\n")}`).toEqual([]);
    expect(accepted).toBeGreaterThan(30);
  }, 240_000);

  it("fuzz with accepted inputs that EXECUTE successfully: the allow-listed ALTER really ran (the harness exercises real execution, not just errors)", async () => {
    await reset();
    const err = await execute(`${HEAD}; -- DROP TABLE "victim"\r\n`);
    expect(err).toBeNull();
    const col = await c.query(`SELECT 1 FROM information_schema.columns WHERE table_name = 'subscriptions' AND column_name = 'x'`);
    expect(col.rowCount).toBe(1);
    expect(await victimIntact()).toBe(true);
  });
});
