#!/usr/bin/env tsx
/**
 * Release manifests computed from the checked-out RELEASE TREE (pure, no network, no secrets):
 *   migrationManifestSha256   sha256 over sorted `<migration folder>:<sha256(migration.sql)>` lines (the exact chain that ships);
 *   privilegeManifestSha256   sha256 over the runtime role's required privilege set derived from prisma/schema.prisma
 *                             (writable / read-only / denied tables), i.e. what the reconcile gate will enforce.
 * They are written next to the release SHA, tree and PR head in the evidence so a deployment can be compared to ONE bound record.
 */
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { RUNTIME_DENIED_TABLES, RUNTIME_READONLY_TABLES, readModeledTables, runtimeWritableTables } from "../../src/services/privacy-erasure/role-topology";

const sha256 = (s: string | Buffer) => createHash("sha256").update(s).digest("hex");

export function migrationManifest(dir: string): { lines: string[]; sha256: string } {
  const names = readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort();
  const lines = names.map((n) => { const f = join(dir, n, "migration.sql"); return `${n}:${existsSync(f) ? sha256(readFileSync(f)) : "MISSING"}`; });
  return { lines, sha256: sha256(lines.join("\n")) };
}

export function privilegeManifest(modeled: readonly string[] = readModeledTables()): { sha256: string; writable: number; readonly: number; denied: number } {
  const writable = [...runtimeWritableTables(modeled)].sort();
  const readonly = [...RUNTIME_READONLY_TABLES].sort();
  const denied = [...RUNTIME_DENIED_TABLES].sort();
  return { sha256: sha256(JSON.stringify({ writable, readonly, denied })), writable: writable.length, readonly: readonly.length, denied: denied.length };
}

if (process.argv[1] && /release-manifest\.ts$/.test(process.argv[1])) {
  const m = migrationManifest(resolve(process.cwd(), "prisma", "migrations"));
  const p = privilegeManifest();
  console.log(`MIGRATION_MANIFEST_SHA256=${m.sha256}`);
  console.log(`MIGRATION_COUNT=${m.lines.length}`);
  console.log(`PRIVILEGE_MANIFEST_SHA256=${p.sha256}`);
  console.log(`PRIVILEGE_TABLES=${p.writable}/${p.readonly}/${p.denied}`);
}
