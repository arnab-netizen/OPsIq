#!/usr/bin/env node
/**
 * Exact-SHA production deployment state from GitHub's Deployments API (Vercel's GitHub integration records every production build
 * there), plus a bounded redeploy decision. No Vercel token is needed and no secret is read by the pure functions.
 *
 *   decideRedeploy: NONE (already deployed), WAIT (a build is in flight), REDEPLOY (hook once), BLOCK (retry budget exhausted).
 * Bounded by construction: at most ONE hook trigger per scheduled run, and BLOCK after MAX_FAILURES_PER_SHA failed production builds of the
 * same SHA, which means the cause is not something a redeploy can fix and a human must look.
 */
import { fileURLToPath } from "node:url";

export const MAX_FAILURES_PER_SHA = 5;
export const INFLIGHT_WINDOW_MS = 30 * 60 * 1000;
const FAIL = new Set(["failure", "error"]);
const INFLIGHT = new Set(["pending", "queued", "in_progress"]);

const isProduction = (env) => /production/i.test(String(env ?? ""));

/** deployments: [{ sha, environment, createdAtMs, state }] (state = the latest status of that deployment). */
export function decideRedeploy({ releaseSha, deployments, nowMs }) {
  if (!/^[0-9a-f]{40}$/.test(releaseSha ?? "")) return { action: "BLOCK", code: "BAD_RELEASE_SHA" };
  const mine = (deployments ?? []).filter((d) => d && d.sha === releaseSha && isProduction(d.environment));
  if (mine.some((d) => d.state === "success")) return { action: "NONE", code: "ALREADY_DEPLOYED" };
  if (mine.some((d) => INFLIGHT.has(d.state) && nowMs - d.createdAtMs < INFLIGHT_WINDOW_MS)) return { action: "WAIT", code: "BUILD_IN_FLIGHT" };
  const failures = mine.filter((d) => FAIL.has(d.state)).length;
  if (failures >= MAX_FAILURES_PER_SHA) return { action: "BLOCK", code: "RETRY_BUDGET_EXHAUSTED" };
  return { action: "REDEPLOY", code: failures > 0 ? "PREVIOUS_BUILD_FAILED" : "NO_PRODUCTION_BUILD_RECORDED" };
}

/** Collects production deployments for a SHA with their latest status. `fetchJson(path)` is injected (tests) or uses GITHUB_TOKEN. */
export async function collectDeployments({ fetchJson, repo, sha }) {
  const list = await fetchJson(`/repos/${repo}/deployments?sha=${sha}&per_page=100`);
  if (!Array.isArray(list)) throw new Error("unexpected deployments response");
  const out = [];
  for (const d of list) {
    if (d.sha !== sha) continue;
    const statuses = await fetchJson(`/repos/${repo}/deployments/${d.id}/statuses?per_page=1`);
    out.push({ sha: d.sha, environment: d.environment, createdAtMs: Date.parse(d.created_at), state: Array.isArray(statuses) && statuses[0] ? statuses[0].state : "pending" });
  }
  return out;
}

async function cli() {
  const [mode] = process.argv.slice(2);
  const repo = process.env.GITHUB_REPOSITORY;
  const token = process.env.GITHUB_TOKEN;
  const sha = process.env.RELEASE_SHA;
  if (!repo || !token || !/^[0-9a-f]{40}$/.test(sha ?? "")) { console.log("DEPLOY_DECISION=BLOCK"); console.log("DEPLOY_DECISION_CODE=BAD_INPUT"); process.exit(1); }
  const fetchJson = async (path) => {
    const r = await fetch(`https://api.github.com${path}`, { headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28" }, redirect: "error" });
    if (!r.ok) throw new Error(`github api ${r.status}`);
    return r.json();
  };
  const deployments = await collectDeployments({ fetchJson, repo, sha });
  const d = decideRedeploy({ releaseSha: sha, deployments, nowMs: Date.now() });
  console.log(`DEPLOY_DECISION=${d.action}`);
  console.log(`DEPLOY_DECISION_CODE=${d.code}`);
  // verify mode: success only when THIS exact SHA has a successful production deployment.
  if (mode === "verify") process.exit(d.action === "NONE" ? 0 : 1);
  process.exit(d.action === "BLOCK" ? 1 : 0);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) cli().catch(() => { console.log("DEPLOY_DECISION=BLOCK"); console.log("DEPLOY_DECISION_CODE=API_ERROR"); process.exit(1); });
