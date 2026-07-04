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
  INTERNAL_DIAGNOSTIC: [
    "/api/internal/build-info", // Build metadata - safe public deployment info
    "/api/internal/debug-engagements-p2007", // Debug proof endpoint
    "/api/internal/debug-engagements-prisma", // Debug proof endpoint
    "/api/internal/demo-engagement-proof", // Demo proof endpoint
    "/api/internal/demo-permission-proof", // Demo proof endpoint (protected via OPSIQ_DIAGNOSTIC_KEY)
    "/api/internal/engagement-dashboard-route-proof", // Proof endpoint
    "/api/internal/engagement-drift-route-proof", // Proof endpoint
    "/api/internal/engagements-api-runtime-trace", // Runtime trace endpoint
    "/api/internal/engagements-route-proof", // Proof endpoint
    "/api/internal/login-diagnostic", // Diagnostic endpoint
    "/api/internal/owner-dashboard-runtime-proof", // Runtime proof endpoint
    "/api/internal/signup-owner-permission-proof", // Signup permission proof endpoint
    "/api/internal/signup-proof", // Signup proof endpoint
  ],
  PUBLIC: [
    "/api/public/actions",
    "/api/public/engagements",
    "/api/public/kpis",
  ],
  AUTH: [
    "/api/auth/login", // User login - credentials validated instead of auth token
    "/api/auth/logout", // Logout - accepts both authenticated and unauthenticated
    "/api/auth/signup", // User signup - public registration endpoint, no auth required
  ],
  WEBHOOK_SIGNED: [
    "/api/webhooks/stripe", // Signature verification is mandatory
  ],
  SCHEDULER_TOKEN: [
    // Not session-auth: authorized by a strong SCHEDULER_INTERNAL_TOKEN (constant-time
    // compared, fail-closed / disabled when the token is unset). Invoked by the caller's scheduler.
    "/api/internal/reassessment-scan",
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
  "/api/auth/signup": "User signup endpoint - public registration, no auth required",
  "/api/webhooks/stripe": "Webhook with mandatory HMAC-SHA256 signature verification - Stripe signature validates request legitimacy",
  "/api/internal/reassessment-scan": "Scheduler endpoint authorized by SCHEDULER_INTERNAL_TOKEN (constant-time compare, fail-closed when unset) instead of session auth",
  "/api/internal/build-info": "Build metadata endpoint - safe public deployment info (commit SHA, environment)",
  "/api/internal/debug-engagements-p2007": "Internal debug and proof endpoint - development and testing only",
  "/api/internal/debug-engagements-prisma": "Internal debug and proof endpoint - development and testing only",
  "/api/internal/demo-engagement-proof": "Internal demo proof endpoint - proves engagement lifecycle in deployed runtime",
  "/api/internal/demo-permission-proof": "Internal demo proof endpoint - proves permission resolution (protected via OPSIQ_DIAGNOSTIC_KEY)",
  "/api/internal/engagement-dashboard-route-proof": "Internal proof endpoint - demonstrates engagement dashboard route execution",
  "/api/internal/engagement-drift-route-proof": "Internal proof endpoint - demonstrates engagement drift detection",
  "/api/internal/engagements-api-runtime-trace": "Internal runtime trace endpoint - API execution tracing",
  "/api/internal/engagements-route-proof": "Internal proof endpoint - demonstrates engagements route execution",
  "/api/internal/login-diagnostic": "Internal diagnostic endpoint - login flow investigation",
  "/api/internal/owner-dashboard-runtime-proof": "Internal proof endpoint - demonstrates owner dashboard runtime behavior",
  "/api/internal/signup-owner-permission-proof": "Internal proof endpoint - demonstrates signup permission granting",
  "/api/internal/signup-proof": "Internal proof endpoint - demonstrates signup flow execution",
} as const;

export function isPublicRouteExempted(path: string): boolean {
  const allExempted = Object.values(PUBLIC_ROUTE_EXEMPTIONS).flat();
  return allExempted.includes(path as any);
}

export function getExemptionReason(path: string): string | undefined {
  return EXEMPTION_REASONS[path as keyof typeof EXEMPTION_REASONS];
}
