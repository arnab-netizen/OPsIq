/**
 * Production paywall release tooling (pure logic + injectable I/O).
 *
 * Two commands share this library:
 *   npm run billing:paywall:enable  -- --expected-main-sha=<40-hex> --confirm="ENABLE PRODUCTION PAYWALL" [--dry-run]
 *   npm run billing:paywall:disable -- --expected-main-sha=<40-hex> --confirm="DISABLE PRODUCTION PAYWALL" [--dry-run]
 *
 * Contract
 *  - Exactly two Production mutations, in this order, and nothing else:
 *      1. set BILLING_PAYWALL_ENFORCEMENT on the Production target ONLY ("on" / "off");
 *      2. create a Production deployment of the EXACT Git commit via the Vercel deployments API
 *         with a gitSource (type github, ref main, sha <expected>). Local files are never uploaded,
 *         so a dirty or divergent working tree cannot reach Production (LOCAL_TREE_DEPLOY_RISK=NO).
 *    If step 2 fails after step 1, step 1 is COMPENSATED and the compensation is VERIFIED by reading the flag back:
 *      - flag existed  -> restored to its exact previous value;
 *      - flag was absent -> the newly created Production record is deleted (verified absent), or, if deletion
 *        cannot be verified, set to "off" (verified). A latent "on" is never left behind: if neither can be
 *        verified the tool exits 3 with UNCOMPENSATED_DANGER and never prints a success message.
 *    (disable never re-enables: if its deploy fails the flag stays "off", the safe direction, and a redeploy is demanded.)
 *
 * Vercel wire model (verified against the current REST reference): list GET /v10/projects/{id}/env, create
 * POST /v10/projects/{id}/env, edit PATCH /v9/projects/{id}/env/{id}, delete DELETE /v9/projects/{id}/env/{keyOrId},
 * read one GET /v1/projects/{id}/env/{id}, deployments POST /v13/deployments. Variable `type` is one of
 * system | encrypted | plain | sensitive. The 2026 "Config" variable is the readable, encrypted-at-rest kind and is
 * represented on the wire as type "encrypted" (response visibility "config"); "Secret" is type "sensitive"
 * (visibility "secret", write-only). BILLING_PAYWALL_ENFORCEMENT is configuration, so "encrypted" is correct and it
 * is deliberately NOT sensitive: the tool must be able to read it back to verify state.
 *  - It never touches Paddle, the database, subscriptions or billing records. Database access, when
 *    present, is a single READ ONLY transaction used only by the "plan seeded" preflight.
 *  - Every preflight fails closed. A dry run performs the same read-only preflights, performs ZERO
 *    mutations, and prints the exact requests it would send (never a token).
 *  - Secrets (VERCEL_TOKEN, DATABASE_URL, Paddle keys) are read from the environment of the single
 *    process, never written to disk or printed; all output passes through redact().
 */
import { existsSync, readFileSync } from "node:fs";

export const FLAG = "BILLING_PAYWALL_ENFORCEMENT";
export const EXPECTED_REPO = { org: "arnab-netizen", repo: "OPsIq" };
export const PROJECT_ID = "prj_LzPZ9kyIq2nna8F6MZtpt7MZUZTb";
export const PROJECT_NAME = "o-ps-iq";
export const TEAM_SLUG = "opsiq-s-projects";
/** The one approved OpsIQ Production origin. Not caller-suppliable: a mistyped or hostile URL must never satisfy
 *  the Production health / readiness / build-info checks. */
export const PRODUCTION_ORIGIN = "https://opsiq.solutions";
export const PRODUCTION_HOST = "opsiq.solutions";
export const EXPECTED_PRODUCTION_DB_HOST = "ep-empty-sky-ay1e6c27.c-5.us-east-2.aws.neon.tech";
export const CONFIRM = { enable: "ENABLE PRODUCTION PAYWALL", disable: "DISABLE PRODUCTION PAYWALL" };
export const REQUIRED_COMMERCIAL_ENV = ["PADDLE_ENV", "PADDLE_API_KEY", "PADDLE_PRICE_ID", "PADDLE_WEBHOOK_SECRET", "PADDLE_CLIENT_TOKEN"];
export const VERCEL_API = "https://api.vercel.com";
const SHA_RE = /^[0-9a-f]{40}$/;

