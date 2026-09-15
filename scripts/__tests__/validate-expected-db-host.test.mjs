#!/usr/bin/env node
/**
 * validate-expected-db-host.mjs — hostile exact-host gate unit tests
 *
 * Proves the 7 owner-required scenarios plus supporting cases, without a
 * live DB: correct hostname allowed; different valid Neon hostname
 * rejected; pooler equivalent of the expected host rejected; hostname with
 * credentials rejected; full URL instead of hostname rejected; empty
 * hostname rejected; shell/metacharacter input rejected.
 *
 * Run: node scripts/__tests__/validate-expected-db-host.test.mjs
 * Exit 0 → all cases pass; exit 1 → one or more cases misbehaved.
 */
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const { isValidExpectedHost, extractHostname, hostsMatch } = await import(
  join(__dirname, "..", "validate-expected-db-host.mjs")
);

let passed = 0;
let failed = 0;

function assert(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}`);
    console.error(`    expected: ${JSON.stringify(expected)}`);
    console.error(`    actual:   ${JSON.stringify(actual)}`);
    failed++;
  }
}

const EXPECTED = "ep-abc-123.us-east-1.aws.neon.tech";
const OTHER_VALID = "ep-different-456.us-east-1.aws.neon.tech";
const POOLER_OF_EXPECTED = "ep-abc-123-pooler.us-east-1.aws.neon.tech";

console.log("\n── owner-required scenario 1: correct exact hostname -> allowed ──");
assert("format valid", isValidExpectedHost(EXPECTED).ok, true);
assert("matches itself", hostsMatch(EXPECTED, EXPECTED), true);

console.log("\n── owner-required scenario 2: different valid Neon hostname -> rejected ──");
assert("format valid on its own", isValidExpectedHost(OTHER_VALID).ok, true);
assert("does not match expected", hostsMatch(OTHER_VALID, EXPECTED), false);

console.log("\n── owner-required scenario 3: pooler equivalent of expected host -> rejected ──");
assert("format valid on its own", isValidExpectedHost(POOLER_OF_EXPECTED).ok, true);
assert("does not match expected (exact string compare)", hostsMatch(POOLER_OF_EXPECTED, EXPECTED), false);

console.log("\n── owner-required scenario 4: hostname with credentials -> rejected ──");
assert("rejects user:pass@host", isValidExpectedHost(`user:pass@${EXPECTED}`).ok, false);
assert("rejects bare @host", isValidExpectedHost(`user@${EXPECTED}`).ok, false);

console.log("\n── owner-required scenario 5: URL instead of hostname -> rejected ──");
assert("rejects postgresql:// URL", isValidExpectedHost(`postgresql://${EXPECTED}/db`).ok, false);
assert("rejects https:// URL", isValidExpectedHost(`https://${EXPECTED}`).ok, false);
assert("rejects host with path", isValidExpectedHost(`${EXPECTED}/db`).ok, false);
assert("rejects host with query string", isValidExpectedHost(`${EXPECTED}?sslmode=require`).ok, false);
assert("rejects host with fragment", isValidExpectedHost(`${EXPECTED}#frag`).ok, false);

console.log("\n── owner-required scenario 6: empty hostname -> rejected ──");
assert("rejects empty string", isValidExpectedHost("").ok, false);
assert("rejects non-string (undefined)", isValidExpectedHost(undefined).ok, false);

console.log("\n── owner-required scenario 7: shell/metacharacter input -> rejected ──");
assert("rejects semicolon injection", isValidExpectedHost(`${EXPECTED}; rm -rf /`).ok, false);
assert("rejects backtick injection", isValidExpectedHost("`whoami`.neon.tech").ok, false);
assert("rejects dollar-paren injection", isValidExpectedHost("$(whoami).neon.tech").ok, false);
assert("rejects pipe", isValidExpectedHost(`${EXPECTED}|cat /etc/passwd`).ok, false);
assert("rejects ampersand", isValidExpectedHost(`${EXPECTED}&&echo pwned`).ok, false);
assert("rejects whitespace", isValidExpectedHost("ep abc.neon.tech").ok, false);
assert("rejects embedded newline", isValidExpectedHost("ep-abc.neon.tech\nrm -rf /").ok, false);
assert("rejects embedded tab", isValidExpectedHost("ep-abc.neon.tech\t").ok, false);

console.log("\n── single-label hostname (e.g. \"localhost\", \"postgres\") -> rejected by format, shared/default validator ──");
assert("bare single-label hostname is rejected (no dot)", isValidExpectedHost("localhost").ok, false);
assert("bare single-label service name is rejected (no dot)", isValidExpectedHost("postgres").ok, false);
assert("bare single-label 'db' is rejected (no dot)", isValidExpectedHost("db").ok, false);

console.log("\n── extractHostname ──");
assert(
  "extracts hostname from a well-formed connection URL",
  extractHostname("postgresql://user:pass@ep-abc-123.us-east-1.aws.neon.tech/db?sslmode=require"),
  "ep-abc-123.us-east-1.aws.neon.tech"
);
assert("returns null for unparseable input", extractHostname("not a url"), null);
assert("returns null for empty input", extractHostname(""), null);

console.log("\n── hostsMatch type safety ──");
assert("null actual never matches", hostsMatch(null, EXPECTED), false);
assert("undefined expected never matches", hostsMatch(EXPECTED, undefined), false);

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
