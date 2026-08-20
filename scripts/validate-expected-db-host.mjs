#!/usr/bin/env node
/**
 * PINNED_PREDEPLOY exact-host gate for migrate-production.yml.
 *
 * Before any migration is allowed to run, the owner-pinned
 * expected_database_host input is validated as a bare hostname (never a
 * full connection URL, credentials, path, or query string) and compared
 * exactly against PRODUCTION_DATABASE_URL's actual hostname. Without this,
 * a syntactically valid direct (non-pooler) Neon URL belonging to the wrong
 * project/branch would pass the existing placeholder/pooler checks
 * undetected.
 *
 * Usage: DATABASE_URL=... EXPECTED_DATABASE_HOST=<hostname> node scripts/validate-expected-db-host.mjs
 */
import { fileURLToPath } from "url";

// RFC 1123 hostname: dot-separated labels, each 1-63 chars, alphanumeric
// with internal hyphens only. This allow-list rejects "://", "@", "/", "?",
// "#", whitespace, control characters, and every shell metacharacter by
// construction -- none of those characters can appear in a match.
const HOSTNAME_PATTERN =
  /^(?=.{1,253}$)[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

const FORBIDDEN_SUBSTRINGS = ["://", "@", "/", "?", "#"];

export function isValidExpectedHost(value) {
  if (typeof value !== "string" || value.length === 0) {
    return { ok: false, reason: "expected_database_host is required and must not be empty" };
  }
  for (const bad of FORBIDDEN_SUBSTRINGS) {
    if (value.includes(bad)) {
      return { ok: false, reason: `expected_database_host must not contain '${bad}'` };
    }
  }
  if (/[\s\x00-\x1f\x7f]/.test(value)) {
    return { ok: false, reason: "expected_database_host must not contain whitespace or control characters" };
  }
  if (!HOSTNAME_PATTERN.test(value)) {
    return {
      ok: false,
      reason:
        "expected_database_host must be a bare DNS hostname (letters, digits, hyphens, dots only) -- no scheme, credentials, path, query string, or other characters",
    };
  }
  return { ok: true };
}

export function extractHostname(databaseUrl) {
  try {
    return new URL(databaseUrl).hostname;
  } catch {
    return null;
  }
}

export function hostsMatch(actualHost, expectedHost) {
  return typeof actualHost === "string" && typeof expectedHost === "string" && actualHost === expectedHost;
}

function main() {
  const expected = process.env.EXPECTED_DATABASE_HOST ?? "";
  const databaseUrl = process.env.DATABASE_URL ?? "";

  const formatCheck = isValidExpectedHost(expected);
  if (!formatCheck.ok) {
    console.error(`::error::${formatCheck.reason}`);
    process.exit(1);
  }

  const actual = extractHostname(databaseUrl);
  if (!actual) {
    console.error("::error::Could not parse a hostname from DATABASE_URL");
    process.exit(1);
  }

  const match = hostsMatch(actual, expected);
  console.log(`Expected database host: ${expected}`);
  console.log(`Actual database host: ${actual}`);
  console.log(`MATCH=${match ? "YES" : "NO"}`);

  if (!match) {
    console.error(
      "::error::PRODUCTION_DATABASE_URL's hostname does not match the owner-pinned expected_database_host. Aborting before any migration deploy."
    );
    process.exit(1);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