/* ───────────────────────── argument handling ───────────────────────── */

export function parseArgs(argv) {
  const out = { dryRun: false };
  for (const a of argv) {
    if (a === "--dry-run") out.dryRun = true;
    else if (a.startsWith("--expected-main-sha=")) out.expectedSha = a.slice("--expected-main-sha=".length);
    else if (a.startsWith("--confirm=")) out.confirm = a.slice("--confirm=".length);
    else if (a.startsWith("--manifest=")) out.manifest = a.slice("--manifest=".length);
    else if (a.startsWith("--production-url=")) out.productionUrl = a.slice("--production-url=".length).replace(/\/+$/, "");
    else out.unknown = [...(out.unknown ?? []), a];
  }
  return out;
}

export function validateArgs(mode, args) {
  const errors = [];
  if (mode !== "enable" && mode !== "disable") errors.push("mode must be enable or disable");
  if (!args.expectedSha || !SHA_RE.test(args.expectedSha)) errors.push("--expected-main-sha must be a full 40-character lowercase hex commit SHA");
  if (args.confirm !== CONFIRM[mode]) errors.push(`--confirm must be exactly "${CONFIRM[mode]}"`);
  if (args.productionUrl !== undefined && args.productionUrl !== PRODUCTION_ORIGIN) errors.push(`--production-url, if given, must be exactly ${PRODUCTION_ORIGIN} (the origin is pinned and not caller-suppliable)`);
  if (mode === "enable" && !args.manifest) errors.push("--manifest=<path> (auditable Paddle approval manifest) is required to enable");
  if (args.unknown?.length) errors.push(`unknown arguments: ${args.unknown.join(" ")}`);
  return errors;
}

/* ───────────────────────── manifest ───────────────────────── */

/** Auditable record of the manual Paddle approval. Pure validation; no I/O. */
export function validateManifest(m, { expectedSha }) {
  const errors = [];
  if (!m || typeof m !== "object") return ["manifest is not an object"];
  const nonEmpty = (v) => typeof v === "string" && v.trim().length > 0;
  if (m.paddleDomainApproved !== true) errors.push("paddleDomainApproved must be true (Paddle live approval is manual)");
  if (!nonEmpty(m.paddleApprovalEvidence)) errors.push("paddleApprovalEvidence (reference to the approval email/ticket) is required");
  if (!nonEmpty(m.approvedBy)) errors.push("approvedBy is required");
  if (!nonEmpty(m.approvedAt) || Number.isNaN(Date.parse(m.approvedAt))) errors.push("approvedAt must be an ISO timestamp");
  if (m.expectedMainSha !== expectedSha) errors.push("manifest expectedMainSha does not equal --expected-main-sha");
  if (!nonEmpty(m.livePriceId) || !/^pri_[a-z0-9]+$/i.test(m.livePriceId)) errors.push("livePriceId must be a Paddle price id (pri_...)");
  if (m.ownerDecisionsResolved !== true) errors.push("ownerDecisionsResolved must be true (see PAYWALL_BOUNDARY.md section 7)");
  if (!Array.isArray(m.knownReleaseBlockers) || m.knownReleaseBlockers.length !== 0) errors.push("knownReleaseBlockers must be an empty array");
  return errors;
}

/* ───────────────────────── requests (pure) ───────────────────────── */

export function teamQuery(teamSlug) {
  return `slug=${encodeURIComponent(teamSlug)}`;
}

export function buildEnvRequest({ projectId, teamSlug, existing, value }) {
  if (existing) {
    // Edit keeps the record's own type (so a plain/encrypted record stays what it was) and pins the target.
    return { method: "PATCH", path: `/v9/projects/${projectId}/env/${existing.id}?${teamQuery(teamSlug)}`, body: { value, target: ["production"] } };
  }
  // "encrypted" == Config (readable, encrypted at rest); never "sensitive" (write-only) for this flag.
  const body = { key: FLAG, value, type: "encrypted", target: ["production"], comment: "OpsIQ paywall enforcement switch (managed by billing:paywall:enable|disable)" };
  return { method: "POST", path: `/v10/projects/${projectId}/env?${teamQuery(teamSlug)}`, body };
}

