/**
 * Phase 9: Verify that the decision signing module fails closed in production
 * when DECISION_SIGNING_SECRET is absent, and uses constant-time comparison.
 */
import { readFileSync } from "fs";
import { join } from "path";
import { signDecisionHash, verifySignature } from "@/services/integrity/sign";

const SIGN_PATH = join(process.cwd(), "src/services/integrity/sign.ts");
const src = readFileSync(SIGN_PATH, "utf-8");

describe("src/services/integrity/sign.ts — static source checks", () => {
  it("imports timingSafeEqual from crypto", () => {
    expect(src).toMatch(/import\s*\{[^}]*timingSafeEqual[^}]*\}\s*from\s*['"]crypto['"]/);
  });

  it("does not use === to compare HMAC digests", () => {
    // computedSignature === signedHash is the pre-fix pattern.
    expect(src).not.toMatch(/computedSignature\s*===\s*signedHash/);
  });

  it("fails closed in production when DECISION_SIGNING_SECRET is absent", () => {
    // Must throw in production instead of falling back to a dev key.
    expect(src).toContain("NODE_ENV");
    expect(src).toContain("production");
    expect(src).toContain("throw new Error");
    // The error message must reference DECISION_SIGNING_SECRET.
    expect(src).toContain("DECISION_SIGNING_SECRET must be configured in production");
  });

  it("does not embed a hardcoded production-capable signing secret", () => {
    // The old "dev-signing-key" must not be used as a production fallback.
    // It may still appear in the dev-only fallback branch, but only gated by NODE_ENV check.
    const prodBlock = src.slice(0, src.indexOf("NODE_ENV"));
    // Before the NODE_ENV check, no hardcoded secret should be returned.
    expect(prodBlock).not.toContain('"dev-signing-key"');
  });

  it("uses timingSafeEqual in verifySignature", () => {
    const fnStart = src.indexOf("export function verifySignature");
    const fnEnd = src.indexOf("\n}", fnStart);
    expect(fnStart).toBeGreaterThan(-1);
    const fnBody = src.slice(fnStart, fnEnd);
    expect(fnBody).toContain("timingSafeEqual");
  });

  it("checks buffer lengths before timingSafeEqual to handle length mismatches", () => {
    const fnStart = src.indexOf("export function verifySignature");
    const fnEnd = src.indexOf("\n}", fnStart);
    const fnBody = src.slice(fnStart, fnEnd);
    // Should return false for mismatched lengths.
    expect(fnBody).toContain("a.length !== b.length");
    expect(fnBody).toContain("return false");
  });
});

describe("src/services/integrity/sign.ts — runtime behavior (non-production)", () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalSecret = process.env.DECISION_SIGNING_SECRET;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    if (originalSecret === undefined) {
      delete process.env.DECISION_SIGNING_SECRET;
    } else {
      process.env.DECISION_SIGNING_SECRET = originalSecret;
    }
  });

  it("verifySignature returns true for a matching signature in non-production", () => {
    process.env.NODE_ENV = "test";
    process.env.DECISION_SIGNING_SECRET = "test-secret-for-unit-test-only";
    // resolveSigningSecret() reads env vars at call time — no module reset needed.
    const hash = "abc123";
    const sig = signDecisionHash(hash);
    expect(verifySignature(hash, sig)).toBe(true);
  });

  it("verifySignature returns false for a wrong signature", () => {
    process.env.NODE_ENV = "test";
    process.env.DECISION_SIGNING_SECRET = "test-secret-for-unit-test-only";
    const hash = "abc123";
    const sig = signDecisionHash(hash);
    // Corrupt a hex char — "f" → "0" guarantees different bytes if any nibble was "f", or
    // produce an all-zeros same-length signature which is a definitively wrong value.
    const wrongSig = "0".repeat(64); // same length, wrong bytes
    expect(verifySignature(hash, wrongSig)).toBe(false);
    expect(verifySignature("different-hash", sig)).toBe(false);
  });
});
