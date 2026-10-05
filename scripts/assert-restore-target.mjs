#!/usr/bin/env node
/**
 * Preflight called by scripts/restore-database.sh right after its backup-file check — before the script inspects
 * DATABASE_URL, runs any database client, or decompresses or writes anything.
 * Exit 0 only for a proven local (loopback) or approved staging restore target. Prints `RESTORE_TARGET=<target>`
 * or a sanitized refusal code — never a URL, host, user, password or database name. Opens no database connection.
 */
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { assessRestoreTarget } from "./lib/restore-target.mjs";

const verdict = assessRestoreTarget(process.env);
if (!verdict.ok) {
  console.error(`RESTORE_REFUSED ${verdict.code}: ${verdict.message}`);
  process.exit(1);
}
if (verdict.needsStagingValidator) {
  // The canonical staging validator — the same function every other staging mutation uses. No URL parsing in this file.
  const here = dirname(fileURLToPath(import.meta.url));
  const r = spawnSync("npx", ["tsx", join(here, "assert-approved-staging-database.ts"), "DATABASE_URL"], {
    env: process.env,
    stdio: ["ignore", "inherit", "inherit"],
  });
  if (r.status !== 0) {
    console.error("RESTORE_REFUSED STAGING_TARGET_NOT_VERIFIED: the staging restore target could not be positively verified. No write was attempted.");
    process.exit(1);
  }
}
console.log(verdict.message);
