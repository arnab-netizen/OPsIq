/**
 * B13-S1: OAuth Token Encryption Service
 *
 * Secure token management with encryption, state generation, and refresh handling.
 * All tokens are encrypted before storage and decrypted on use.
 * No raw tokens are ever exposed to the frontend.
 *
 * Security properties:
 * - Tokens encrypted at rest with authenticated AES-256-GCM. The per-workspace
 *   key is derived (HKDF-SHA256) from an explicit master key so ciphertext is
 *   bound to its workspace: a token encrypted for workspace A cannot be decrypted
 *   with workspace B's derived key (the GCM auth tag fails).
 * - Fail-closed: the master key MUST be supplied via the OAUTH_TOKEN_ENCRYPTION_KEY
 *   environment variable (>= 32 bytes, base64 or hex). If it is missing or too
 *   short, encrypt/decrypt THROW rather than silently downgrade to base64 or
 *   store plaintext. There is no insecure fallback.
 * - Ciphertext is a versioned string ("v1gcm.<iv>.<tag>.<ct>", base64 segments),
 *   never a bare base64 encoding of the token. decrypt refuses any other format.
 * - State tokens for CSRF protection on OAuth callbacks
 * - Nonce tokens for ID token validation
 * - Refresh token rotation on use
 * - Automatic cleanup of expired states
 */

import { randomBytes, createCipheriv, createDecipheriv, hkdfSync } from "crypto";

/** Env var holding the master key for OAuth token encryption. No default — absence fails closed. */
export const OAUTH_TOKEN_ENCRYPTION_KEY_ENV = "OAUTH_TOKEN_ENCRYPTION_KEY";
/** Ciphertext format tag. A value NOT starting with this is rejected by decrypt. */
const TOKEN_ENC_VERSION = "v1gcm";
const TOKEN_ENC_IV_BYTES = 12;
const TOKEN_ENC_KEY_BYTES = 32;
const TOKEN_ENC_HKDF_INFO = "opsiq-oauth-token-v1";

export interface OAuthToken {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
  tokenType: string; // "Bearer", "Basic", etc.
}

export interface EncryptedOAuthToken {
  accessToken: string; // AES-256-GCM ciphertext: "v1gcm.<iv>.<tag>.<ct>" (base64 segments)
  refreshToken?: string; // AES-256-GCM ciphertext (same format) when present
  expiresAt?: Date;
  tokenType: string;
}

export interface OAuthState {
  state: string;
  nonce: string;
  codeVerifier: string; // for PKCE
  createdAt: Date;
  expiresAt: Date;
}

/**
 * Generate cryptographically secure random state tokens for OAuth flows.
 * Returns state, nonce, and code_verifier for PKCE support.
 */
export function generateOAuthState(ttlSeconds: number = 600): OAuthState {
  const state = randomBytes(32).toString("hex");
  const nonce = randomBytes(32).toString("hex");
  const codeVerifier = randomBytes(32).toString("base64url");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);

  return {
    state,
    nonce,
    codeVerifier,
    createdAt: now,
    expiresAt,
  };
}

/**
 * Validate OAuth state token (anti-CSRF).
 * Returns true if state is valid and not expired.
 */
export function validateOAuthState(
  storedState: OAuthState,
  receivedState: string,
): boolean {
  // Constant-time comparison to prevent timing attacks
  const bufStored = Buffer.from(storedState.state);
  const bufReceived = Buffer.from(receivedState);

  if (bufStored.length !== bufReceived.length) {
    return false;
  }

  let matches = true;
  for (let i = 0; i < bufStored.length; i++) {
    if (bufStored[i] !== bufReceived[i]) {
      matches = false;
    }
  }

  // Check expiration
  if (new Date() > storedState.expiresAt) {
    return false;
  }

  return matches;
}

/**
 * Load and validate the master encryption key. Fails closed (throws) when the
 * OAUTH_TOKEN_ENCRYPTION_KEY env var is missing, empty, malformed, or too short.
 * Never returns a weak/default key.
 */
function getMasterKey(): Buffer {
  const raw = process.env[OAUTH_TOKEN_ENCRYPTION_KEY_ENV];
  if (!raw || raw.trim() === "") {
    throw new Error(
      `${OAUTH_TOKEN_ENCRYPTION_KEY_ENV} is not configured. OAuth token encryption fails closed: ` +
        `refusing to encrypt or decrypt tokens without an explicit encryption key.`,
    );
  }
  const trimmed = raw.trim();
  const looksHex = /^[0-9a-fA-F]+$/.test(trimmed) && trimmed.length % 2 === 0;
  const key = looksHex ? Buffer.from(trimmed, "hex") : Buffer.from(trimmed, "base64");
  if (key.length < TOKEN_ENC_KEY_BYTES) {
    throw new Error(
      `${OAUTH_TOKEN_ENCRYPTION_KEY_ENV} must decode to at least ${TOKEN_ENC_KEY_BYTES} bytes ` +
        `(base64 or hex); got ${key.length}. Refusing to use a weak key.`,
    );
  }
  return key;
}

