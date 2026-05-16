/**
 * Rate Limiting Middleware
 *
 * Applies rate limit checks to API requests.
 * Workspace-based quota + IP-based DDoS protection.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  checkWorkspaceRateLimit,
  checkIPRateLimit,
} from "@/services/rate-limit";
import { RateLimitTier } from "@/domain/rate-limit/rate-limit-contracts";

/**
 * Extract client IP from request
 */
export function getClientIP(request: NextRequest): string {
  // Check standard forwarding headers
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }

  const realIP = request.headers.get("x-real-ip");
  if (realIP) {
    return realIP;
  }

  // Fallback (in local development)
  return "unknown";
}

/**
 * Apply rate limit check to request
 * Returns response with rate limit headers or null if within quota
 */
export function applyRateLimit(
  request: NextRequest,
  workspaceId: string | null,
  tier: RateLimitTier = RateLimitTier.FREE
): { response: NextResponse; rateLimited: boolean } | null {
  const clientIP = getClientIP(request);

  // Check IP-based DDoS limit first (applies to all traffic)
  const ipCheck = checkIPRateLimit(clientIP);
  if (!ipCheck.allowed) {
    const response = NextResponse.json(
      { error: "Too many requests from this IP", ...ipCheck },
      { status: 429 }
    );
    response.headers.set("Retry-After", String(ipCheck.retryAfterSeconds || 60));
    response.headers.set("X-RateLimit-Limit", String(ipCheck.retryAfterSeconds || 60));
    response.headers.set("X-RateLimit-Remaining", "0");
    return { response, rateLimited: true };
  }

  // If no workspace ID, allow (public endpoint)
  if (!workspaceId) {
    return null;
  }

  // Check workspace quota
  const workspaceCheck = checkWorkspaceRateLimit(workspaceId, tier);
  if (!workspaceCheck.allowed) {
    const response = NextResponse.json(
      { error: "Quota exceeded", ...workspaceCheck },
      { status: 429 }
    );
    response.headers.set("Retry-After", String(workspaceCheck.retryAfterSeconds || 3600));
    response.headers.set(
      "X-RateLimit-Limit",
      String(workspaceCheck.quotaUsagePercent || 0)
    );
    response.headers.set("X-RateLimit-Remaining", String(workspaceCheck.tokensRemaining || 0));
    response.headers.set(
      "X-RateLimit-Reset",
      String(workspaceCheck.retryAfterSeconds || 3600)
    );
    return { response, rateLimited: true };
  }

  // Within quota - add rate limit headers to response (for caller)
  return null;
}

/**
 * Add rate limit headers to response
 */
export function addRateLimitHeaders(
  response: NextResponse,
  remaining: number,
  limit: number,
  resetSeconds: number
): NextResponse {
  response.headers.set("X-RateLimit-Limit", String(limit));
  response.headers.set("X-RateLimit-Remaining", String(remaining));
  response.headers.set("X-RateLimit-Reset", String(resetSeconds));
  return response;
}