export function buildEnvDeleteRequest({ projectId, teamSlug, id }) {
  return { method: "DELETE", path: `/v9/projects/${projectId}/env/${id}?${teamQuery(teamSlug)}` };
}

export function buildDeploymentRequest({ projectId, teamSlug, sha }) {
  return {
    method: "POST",
    path: `/v13/deployments?${teamQuery(teamSlug)}&forceNew=1&skipAutoDetectionConfirmation=1`,
    body: {
      name: PROJECT_NAME,
      project: projectId,
      target: "production",
      gitSource: { type: "github", org: EXPECTED_REPO.org, repo: EXPECTED_REPO.repo, ref: "main", sha },
      meta: { paywallRelease: "true" },
    },
  };
}

export function redact(text, secrets) {
  let out = String(text);
  for (const s of secrets) if (s && s.length >= 6) out = out.split(s).join("[redacted]");
  return out.replace(/postgres(ql)?:\/\/\S+/gi, "[redacted-url]").replace(/Bearer\s+\S+/gi, "Bearer [redacted]");
}

/* ───────────────────────── preflights ───────────────────────── */

const pass = (id, detail) => ({ id, status: "PASS", detail });
const fail = (id, detail) => ({ id, status: "FAIL", detail });
const skip = (id, detail) => ({ id, status: "SKIPPED", detail });

