#!/usr/bin/env node
/**
 * Exact-SHA production release state and bounded, DURABLE retry accounting (no Vercel token, no unpinned deploy).
 *
 * Mechanism: the Vercel project's Production Branch is `release/production` (one-time owner/operator setting). A release is a
 * FAST-FORWARD-ONLY advance of that branch to the approved SHA; Vercel builds exactly that commit as Production. The request is therefore
 * bound to the SHA by construction (the ref is the deployment source), main pushes only create previews (no premature production race), and
 * Vercel's own migration/role release gate still runs as defence in depth.
 *
 * Acceptance is NOT a build record: production is accepted only when the PUBLIC site (an approved origin) answers /api/health with
 * HTTP 200, database check healthy and `commit` EXACTLY equal to the release SHA, i.e. the deployment actually being served.
 *
 * Retry accounting is durable and independent of any provider record: each trigger first writes a git ref
 * `refs/release-attempts/<sha>/<epochMs>` (conservative: an interrupted run after the write still counts). At most MAX_ATTEMPTS per
 * RETRY_WINDOW_MS per SHA; the budget refills as old attempts age out, so recovery is automatic and a retry storm is impossible.
 */
import { fileURLToPath } from "node:url";

export const RELEASE_BRANCH = "release/production";
export const MAX_ATTEMPTS = 3;
export const RETRY_WINDOW_MS = 24 * 60 * 60 * 1000;
export const INFLIGHT_WINDOW_MS = 30 * 60 * 1000;
export const APPROVED_ORIGINS = ["https://opsiq.solutions", "https://www.opsiq.solutions", "https://o-ps-iq.vercel.app"];
const SHA_RE = /^[0-9a-f]{40}$/;
const INFLIGHT = new Set(["pending", "queued", "in_progress"]);

/** Authoritative environment identification: Vercel records production builds as environment "Production" exactly (never a substring match). */
export const isProductionDeployment = (d) => d?.environment === "Production" && d?.productionEnvironment !== false;

/** Public-site acceptance: exact SHA served, HTTP 200, database healthy. `health` = { status:number, body:object|null }. */
export function evaluateServed({ releaseSha, health }) {
  if (!SHA_RE.test(releaseSha ?? "")) return { served: false, code: "BAD_RELEASE_SHA" };
  if (!health || health.status !== 200 || !health.body || typeof health.body !== "object") return { served: false, code: "HEALTH_UNAVAILABLE" };
  const b = health.body;
  if (b.checks?.database?.status !== "healthy") return { served: false, code: "DATABASE_NOT_HEALTHY" };
  if (b.commit === null || b.commit === undefined) return { served: false, code: "COMMIT_NOT_REPORTED" };
  if (b.commit !== releaseSha) return { served: false, code: "OTHER_COMMIT_SERVED", servedCommit: String(b.commit).slice(0, 40) };
  return { served: true, code: "EXACT_SHA_SERVED_AND_HEALTHY" };
}

/**
 * @param {{ releaseSha: string, served: boolean, deployments: object[], attemptsMs: number[], nowMs: number }} p
 * NONE (accepted) | WAIT (a build is in flight) | TRIGGER | BLOCK.
 */
export function decideRelease({ releaseSha, served, deployments, attemptsMs, nowMs }) {
  if (!SHA_RE.test(releaseSha ?? "")) return { action: "BLOCK", code: "BAD_RELEASE_SHA" };
  if (served === true) return { action: "NONE", code: "EXACT_SHA_SERVED_AND_HEALTHY" };
  const inflight = (deployments ?? []).some((d) => d && d.sha === releaseSha && isProductionDeployment(d) && INFLIGHT.has(d.state) && nowMs - d.createdAtMs < INFLIGHT_WINDOW_MS);
  if (inflight) return { action: "WAIT", code: "PRODUCTION_BUILD_IN_FLIGHT" };
  const recent = (attemptsMs ?? []).filter((t) => Number.isFinite(t) && nowMs - t < RETRY_WINDOW_MS).sort((a, b) => a - b);
  if (recent.length >= MAX_ATTEMPTS) return { action: "BLOCK", code: "RETRY_BUDGET_EXHAUSTED", retryAfterMs: recent[recent.length - MAX_ATTEMPTS] + RETRY_WINDOW_MS - nowMs };
  return { action: "TRIGGER", code: recent.length > 0 ? "RETRY_AFTER_NOT_SERVED" : "FIRST_ATTEMPT", attemptsInWindow: recent.length };
}

/** Production deployments for a SHA from GitHub's Deployments API (informational: used only to avoid duplicate in-flight triggers). */
export async function collectDeployments({ fetchJson, repo, sha }) {
  const list = await fetchJson(`/repos/${repo}/deployments?sha=${sha}&per_page=100`);
  if (!Array.isArray(list)) throw new Error("unexpected deployments response");
  const out = [];
  for (const d of list) {
    if (d.sha !== sha) continue;
    const statuses = await fetchJson(`/repos/${repo}/deployments/${d.id}/statuses?per_page=1`);
    out.push({ sha: d.sha, environment: d.environment, productionEnvironment: d.production_environment, createdAtMs: Date.parse(d.created_at), state: Array.isArray(statuses) && statuses[0] ? statuses[0].state : "pending" });
  }
  return out;
}

