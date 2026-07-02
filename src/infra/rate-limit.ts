import { TooManyRequestsError } from "@/infra/errors";
import { logger } from "@/infra/logger";

export class RateLimitError extends TooManyRequestsError {
  constructor(retryAfterSeconds: number) {
    super(
      `Rate limit exceeded. Retry after ${retryAfterSeconds} seconds.`,
      { retryAfterSeconds }
    );
    this.name = "RateLimitError";
  }
}

interface RateLimitEntry {
  count: number;
  windowStart: number;
}

interface RateLimitConfig {
  windowMs: number;
  maxAttempts: number;
}

const store = new Map<string, RateLimitEntry>();

let lastCleanup = Date.now();
const CLEANUP_INTERVAL_MS = 60_000;

function cleanup(windowMs: number): void {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;
  for (const [key, entry] of store) {
    if (now - entry.windowStart > windowMs * 2) {
      store.delete(key);
    }
  }
}

export function checkRateLimit(
  key: string,
  config: RateLimitConfig
): { allowed: boolean; remaining: number; retryAfterSeconds: number } {
  const now = Date.now();
  cleanup(config.windowMs);

  const entry = store.get(key);

  if (!entry || now - entry.windowStart > config.windowMs) {
    store.set(key, { count: 1, windowStart: now });
    return { allowed: true, remaining: config.maxAttempts - 1, retryAfterSeconds: 0 };
  }

  entry.count++;

  if (entry.count > config.maxAttempts) {
    const retryAfterSeconds = Math.ceil(
      (entry.windowStart + config.windowMs - now) / 1000
    );
    logger.warn("Rate limit exceeded", { key, count: entry.count, maxAttempts: config.maxAttempts });
    return { allowed: false, remaining: 0, retryAfterSeconds };
  }

  return {
    allowed: true,
    remaining: config.maxAttempts - entry.count,
    retryAfterSeconds: 0,
  };
}

export function requireRateLimit(key: string, config: RateLimitConfig): void {
  const result = checkRateLimit(key, config);
  if (!result.allowed) {
    throw new RateLimitError(result.retryAfterSeconds);
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
