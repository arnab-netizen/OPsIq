import { TooManyRequestsError } from "@/infra/errors";
import { checkPgRateLimit } from "@/infra/rate-limiter-pg";

export class RateLimitError extends TooManyRequestsError {
  constructor(retryAfterSeconds: number) {
    super(
      `Rate limit exceeded. Retry after ${retryAfterSeconds} seconds.`,
      { retryAfterSeconds }
    );
    this.name = "RateLimitError";
  }
}

interface RateLimitConfig {
  windowMs: number;
  maxAttempts: number;
}

/**
 * Distributed, serverless-safe rate limit check for public identity endpoints
 * (login, signup, forgot-password, reset-password). Backed by checkPgRateLimit
 * (S7-DC11) instead of an in-process Map: a Map-based limiter is
 * instance-local, so on Vercel every concurrent/cold-started instance sees its
 * own empty bucket and the effective limit becomes N x the configured value
 * for N concurrent instances -- the exact split-brain gap that let a
 * pre-beta audit trivially exceed the configured attempt ceiling.
 *
 * windowMs/maxAttempts (fixed-window semantics) are converted to the token
 * bucket's continuous capacity/refillPerSecond: capacity = maxAttempts,
 * refillPerSecond = maxAttempts / (windowMs / 1000). This also removes the
 * fixed-window "burst at the window boundary" artifact of the old
 * implementation (2x maxAttempts obtainable by an attacker who times requests
 * either side of the window edge).
 *
 * Fails open on DB error (see checkPgRateLimit) -- rate limiting is
 * best-effort abuse control, not the security gate; auth itself is DB-backed
 * and fails closed independently.
 */
export async function requirePgRateLimit(key: string, config: RateLimitConfig): Promise<void> {
  const windowSeconds = config.windowMs / 1000;
  const result = await checkPgRateLimit(key, {
    capacity: config.maxAttempts,
    refillPerSecond: config.maxAttempts / windowSeconds,
  });
  if (!result.allowed) {
    throw new RateLimitError(result.retryAfterSeconds ?? Math.ceil(windowSeconds));
  }
}

// Production default is 10 attempts / 15 min (unchanged). The ceiling is env-overridable ONLY so the browser E2E
// lane — which legitimately performs many real logins from a single CI IP across its serial spec suite — is not
// self-throttled. When LOGIN_RATE_LIMIT_MAX_ATTEMPTS is unset or invalid the value is exactly 10, so no production
// deployment is affected and the gate is not weakened.
const LOGIN_MAX_ATTEMPTS = ((): number => {
  const raw = Number(process.env.LOGIN_RATE_LIMIT_MAX_ATTEMPTS);
  return Number.isInteger(raw) && raw >= 10 ? raw : 10;
})();

export const LOGIN_RATE_LIMIT: RateLimitConfig = {
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxAttempts: LOGIN_MAX_ATTEMPTS,
};

export const MUTATION_RATE_LIMIT: RateLimitConfig = {
  windowMs: 60 * 1000, // 1 minute
  maxAttempts: 30,
};

// Deliberately tighter than LOGIN_RATE_LIMIT: unlike a failed login, each
// forgot-password request that reaches the "user exists" branch sends a real
// email, so this bounds both inbox-bombing a target address and needless
// Resend spend, not just brute-force guessing.
export const PASSWORD_RESET_RATE_LIMIT: RateLimitConfig = {
  windowMs: 60 * 60 * 1000, // 1 hour
  maxAttempts: 5,
};