/** io: { git(args)->string, readFile(path)->string|null, http(url,opts)->{status,text}, vercel(method,path,body)->{status,json}, env, db(query)->rows|null } */
export async function runPreflights(mode, args, io) {
  const results = [];
  const add = (r) => results.push(r);
  const dry = args.dryRun;
  const step = async (id, fn) => {
    try {
      add(await fn());
    } catch (e) {
      add(fail(id, `error: ${e?.message ?? e}`));
    }
  };
  const projectId = PROJECT_ID;
  const teamSlug = TEAM_SLUG;
  const hasToken = Boolean(io.env.VERCEL_TOKEN);
  const needVercel = (id) => (hasToken ? null : dry ? skip(id, "VERCEL_TOKEN not set: skipped in dry-run, FAILS a real run") : fail(id, "VERCEL_TOKEN not set"));

  await step("1 repository identity", async () => {
    const url = io.git(["remote", "get-url", "origin"]).trim();
    const ok = new RegExp(`github\\.com[/:]${EXPECTED_REPO.org}/${EXPECTED_REPO.repo}(\\.git)?$`, "i").test(url);
    return ok ? pass("1 repository identity", `origin is ${EXPECTED_REPO.org}/${EXPECTED_REPO.repo}`) : fail("1 repository identity", "origin is not the OpsIQ repository");
  });
  await step("2 clean working tree", async () => {
    const s = io.git(["status", "--porcelain"]).trim();
    return s === "" ? pass("2 clean working tree", "clean") : fail("2 clean working tree", "uncommitted changes present");
  });
  await step("3 origin/main matches expected SHA", async () => {
    io.git(["fetch", "origin", "main"]);
    const head = io.git(["rev-parse", "HEAD"]).trim();
    if (mode === "enable") {
      const remote = io.git(["rev-parse", "origin/main"]).trim();
      if (remote !== args.expectedSha) return fail("3 origin/main matches expected SHA", `origin/main is ${remote}, expected ${args.expectedSha}`);
      if (head !== args.expectedSha) return fail("3 origin/main matches expected SHA", `local HEAD ${head} is not the expected SHA`);
      return pass("3 origin/main matches expected SHA", args.expectedSha);
    }
    // Rollback target need not be the tip of main, but must be a commit already on main.
    try {
      io.git(["merge-base", "--is-ancestor", args.expectedSha, "origin/main"]);
      return pass("3 origin/main matches expected SHA", "expected SHA is on origin/main");
    } catch {
      return fail("3 origin/main matches expected SHA", "expected SHA is not reachable from origin/main");
    }
  });

  const vercelEnvs = { list: null };
  await step("4 Vercel project identity and reachability", async () => {
    const id4 = "4 Vercel project identity and reachability";
    const miss = needVercel(id4);
    if (miss) return miss;
    // The target must PROVE it is the OpsIQ Production project before anything is read or written.
    const pr = await io.vercel("GET", `/v9/projects/${projectId}?${teamQuery(teamSlug)}`);
    if (pr.status !== 200) return fail(id4, `project metadata returned HTTP ${pr.status}`);
    const pj = pr.json ?? {};
    const link = pj.link ?? {};
    const problems = [];
    if (pj.id !== projectId) problems.push("project id mismatch");
    if (pj.name !== PROJECT_NAME) problems.push("project name mismatch");
    if (link.type !== "github" || String(link.org ?? "").toLowerCase() !== EXPECTED_REPO.org.toLowerCase() || String(link.repo ?? "").toLowerCase() !== EXPECTED_REPO.repo.toLowerCase()) problems.push("linked Git repository mismatch");
    const dr = await io.vercel("GET", `/v9/projects/${projectId}/domains?production=true&${teamQuery(teamSlug)}`);
    const domains = dr.status === 200 ? (dr.json?.domains ?? []) : [];
    if (!domains.some((d) => d.name === PRODUCTION_HOST && d.verified === true)) problems.push(`${PRODUCTION_HOST} is not a verified Production domain of this project`);
    if (problems.length) return fail(id4, problems.join("; "));
    const r = await io.vercel("GET", `/v10/projects/${projectId}/env?${teamQuery(teamSlug)}`);
    if (r.status !== 200) return fail(id4, `env list returned HTTP ${r.status}`);
    vercelEnvs.list = r.json?.envs ?? [];
    return pass(id4, `${PROJECT_NAME} (${projectId}) linked to ${EXPECTED_REPO.org}/${EXPECTED_REPO.repo}, ${PRODUCTION_HOST} is a Production domain; ${vercelEnvs.list.length} environment variable records`);
  });
  const prodEnv = (key) => (vercelEnvs.list ?? []).filter((e) => e.key === key && (e.target ?? []).includes("production"));
  const readEnvValue = async (record) => {
    const r = await io.vercel("GET", `/v1/projects/${projectId}/env/${record.id}?${teamQuery(teamSlug)}`);
    return r.status === 200 ? String(r.json?.value ?? "") : null;
  };

  await step("5 flag state and scope", async () => {
    if (!vercelEnvs.list) return needVercel("5 flag state and scope") ?? fail("5 flag state and scope", "env list unavailable");
    const all = vercelEnvs.list.filter((e) => e.key === FLAG);
    if (all.some((e) => (e.target ?? []).some((t) => t !== "production"))) return fail("5 flag state and scope", `${FLAG} exists on a non-production target; refusing to guess`);
    if (all.length > 1) return fail("5 flag state and scope", `${FLAG} has multiple records`);
    let current = "(unset)";
    if (all[0]) {
      const v = await readEnvValue(all[0]);
      if (v === null) return fail("5 flag state and scope", "could not read current value");
      current = v;
    }
    io.state.flagRecord = all[0] ?? null;
    io.state.previousValue = current;
    if (mode === "enable") return current === "on" ? fail("5 flag state and scope", "paywall is already ON in Production") : pass("5 flag state and scope", `currently ${current}`);
    return current === "on" ? pass("5 flag state and scope", "currently ON; disable will turn it off") : fail("5 flag state and scope", `currently ${current}; nothing to disable`);
  });

  if (mode === "enable") {
    await step("6 production health", async () => {
      const r = await io.http(`${PRODUCTION_ORIGIN}/api/health`);
      return r.status === 200 ? pass("6 production health", "HTTP 200") : fail("6 production health", `HTTP ${r.status}`);
    });
    await step("7 production readiness and schema current", async () => {
      // /api/readiness computes is_ready = startup complete AND migration history current AND database/queue healthy
      // (see src/app/api/readiness/route.ts); the migration detail itself is logged, not exposed, so is_ready is the signal.
      const r = await io.http(`${PRODUCTION_ORIGIN}/api/readiness`);
      let j = {};
      try { j = JSON.parse(r.text); } catch { /* fail below */ }
      return r.status === 200 && j.is_ready === true && j.startup_complete === true && j.database_healthy === true
        ? pass("7 production readiness and schema current", "ready (includes migration history current)")
        : fail("7 production readiness and schema current", `HTTP ${r.status}, is_ready=${j.is_ready}, startup_complete=${j.startup_complete}, database_healthy=${j.database_healthy}`);
    });
    await step("8 deployment corresponds to expected SHA", async () => {
      const r = await io.http(`${PRODUCTION_ORIGIN}/api/internal/build-info`);
      let j = {};
      try { j = JSON.parse(r.text); } catch { /* fail below */ }
      return j.commit === args.expectedSha && j.environment === "production"
        ? pass("8 deployment corresponds to expected SHA", "serving the expected commit")
        : fail("8 deployment corresponds to expected SHA", `serving ${String(j.commit).slice(0, 12)} (${j.environment}), expected ${args.expectedSha.slice(0, 12)}`);
    });
    await step("9 pricing no longer 'to be announced'", async () => {
      const r = await io.http(`${PRODUCTION_ORIGIN}/pricing`);
      return r.status === 200 && !/to be announced/i.test(r.text) ? pass("9 pricing no longer 'to be announced'", "price published") : fail("9 pricing no longer 'to be announced'", "pricing page still says the price is to be announced");
    });
    await step("10 /pay is available", async () => {
      const r = await io.http(`${PRODUCTION_ORIGIN}/pay`);
      return r.status === 200 && !/Payments are not available right now/i.test(r.text) ? pass("10 /pay is available", "checkout page available") : fail("10 /pay is available", "checkout page reports payments unavailable");
    });
    await step("11 commercial config present", async () => {
      if (!vercelEnvs.list) return needVercel("11 commercial config present") ?? fail("11 commercial config present", "env list unavailable");
      const missing = REQUIRED_COMMERCIAL_ENV.filter((k) => prodEnv(k).length === 0);
      return missing.length === 0 ? pass("11 commercial config present", "all required keys set for Production") : fail("11 commercial config present", `missing for Production: ${missing.join(", ")}`);
    });
    let manifest = null;
    await step("12 Paddle approval manifest", async () => {
      const raw = io.readFile(args.manifest);
      if (raw === null) return fail("12 Paddle approval manifest", "manifest file not found");
      manifest = JSON.parse(raw);
      const errs = validateManifest(manifest, { expectedSha: args.expectedSha });
      return errs.length === 0 ? pass("12 Paddle approval manifest", `approved by ${manifest.approvedBy} at ${manifest.approvedAt}`) : fail("12 Paddle approval manifest", errs.join("; "));
    });
    await step("13 PADDLE_ENV is live", async () => {
      const rec = prodEnv("PADDLE_ENV")[0];
      if (!rec) return needVercel("13 PADDLE_ENV is live") ?? fail("13 PADDLE_ENV is live", "PADDLE_ENV not set for Production");
      const v = await readEnvValue(rec);
      return v === "live" || v === "production" ? pass("13 PADDLE_ENV is live", "live") : fail("13 PADDLE_ENV is live", "PADDLE_ENV is not live");
    });
    await step("14 live PADDLE_PRICE_ID matches the approved price", async () => {
      const rec = prodEnv("PADDLE_PRICE_ID")[0];
      if (!rec) return needVercel("14 live PADDLE_PRICE_ID matches the approved price") ?? fail("14 live PADDLE_PRICE_ID matches the approved price", "PADDLE_PRICE_ID not set for Production");
      const v = (await readEnvValue(rec))?.trim();
      if (!v || !/^pri_[a-z0-9]+$/i.test(v)) return fail("14 live PADDLE_PRICE_ID matches the approved price", "value is not a Paddle price id");
      if (!manifest || v !== manifest.livePriceId) return fail("14 live PADDLE_PRICE_ID matches the approved price", "Production price id differs from the manifest's livePriceId");
      return pass("14 live PADDLE_PRICE_ID matches the approved price", "matches manifest");
    });
    await step("15 Plan seeded for the live price", async () => {
      if (!io.env.DATABASE_URL) return dry ? skip("15 Plan seeded for the live price", "DATABASE_URL not provided: skipped in dry-run, FAILS a real run") : fail("15 Plan seeded for the live price", "DATABASE_URL (read-only check) not provided");
      if (new URL(io.env.DATABASE_URL).hostname !== EXPECTED_PRODUCTION_DB_HOST) return fail("15 Plan seeded for the live price", "DATABASE_URL host is not the Production database");
      if (!manifest) return fail("15 Plan seeded for the live price", "manifest unavailable");
      const rows = await io.db(manifest.livePriceId);
      return Array.isArray(rows) && rows.length === 1 && rows[0].active === true ? pass("15 Plan seeded for the live price", "exactly one active plan carries the live price id") : fail("15 Plan seeded for the live price", "no single active plan for the live price id");
    });
    await step("16 no known release blocker in the repository", async () => {
      const raw = io.readFile("docs/opsiq/commercial/RELEASE_BLOCKERS.json");
      if (raw === null) return fail("16 no known release blocker in the repository", "RELEASE_BLOCKERS.json missing");
      const open = JSON.parse(raw).open ?? [];
      return open.length === 0 ? pass("16 no known release blocker in the repository", "none open") : fail("16 no known release blocker in the repository", `${open.length} open: ${open.join("; ")}`);
    });
  }
  return results;
}

