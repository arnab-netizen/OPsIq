// Production safety configuration
// Minimal changes to core systems, config-driven

export const PRODUCTION_CONFIG = {
  // Idempotency: request deduplication window (seconds)
  idempotencyWindowSeconds: 60,

  // Rate limiting: requests per workspace per minute
  rateLimit: {
    requestsPerMinute: 1000,
    windowMs: 60 * 1000,
  },

  // Retention policy: auto-delete old records (days)
  retention: {
    operatorItemTtlDays: parseInt(process.env.OPERATOR_ITEM_TTL_DAYS || "730"), // 2 years default
    auditEventTtlDays: parseInt(process.env.AUDIT_EVENT_TTL_DAYS || "90"),
    lifecycleEventTtlDays: parseInt(process.env.LIFECYCLE_EVENT_TTL_DAYS || "365"),
    decisionLifecycleTtlDays: parseInt(process.env.DECISION_LIFECYCLE_TTL_DAYS || "30"),
  },

  // Deduplication: detect duplicate decisions within N seconds
  deduplicationWindowSeconds: 5,
};

// In-memory rate limiter (per-workspace)
const workspaceRateLimitState = new Map<
  string,
  { count: number; resetAt: number }
>();

export function checkRateLimit(workspaceId: string): boolean {
  const now = Date.now();
  const state = workspaceRateLimitState.get(workspaceId);

  if (!state || now > state.resetAt) {
    workspaceRateLimitState.set(workspaceId, {
      count: 1,
      resetAt: now + PRODUCTION_CONFIG.rateLimit.windowMs,
    });
    return true;
  }

  if (state.count >= PRODUCTION_CONFIG.rateLimit.requestsPerMinute) {
    return false;
  }

  state.count++;
  return true;
}

// Request deduplication: track recent request hashes
const recentRequests = new Map<string, number>();

export function getRequestHash(workspaceId: string, body: unknown): string {
  const jsonStr = JSON.stringify(body);
  // Simple hash: first 32 chars of JSON + workspace ID
  return `${workspaceId}:${jsonStr.substring(0, 100)}`;
}

export function isDuplicateRequest(hash: string): boolean {
  const now = Date.now();
  const lastSeen = recentRequests.get(hash);

  if (!lastSeen || now - lastSeen > PRODUCTION_CONFIG.deduplicationWindowSeconds * 1000) {
    recentRequests.set(hash, now);
    return false;
  }

  return true;
}

// Cleanup: periodically purge old entries
setInterval(() => {
  const now = Date.now();
  const cutoff = now - PRODUCTION_CONFIG.idempotencyWindowSeconds * 1000;

  for (const [key, timestamp] of recentRequests.entries()) {
    if (timestamp < cutoff) {
      recentRequests.delete(key);
    }
  }
}, 60 * 1000); // Run every minute
