import { describe, it, expect } from "vitest";
import {
  RESET_CONFIRMATION_TEXT,
  RESET_TOKEN_TTL_MS,
  normalizeEmail,
  parseDatabaseHost,
  validateDatabaseHost,
  isConfirmed,
  generateResetToken,
} from "../../../scripts/production-acceptance-password-reset.mjs";
import { createHash } from "crypto";

// This script exists because production password-reset email delivery is
// currently unavailable (no RESEND_API_KEY). It creates a PasswordResetToken
// row with the exact same semantics as src/app/api/auth/forgot-password/route.ts
// so the real /api/auth/reset-password route still performs the actual
// password change. These tests cover only the pure, DB-independent gating
// logic — the account-lookup/refusal branches and the Prisma writes require a
// live production-shaped database and are not exercised here; they were
// verified by direct code reading against the identical patterns already
// covered by the production auth test suite (password-reset-lifecycle.db.test.ts,
// password-reset-e2e.db.test.ts).

describe("production-acceptance-password-reset — TTL and hashing match production exactly", () => {
  it("RESET_TOKEN_TTL_MS is exactly one hour, matching forgot-password/route.ts", () => {
    expect(RESET_TOKEN_TTL_MS).toBe(60 * 60 * 1000);
  });

  it("generateResetToken produces a 32-byte hex token and its sha256 hex digest", () => {
    const { rawToken, tokenHash } = generateResetToken();
    expect(rawToken).toMatch(/^[0-9a-f]{64}$/);
    expect(tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(tokenHash).toBe(createHash("sha256").update(rawToken).digest("hex"));
  });

  it("two calls never produce the same token (real randomness, not a fixed fixture)", () => {
    const a = generateResetToken();
    const b = generateResetToken();
    expect(a.rawToken).not.toBe(b.rawToken);
    expect(a.tokenHash).not.toBe(b.tokenHash);
  });
});

describe("production-acceptance-password-reset — email normalization matches identityEmailSchema", () => {
  it("trims and lowercases, matching src/lib/validation.ts's identityEmailSchema exactly", () => {
    expect(normalizeEmail("  Owner@Example.COM  ")).toBe("owner@example.com");
  });
});

describe("production-acceptance-password-reset — confirmation gate", () => {
  it("accepts only the exact confirmation string", () => {
    expect(isConfirmed(RESET_CONFIRMATION_TEXT)).toBe(true);
  });

  it("rejects case variants, substrings, superstrings, and whitespace variants — no fuzzy match", () => {
    expect(isConfirmed(RESET_CONFIRMATION_TEXT.toLowerCase())).toBe(false);
    expect(isConfirmed(RESET_CONFIRMATION_TEXT.slice(0, -1))).toBe(false);
    expect(isConfirmed(`${RESET_CONFIRMATION_TEXT} `)).toBe(false);
    expect(isConfirmed(` ${RESET_CONFIRMATION_TEXT}`)).toBe(false);
    expect(isConfirmed(`${RESET_CONFIRMATION_TEXT}X`)).toBe(false);
  });

  it("rejects undefined/empty input rather than treating it as a pass", () => {
    expect(isConfirmed(undefined as unknown as string)).toBe(false);
    expect(isConfirmed("")).toBe(false);
  });
});

describe("production-acceptance-password-reset — database host gate", () => {
  const EXPECTED = "ep-empty-sky-ay1e6c27.c-5.us-east-2.aws.neon.tech";
  const direct = `postgresql://user:pass@${EXPECTED}/neondb?sslmode=require`;

  it("parseDatabaseHost extracts the bare hostname only, never credentials/path/query", () => {
    expect(parseDatabaseHost(direct)).toBe(EXPECTED);
  });

  it("parseDatabaseHost returns null for an unparseable URL rather than throwing", () => {
    expect(parseDatabaseHost("not a url")).toBeNull();
  });

  it("accepts an exact-match direct (non-pooler) host", () => {
    const result = validateDatabaseHost(direct, EXPECTED);
    expect(result.ok).toBe(true);
  });

  it("refuses a pooler endpoint even when the base hostname would otherwise match", () => {
    const poolerHost = "ep-empty-sky-ay1e6c27-pooler.c-5.us-east-2.aws.neon.tech";
    const poolerUrl = `postgresql://user:pass@${poolerHost}/neondb`;
    const result = validateDatabaseHost(poolerUrl, poolerHost);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("POOLER_ENDPOINT_REFUSED");
  });

  it("refuses any host that does not exactly equal EXPECTED_DATABASE_HOST — no substring/prefix match", () => {
    const wrongUrl = `postgresql://user:pass@staging-${EXPECTED}/neondb`;
    const result = validateDatabaseHost(wrongUrl, EXPECTED);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("HOST_MISMATCH");
  });

  it("refuses when EXPECTED_DATABASE_HOST is empty/undefined, even against a well-formed direct URL", () => {
    const result = validateDatabaseHost(direct, "");
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("HOST_MISMATCH");
  });

  it("refuses an unparseable DATABASE_URL before ever comparing hosts", () => {
    const result = validateDatabaseHost("not a url", EXPECTED);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("DATABASE_URL_UNPARSEABLE");
  });

  it("never leaks the connection string itself in a refusal reason", () => {
    const secretUrl = "postgresql://realuser:realsecretpassword@wrong-host.example.com/db";
    const result = validateDatabaseHost(secretUrl, EXPECTED);
    expect(result.ok).toBe(false);
    expect(result.reason).not.toContain("realuser");
    expect(result.reason).not.toContain("realsecretpassword");
  });
});