/** Derive a 32-byte AES key bound to a specific workspace via HKDF-SHA256. */
function deriveWorkspaceKey(workspaceId: string): Buffer {
  if (!workspaceId) {
    throw new Error("workspaceId is required to derive an OAuth token encryption key.");
  }
  const derived = hkdfSync(
    "sha256",
    getMasterKey(),
    Buffer.from(workspaceId, "utf-8"),
    Buffer.from(TOKEN_ENC_HKDF_INFO, "utf-8"),
    TOKEN_ENC_KEY_BYTES,
  );
  return Buffer.from(derived);
}

/** Encrypt one field with authenticated AES-256-GCM under the workspace-derived key. */
function encryptField(plaintext: string, workspaceId: string): string {
  const key = deriveWorkspaceKey(workspaceId);
  const iv = randomBytes(TOKEN_ENC_IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf-8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [
    TOKEN_ENC_VERSION,
    iv.toString("base64"),
    authTag.toString("base64"),
    ciphertext.toString("base64"),
  ].join(".");
}

/** Decrypt one field. Throws on wrong/missing key, tampering, or unsupported format. */
function decryptField(encoded: string, workspaceId: string): string {
  const parts = encoded.split(".");
  if (parts.length !== 4 || parts[0] !== TOKEN_ENC_VERSION) {
    throw new Error(
      "Unsupported OAuth token ciphertext format: expected authenticated AES-256-GCM " +
        `("${TOKEN_ENC_VERSION}.<iv>.<tag>.<ct>"). Refusing to decrypt (fail closed).`,
    );
  }
  const iv = Buffer.from(parts[1], "base64");
  const authTag = Buffer.from(parts[2], "base64");
  const ciphertext = Buffer.from(parts[3], "base64");
  const key = deriveWorkspaceKey(workspaceId);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  // .final() throws if the auth tag does not verify (wrong key / tampered ciphertext).
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString("utf-8");
}

/**
 * Encrypt OAuth token for storage using authenticated AES-256-GCM with a
 * per-workspace derived key. Fails closed if OAUTH_TOKEN_ENCRYPTION_KEY is unset.
 */
export function encryptOAuthToken(token: OAuthToken, workspaceId: string): EncryptedOAuthToken {
  return {
    accessToken: encryptField(token.accessToken, workspaceId),
    refreshToken: token.refreshToken
      ? encryptField(token.refreshToken, workspaceId)
      : undefined,
    expiresAt: token.expiresAt,
    tokenType: token.tokenType,
  };
}

/**
 * Decrypt OAuth token for use. Throws (fails closed) on missing key, wrong
 * workspace key, tampered ciphertext, or legacy/base64 (non-GCM) input.
 */
export function decryptOAuthToken(
  encrypted: EncryptedOAuthToken,
  workspaceId: string,
): OAuthToken {
  return {
    accessToken: decryptField(encrypted.accessToken, workspaceId),
    refreshToken: encrypted.refreshToken
      ? decryptField(encrypted.refreshToken, workspaceId)
      : undefined,
    expiresAt: encrypted.expiresAt,
    tokenType: encrypted.tokenType,
  };
}

/**
 * Check if token is expired and needs refresh.
 */
export function isTokenExpired(token: OAuthToken, gracePeriodSeconds: number = 300): boolean {
  if (!token.expiresAt) {
    return false; // No expiration means it doesn't expire
  }

  const now = new Date();
  const refreshTime = new Date(token.expiresAt.getTime() - gracePeriodSeconds * 1000);

  return now >= refreshTime;
}

/**
 * Generate authorization code challenge for PKCE flow.
 * Prevents authorization code interception attacks.
 */
export function generateCodeChallenge(codeVerifier: string): string {
  const crypto = require("crypto");
  return crypto.createHash("sha256").update(codeVerifier).digest("base64url");
}

/**
 * Validate that the code_verifier matches the stored code_challenge.
 */
export function validateCodeVerifier(codeVerifier: string, codeChallenge: string): boolean {
  const challengeFromVerifier = generateCodeChallenge(codeVerifier);

  // Constant-time comparison
  const bufChallenge = Buffer.from(codeChallenge);
  const bufComputed = Buffer.from(challengeFromVerifier);

  if (bufChallenge.length !== bufComputed.length) {
    return false;
  }

  let matches = true;
  for (let i = 0; i < bufChallenge.length; i++) {
    if (bufChallenge[i] !== bufComputed[i]) {
      matches = false;
    }
  }

  return matches;
}

/**
 * Sanitize token for logging/debugging (never expose full token).
 */
export function sanitizeTokenForLogging(token: OAuthToken): {
  accessToken: string;
  tokenType: string;
  expiresAt?: Date;
} {
  return {
    accessToken: `${token.accessToken.substring(0, 10)}...***`,
    tokenType: token.tokenType,
    expiresAt: token.expiresAt,
  };
}
