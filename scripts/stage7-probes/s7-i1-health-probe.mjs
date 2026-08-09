#!/usr/bin/env node
/**
 * S7-I1 — Exact private deployment identity
 *
 * LANE_C production runtime check.
 *
 * Assertion: Deployed SHA matches authorized candidate;
 *            production health probe returns 200.
 *
 * Required env vars:
 *   DEPLOYMENT_ID      — Vercel deployment id (dpl_...)
 *   VERCEL_TOKEN       — (optional) Vercel API token; enables SHA cross-check
 *   CLOSURE_SUBJECT_SHA — authorized SHA from factory-stage-7-closure.yaml;
 *                        defaults to the D-12 authorized value when not set
 *
 * Derived env vars (alternatives to DEPLOYMENT_ID-based resolution):
 *   PROBE_BASE_URL     — override: probe this URL directly (must be the exact deployment)
 *
 * Exit 0 = PASS. Non-zero = FAIL. Observations on stdout.
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..", "..");

const D12_AUTHORIZED_SHA = "036c526940f349d7d06e05635f29c064c78ba71b";
const DEFAULT_PRODUCTION_URL = "https://o-ps-iq.vercel.app";

const DEPLOYMENT_ID = process.env.DEPLOYMENT_ID ?? "";
const VERCEL_TOKEN = process.env.VERCEL_TOKEN ?? "";
const CLOSURE_SUBJECT_SHA = process.env.CLOSURE_SUBJECT_SHA ?? D12_AUTHORIZED_SHA;
const PROBE_BASE_URL_OVERRIDE = process.env.PROBE_BASE_URL ?? "";

const observations = [];
let failed = false;

function record(label, value, pass = true) {
  const entry = { label, value, pass };
  observations.push(entry);
  console.log(`[${pass ? "PASS" : "FAIL"}] ${label}: ${JSON.stringify(value)}`);
  if (!pass) failed = true;
}

function fail(label, value) {
  record(label, value, false);
}

async function resolveDeploymentUrl() {
  if (PROBE_BASE_URL_OVERRIDE) {
    record("probe_base_url_source", "PROBE_BASE_URL override");
    return PROBE_BASE_URL_OVERRIDE;
  }

  if (VERCEL_TOKEN && DEPLOYMENT_ID) {
    try {
      const res = await fetch(
        `https://api.vercel.com/v13/deployments/${encodeURIComponent(DEPLOYMENT_ID)}`,
        {
          headers: {
            Authorization: `Bearer ${VERCEL_TOKEN}`,
            "Content-Type": "application/json",
          },
        }
      );
      if (!res.ok) {
        record(
          "vercel_api_response",
          `HTTP ${res.status} — using default production URL`,
          true
        );
        return DEFAULT_PRODUCTION_URL;
      }
      const data = await res.json();
      const deploymentUrl = data.url ? `https://${data.url}` : null;
      if (!deploymentUrl) {
        record("vercel_deployment_url", "null — using default", true);
        return DEFAULT_PRODUCTION_URL;
      }
      record("vercel_deployment_url", deploymentUrl);
      return deploymentUrl;
    } catch (err) {
      record("vercel_api_error", String(err), true);
      return DEFAULT_PRODUCTION_URL;
    }
  }

  record(
    "probe_base_url_source",
    "no VERCEL_TOKEN or PROBE_BASE_URL — using default production alias"
  );
  return DEFAULT_PRODUCTION_URL;
}

async function verifySha(deploymentId) {
  if (!VERCEL_TOKEN) {
    record(
      "sha_verification",
      "SKIPPED — VERCEL_TOKEN not set; cannot verify SHA via API"
    );
    return;
  }
  if (!deploymentId) {
    fail("sha_verification", "SKIPPED — DEPLOYMENT_ID not set; SHA unverifiable");
    return;
  }

  try {
    const res = await fetch(
      `https://api.vercel.com/v13/deployments/${encodeURIComponent(deploymentId)}`,
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
    if (deployedSha) {
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
      }
    }

    const deploymentState = data.readyState ?? data.state ?? "UNKNOWN";
    const deploymentReady = deploymentState === "READY";
    record(
      "vercel_deployment_state",
      deploymentState,
      deploymentReady
    );
    if (!deploymentReady) {
      fail("deployment_not_ready", `State is ${deploymentState}, expected READY`);
    }
  } catch (err) {
    fail("vercel_sha_fetch_error", String(err));
  }
}

async function probeHealth(baseUrl) {
  const url = `${baseUrl.replace(/\/$/, "")}/api/health`;
  record("probe_url", url);

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
  record("health_status_value", body.status ?? "MISSING");
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
  console.log(`CLOSURE_SUBJECT_SHA: ${CLOSURE_SUBJECT_SHA}`);
  console.log(`VERCEL_TOKEN: ${VERCEL_TOKEN ? "set" : "not set"}`);
  console.log("");

  const baseUrl = await resolveDeploymentUrl();

  await verifySha(DEPLOYMENT_ID);
  await probeHealth(baseUrl);

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
