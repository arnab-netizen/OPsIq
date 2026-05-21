/**
 * Error Handler Wrapper: Integrates error tracking into API routes.
 * Wraps route handlers to catch errors, classify them, report to tracking,
 * and return properly formatted error responses.
 *
 * Usage:
 *   export const POST = withErrorHandling(async (request) => {
 *     // route logic
 *   });
 */

import { NextRequest, NextResponse } from "next/server";
import { classifyError, type ClassifiedError } from "@/infra/error-tracking";
import { classifyOperatorError } from "@/lib/operator-error-governance";

/**
 * Type for a route handler function
 */
export type RouteHandler = (request: NextRequest) => Promise<NextResponse>;

/**
 * Error response format
 */
export interface ErrorResponse {
  error: string;
  code?: string;
  statusCode: number;
  timestamp: string;
  traceId?: string;
  details?: string; // Only in non-production
}

/**
 * Converts ClassifiedError to error response
 */
function formatErrorResponse(classified: ClassifiedError): ErrorResponse {
  const isProduction = process.env.NODE_ENV === "production";

  return {
    error: classified.classification,
    code: classified.code,
    statusCode: classified.statusCode,
    timestamp: classified.timestamp,
    traceId: classified.traceId,
    // Only include detailed message in non-production
    details: isProduction ? undefined : classified.message,
  };
}

/**
 * Report error to tracking system (console in dev, Sentry in production)
 */
function reportError(classified: ClassifiedError): void {
  const isDev = process.env.NODE_ENV === "development";

  if (isDev) {
    // Development: log to console
    console.error(
      `[${classified.classification}]`,
      classified.message,
      classified.context || {}
    );
  } else {
    // Production: would send to Sentry
    // import * as Sentry from "@sentry/nextjs";
    // Sentry.captureException(new Error(classified.message), {
    //   tags: {
    //     errorClassification: classified.classification,
    //   },
    //   contexts: {
    //     classification: classified.context,
    //   },
    // });
    console.error(
      `[ERROR_TRACKING] ${classified.classification}: ${classified.message}`
    );
  }
}

/**
 * High-order function: Wraps a route handler with error handling
 *
 * Usage:
 *   export const GET = withErrorHandling(async (request) => {
 *     // Your route logic
 *     return NextResponse.json({ data: "..." });
 *   }, { requireAuth: true, requireWorkspace: true });
 */
export function withErrorHandling(
  handler: RouteHandler,
  options?: {
    requireAuth?: boolean;
    requireWorkspace?: boolean;
  }
): RouteHandler {
  return async (request: NextRequest): Promise<NextResponse> => {
    try {
      // Pre-checks
      if (options?.requireAuth) {
        const authHeader = request.headers.get("authorization");
        if (!authHeader) {
          const classified = classifyError(new Error("Unauthorized"), {
            missing: "authorization header",
          });
          reportError(classified);
          return NextResponse.json(formatErrorResponse(classified), {
            status: classified.statusCode,
          });
        }
      }

      if (options?.requireWorkspace) {
        const workspaceId = request.headers.get("x-workspace-id");
        if (!workspaceId) {
          const classified = classifyError(
            new Error("Forbidden - Missing workspace ID"),
            { missing: "x-workspace-id header" }
          );
          reportError(classified);
          return NextResponse.json(formatErrorResponse(classified), {
            status: classified.statusCode,
          });
        }
      }

      // Call handler
      return await handler(request);
    } catch (error: unknown) {
      // Classify error
      const context = {
        url: request.url,
        method: request.method,
        timestamp: new Date().toISOString(),
      };

      const classified = classifyError(error, context);

      // Report to tracking
      reportError(classified);

      // Return error response
      return NextResponse.json(formatErrorResponse(classified), {
        status: classified.statusCode,
      });
    }
  };
}

/**
 * Middleware-style error handler for catching errors in route handlers
 * Can be used in middleware pipeline to catch and report errors
 */
export async function handleRouteError(
  error: unknown,
  request: NextRequest,
  context?: Record<string, unknown>
): Promise<NextResponse> {
  const fullContext = {
    url: request.url,
    method: request.method,
    timestamp: new Date().toISOString(),
    ...context,
  };

  const classified = classifyError(error, fullContext);
  reportError(classified);

  return NextResponse.json(formatErrorResponse(classified), {
    status: classified.statusCode,
  });
}

/**
 * Helper: Get error HTTP status code
 */
export function getErrorStatusCode(error: unknown): number {
  const classified = classifyError(error);
  return classified.statusCode;
}

/**
 * Helper: Check if error should be reported (skip expected/benign errors)
 */
export function shouldReportError(error: unknown): boolean {
  const governed = classifyOperatorError(error instanceof Error ? error : new Error(String(error)), { context: "load" });
  const message = governed.operatorMessage;

  // Skip benign errors
  const benignPatterns = [
    "CANCEL",
    "User canceled",
    "timeout",
    "AbortError",
  ];

  return !benignPatterns.some((pattern) =>
    message.toLowerCase().includes(pattern.toLowerCase())
  );
}