/** Durable attempt timestamps for a SHA, from `refs/release-attempts/<sha>/<epochMs>`. Malformed refs are ignored; a bad response throws (fail closed). */
export async function collectAttempts({ fetchJson, repo, sha }) {
  const refs = await fetchJson(`/repos/${repo}/git/matching-refs/release-attempts/${sha}/`);
  if (!Array.isArray(refs)) throw new Error("unexpected refs response");
  const prefix = `refs/release-attempts/${sha}/`;
  return refs.map((r) => (typeof r.ref === "string" && r.ref.startsWith(prefix) ? Number(r.ref.slice(prefix.length)) : NaN)).filter((n) => Number.isInteger(n) && n > 0);
}

/** Writes the attempt BEFORE any trigger. Returns the epoch used. */
export async function recordAttempt({ postJson, repo, sha, nowMs }) {
  await postJson(`/repos/${repo}/git/refs`, { ref: `refs/release-attempts/${sha}/${nowMs}`, sha });
  return nowMs;
}

/**
 * Fast-forward-only advance of the release branch to `sha`. Returns { advanced:boolean, code }. Never forces: a non-descendant SHA (rollback,
 * diverged history) is BLOCKED for a human; an existing tip equal to `sha` means nothing to push (a retry then needs the branch deploy hook).
 */
export async function ensureReleaseBranch({ fetchJson, postJson, patchJson, repo, sha }) {
  let tip;
  try { tip = (await fetchJson(`/repos/${repo}/git/ref/heads/${RELEASE_BRANCH}`))?.object?.sha; } catch (e) { if (e && e.status === 404) tip = null; else throw e; }
  if (!tip) { await postJson(`/repos/${repo}/git/refs`, { ref: `refs/heads/${RELEASE_BRANCH}`, sha }); return { advanced: true, code: "BRANCH_CREATED_AT_RELEASE_SHA" }; }
  if (tip === sha) return { advanced: false, code: "BRANCH_ALREADY_AT_RELEASE_SHA" };
  const cmp = await fetchJson(`/repos/${repo}/compare/${tip}...${sha}`);
  if (cmp?.status !== "ahead") return { advanced: false, blocked: true, code: "NOT_A_FAST_FORWARD" };
  await patchJson(`/repos/${repo}/git/refs/heads/${RELEASE_BRANCH}`, { sha, force: false });
  return { advanced: true, code: "BRANCH_FAST_FORWARDED" };
}

const gh = (token) => async (method, path, body) => {
  const r = await fetch(`https://api.github.com${path}`, { method, redirect: "error", headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28", ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
  if (!r.ok) { const e = new Error(`github api ${r.status}`); e.status = r.status; throw e; }
  return r.status === 204 ? null : r.json();
};

export async function fetchHealth({ origin, fetchImpl = fetch }) {
  if (!APPROVED_ORIGINS.includes(origin)) throw new Error("origin not approved");
  const r = await fetchImpl(`${origin}/api/health`, { redirect: "error", signal: AbortSignal.timeout(15000) });
  let body = null; try { body = await r.json(); } catch { body = null; }
  return { status: r.status, body };
}

async function cli() {
  const [mode] = process.argv.slice(2);
  const { GITHUB_REPOSITORY: repo, GITHUB_TOKEN: token, RELEASE_SHA: sha, PUBLIC_ORIGIN: origin = "https://opsiq.solutions" } = process.env;
  const out = (k, v) => console.log(`${k}=${String(v).replace(/[^A-Za-z0-9_.:-]/g, "").slice(0, 80)}`);
  if (!repo || !token || !SHA_RE.test(sha ?? "")) { out("RELEASE_DECISION", "BLOCK"); out("RELEASE_CODE", "BAD_INPUT"); process.exit(1); }
  const g = gh(token);
  const fetchJson = (p) => g("GET", p), postJson = (p, b) => g("POST", p, b), patchJson = (p, b) => g("PATCH", p, b);
  try {
    let health = null;
    try { health = await fetchHealth({ origin }); } catch { health = null; }
    const ev = evaluateServed({ releaseSha: sha, health });
    if (mode === "verify") { out("SERVED", ev.served); out("RELEASE_CODE", ev.code); process.exit(ev.served ? 0 : 1); }
    const [deployments, attemptsMs] = await Promise.all([collectDeployments({ fetchJson, repo, sha }), collectAttempts({ fetchJson, repo, sha })]);
    const d = decideRelease({ releaseSha: sha, served: ev.served, deployments, attemptsMs, nowMs: Date.now() });
    out("RELEASE_DECISION", d.action); out("RELEASE_CODE", d.code);
    if (mode === "decide") process.exit(d.action === "BLOCK" ? 1 : 0);
    if (mode === "trigger") {
      if (d.action !== "TRIGGER") process.exit(d.action === "BLOCK" ? 1 : 0);
      await recordAttempt({ postJson, repo, sha, nowMs: Date.now() }); // durable BEFORE any trigger
      const b = await ensureReleaseBranch({ fetchJson, postJson, patchJson, repo, sha });
      out("BRANCH_CODE", b.code); out("HOOK_NEEDED", b.advanced ? "false" : "true");
      process.exit(b.blocked ? 1 : 0);
    }
  } catch {
    out("RELEASE_DECISION", "BLOCK"); out("RELEASE_CODE", "API_ERROR"); process.exit(1); // fail closed: never trigger on an ambiguous provider response
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) cli();
