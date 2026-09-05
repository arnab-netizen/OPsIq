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
  // NOTE (open-beta hardening audit): these three route NAMES suggest they
  // bypass auth entirely ("workspace context provided by caller"). They do
  // not. All three are wrapped in withCanonicalEnforcement({ requireWorkspace:
  // true, requireCapabilities: [...] }); workspaceId is resolved exclusively
  // from the caller's own DB-verified workspace membership inside
  // canonical-route-enforcement.ts, never from a query param, request body,
  // or header (confirmed by direct code reading during the open-beta hostile
  // audit). They remain listed here only because they legitimately do not
  // need the FULL session-auth marker set the route-scanner greps for beyond
  // withCanonicalEnforcement itself; kept as a category so a future removal
  // of withCanonicalEnforcement from any of the three is still visible as a
  // deliberate registry edit, not a silent regression.
  PUBLIC: [
    "/api/public/actions",
    "/api/public/engagements",
    "/api/public/kpis",
  ],
  AUTH: [
    "/api/auth/login", // User login - credentials validated instead of auth token
    "/api/auth/logout", // Logout - accepts both authenticated and unauthenticated
    "/api/auth/signup", // User signup - public registration endpoint, no auth required
    "/api/auth/forgot-password", // Password-reset request - public and enumeration-resistant by design (the caller isn't logged in)
    "/api/auth/reset-password", // Password-reset redemption - authorized by the single-use, hashed, expiring reset token, not session auth
    "/api/auth/beta-status", // Display-only: whether public registration is open. Carries no authority — signup independently re-checks the flag server-side
    "/api/auth/verify-email", // Email-verification redemption - authorized by the single-use, hashed, expiring verification token, not session auth
    "/api/auth/resend-verification", // Verification-resend request - public and enumeration-resistant by design, rate-limited per IP and email
  ],
  WEBHOOK_SIGNED: [
    "/api/webhooks/stripe", // Signature verification is mandatory
    "/api/webhooks/resend", // HMAC-SHA256 (svix) signature verification — fail-closed when RESEND_WEBHOOK_SECRET unset
  ],
  PRIVACY: [
    // A user filing a privacy request (access/export, deletion, correction) may be
    // locked out of their account — this cannot require a session. Public and
    // enumeration-resistant by design, rate-limited per IP and email, same pattern
    // as the AUTH category's forgot-password/resend-verification routes.
    "/api/privacy-requests",
  ],
  SCHEDULER_TOKEN: [
    // Not session-auth: authorized by a strong SCHEDULER_INTERNAL_TOKEN (constant-time
    // compared, fail-closed / disabled when the token is unset). Invoked by the caller's scheduler.
    "/api/internal/reassessment-scan",
    "/api/internal/cron/scheduler", // Vercel Cron — authorized by CRON_SECRET bearer token (Vercel injects)
    "/api/internal/finance-learning-reconcile", // Authorized by SCHEDULER_INTERNAL_TOKEN (same pattern as reassessment-scan)
  ],
  DIAGNOSTIC_KEY: [
    // Authorized by OPSIQ_DIAGNOSTIC_KEY header; disabled in production.
    "/api/internal/smoke-cleanup", // Smoke test cleanup — dev/test only, returns 404 in production
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
  "/api/public/actions": "Public API - requires session auth + DB-verified workspace membership + ACTION_VIEW capability via withCanonicalEnforcement; workspaceId is server-derived, never caller-supplied. Listed for registry completeness, not because it bypasses auth.",
  "/api/public/engagements": "Public API - requires session auth + DB-verified workspace membership + ENGAGEMENT_VIEW capability via withCanonicalEnforcement; workspaceId is server-derived, never caller-supplied. Listed for registry completeness, not because it bypasses auth.",
  "/api/public/kpis": "Public API - requires session auth + DB-verified workspace membership + KPI_VIEW capability via withCanonicalEnforcement; workspaceId is server-derived, never caller-supplied. Listed for registry completeness, not because it bypasses auth.",
  "/api/auth/login": "User authentication endpoint - validates credentials instead of auth token",
  "/api/auth/logout": "Session termination - accepts both authenticated and unauthenticated requests",
  "/api/auth/signup": "User signup endpoint - public registration, no auth required; refuses when PUBLIC_BETA_ENABLED is not \"true\"",
  "/api/auth/forgot-password": "Password-reset request endpoint - public and enumeration-resistant by design (a locked-out user isn't logged in); rate-limited per IP and email",
  "/api/auth/reset-password": "Password-reset redemption endpoint - authorized by the single-use, sha256-hashed, 1-hour-expiring reset token from the emailed link, not session auth; rate-limited per IP",
  "/api/auth/beta-status": "Display-only open-beta flag read - carries no authority, signup independently re-checks the flag server-side",
  "/api/auth/verify-email": "Email-verification redemption endpoint - authorized by the single-use, sha256-hashed, 7-day-expiring verification token from the emailed link, not session auth; rate-limited per IP",
  "/api/auth/resend-verification": "Verification-resend request endpoint - public and enumeration-resistant by design; rate-limited per IP and email",
  "/api/webhooks/stripe": "Webhook with mandatory HMAC-SHA256 signature verification - Stripe signature validates request legitimacy",
  "/api/webhooks/resend": "Email webhook with HMAC-SHA256 (svix) signature verification + timestamp tolerance - fail-closed when RESEND_WEBHOOK_SECRET unset",
  "/api/privacy-requests": "Privacy request (access/export, deletion, correction) endpoint - public and enumeration-resistant by design (a locked-out user isn't authenticated); rate-limited per IP and email",
  "/api/internal/cron/scheduler": "Vercel Cron endpoint - authorized by CRON_SECRET bearer token injected by Vercel, fail-closed when unset",
  "/api/internal/smoke-cleanup": "Smoke test cleanup - authorized by OPSIQ_DIAGNOSTIC_KEY, returns 404 in production (never exposed publicly)",
  "/api/internal/reassessment-scan": "Scheduler endpoint authorized by SCHEDULER_INTERNAL_TOKEN (constant-time compare, fail-closed when unset) instead of session auth",
  "/api/internal/finance-learning-reconcile": "Scheduler endpoint authorized by SCHEDULER_INTERNAL_TOKEN (constant-time compare, fail-closed when unset) instead of session auth",
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
  const allExempted = Object.values(PUBLIC_ROUTE_EXEMPTIONS).flat() as string[];
  return allExempted.includes(path);
}

export function getExemptionReason(path: string): string | undefined {
  return EXEMPTION_REASONS[path as keyof typeof EXEMPTION_REASONS];
}
