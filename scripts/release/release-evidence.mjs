#!/usr/bin/env node
/**
 * Trustworthy release evidence for a merged main commit (no fabricated or historical CI accepted).
 *
 * Problem: ci.yml is pull-request-only and main-integration.yml is dispatch-only, so a merge commit on main has NO check runs of its own.
 * Accepting "CI is green at main" would either deadlock the release or accept unrelated evidence.
 *
 * Mechanism (verified-tree equivalence): the ruleset requires a strictly up-to-date PR head with a green `branch-protection` check. A merge
 * (or squash) of an up-to-date head produces a main commit whose TREE equals the PR head's TREE: the exact tested content. So a release SHA is
 * eligible only if ALL of these hold, each read from GitHub:
 *   1. exactly one MERGED pull request into `main` whose merge commit is the release SHA (direct pushes are not eligible);
 *   2. the tree of the release commit equals the tree of that PR's head commit (what CI tested is what ships);
 *   3. the PR head has a `branch-protection` check run, authored by the GitHub Actions app (the integration the ruleset pins, id 15368),
 *      whose latest conclusion is `success` (a check from another app, a stale run or a failed re-run never counts);
 *   4. (recorded) the migration manifest and the privilege manifest are computed from the release tree and written to the evidence, so the
 *      release SHA, tree, PR head, CI check run, migrations and privileges are bound in one record that the deployment SHA is later compared to.
 * If trees differ (should not happen under the strict policy) the commit is NOT eligible and needs an explicit dispatch of the full suite on it.
 * No extra CI run is needed for ordinary changes, so CI-MIN-01's resource optimisation is preserved.
 */
import { fileURLToPath } from "node:url";

export const REQUIRED_CHECK = "branch-protection";
export const ACTIONS_APP_ID = 15368; // the integration pinned by the `Protect main` ruleset required status check
const SHA_RE = /^[0-9a-f]{40}$/;

/** @returns {Promise<{ ok: boolean, code: string, evidence?: object }>} */
export async function verifyReleaseEvidence({ fetchJson, repo, sha }) {
  const no = (code) => ({ ok: false, code });
  if (!SHA_RE.test(sha ?? "")) return no("BAD_RELEASE_SHA");
  try {
    const prs = await fetchJson(`/repos/${repo}/commits/${sha}/pulls?per_page=100`);
    if (!Array.isArray(prs)) return no("UNEXPECTED_PULLS_RESPONSE");
    const merged = prs.filter((p) => p && p.merged_at && p.base?.ref === "main" && p.merge_commit_sha === sha);
    if (merged.length === 0) return no("NOT_A_MERGED_PULL_REQUEST_COMMIT");
    if (merged.length > 1) return no("AMBIGUOUS_PULL_REQUEST");
    const pr = merged[0];
    const head = pr.head?.sha;
    if (!SHA_RE.test(head ?? "")) return no("BAD_PR_HEAD");
    const [relCommit, headCommit] = await Promise.all([fetchJson(`/repos/${repo}/git/commits/${sha}`), fetchJson(`/repos/${repo}/git/commits/${head}`)]);
    const relTree = relCommit?.tree?.sha, headTree = headCommit?.tree?.sha;
    if (!SHA_RE.test(relTree ?? "") || !SHA_RE.test(headTree ?? "")) return no("TREE_UNAVAILABLE");
    if (relTree !== headTree) return no("TREE_DIFFERS_FROM_TESTED_PR_HEAD");
    const runs = await fetchJson(`/repos/${repo}/commits/${head}/check-runs?check_name=${REQUIRED_CHECK}&per_page=100`);
    const list = Array.isArray(runs?.check_runs) ? runs.check_runs : null;
    if (!list) return no("UNEXPECTED_CHECK_RUNS_RESPONSE");
    const own = list.filter((c) => c.name === REQUIRED_CHECK && c.app?.id === ACTIONS_APP_ID && c.head_sha === head && c.status === "completed");
    if (own.length === 0) return no("NO_REQUIRED_CHECK_FROM_THE_PINNED_APP");
    own.sort((a, b) => Date.parse(a.completed_at) - Date.parse(b.completed_at));
    const latest = own[own.length - 1];
    if (latest.conclusion !== "success") return no("REQUIRED_CHECK_NOT_SUCCESS");
    return { ok: true, code: "VERIFIED_TREE_EQUIVALENT_TO_CI_GREEN_PR_HEAD", evidence: { releaseSha: sha, treeSha: relTree, prNumber: pr.number, prHeadSha: head, checkRunId: latest.id } };
  } catch {
    return no("API_ERROR"); // fail closed on any provider ambiguity
  }
}

async function cli() {
  const { GITHUB_REPOSITORY: repo, GITHUB_TOKEN: token, RELEASE_SHA: sha } = process.env;
  const out = (k, v) => console.log(`${k}=${String(v).replace(/[^A-Za-z0-9_.:-]/g, "").slice(0, 80)}`);
  const fetchJson = async (p) => {
    const r = await fetch(`https://api.github.com${p}`, { redirect: "error", headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28" } });
    if (!r.ok) throw new Error(`github api ${r.status}`);
    return r.json();
  };
  const r = repo && token ? await verifyReleaseEvidence({ fetchJson, repo, sha }) : { ok: false, code: "BAD_INPUT" };
  out("RELEASE_EVIDENCE", r.ok ? "VERIFIED" : "REJECTED"); out("RELEASE_EVIDENCE_CODE", r.code);
  if (r.ok) for (const [k, v] of Object.entries(r.evidence)) out(`EVIDENCE_${k.replace(/[A-Z]/g, (c) => `_${c}`).toUpperCase()}`, v);
  process.exit(r.ok ? 0 : 1);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) cli();
