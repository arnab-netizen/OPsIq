/**
 * Operator tool: delete every scheduled-backup artifact of the production backup
 * workflow, so a QuickBooks erasure is not recoverable from GitHub Actions
 * artifacts. Dry-run by default.
 *
 *   GITHUB_TOKEN=<fine-grained token: Actions read+write on this repo> \
 *     npx tsx scripts/privacy/purge-backup-artifacts.ts --repo <owner/repo> [--confirm PURGE-BACKUP-ARTIFACTS]
 *
 * It refuses to run while a backup workflow run is queued or in progress, deletes
 * the artifacts through the REST API, then re-lists to prove none remain, and
 * prints the evidence line to use for --attest-github-backup-artifacts. Take a
 * fresh backup afterwards (workflow_dispatch of scheduled-backup.yml): everything
 * before it is gone by design. It never touches the database.
 */
import {
  backupRunInProgress,
  liveArtifacts,
  selectBackupArtifactsToPurge,
  type BackupArtifactRef,
} from "../../src/services/privacy-erasure/backup-artifact-purge";

const API = "https://api.github.com";
const WORKFLOW_FILE = "scheduled-backup.yml";

function args(argv: string[]): Record<string, string> {
  const o: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) throw new Error(`unexpected argument: ${a}`);
    o[a.slice(2)] = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : "";
  }
  return o;
}

async function gh(token: string, method: string, path: string): Promise<unknown> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" },
  });
  if (res.status === 204) return null;
  if (!res.ok) throw new Error(`GitHub ${method} ${path} -> ${res.status}`);
  return res.json();
}

async function listArtifacts(token: string, repo: string): Promise<BackupArtifactRef[]> {
  const all: BackupArtifactRef[] = [];
  for (let page = 1; page < 200; page++) {
    const r = (await gh(token, "GET", `/repos/${repo}/actions/artifacts?per_page=100&page=${page}`)) as { artifacts: BackupArtifactRef[] };
    all.push(...r.artifacts);
    if (r.artifacts.length < 100) break;
  }
  return all;
}

async function main() {
  const o = args(process.argv.slice(2));
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error("GITHUB_TOKEN is required");
  const repo = o["repo"];
  if (!repo || !/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new Error("--repo <owner/repo> is required");

  const runs = (await gh(token, "GET", `/repos/${repo}/actions/workflows/${WORKFLOW_FILE}/runs?per_page=20`)) as { workflow_runs: { status: string | null }[] };
  if (backupRunInProgress(runs.workflow_runs)) {
    console.error("REFUSED: a scheduled-backup run is queued or in progress; it could upload a dump that still holds the data. Wait for it to finish, then re-run.");
    process.exitCode = 2;
    return;
  }

  const targets = liveArtifacts(selectBackupArtifactsToPurge(await listArtifacts(token, repo)));
  console.log(JSON.stringify({ mode: o["confirm"] === "PURGE-BACKUP-ARTIFACTS" ? "PURGE" : "DRY_RUN", artifacts: targets.map((a) => ({ id: a.id, name: a.name, created_at: a.created_at, size_in_bytes: a.size_in_bytes })) }, null, 2));
  if (o["confirm"] !== "PURGE-BACKUP-ARTIFACTS") {
    console.log("DRY RUN: nothing deleted. Re-run with --confirm PURGE-BACKUP-ARTIFACTS to delete exactly the artifacts listed above.");
    return;
  }
  for (const a of targets) await gh(token, "DELETE", `/repos/${repo}/actions/artifacts/${a.id}`);
  const remaining = liveArtifacts(selectBackupArtifactsToPurge(await listArtifacts(token, repo)));
  if (remaining.length > 0) {
    console.error(`GITHUB_BACKUP_ARTIFACTS_PURGE=FAIL remaining=${remaining.length}`);
    process.exitCode = 1;
    return;
  }
  console.log(`GITHUB_BACKUP_ARTIFACTS_PURGE=PASS deleted=${targets.length}`);
  console.log(`GITHUB_BACKUP_ARTIFACTS_PURGED_AT=${new Date().toISOString()}`);
  console.log("Next: run scheduled-backup.yml once (workflow_dispatch) so a post-erasure backup exists.");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
