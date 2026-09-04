#!/usr/bin/env node
/**
 * S7-I1 — Exact private deployment identity
 *
 * LANE_C production runtime check.
 *
 * Assertion: Deployed SHA matches authorized candidate;
 *            production health probe returns 200.
 *
 * ─── Why this probe may never PASS without comparing a SHA ───────────────────
 * The assertion is about identity. Before PR-G2 the probe could satisfy it
 * without ever obtaining the deployed SHA: `CLOSURE_SUBJECT_SHA` fell back to a
 * hardcoded D-12 value, an absent `VERCEL_TOKEN` recorded
 * `sha_verification: "SKIPPED"` as a PASSING observation, and the base URL fell
 * back to a compiled-in production alias. Run with the environment the capture
 * workflow actually supplied, it reported `10 PASS, 0 FAIL` and `RESULT: PASS`
 * while the deployed SHA matched neither the stale default nor the governed
 * subject. That is a signable LANE_C artifact asserting an identity nobody
 * checked.
 *
 * Every one of those fallbacks is gone. There is now no path on which the
 * deployed SHA is unknown and the result is PASS.
 *
 * ─── Where the deployed SHA comes from, and why TWO authorities ─────────────
 * `GET {PROBE_BASE_URL}/api/internal/build-info` — the repository's existing
 * first-party deployed-identity authority (src/app/api/internal/build-info/route.ts),
 * already used for exactly this purpose by
 * .github/workflows/production-owner-acceptance.yml. It reports the deployed
 * commit and the Vercel environment and is served by the deployment being probed.
 *
 * That establishes "the host answering this URL claims commit X". It does NOT
 * establish WHICH DEPLOYMENT that host is. The canonical executable_evidence
 * requires more than a self-report: "deployed URL responds with 200 to health
 * probe; Vercel or equivalent DEPLOYMENT DASHBOARD shows exact authorized SHA."
 * A deployment is not its own dashboard, and `DEPLOYMENT_ID` — which is written
 * verbatim into the signed artifact — arrives from the caller's dispatch input.
 *
 * The control-plane check is therefore REQUIRED, not optional, and it binds the
 * alias too: the probed host must be listed by the control plane as an address of
 * DEPLOYMENT_ID. Absent VERCEL_TOKEN this probe now FAILS rather than recording
 * "NOT_REQUESTED" as a passing observation.
 *
 * Required env vars:
 *   CLOSURE_SUBJECT_SHA — the exact commit this capture is authorized against.
 *                         Supplied by the capture workflow as GITHUB_SHA, which
 *                         the OPTION A gate has independently proved equals the
 *                         authorized closure_subject_sha at AUTH_SHA. No default.
 *   PROBE_BASE_URL      — the production endpoint to probe. No default.
 *   DEPLOYMENT_ID       — Vercel deployment id (dpl_...), recorded by the contract
 *                         and now verified against the control plane.
 *   VERCEL_TOKEN        — deployment-dashboard credential. REQUIRED: supplies the
 *                         second authority the canonical evidence names. Never
 *                         printed.
 *
 * Exit 0 = PASS. Non-zero = FAIL. Observations on stdout.
 */

const SHA40 = /^[0-9a-f]{40}$/;

const DEPLOYMENT_ID = process.env.DEPLOYMENT_ID ?? "";
const VERCEL_TOKEN = process.env.VERCEL_TOKEN ?? "";
const CLOSURE_SUBJECT_SHA = process.env.CLOSURE_SUBJECT_SHA ?? "";
const PROBE_BASE_URL = process.env.PROBE_BASE_URL ?? "";
/**
 * Deployment-dashboard API root. Overridable so the control-plane branch is
 * testable against a stub; the value used is RECORDED in the observation, and
 * the capture workflow never supplies it (asserted by
 * stage7-machine-probe-integrity.test.ts), so a signed capture always reads the
 * real control plane and any other value is visible in the artifact.
 */
