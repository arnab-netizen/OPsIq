/**
 * Public Route Exemption Registry
 *
 * Explicit whitelist of routes that may operate without authentication.
 * All other routes MUST enforce authentication.
 *
 * Categories:
 * - HEALTH: Health check, readiness, liveness probes
 * - STARTUP: Application startup verification
 * - PUBLIC: Explicitly public API endpoints (branded/marketed as such)
 * - WEBHOOK_SIGNED: Webhook routes with mandatory signature verification
 */

export const PUBLIC_ROUTE_EXEMPTIONS = {
  HEALTH: [
    "/api/health",
    "/api/readiness",
    "/api/liveness",
  ],
  STARTUP: [
    "/api/startup",
    "/api/internal/startup",
  ],
  OPS: [
    "/api/ops/errors",
    "/api/ops/metrics",
    "/api/ops/readiness",
    "/api/ops/runtime",
  ],
  PUBLIC: [
    "/api/public/actions",
    "/api/public/engagements",
    "/api/public/kpis",
  ],
  AUTH: [
    "/api/auth/login", // User login - credentials validated instead of auth token
    "/api/auth/logout", // Logout - accepts both authenticated and unauthenticated
  ],
  WEBHOOK_SIGNED: [
    "/api/webhooks/stripe", // Signature verification is mandatory
  ],
} as const;

export const EXEMPTION_REASONS = {
  "/api/health": "Health check endpoint for load balancers and monitoring",
  "/api/readiness": "Kubernetes readiness probe - no auth required",
  "/api/liveness": "Kubernetes liveness probe - no auth required",
  "/api/startup": "Application startup initialization - internal only",
  "/api/internal/startup": "Internal startup verification - system initialization endpoint",
  "/api/ops/errors": "Internal operations endpoint - error tracking and diagnostics",
  "/api/ops/metrics": "Internal operations endpoint - system metrics collection",
  "/api/ops/readiness": "Internal operations endpoint - readiness status for observability",
  "/api/ops/runtime": "Internal operations endpoint - runtime state for diagnostics",
  "/api/public/actions": "Public API - workspace context provided by caller",
  "/api/public/engagements": "Public API - workspace context provided by caller",
  "/api/public/kpis": "Public API - workspace context provided by caller",
  "/api/auth/login": "User authentication endpoint - validates credentials instead of auth token",
  "/api/auth/logout": "Session termination - accepts both authenticated and unauthenticated requests",
  "/api/webhooks/stripe": "Webhook with mandatory HMAC-SHA256 signature verification - Stripe signature validates request legitimacy",
} as const;

export function isPublicRouteExempted(path: string): boolean {
  const allExempted = Object.values(PUBLIC_ROUTE_EXEMPTIONS).flat();
  return allExempted.includes(path as any);
}

export function getExemptionReason(path: string): string | undefined {
  return EXEMPTION_REASONS[path as keyof typeof EXEMPTION_REASONS];
}
