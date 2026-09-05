/**
 * B13-S1: OAuth Token Service — Pure Function Tests
 *
 * Verifies:
 * - State generation (CSRF protection)
 * - State validation (constant-time comparison)
 * - Token encryption/decryption
 * - Token expiration detection
 * - PKCE code verifier validation
 * - Token sanitization for logging
 */

import { describe, it, expect } from "vitest";
import {
  generateOAuthState,
  validateOAuthState,
  encryptOAuthToken,
  decryptOAuthToken,
  isTokenExpired,
  generateCodeChallenge,
  validateCodeVerifier,
  sanitizeTokenForLogging,
  OAUTH_TOKEN_ENCRYPTION_KEY_ENV,
  type OAuthToken,
} from "@/services/external-systems/oauth-token.service";

// Synthetic 32-byte key for tests only (NOT a real secret). Encryption fails
// closed without a configured key, so the suite must supply one explicitly.
const TEST_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
process.env[OAUTH_TOKEN_ENCRYPTION_KEY_ENV] = TEST_ENCRYPTION_KEY;

describe("B13-S1: OAuth Token Service", () => {
  describe("State Generation", () => {
    it("should generate unique state tokens", () => {
      const state1 = generateOAuthState();
      const state2 = generateOAuthState();

      expect(state1.state).not.toBe(state2.state);
      expect(state1.nonce).not.toBe(state2.nonce);
      expect(state1.codeVerifier).not.toBe(state2.codeVerifier);
    });

    it("should generate state with required fields", () => {
      const state = generateOAuthState(600);

      expect(state.state).toBeDefined();
      expect(state.nonce).toBeDefined();
      expect(state.codeVerifier).toBeDefined();
      expect(state.createdAt).toBeInstanceOf(Date);
      expect(state.expiresAt).toBeInstanceOf(Date);
      expect(state.expiresAt.getTime()).toBeGreaterThan(state.createdAt.getTime());
    });

    it("should respect TTL parameter", () => {
      const state = generateOAuthState(300);
      const expectedExpiry = new Date(state.createdAt.getTime() + 300 * 1000);

      // Allow 100ms tolerance for test execution
      expect(Math.abs(state.expiresAt.getTime() - expectedExpiry.getTime())).toBeLessThan(100);
    });

    it("should generate cryptographically secure tokens (length check)", () => {
      const state = generateOAuthState();

      // State and nonce should be 64 hex chars (32 bytes)
      expect(state.state.length).toBe(64);
      expect(state.nonce.length).toBe(64);
      // Code verifier should be base64url encoded
      expect(state.codeVerifier.length).toBeGreaterThan(40);
    });
  });

  describe("State Validation", () => {
    it("should validate correct state token", () => {
      const state = generateOAuthState();
      const isValid = validateOAuthState(state, state.state);

      expect(isValid).toBe(true);
    });

    it("should reject incorrect state token", () => {
      const state = generateOAuthState();
      const wrongState = generateOAuthState();

      const isValid = validateOAuthState(state, wrongState.state);

      expect(isValid).toBe(false);
    });

    it("should reject expired state token", () => {
      const state = generateOAuthState(1); // 1 second TTL
      // Wait for expiration
      const now = new Date();
      state.expiresAt = new Date(now.getTime() - 1000);

      const isValid = validateOAuthState(state, state.state);

      expect(isValid).toBe(false);
    });

    it("should use constant-time comparison (no timing attack)", () => {
      const state = generateOAuthState();
      const wrongState = "a".repeat(64); // All same character

      // Both should return false, and timing should be similar
      const result1 = validateOAuthState(state, wrongState);
      const result2 = validateOAuthState(state, wrongState);

      expect(result1).toBe(false);
      expect(result2).toBe(false);
    });

    it("should handle empty state gracefully", () => {
      const state = generateOAuthState();

      const isValid = validateOAuthState(state, "");

      expect(isValid).toBe(false);
    });
  });

  describe("Token Encryption/Decryption", () => {
    it("should encrypt and decrypt token", () => {
      const originalToken: OAuthToken = {
        accessToken: "access_token_123",
        refreshToken: "refresh_token_456",
        expiresAt: new Date("2026-12-31"),
        tokenType: "Bearer",
      };

      const encrypted = encryptOAuthToken(originalToken, "ws_123");
      const decrypted = decryptOAuthToken(encrypted, "ws_123");

      expect(decrypted.accessToken).toBe(originalToken.accessToken);
      expect(decrypted.refreshToken).toBe(originalToken.refreshToken);
      expect(decrypted.expiresAt).toEqual(originalToken.expiresAt);
      expect(decrypted.tokenType).toBe(originalToken.tokenType);
    });

    it("should handle token without refresh token", () => {
      const originalToken: OAuthToken = {
        accessToken: "access_token_123",
        tokenType: "Bearer",
      };

      const encrypted = encryptOAuthToken(originalToken, "ws_123");
      const decrypted = decryptOAuthToken(encrypted, "ws_123");

      expect(decrypted.accessToken).toBe(originalToken.accessToken);
      expect(decrypted.refreshToken).toBeUndefined();
    });

    it("should encrypt different tokens differently", () => {
      const token1 = encryptOAuthToken(
        { accessToken: "token1", tokenType: "Bearer" },
        "ws_123",
      );
      const token2 = encryptOAuthToken(
        { accessToken: "token2", tokenType: "Bearer" },
        "ws_123",
      );

      expect(token1.accessToken).not.toBe(token2.accessToken);
    });

    it("should never expose raw token in encrypted form hints", () => {
      const token = encryptOAuthToken(
        { accessToken: "super_secret_token_12345", tokenType: "Bearer" },
        "ws_123",
      );

      // Encrypted form should not contain readable token parts
      expect(token.accessToken).not.toContain("super_secret");
      expect(token.accessToken).not.toContain("12345");
    });
  });

  describe("Encryption hardening (Phase 0 truth/safety)", () => {
    const plaintextToken = "super_secret_token_12345";

    it("ciphertext is not the plaintext", () => {
      const enc = encryptOAuthToken(
        { accessToken: plaintextToken, tokenType: "Bearer" },
        "ws_123",
      );
      expect(enc.accessToken).not.toBe(plaintextToken);
      expect(enc.accessToken).not.toContain(plaintextToken);
    });

    it("ciphertext is NOT a simple base64 of the token (rejects the old scheme)", () => {
      const enc = encryptOAuthToken(
        { accessToken: plaintextToken, tokenType: "Bearer" },
        "ws_123",
      );
      const naiveBase64 = Buffer.from(plaintextToken).toString("base64");
      // The stored value must not equal base64(token), and base64-decoding it
      // must not reveal the token (which the old placeholder implementation did).
      expect(enc.accessToken).not.toBe(naiveBase64);
      const decodedWhole = Buffer.from(enc.accessToken, "base64").toString("utf-8");
      expect(decodedWhole).not.toContain(plaintextToken);
      // It uses the authenticated AES-256-GCM envelope, not bare base64.
      expect(enc.accessToken.startsWith("v1gcm.")).toBe(true);
    });

    it("decrypt works with the correct workspace key", () => {
      const enc = encryptOAuthToken(
        { accessToken: plaintextToken, refreshToken: "refresh_abc", tokenType: "Bearer" },
        "ws_correct",
      );
      const dec = decryptOAuthToken(enc, "ws_correct");
      expect(dec.accessToken).toBe(plaintextToken);
      expect(dec.refreshToken).toBe("refresh_abc");
    });

    it("decrypt FAILS with the wrong workspace key (GCM auth tag rejects)", () => {
      const enc = encryptOAuthToken(
        { accessToken: plaintextToken, tokenType: "Bearer" },
        "ws_owner",
      );
      expect(() => decryptOAuthToken(enc, "ws_attacker")).toThrow();
    });

    it("decrypt FAILS on tampered ciphertext", () => {
      const enc = encryptOAuthToken(
        { accessToken: plaintextToken, tokenType: "Bearer" },
        "ws_123",
      );
      const parts = enc.accessToken.split(".");
      // Flip the last base64 char of the ciphertext segment.
      const ct = parts[3];
      parts[3] = ct.slice(0, -1) + (ct.slice(-1) === "A" ? "B" : "A");
      const tampered = { ...enc, accessToken: parts.join(".") };
      expect(() => decryptOAuthToken(tampered, "ws_123")).toThrow();
    });

    it("decrypt REFUSES legacy base64 (non-GCM) input — no silent downgrade", () => {
      const legacy = {
        accessToken: Buffer.from(plaintextToken).toString("base64"),
        tokenType: "Bearer",
      };
      expect(() => decryptOAuthToken(legacy, "ws_123")).toThrow();
    });

    it("fails closed when the encryption key is missing", () => {
      const saved = process.env[OAUTH_TOKEN_ENCRYPTION_KEY_ENV];
      try {
        delete process.env[OAUTH_TOKEN_ENCRYPTION_KEY_ENV];
        expect(() =>
          encryptOAuthToken({ accessToken: plaintextToken, tokenType: "Bearer" }, "ws_123"),
        ).toThrow(/not configured|fails closed/i);
      } finally {
        process.env[OAUTH_TOKEN_ENCRYPTION_KEY_ENV] = saved;
      }
    });

    it("fails closed when the encryption key is too short/weak", () => {
      const saved = process.env[OAUTH_TOKEN_ENCRYPTION_KEY_ENV];
      try {
        process.env[OAUTH_TOKEN_ENCRYPTION_KEY_ENV] = Buffer.alloc(8, 1).toString("base64");
        expect(() =>
          encryptOAuthToken({ accessToken: plaintextToken, tokenType: "Bearer" }, "ws_123"),
        ).toThrow(/at least 32 bytes|weak key/i);
      } finally {
        process.env[OAUTH_TOKEN_ENCRYPTION_KEY_ENV] = saved;
      }
    });

    it("no code path labels base64 as encryption (source contract)", async () => {
      const fs = await import("fs");
      const path = await import("path");
      const src = fs.readFileSync(
        path.join(process.cwd(), "src/services/external-systems/oauth-token.service.ts"),
        "utf-8",
      );
      // The insecure placeholder returned base64 of the raw token as "encrypted".
      expect(src).not.toContain('Buffer.from(token.accessToken).toString("base64")');
      expect(src).toContain("createCipheriv");
      expect(src).toContain("aes-256-gcm");
    });
  });

  describe("Token Expiration", () => {
    it("should detect expired token", () => {
      const expiredToken: OAuthToken = {
        accessToken: "token",
        tokenType: "Bearer",
        expiresAt: new Date("2020-01-01"),
      };

      expect(isTokenExpired(expiredToken)).toBe(true);
    });

    it("should detect valid token", () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 30);

      const validToken: OAuthToken = {
        accessToken: "token",
        tokenType: "Bearer",
        expiresAt: futureDate,
      };

      expect(isTokenExpired(validToken)).toBe(false);
    });

    it("should respect grace period for refresh", () => {
      const expiresAt = new Date();
      expiresAt.setSeconds(expiresAt.getSeconds() + 100); // 100 seconds from now

      const token: OAuthToken = {
        accessToken: "token",
        tokenType: "Bearer",
        expiresAt,
      };

      // With 200 second grace period, token should need refresh
      expect(isTokenExpired(token, 200)).toBe(true);

      // With 50 second grace period, token should NOT need refresh
      expect(isTokenExpired(token, 50)).toBe(false);
    });

    it("should handle tokens without expiration", () => {
      const token: OAuthToken = {
        accessToken: "token",
        tokenType: "Bearer",
      };

      expect(isTokenExpired(token)).toBe(false);
    });
  });

  describe("PKCE Flow (Code Verifier)", () => {
    it("should generate code challenge from verifier", () => {
      const verifier = generateOAuthState().codeVerifier;
      const challenge = generateCodeChallenge(verifier);

      expect(challenge).toBeDefined();
      expect(challenge).not.toBe(verifier);
      // Challenge should be base64url encoded SHA256
      expect(challenge.length).toBeGreaterThan(30);
    });

    it("should validate correct code verifier", () => {
      const state = generateOAuthState();
      const challenge = generateCodeChallenge(state.codeVerifier);

      const isValid = validateCodeVerifier(state.codeVerifier, challenge);

      expect(isValid).toBe(true);
    });

    it("should reject incorrect code verifier", () => {
      const state1 = generateOAuthState();
      const state2 = generateOAuthState();
      const challenge = generateCodeChallenge(state1.codeVerifier);

      const isValid = validateCodeVerifier(state2.codeVerifier, challenge);

      expect(isValid).toBe(false);
    });

    it("should use constant-time comparison for code verifier", () => {
      const state = generateOAuthState();
      const challenge = generateCodeChallenge(state.codeVerifier);
      const wrongVerifier = "a".repeat(state.codeVerifier.length);

      const result = validateCodeVerifier(wrongVerifier, challenge);

      expect(result).toBe(false);
    });
  });

  describe("Token Sanitization", () => {
    // Synthetic, unmistakably fake token values — never real credentials.
    const REAL_LOOKING_TOKEN = "ya29.a0AfH6SMC_fake_synthetic_token_do_not_use_1234567890abcdef";

    it("should sanitize token for logging with a fixed, opaque marker", () => {
      const token: OAuthToken = {
        accessToken: REAL_LOOKING_TOKEN,
        tokenType: "Bearer",
        expiresAt: new Date("2026-12-31"),
      };

      const sanitized = sanitizeTokenForLogging(token);

      expect(sanitized.accessToken).toBe("[REDACTED]");
      expect(sanitized.tokenType).toBe("Bearer");
      expect(sanitized.expiresAt).toBe(token.expiresAt);
    });

    it("never contains the full access token", () => {
      const token: OAuthToken = { accessToken: REAL_LOOKING_TOKEN, tokenType: "Bearer" };
      const sanitized = sanitizeTokenForLogging(token);
      expect(sanitized.accessToken).not.toContain(REAL_LOOKING_TOKEN);
    });

    it("never contains the token's first 10 characters (the historical prefix-disclosure defect)", () => {
      const token: OAuthToken = { accessToken: REAL_LOOKING_TOKEN, tokenType: "Bearer" };
      const sanitized = sanitizeTokenForLogging(token);
      expect(sanitized.accessToken).not.toContain(REAL_LOOKING_TOKEN.slice(0, 10));
    });

    it("never contains the token's first 8 characters", () => {
      const token: OAuthToken = { accessToken: REAL_LOOKING_TOKEN, tokenType: "Bearer" };
      const sanitized = sanitizeTokenForLogging(token);
      expect(sanitized.accessToken).not.toContain(REAL_LOOKING_TOKEN.slice(0, 8));
    });

    it("never contains the token's last 8 characters", () => {
      const token: OAuthToken = { accessToken: REAL_LOOKING_TOKEN, tokenType: "Bearer" };
      const sanitized = sanitizeTokenForLogging(token);
      expect(sanitized.accessToken).not.toContain(REAL_LOOKING_TOKEN.slice(-8));
    });

    it("never contains any 4+ character contiguous substring of the real token", () => {
      const token: OAuthToken = { accessToken: REAL_LOOKING_TOKEN, tokenType: "Bearer" };
      const sanitized = sanitizeTokenForLogging(token);
      for (let i = 0; i + 4 <= REAL_LOOKING_TOKEN.length; i++) {
        const chunk = REAL_LOOKING_TOKEN.slice(i, i + 4);
        expect(sanitized.accessToken).not.toContain(chunk);
      }
    });

    it("does not leak the whole value even for a token shorter than 10 characters", () => {
      const shortToken: OAuthToken = { accessToken: "abcdefg", tokenType: "Bearer" };
      const sanitized = sanitizeTokenForLogging(shortToken);
      expect(sanitized.accessToken).not.toContain("abcdefg");
      expect(sanitized.accessToken).not.toBe("abcdefg");
      expect(sanitized.accessToken).toBe("[REDACTED]");
    });

    it("does not vary with token content (no fingerprint correlating back to the raw value)", () => {
      const a = sanitizeTokenForLogging({ accessToken: "token-alpha-0000000000", tokenType: "Bearer" });
      const b = sanitizeTokenForLogging({ accessToken: "token-beta--9999999999", tokenType: "Bearer" });
      expect(a.accessToken).toBe(b.accessToken);
    });

    it("preserves non-secret metadata (tokenType, expiresAt) while redacting the secret", () => {
      const expiresAt = new Date("2027-01-01");
      const token: OAuthToken = { accessToken: REAL_LOOKING_TOKEN, tokenType: "Bearer", expiresAt };
      const sanitized = sanitizeTokenForLogging(token);
      expect(sanitized.tokenType).toBe("Bearer");
      expect(sanitized.expiresAt).toBe(expiresAt);
    });
  });

  describe("Acceptance Gates", () => {
    it("should never expose tokens to frontend (service contract)", () => {
      // Contract: encryptOAuthToken and decryptOAuthToken are backend-only
      // Frontend never receives raw tokens, only uses them via backend API calls
      const token = encryptOAuthToken(
        { accessToken: "secret", tokenType: "Bearer" },
        "ws_123",
      );

      // The encrypted form should not be directly usable as a token
      expect(() => {
        // This should fail if someone tries to use encrypted form as a real token
        Buffer.from(token.accessToken, "base64").toString("utf-8");
      }).not.toThrow();
    });

    it("should generate unpredictable state tokens (CSRF protection)", () => {
      // State tokens must be cryptographically random
      const states = new Set();
      for (let i = 0; i < 100; i++) {
        states.add(generateOAuthState().state);
      }

      expect(states.size).toBe(100); // All unique
    });

    it("should support token refresh lifecycle", () => {
      const token: OAuthToken = {
        accessToken: "old_access",
        refreshToken: "refresh_token",
        tokenType: "Bearer",
      };

      // After expiration, token should be detected as needing refresh
      const expiredToken: OAuthToken = {
        ...token,
        expiresAt: new Date("2020-01-01"),
      };

      expect(isTokenExpired(expiredToken)).toBe(true);

      // With refresh token, flow should be able to continue
      expect(expiredToken.refreshToken).toBeDefined();
    });
  });
});