export function summarize(results) {
  const failed = results.filter((r) => r.status === "FAIL");
  const skipped = results.filter((r) => r.status === "SKIPPED");
  return { failed, skipped, ok: failed.length === 0 };
}

/* ───────────────────────── execution ───────────────────────── */

export function plannedMutations(mode, args, io) {
  const projectId = PROJECT_ID;
  const teamSlug = TEAM_SLUG;
  const value = mode === "enable" ? "on" : "off";
  return [
    buildEnvRequest({ projectId, teamSlug, existing: io.state.flagRecord ?? null, value }),
    buildDeploymentRequest({ projectId, teamSlug, sha: args.expectedSha }),
  ];
}

/** Resolve the deployed commit from a deployment record: gitSource.sha and/or meta.githubCommitSha. All present values must agree with the request. */
export function deploymentCommit(d) {
  const shas = [d?.gitSource?.sha, d?.meta?.githubCommitSha].filter((s) => typeof s === "string" && s.length > 0);
  return shas;
}

async function pollReady(io, projectId, teamSlug, id, sha) {
  for (let i = 0; i < 90; i++) {
    const r = await io.vercel("GET", `/v13/deployments/${id}?withGitRepoInfo=true&${teamQuery(teamSlug)}`);
    const d = r.json ?? {};
    if (d.readyState === "READY") {
      const shas = deploymentCommit(d);
      if (shas.length === 0 || shas.some((s) => s !== sha) || d.target !== "production") throw new Error("deployment READY but not the exact production commit requested");
      return d;
    }
    if (d.readyState === "ERROR" || d.readyState === "CANCELED") throw new Error(`deployment ${d.readyState}`);
    await io.sleep(10_000);
  }
  throw new Error("deployment did not become READY in time");
}