const VERCEL_API_BASE = process.env.VERCEL_API_BASE || "https://api.vercel.com";

const observations = [];
let failed = false;

function record(label, value, pass) {
  if (typeof pass !== "boolean") {
    throw new Error(`record("${label}") requires an explicit boolean verdict`);
  }
  const entry = { label, value, pass };
  observations.push(entry);
  console.log(`[${pass ? "PASS" : "FAIL"}] ${label}: ${JSON.stringify(value)}`);
  if (!pass) failed = true;
}

function fail(label, value) {
  record(label, value, false);
}

/**
 * Fail-closed configuration gate. The capture workflow refuses before reaching
 * this probe when a governed input is missing; this is the second line, so the
 * probe is also safe to run by hand without inventing an identity to compare
 * against.
 *
 * @returns {boolean} true when the probe holds everything identity needs
 */
function verifyConfiguration() {
  let ok = true;

  if (!CLOSURE_SUBJECT_SHA) {
    fail(
      "closure_subject_sha_present",
      "MISSING — CLOSURE_SUBJECT_SHA is not set. S7-I1 asserts that the deployed " +
        "SHA matches the authorized candidate; with no authorized candidate there " +
        "is nothing to match and no default may be assumed."
    );
    ok = false;
  } else if (!SHA40.test(CLOSURE_SUBJECT_SHA)) {
    fail(
      "closure_subject_sha_wellformed",
      `MALFORMED — '${CLOSURE_SUBJECT_SHA}' is not a 40-character lowercase commit SHA`
    );
    ok = false;
  } else {
    record("closure_subject_sha_present", CLOSURE_SUBJECT_SHA, true);
  }

  if (!PROBE_BASE_URL) {
    fail(
      "probe_base_url_present",
      "MISSING — PROBE_BASE_URL is not set. The endpoint under observation must be " +
        "named by the caller; a compiled-in production alias would let this probe " +
        "report on a target the capture never selected."
    );
    ok = false;
  } else {
    record("probe_base_url", PROBE_BASE_URL, true);
  }

  return ok;
}

/**
 * Establish the deployed identity from the deployment itself.
 *
 * This is the check the whole invariant rests on, so every way it can fail to
 * produce a compared SHA is a FAIL: unreachable endpoint, non-JSON body, absent
 * or "unknown" commit, wrong environment, or a commit that is not the authorized
 * subject.
 *
 * @returns {Promise<string|null>} the verified deployed SHA, or null on failure
 */
async function verifyDeployedIdentity() {
  const url = `${PROBE_BASE_URL.replace(/\/$/, "")}/api/internal/build-info`;
  record("build_info_url", url, true);

  let body;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    record("build_info_http_status", res.status, res.status === 200);
    if (res.status !== 200) {
      fail("build_info_unavailable", `Expected 200 from ${url}, got ${res.status}`);
      return null;
    }
    body = await res.json();
  } catch (err) {
    fail("build_info_error", String(err));
    return null;
  }

  const deployedEnv = body.environment ?? "MISSING";
  const envIsProduction = deployedEnv === "production";
  record("deployed_environment", deployedEnv, envIsProduction);
  if (!envIsProduction) {
    fail(
      "deployed_environment_not_production",
      `environment='${deployedEnv}' — LANE_C evidence is only observed in production`
    );
  }

  const deployedSha = typeof body.commit === "string" ? body.commit : "";
  if (!SHA40.test(deployedSha)) {
    fail(
      "deployed_sha_unresolvable",
      `build-info reported commit='${deployedSha || "MISSING"}' — the deployed SHA ` +
        "could not be established, so deployment identity is unverified"
    );
    return null;
  }
  record("deployed_sha", deployedSha, true);

  const shaMatch = deployedSha === CLOSURE_SUBJECT_SHA;
  record(
    "sha_matches_closure_subject",
    `deployed=${deployedSha} authorized=${CLOSURE_SUBJECT_SHA}`,
    shaMatch
  );
  if (!shaMatch) {
    fail(
      "sha_mismatch_detail",
      `Deployed SHA ${deployedSha} does not match authorized candidate ${CLOSURE_SUBJECT_SHA}`
    );
    return null;
  }

  return deployedSha;
}

