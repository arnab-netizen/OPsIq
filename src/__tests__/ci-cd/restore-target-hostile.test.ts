/**
 * Hostile tests for scripts/lib/restore-target.mjs (no dedicated test file existed before this
 * change -- confirmed via a repo-wide search). This module is the single authoritative preflight
 * that scripts/restore-database.sh (and, transitively, scripts/restore-database-r2.sh) relies on
 * to refuse a production restore target BEFORE DATABASE_URL is even inspected, and to refuse a
 * "local" target that is not a true loopback address. These tests drive the real, unmodified
 * module directly -- no mocking of its own logic -- and specifically probe for numeric-IP-
 * obfuscation bypasses (decimal/hex/octal IPv4, IPv4-mapped IPv6, userinfo tricks) that are a
 * classic SSRF/allowlist-bypass pattern, plus the documented host/hostaddr override rejection.
 */
import { describe, it, expect } from "vitest";
import { isLoopbackPostgresUrl, assessRestoreTarget } from "../../../scripts/lib/restore-target.mjs";

describe("assessRestoreTarget: production is refused on the target alone", () => {
  it("refuses target=production unconditionally, even with a benign-looking DATABASE_URL", () => {
    const r = assessRestoreTarget({ OPSIQ_DB_TARGET: "production", DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/db" });
    expect(r.ok).toBe(false);
    expect(r.code).toBe("PRODUCTION_RESTORE_REQUIRES_GOVERNED_WORKFLOW");
  });

  it("refuses target=production even when DATABASE_URL is missing entirely (target checked first)", () => {
    const r = assessRestoreTarget({ OPSIQ_DB_TARGET: "production" });
    expect(r.ok).toBe(false);
    expect(r.code).toBe("PRODUCTION_RESTORE_REQUIRES_GOVERNED_WORKFLOW");
  });

  it.each(["Production", "PRODUCTION", " production "])(
    "refuses case/whitespace variants of the target string ('%s')",
    (variant) => {
      const r = assessRestoreTarget({ OPSIQ_DB_TARGET: variant, DATABASE_URL: "postgresql://x@real-prod-host.neon.tech/db" });
      expect(r.ok).toBe(false);
      expect(r.code).toBe("PRODUCTION_RESTORE_REQUIRES_GOVERNED_WORKFLOW");
    },
  );

  it("refuses a target string with a trailing newline (not run via it.each: a literal newline in a vitest test title breaks the harness's own testNamePattern matching and would otherwise be silently skipped)", () => {
    const r = assessRestoreTarget({ OPSIQ_DB_TARGET: "production\n", DATABASE_URL: "postgresql://x@real-prod-host.neon.tech/db" });
    expect(r.ok).toBe(false);
    expect(r.code).toBe("PRODUCTION_RESTORE_REQUIRES_GOVERNED_WORKFLOW");
  });

  it("never echoes DATABASE_URL, a host, a username, or a password in a refusal message", () => {
    const r = assessRestoreTarget({ OPSIQ_DB_TARGET: "production", DATABASE_URL: "postgresql://secretuser:secretpass@real-prod-host.neon.tech:5432/proddb" });
    expect(r.message).not.toMatch(/secretuser|secretpass|real-prod-host|proddb/);
  });
});

describe("assessRestoreTarget: missing/unsupported targets fail closed", () => {
  it("refuses when OPSIQ_DB_TARGET is unset", () => {
    const r = assessRestoreTarget({ DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/db" });
    expect(r.ok).toBe(false);
    expect(r.code).toBe("RESTORE_TARGET_REQUIRED");
  });

  it.each(["ci", "test", "unknown", "", "dev", "sandbox"])("refuses unsupported target '%s'", (t) => {
    const r = assessRestoreTarget({ OPSIQ_DB_TARGET: t, DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/db" });
    expect(r.ok).toBe(false);
  });

  it("refuses local target with DATABASE_URL unset", () => {
    const r = assessRestoreTarget({ OPSIQ_DB_TARGET: "local" });
    expect(r.ok).toBe(false);
    expect(r.code).toBe("RESTORE_DATABASE_URL_UNSET");
  });
});

describe("assessRestoreTarget: local target requires a TRUE loopback URL (no named-host exception)", () => {
  it("allows localhost, 127.0.0.1, ::1", () => {
    for (const host of ["localhost", "127.0.0.1", "[::1]"]) {
      const r = assessRestoreTarget({ OPSIQ_DB_TARGET: "local", DATABASE_URL: `postgresql://postgres:postgres@${host}:5432/db` });
      expect(r.ok).toBe(true);
      expect(r.target).toBe("local");
    }
  });

  it("refuses a non-loopback hostname labelled 'local'", () => {
    const r = assessRestoreTarget({ OPSIQ_DB_TARGET: "local", DATABASE_URL: "postgresql://postgres:postgres@internal-db.corp.example.com:5432/db" });
    expect(r.ok).toBe(false);
    expect(r.code).toBe("RESTORE_LOCAL_REQUIRES_LOOPBACK");
  });

  it("staging delegates to the canonical validator rather than parsing the URL itself", () => {
    const r = assessRestoreTarget({ OPSIQ_DB_TARGET: "staging", DATABASE_URL: "postgresql://u:p@some-staging-host.neon.tech/db" });
    expect(r.ok).toBe(true);
    expect(r.target).toBe("staging");
    expect(r.needsStagingValidator).toBe(true);
  });
});

describe("isLoopbackPostgresUrl: numeric-IP-obfuscation bypass attempts are all correctly refused", () => {
  // These are the classic SSRF/allowlist-bypass encodings of 127.0.0.1. WHATWG URL only special-
  // cases IPv4 canonicalization for "special" schemes (http/https/ws/wss/ftp/file); postgres: and
  // postgresql: are non-special, so Node's URL class does NOT canonicalize a bare (unbracketed)
  // IPv4 obfuscation for these schemes -- the decimal/hex/octal/short forms below each produce a
  // literal, non-matching hostname string. The bracketed IPv4-mapped-IPv6 case is DIFFERENT:
  // WHATWG URL parses and compresses a bracketed IPv6 literal (e.g. "[::ffff:127.0.0.1]" ->
  // "[::ffff:7f00:1]") regardless of scheme speciality -- that parsing is not special-scheme-gated
  // the way IPv4 canonicalization is. It is still correctly refused here, but for a different
  // reason: LOOPBACK_HOSTS only contains the literal string "[::1]", and the compressed mapped
  // form never equals that string, not because the scheme prevented any canonicalization.
  it.each([
    ["decimal IPv4", "2130706433"], // 127.0.0.1 as a single decimal integer
    ["hex IPv4", "0x7f000001"],
    ["octal-looking IPv4", "0177.0.0.1"],
    ["IPv4-mapped IPv6", "[::ffff:127.0.0.1]"],
    ["partial/short form", "127.1"],
  ])("rejects %s ('%s') as NOT loopback for the non-special postgres: scheme", (_label, hostEncoding) => {
    const url = `postgresql://postgres:postgres@${hostEncoding}:5432/db`;
    expect(isLoopbackPostgresUrl(url)).toBe(false);
  });

  it("rejects a userinfo-injection trick (loopback-looking userinfo, real host after @)", () => {
    // e.g. "postgresql://localhost@real-host/db" -- "localhost" here is the USERNAME, not the host.
    const url = "postgresql://localhost@real-external-host.example.com:5432/db";
    expect(isLoopbackPostgresUrl(url)).toBe(false);
  });

  it("rejects a host/hostaddr query-param override even when the hostname itself is loopback", () => {
    expect(isLoopbackPostgresUrl("postgresql://postgres:postgres@localhost:5432/db?host=real-external-host.example.com")).toBe(false);
    expect(isLoopbackPostgresUrl("postgresql://postgres:postgres@localhost:5432/db?hostaddr=10.0.0.5")).toBe(false);
    expect(isLoopbackPostgresUrl("postgresql://postgres:postgres@localhost:5432/db?HOSTADDR=10.0.0.5")).toBe(false); // case-insensitive key check
  });

  it("rejects a non-postgres scheme even with a loopback host (scheme is checked explicitly)", () => {
    expect(isLoopbackPostgresUrl("http://localhost:5432/db")).toBe(false);
    expect(isLoopbackPostgresUrl("mysql://localhost:5432/db")).toBe(false);
  });

  it("rejects malformed/unparseable input without throwing", () => {
    expect(isLoopbackPostgresUrl("not a url at all")).toBe(false);
    expect(isLoopbackPostgresUrl(undefined)).toBe(false);
    expect(isLoopbackPostgresUrl("")).toBe(false);
  });

  it("accepts the real loopback forms the policy intends to allow", () => {
    expect(isLoopbackPostgresUrl("postgresql://postgres:postgres@localhost:5432/db")).toBe(true);
    expect(isLoopbackPostgresUrl("postgres://postgres:postgres@127.0.0.1:5432/db")).toBe(true);
    expect(isLoopbackPostgresUrl("postgresql://postgres:postgres@[::1]:5432/db")).toBe(true);
  });
});
