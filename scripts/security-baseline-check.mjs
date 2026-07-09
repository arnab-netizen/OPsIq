#!/usr/bin/env node
/**
 * Security Baseline Check — truthful dependency-vulnerability gate.
 *
 * Runs `npm audit --json`, parses the severity counts, and enforces a policy:
 *   - FAIL (exit 1) if any CRITICAL or HIGH vulnerability is present.
 *   - REPORT (non-blocking) moderate / low / info counts.
 *   - EXIT 2 on a tooling error (audit could not run or its output could not be parsed) —
 *     a broken scanner must not silently pass as "green".
 *
 * This replaces the previous `npm audit --audit-level=moderate || true` step, whose `|| true`
 * (combined with a job-level `continue-on-error: true`) made the gate structurally incapable of
 * failing — a critical/high vulnerability would pass green. See
 * docs/audits/2026-07-09-phase-6b-security-baseline-gate-integrity/.
 *
 * Deterministic: no network beyond the `npm audit` call the gate already performed, no secret
 * access, no filesystem writes. Clear exit codes (0 pass, 1 policy violation, 2 tooling error).
 *
 * Policy threshold is intentionally the honest "security baseline" the job name implies
 * (block critical + high). To change it, edit BLOCKING_SEVERITIES below.
 */

import { execSync } from "node:child_process";

const BLOCKING_SEVERITIES = ["critical", "high"];
const REPORTED_SEVERITIES = ["critical", "high", "moderate", "low", "info"];

function runAuditJson() {
  // `npm audit` exits non-zero when vulnerabilities are found, so we capture stdout even on a
  // non-zero exit and parse it. A genuine tooling failure (no output / unparseable) → exit 2.
  let raw;
  try {
    raw = execSync("npm audit --json", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (err) {
    // Non-zero exit is expected when vulns exist; the JSON is still on stdout.
    raw = err.stdout ? String(err.stdout) : "";
    if (!raw.trim()) {
      console.error("::error::security-baseline-check: `npm audit --json` produced no output");
      if (err.stderr) console.error(String(err.stderr));
      process.exit(2);
    }
  }
  try {
    return JSON.parse(raw);
  } catch {
    console.error("::error::security-baseline-check: could not parse `npm audit --json` output");
    process.exit(2);
  }
}

function severityCounts(audit) {
  const meta = audit && audit.metadata && audit.metadata.vulnerabilities;
  if (!meta || typeof meta !== "object") {
    console.error("::error::security-baseline-check: audit output missing metadata.vulnerabilities");
    process.exit(2);
  }
  const counts = {};
  for (const sev of REPORTED_SEVERITIES) counts[sev] = Number(meta[sev] || 0);
  return counts;
}

function blockingAdvisories(audit) {
  // Best-effort per-package detail for the report (npm v7+ `vulnerabilities` map).
  const out = [];
  const vulns = audit && audit.vulnerabilities;
  if (vulns && typeof vulns === "object") {
    for (const [name, info] of Object.entries(vulns)) {
      if (!BLOCKING_SEVERITIES.includes(info.severity)) continue;
      const fix = info.fixAvailable;
      const fixStr =
        typeof fix === "boolean"
          ? fix
            ? "fix available"
            : "no automatic fix"
          : fix && typeof fix === "object"
            ? `fix: ${fix.name}@${fix.version}`
            : "unknown";
      out.push(`${name} [${info.severity}] (${fixStr})`);
    }
  }
  return out;
}

function main() {
  const audit = runAuditJson();
  const counts = severityCounts(audit);

  console.log("==========================================");
  console.log("SECURITY BASELINE CHECK");
  console.log("Policy: FAIL on critical or high; report moderate/low");
  console.log("==========================================");
  for (const sev of REPORTED_SEVERITIES) {
    console.log(`  ${sev.padEnd(9)}: ${counts[sev]}`);
  }
  console.log("");

  const blockingCount = BLOCKING_SEVERITIES.reduce((n, s) => n + counts[s], 0);

  if (blockingCount > 0) {
    const advisories = blockingAdvisories(audit);
    console.error(
      `::error::Security baseline FAILED: ${counts.critical} critical, ${counts.high} high ` +
        `blocking vulnerabilit${blockingCount === 1 ? "y" : "ies"} found.`
    );
    if (advisories.length) {
      console.error("Blocking advisories:");
      for (const a of advisories) console.error(`  - ${a}`);
    }
    console.error("");
    console.error("Remediate the critical/high advisories (see `npm audit`) before this gate can pass.");
    process.exit(1);
  }

  const nonBlocking = counts.moderate + counts.low + counts.info;
  if (nonBlocking > 0) {
    console.log(
      `No critical/high vulnerabilities. ${counts.moderate} moderate, ${counts.low} low reported ` +
        `(non-blocking under the current baseline policy).`
    );
  } else {
    console.log("No vulnerabilities reported by npm audit.");
  }
  console.log("✅ Security baseline check passed.");
  process.exit(0);
}

main();
