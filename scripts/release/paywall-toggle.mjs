#!/usr/bin/env node
/**
 * Entry point for billing:paywall:enable / billing:paywall:disable.
 * Usage: node scripts/release/paywall-toggle.mjs <enable|disable> --expected-main-sha=<sha> --confirm="..." --production-url=https://... [--manifest=path] [--dry-run]
 * Secrets come only from the process environment: VERCEL_TOKEN (required), DATABASE_URL (enable: read-only plan check).
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { VERCEL_API, execute, parseArgs, redact } from "./lib/paywall-release.mjs";

const mode = process.argv[2];
const args = parseArgs(process.argv.slice(3));
const secrets = [process.env.VERCEL_TOKEN, process.env.DATABASE_URL];

const io = {
  env: process.env,
  state: {},
  git: (a) => execFileSync("git", a, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }),
  readFile: (p) => (existsSync(p) ? readFileSync(p, "utf8") : null),
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  http: async (url) => {
    const res = await fetch(url, { redirect: "follow" });
    return { status: res.status, text: await res.text() };
  },
  vercel: async (method, path, body) => {
    const res = await fetch(`${VERCEL_API}${path}`, {
      method,
      headers: { authorization: `Bearer ${process.env.VERCEL_TOKEN}`, "content-type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    let json = null;
    try { json = await res.json(); } catch { /* non-JSON */ }
    return { status: res.status, json };
  },
  db: async (priceId) => {
    const { neon } = await import("@neondatabase/serverless");
    const sql = neon(process.env.DATABASE_URL);
    const [rows] = await sql.transaction((t) => [t`select active from plans where paddle_price_id = ${priceId}`], { readOnly: true });
    return rows;
  },
};

try {
  const { exitCode, lines } = await execute(mode, args, io);
  for (const l of lines) console.log(redact(l, secrets));
  process.exit(exitCode);
} catch (e) {
  console.error(redact(`FATAL: ${e?.message ?? e}`, secrets));
  process.exit(1);
}