/**
 * REQUIRED Vercel control-plane verification.
 *
 * The canonical executable_evidence for S7-I1 is: "deployed URL responds with 200
 * to health probe; Vercel OR EQUIVALENT DEPLOYMENT DASHBOARD shows exact
 * authorized SHA". A deployment reporting its own commit is not a deployment
 * dashboard — the whole point of naming one is corroboration by a second
 * authority. build-info alone proves "the host answering this URL claims commit
 * X"; it cannot prove which deployment that host is, and `deployment_id` is
 * supplied by the caller and recorded verbatim into the signed artifact.
 *
 * So this check is no longer optional, and it now also binds the alias: the host
 * named by PROBE_BASE_URL must appear in the control plane's alias list for
 * DEPLOYMENT_ID. That is what makes the artifact's deployment_id an observation
 * rather than an unverified caller assertion.
 *
 * Never prints the token.
 */
async function crossCheckVercelDeployment(deploymentId) {
  if (!VERCEL_TOKEN) {
    fail(
      "vercel_control_plane_credential",
      "MISSING — VERCEL_TOKEN is not set. S7-I1's canonical evidence requires a " +
        "deployment dashboard to show the authorized SHA; the deployment's own " +
        "build-info endpoint is not a second authority and cannot corroborate " +
        "which deployment is serving the probed URL."
    );
    return;
  }
  if (!deploymentId) {
    fail("vercel_cross_check", "VERCEL_TOKEN supplied but DEPLOYMENT_ID is not set");
    return;
  }
  // Recorded as a fact, so the artifact always states which authority answered.
  record("vercel_api_base", VERCEL_API_BASE, true);

  try {
    const res = await fetch(
      `${VERCEL_API_BASE}/v13/deployments/${encodeURIComponent(deploymentId)}`,
      {
        headers: {
          Authorization: `Bearer ${VERCEL_TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    );
    if (!res.ok) {
      fail("vercel_sha_api", `HTTP ${res.status}`);
      return;
    }
    const data = await res.json();

    const deployedSha = data.meta?.githubCommitSha ?? data.gitSource?.sha ?? null;
    record("vercel_deployed_sha", deployedSha ?? "NOT_FOUND", !!deployedSha);
    if (!deployedSha) {
      fail("vercel_deployed_sha_absent", "Vercel reported no commit SHA for this deployment");
    } else if (deployedSha !== CLOSURE_SUBJECT_SHA) {
      fail(
        "vercel_sha_mismatch_detail",
        `Vercel deployment ${deploymentId} reports ${deployedSha}, not the authorized ` +
          `candidate ${CLOSURE_SUBJECT_SHA}`
      );
    } else {
      record("vercel_sha_matches_closure_subject", deployedSha, true);
    }

    const deploymentState = data.readyState ?? data.state ?? "UNKNOWN";
    const deploymentReady = deploymentState === "READY";
    record("vercel_deployment_state", deploymentState, deploymentReady);
    if (!deploymentReady) {
      fail("deployment_not_ready", `State is ${deploymentState}, expected READY`);
    }

    // ── Alias binding: is THIS deployment the one serving the probed URL? ────
    // Without this, `deployment_id` is a caller-supplied string recorded into a
    // signed artifact that never observed it. The control plane knows which
    // aliases resolve to the deployment, so the probed host must be among them.
    let probeHost = "";
    try {
      probeHost = new URL(PROBE_BASE_URL).host;
    } catch {
      probeHost = "";
    }
    const aliases = Array.isArray(data.alias) ? data.alias : [];
    const aliasHosts = aliases.map((a) =>
      String(a).replace(/^https?:\/\//, "").replace(/\/$/, "")
    );
    // The deployment's own generated URL counts as one of its addresses.
    if (typeof data.url === "string" && data.url) aliasHosts.push(data.url);
    const aliasCovers = probeHost !== "" && aliasHosts.includes(probeHost);
    record(
      "vercel_deployment_alias_covers_probe_target",
      aliasCovers ? "probed host is served by this deployment" : "NOT COVERED",
      aliasCovers
    );
    if (!aliasCovers) {
      fail(
        "deployment_id_not_bound_to_probe_target",
        `The control plane does not list the probed host as an address of ` +
          `deployment ${deploymentId}. The recorded deployment_id would not ` +
          `describe the deployment actually observed.`
      );
    }
  } catch (err) {
    fail("vercel_sha_fetch_error", String(err));
  }
}

async function probeHealth(baseUrl) {
  const url = `${baseUrl.replace(/\/$/, "")}/api/health`;
  record("probe_url", url, true);

  let res;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
  } catch (err) {
    fail("health_probe_error", String(err));
    return;
  }

  const httpStatus = res.status;
  record("http_status", httpStatus, httpStatus === 200);
  if (httpStatus !== 200) {
    fail("health_probe_failed", `Expected 200, got ${httpStatus}`);
  }

  let body;
  try {
    body = await res.json();
  } catch {
    fail("health_response_not_json", "Failed to parse JSON response");
    return;
  }

  record("response_has_status_field", "status" in body, "status" in body);
  record("health_status_value", body.status ?? "MISSING", "status" in body);
  record("response_has_checks_field", "checks" in body, "checks" in body);
  record("response_has_timestamp", "timestamp" in body, "timestamp" in body);

  const overallHealthy = body.status === "healthy";
  const overallDegraded = body.status === "degraded";
  if (!overallHealthy && !overallDegraded) {
    fail("health_status_unexpected", `status='${body.status}' (expected healthy or degraded)`);
  } else {
    record("health_status_acceptable", body.status, overallHealthy || overallDegraded);
  }

  // Database check must be present
  const dbStatus = body.checks?.database?.status ?? "MISSING";
  const dbAcceptable = dbStatus === "healthy" || dbStatus === "degraded";
  record("database_check_status", dbStatus, dbAcceptable);
  if (!dbAcceptable) {
    fail("database_unhealthy", `database.status='${dbStatus}'`);
  }
}

async function main() {
  console.log("=== S7-I1: Exact private deployment identity ===");
  console.log(`DEPLOYMENT_ID: ${DEPLOYMENT_ID || "(not set)"}`);
  console.log(`CLOSURE_SUBJECT_SHA: ${CLOSURE_SUBJECT_SHA || "(not set)"}`);
  console.log(`PROBE_BASE_URL: ${PROBE_BASE_URL || "(not set)"}`);
  console.log(`VERCEL_TOKEN: ${VERCEL_TOKEN ? "set" : "not set"}`);
  console.log(`VERCEL_API_BASE: ${VERCEL_API_BASE}`);
  console.log("");

  // Configuration first: without an authorized subject or a named endpoint there
  // is no identity question to answer, and answering it anyway is the defect.
  if (verifyConfiguration()) {
    const verifiedSha = await verifyDeployedIdentity();
    await crossCheckVercelDeployment(DEPLOYMENT_ID);
    if (verifiedSha) {
      await probeHealth(PROBE_BASE_URL);
    } else {
      record(
        "health_probe_skipped",
        "deployment identity was not established — health of an unidentified " +
          "deployment says nothing about this invariant",
        false
      );
    }
  }

  console.log("\n=== OBSERVATION SUMMARY ===");
  const passes = observations.filter((o) => o.pass).length;
  const failures = observations.filter((o) => !o.pass).length;
  console.log(`Checks: ${passes} PASS, ${failures} FAIL`);

  if (failed) {
    console.log("\nRESULT: FAIL");
    process.exit(1);
  }
  console.log("\nRESULT: PASS");
  process.exit(0);
}

main().catch((err) => {
  console.error("Unhandled error:", err);
  process.exit(1);
});