/** Read the flag back from Vercel: every record for the key, with its production value where readable. */
async function readFlagState(io, projectId, teamSlug) {
  const r = await io.vercel("GET", `/v10/projects/${projectId}/env?${teamQuery(teamSlug)}`);
  if (r.status !== 200) return { ok: false, records: [] };
  const records = [];
  for (const e of (r.json?.envs ?? []).filter((x) => x.key === FLAG)) {
    let value = null;
    if ((e.target ?? []).includes("production")) {
      const v = await io.vercel("GET", `/v1/projects/${projectId}/env/${e.id}?${teamQuery(teamSlug)}`);
      value = v.status === 200 ? String(v.json?.value ?? "") : null;
    }
    records.push({ id: e.id, target: e.target ?? [], value });
  }
  return { ok: true, records };
}

/**
 * Compensate the enable mutation and VERIFY the outcome by reading it back. Returns { ok, how }.
 *  - flag existed: restore the exact previous value, verified.
 *  - flag was absent: delete the created record, verified absent; if that cannot be verified, set "off", verified.
 */
async function compensateEnable({ io, projectId, teamSlug, initial, createdId, log }) {
  const patch = (id, value) => {
    const q = buildEnvRequest({ projectId, teamSlug, existing: { id }, value });
    return io.vercel(q.method, q.path, q.body);
  };
  try {
    if (initial.exists) {
      await patch(initial.id, initial.value);
      const s = await readFlagState(io, projectId, teamSlug);
      const rec = s.records.find((x) => x.id === initial.id);
      if (s.ok && s.records.length === 1 && rec && rec.value === initial.value) return { ok: true, how: `restored to its previous value (${initial.value})` };
      return { ok: false, how: "restoring the previous value could not be verified" };
    }
    let id = createdId;
    if (!id) {
      const s0 = await readFlagState(io, projectId, teamSlug);
      if (!s0.ok) return { ok: false, how: "could not read the flag state to locate the created record" };
      id = s0.records.find((x) => x.target.includes("production"))?.id ?? null;
      if (!id) return { ok: true, how: "no flag record exists (nothing was created)" };
    }
    const del = buildEnvDeleteRequest({ projectId, teamSlug, id });
    const dr = await io.vercel(del.method, del.path);
    if (dr.status < 300) {
      const s = await readFlagState(io, projectId, teamSlug);
      if (s.ok && s.records.length === 0) return { ok: true, how: "the newly created Production record was deleted (verified absent)" };
      log("WARNING: deletion could not be verified; falling back to setting the flag to off");
    } else {
      log(`WARNING: deleting the created record returned HTTP ${dr.status}; falling back to setting the flag to off`);
    }
    await patch(id, "off");
    const s2 = await readFlagState(io, projectId, teamSlug);
    const rec2 = s2.records.find((x) => x.id === id);
    if (s2.ok && rec2 && rec2.value === "off" && s2.records.every((x) => x.value !== "on")) return { ok: true, how: 'the created record was set to "off" (verified)' };
    return { ok: false, how: 'neither deletion nor setting "off" could be verified' };
  } catch (e) {
    return { ok: false, how: `compensation raised: ${e?.message ?? e}` };
  }
}

