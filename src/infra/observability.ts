/**
 * Production observability (Sentry-backed, fail-open).
 *
 * Goal: make production failures visible and traceable without changing any
 * business logic. The Sentry SDK is loaded lazily and only when a DSN is
 * configured, so the app behaves identically when Sentry is unavailable
 * (no DSN, import failure, or init failure are all non-fatal).
 *
 * Privacy: we only ever send low-cardinality, non-PII identifiers
 * (category, route, userId, workspaceId, requestId). We never send passwords,
 * session tokens, authorization headers, cookies, request bodies, or the
 * user's free-text business inputs (e.g. problemStatement). A `beforeSend`
 * scrubber strips request cookies/headers/data as defense-in-depth.
 */

import { classifyOperatorError } from "@/lib/operator-error-governance";

export type ObservabilityCategory =
  | "AUTH_ERROR"
  | "AUTH_RATE_LIMIT"
  | "DIAGNOSIS_ERROR"
  | "DASHBOARD_ERROR"
  | "DATABASE_ERROR"
  | "VALIDATION_ERROR"
  | "SCHEDULER_ERROR"
  | "EMAIL_DELIVERY_ERROR"
  | "AI_ERROR"
  | "WEBHOOK_ERROR"
  | "UNEXPECTED_ERROR";

export interface ObservabilityContext {
  category?: ObservabilityCategory;
  route?: string;
  userId?: string;
  workspaceId?: string;
  requestId?: string;
}

function errorName(error: unknown): string {
  if (error instanceof Error) {
    if (error.name && error.name !== "Error") return error.name;
    return error.constructor?.name || error.name || "Error";
  }
  return "NonError";
}

/** Deterministic, low-cardinality categorization. Same input → same category. */
export function categorizeError(error: unknown, route?: string): ObservabilityCategory {
  const name = errorName(error);
  // Match on governed technical details (never the raw error.message) — same
  // pattern used by error-tracking.ts. Used only for routing, never logged.
  const msg = classifyOperatorError(
    error instanceof Error ? error : new Error(String(error)),
    { context: "load" }
  ).technicalDetails.toLowerCase();
  const r = (route || "").toLowerCase();

  if (name === "ZodError" || name === "ValidationError" || name === "BadRequestError" || msg.includes("validation")) {
    return "VALIDATION_ERROR";
  }
  if (name.startsWith("Prisma") || msg.includes("prisma") || msg.includes("database") || msg.includes("econnrefused") || msg.includes("connect econn")) {
    return "DATABASE_ERROR";
  }
  if (name === "RateLimitError" || name === "TooManyRequestsError" || msg.includes("rate limit") || msg.includes("too many")) {
    return "AUTH_RATE_LIMIT";
  }
  if (r.includes("/api/auth") || name === "UnauthorizedError" || name === "ForbiddenError" || msg.includes("unauthorized") || msg.includes("forbidden") || msg.includes("authentication")) {
    return "AUTH_ERROR";
  }
  if (r.includes("cron/scheduler") || msg.includes("scheduler") || msg.includes("scheduled task")) {
    return "SCHEDULER_ERROR";
  }
  if (r.includes("webhooks/resend") || msg.includes("resend") || msg.includes("email delivery")) {
    return "EMAIL_DELIVERY_ERROR";
  }
  if (msg.includes("openai") || msg.includes("ai_unavailable") || msg.includes("ai provider")) {
    return "AI_ERROR";
  }
  if (r.includes("webhooks")) return "WEBHOOK_ERROR";
  if (r.includes("diagnos")) return "DIAGNOSIS_ERROR";
  if (r.includes("dashboard") || r.includes("engagement")) return "DASHBOARD_ERROR";
  return "UNEXPECTED_ERROR";
}

/**
 * Strip anything potentially sensitive before an event leaves the process.
 * Exported (only) so open-beta hardening's scrubbing tests can drive it
 * directly against constructed Sentry-event-shaped objects, rather than
 * needing to stand up the real @sentry/nextjs SDK in a test.
 */
export function scrubEvent(event: Record<string, unknown>): Record<string, unknown> {
  const req = event.request as Record<string, unknown> | undefined;
  if (req) {
    delete req.cookies;
    delete req.data;
    const headers = req.headers as Record<string, unknown> | undefined;
    if (headers) {
      delete headers.cookie;
      delete headers.authorization;
      delete headers["x-opsiq-diagnostic-key"];
    }
  }
  // We never set user email/ip; ensure nothing leaks via default user context.
  if (event.user && typeof event.user === "object") {
    const u = event.user as Record<string, unknown>;
    delete u.email;
    delete u.ip_address;
    delete u.username;
  }
  return event;
}

function dsnFor(runtime: "server" | "client"): string | undefined {
  const dsn = runtime === "server" ? process.env.SENTRY_DSN : process.env.NEXT_PUBLIC_SENTRY_DSN;
  return dsn && dsn.trim().length > 0 ? dsn : undefined;
}

/**
 * Initialize Sentry for the given runtime. Fail-open: a missing DSN or any
 * import/init error leaves the app fully functional (Sentry simply inert).
 */
export async function initObservability(runtime: "server" | "client"): Promise<void> {
  const dsn = dsnFor(runtime);
  if (!dsn) return;
  try {
    const Sentry = await import("@sentry/nextjs");
    Sentry.init({
      dsn,
      tracesSampleRate: 0,
      environment: process.env.VERCEL_ENV || process.env.NODE_ENV || "production",
      release: process.env.VERCEL_GIT_COMMIT_SHA || undefined,
      beforeSend: (event) => scrubEvent(event as unknown as Record<string, unknown>) as never,
    });
  } catch {
    // Fail-open: never let observability setup break the app.
  }
}

async function sendToSentry(error: unknown, category: ObservabilityCategory, context: ObservabilityContext): Promise<void> {
  // Only attempt when a server/client DSN is present.
  if (!dsnFor("server") && !dsnFor("client")) return;
  try {
    const Sentry = await import("@sentry/nextjs");
    Sentry.captureException(error, {
      tags: { category, route: context.route || "unknown" },
      extra: {
        userId: context.userId,
        workspaceId: context.workspaceId,
        requestId: context.requestId,
        // Deliberately NOT included: request body, problemStatement, headers, cookies.
      },
    });
  } catch {
    // Fail-open.
  }
}

/**
 * Record a user-impacting failure. Always emits a structured, PII-safe log line
 * and (when a DSN is configured) forwards to Sentry. Returns the category.
 */
export function captureError(error: unknown, context: ObservabilityContext = {}): ObservabilityCategory {
  const category = context.category ?? categorizeError(error, context.route);
  // PII-safe message via the operator-error governance layer (never raw input).
  const safeMessage = classifyOperatorError(
    error instanceof Error ? error : new Error(String(error)),
    { context: "load" }
  ).operatorMessage;

  try {
    console.error(
      JSON.stringify({
        observability: "error",
        category,
        timestamp: new Date().toISOString(),
        route: context.route,
        userId: context.userId,
        workspaceId: context.workspaceId,
        requestId: context.requestId,
        errorName: errorName(error),
        message: safeMessage,
      })
    );
  } catch {
    // Never let logging throw.
  }

  // Fire-and-forget; failures here must never affect the caller.
  void sendToSentry(error, category, context);
  return category;
}
