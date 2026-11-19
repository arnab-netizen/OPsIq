#!/usr/bin/env node
/**
 * Phase 2: automatic, ordered application of pending migrations, fail closed. Pure orchestration (tested); the privileged commands
 * (`prisma migrate deploy`, the read-only ledger plan) are injected by the caller.
 *
 * Preconditions (all must hold or NOTHING is applied):
 *   - the ledger plan (release-plan.mjs) is MIGRATE: every pending migration is on the allowlist (additive shapes only). BLOCK (failed/modified/
 *     out-of-order/unknown/destructive/incompatible) and any ambiguity never auto-applies and needs explicit human authorization;
 *   - a VERIFIED BACKUP is fresh (BACKUP_MAX_AGE_MS): applying schema changes without a recoverable backup is refused;
 *   - exactly the planned set is applied, in ascending name order (Prisma's own order); afterwards the ledger plan must be NOOP, so a partial
 *     or interrupted application is detected and fails the run (the next run re-plans from the ledger and resumes safely).
 * The allowlist is a policy filter, not a compatibility proof: compatibility with the currently deployed application is still the author's
 * and reviewer's responsibility (expand/contract), and destructive/incompatible changes keep their explicit-authorization path.
 */
export const BACKUP_MAX_AGE_MS = 36 * 60 * 60 * 1000;
const NAME_RE = /^\d{8,14}_[A-Za-z0-9_]+$/;

export function evaluateBackup({ lastSuccessMs, nowMs }) {
  if (!Number.isFinite(lastSuccessMs)) return { fresh: false, code: "NO_VERIFIED_BACKUP_RECORDED" };
  if (nowMs - lastSuccessMs > BACKUP_MAX_AGE_MS) return { fresh: false, code: "BACKUP_STALE" };
  return { fresh: true, code: "BACKUP_FRESH" };
}

/** Latest successful run of the encrypted backup workflow on main (GitHub Actions API). Throws on a bad response (fail closed). */
export async function lastBackupSuccessMs({ fetchJson, repo }) {
  const r = await fetchJson(`/repos/${repo}/actions/workflows/scheduled-backup-r2.yml/runs?branch=main&status=success&per_page=1`);
  if (!r || !Array.isArray(r.workflow_runs)) throw new Error("unexpected runs response");
  const run = r.workflow_runs[0];
  return run ? Date.parse(run.updated_at ?? run.created_at) : NaN;
}

/** @returns {{ proceed: boolean, code: string, pending: string[], fail: boolean }} */
export function decideAutoMigrate({ plan, backup }) {
  const no = (code, fail = true) => ({ proceed: false, code, pending: [], fail });
  if (!plan || !["NOOP", "MIGRATE", "BLOCK"].includes(plan.action)) return no("PLAN_UNAVAILABLE");
  if (plan.action === "NOOP") return no("NOTHING_PENDING", false);
  if (plan.action === "BLOCK") return no("PLAN_BLOCKED_NEEDS_HUMAN_AUTHORIZATION");
  const pending = plan.pending ?? [];
  if (!Array.isArray(pending) || pending.length === 0 || pending.some((n) => !NAME_RE.test(n)) || new Set(pending).size !== pending.length) return no("PLAN_INCONSISTENT");
  if (pending.join("\n") !== [...pending].sort().join("\n")) return no("PLAN_NOT_IN_ORDER");
  if (!backup?.fresh) return no(backup?.code ?? "NO_VERIFIED_BACKUP_RECORDED");
  return { proceed: true, code: "AUTO_MIGRATE_ALLOWED", pending, fail: false };
}

/**
 * @param {{ decision: ReturnType<typeof decideAutoMigrate>, runDeploy: () => Promise<{exitCode:number|null}>, replan: () => Promise<{action:string, pending:string[]}> }} p
 */
export async function applyAndVerify({ decision, runDeploy, replan }) {
  if (!decision.proceed) return { ok: !decision.fail, code: decision.code, applied: [] };
  const r = await runDeploy();
  if (r.exitCode !== 0) return { ok: false, code: "MIGRATE_DEPLOY_FAILED", applied: [] };
  const after = await replan();
  if (after.action !== "NOOP") return { ok: false, code: "LEDGER_NOT_CURRENT_AFTER_DEPLOY", applied: [], remaining: after.pending ?? [] };
  return { ok: true, code: "MIGRATIONS_APPLIED_AND_VERIFIED", applied: decision.pending };
}
