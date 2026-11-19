#!/usr/bin/env node
/** CLI wiring for auto-migrate.mjs (privileged commands are only ever spawned here, after the pure decision allowed them). */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { decideAutoMigrate, applyAndVerify, evaluateBackup, lastBackupSuccessMs } from "./auto-migrate.mjs";

const env = process.env;
const out = (k, v) => console.log(`${k}=${String(v).replace(/[^A-Za-z0-9_.:-]/g, "").slice(0, 80)}`);
const gh = async (path) => {
  const r = await fetch(`https://api.github.com${path}`, { redirect: "error", headers: { authorization: `Bearer ${env.GITHUB_TOKEN}`, accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28" } });
  if (!r.ok) throw new Error(`github api ${r.status}`);
  return r.json();
};
const parsePlan = (text) => {
  const lines = String(text).split("\n").filter((l) => l.includes('"RELEASE_PLAN"'));
  if (lines.length !== 1) return null;
  try { const j = JSON.parse(lines[0]); return { action: j.RELEASE_PLAN, pending: j.pending ?? [] }; } catch { return null; }
};
const replan = async () => {
  const r = spawnSync("npx", ["tsx", "scripts/release/release-plan-cli.ts", "--target", "production"], { encoding: "utf8", env });
  return parsePlan(r.stdout ?? "") ?? { action: "BLOCK", pending: [] };
};

try {
  const plan = parsePlan(readFileSync(env.PLAN_FILE ?? "", "utf8"));
  const backup = evaluateBackup({ lastSuccessMs: await lastBackupSuccessMs({ fetchJson: gh, repo: env.GITHUB_REPOSITORY }), nowMs: Date.now() });
  const decision = decideAutoMigrate({ plan, backup });
  const result = await applyAndVerify({
    decision,
    runDeploy: async () => {
      const r = spawnSync("npx", ["prisma", "migrate", "deploy"], { stdio: "inherit", env: { ...env, MIGRATION_DATABASE_URL: env.OWNER_DATABASE_URL, OPSIQ_PRODUCTION_OPERATION: "migrate deploy" } });
      return { exitCode: r.status };
    },
    replan,
  });
  out("AUTO_MIGRATE", result.ok ? "OK" : "FAILED"); out("AUTO_MIGRATE_CODE", result.code);
  process.exit(result.ok ? 0 : 1);
} catch {
  out("AUTO_MIGRATE", "FAILED"); out("AUTO_MIGRATE_CODE", "ERROR");
  process.exit(1);
}