export async function execute(mode, args, io) {
  const lines = [];
  const log = (s) => lines.push(s);
  const argErrors = validateArgs(mode, args);
  if (argErrors.length) return { exitCode: 2, lines: argErrors.map((e) => `ARGUMENT ERROR: ${e}`) };

  const results = await runPreflights(mode, args, io);
  for (const r of results) log(`${r.status.padEnd(7)} ${r.id}: ${r.detail}`);
  const { ok, skipped } = summarize(results);
  const mutations = plannedMutations(mode, args, io);
  const value = mode === "enable" ? "on" : "off";

  if (args.dryRun) {
    log("DRY RUN: zero mutations performed (and no compensation). Planned Production mutations (exactly two):");
    mutations.forEach((m, i) => log(`  ${i + 1}. ${m.method} ${VERCEL_API}${m.path.split("?")[0]} ${JSON.stringify({ ...m.body, value: m.body.value ?? undefined })}`));
    log(`  Deployed commit: ${args.expectedSha} (Git source, never uploaded local files)`);
    if (mode === "enable") log(`  If step 2 fails: ${io.state.flagRecord ? "restore the exact previous value" : "delete the newly created record (fallback: set it to off)"}, then verify by reading the flag back.`);
    if (skipped.length) log(`NOTE: ${skipped.length} check(s) skipped in dry-run; they must pass in a real run.`);
    log(ok ? `DRY_RUN_RESULT=WOULD_PROCEED_IF_SKIPPED_CHECKS_PASS` : `DRY_RUN_RESULT=WOULD_REFUSE`);
    return { exitCode: ok ? 0 : 1, lines };
  }
  if (!ok || skipped.length) {
    log("REFUSED: one or more preflights did not pass. No change was made.");
    return { exitCode: 1, lines };
  }

  const projectId = PROJECT_ID;
  const teamSlug = TEAM_SLUG;
  const record = io.state.flagRecord ?? null;
  const initial = record ? { exists: true, id: record.id, value: io.state.previousValue } : { exists: false };

  // STEP 1: set the flag.
  let createdId = null;
  try {
    const envRes = await io.vercel(mutations[0].method, mutations[0].path, mutations[0].body);
    if (envRes.status >= 300) {
      log(`FAILED step 1 (set ${FLAG}=${value}): HTTP ${envRes.status}. Nothing else was changed.`);
      return { exitCode: 1, lines };
    }
    createdId = record ? null : (envRes.json?.created?.id ?? envRes.json?.created?.[0]?.id ?? null);
    log(`STEP 1 OK: ${FLAG}=${value} set for Production only (previous: ${io.state.previousValue}).`);
  } catch (e) {
    // The request may or may not have been applied. Treat as ambiguous: verify/repair for enable, report for disable.
    log(`FAILED step 1 (${e?.message ?? e}); the outcome is ambiguous.`);
    if (mode === "enable") {
      const c = await compensateEnable({ io, projectId, teamSlug, initial, createdId: null, log });
      if (!c.ok) {
        log(`UNCOMPENSATED_DANGER: ${FLAG} may be "on" in Production and could not be reset (${c.how}). Fix it in the Vercel dashboard now.`);
        return { exitCode: 3, lines };
      }
      log(`COMPENSATED: ${c.how}.`);
    }
    return { exitCode: 1, lines };
  }

  // STEP 2: deploy the exact commit from Git and prove it is what Production serves.
  try {
    const dep = await io.vercel(mutations[1].method, mutations[1].path, mutations[1].body);
    if (dep.status >= 300 || !dep.json?.id) throw new Error(`deployment create returned HTTP ${dep.status}`);
    log(`STEP 2: deployment ${dep.json.id} created from exact commit ${args.expectedSha}; waiting for READY.`);
    await pollReady(io, projectId, teamSlug, dep.json.id, args.expectedSha);
    const bi = await io.http(`${PRODUCTION_ORIGIN}/api/internal/build-info`);
    const served = JSON.parse(bi.text).commit;
    if (served !== args.expectedSha) throw new Error(`production serves ${String(served).slice(0, 12)} after deploy`);
    log(`STEP 2 OK: production now serves ${args.expectedSha}. ${FLAG} is ${value.toUpperCase()}.`);
    log(mode === "enable" ? "PRODUCTION_PAYMENT_GATE_ENABLED=YES" : "PRODUCTION_PAYMENT_GATE_ENABLED=NO");
    return { exitCode: 0, lines };
  } catch (e) {
    log(`FAILED step 2: ${e.message}`);
    if (mode === "disable") {
      log(`REDEPLOY_REQUIRED: ${FLAG} is now "off" (the safe direction) but Production still serves the previous deployment, which may still enforce. Redeploy ${args.expectedSha} manually.`);
      return { exitCode: 1, lines };
    }
    const c = await compensateEnable({ io, projectId, teamSlug, initial, createdId, log });
    if (!c.ok) {
      log(`UNCOMPENSATED_DANGER: ${FLAG}=on may remain in Production and was NOT verifiably reset (${c.how}). A later unrelated Production deploy could enforce the paywall. Fix it in the Vercel dashboard now.`);
      return { exitCode: 3, lines };
    }
    log(`COMPENSATED: ${c.how}. Production still serves the previous deployment; the paywall was not activated.`);
    return { exitCode: 1, lines };
  }
}

export function loadManifestFile(path) {
  return existsSync(path) ? readFileSync(path, "utf8") : null;
}
